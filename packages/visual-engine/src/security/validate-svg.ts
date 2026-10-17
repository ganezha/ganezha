import { err, ok, type Result } from "../result";

/** Size and policy class of an SVG asset. Banner and skyline are wide assets. */
export type SvgKind = "banner" | "skyline" | "card";

export type ValidateSvgOptions = Readonly<{ kind: SvgKind; static: boolean }>;

export type ViolationCode =
	| "root-missing"
	| "script-element"
	| "event-handler-attribute"
	| "foreign-object-element"
	| "javascript-url"
	| "text-element"
	| "external-reference"
	| "invalid-local-reference"
	| "dangling-reference"
	| "data-uri-not-allowed"
	| "css-external-url"
	| "css-import"
	| "duplicate-id"
	| "title-missing"
	| "title-id-missing"
	| "role-missing"
	| "aria-labelledby-mismatch"
	| "size-limit-exceeded"
	| "animation-in-static";

/** `code` is a stable machine-readable identifier (see ViolationCode). */
export type Violation = Readonly<{
	code: string;
	message: string;
	context: string;
}>;

export const SVG_KIND_SIZE_LIMITS: Readonly<Record<SvgKind, number>> = {
	banner: 60 * 1024,
	skyline: 60 * 1024,
	card: 40 * 1024,
};

const ATTRIBUTES = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const ROOT_PATTERN = new RegExp(String.raw`^\s*<svg\b(${ATTRIBUTES})>`, "i");
const FIRST_CHILD_TITLE_PATTERN = new RegExp(
	String.raw`^\s*<title\b(${ATTRIBUTES})>`,
	"i",
);
const LOCAL_REFERENCE = /^#[A-Za-z_][\w.:-]*$/;
const ALLOWED_DATA_URI = /^data:image\/svg\+xml;base64,([a-z\d+/]+={0,2})$/i;
const CONTEXT_RADIUS = 40;
const CONTEXT_MAX = 160;

type PatternRule = Readonly<{
	code: ViolationCode;
	pattern: RegExp;
	message: string;
}>;

/** Rules that apply to the document and to any embedded SVG data image. */
const CONTENT_RULES: readonly PatternRule[] = [
	{
		code: "script-element",
		pattern: /<\s*script\b/gi,
		message: "<script> elements are not allowed.",
	},
	{
		code: "event-handler-attribute",
		pattern: /\son[a-z]+\s*=/gi,
		message: "Event handler attributes (on*) are not allowed.",
	},
	{
		code: "foreign-object-element",
		pattern: /<\s*foreignObject\b/gi,
		message: "<foreignObject> elements are not allowed.",
	},
	{
		code: "text-element",
		pattern: /<\s*text\b/gi,
		message: "Live <text> elements are not allowed; render text as paths.",
	},
	{
		code: "css-external-url",
		pattern: /url\s*\(\s*["']?\s*(?:https?:|\/\/)/gi,
		message: "CSS url() must not reference an external resource.",
	},
	{
		code: "css-import",
		pattern: /@import\b/gi,
		message: "CSS @import is not allowed.",
	},
];

const STATIC_RULES: readonly PatternRule[] = [
	{
		code: "animation-in-static",
		pattern: /<\s*(?:animate(?:Transform|Motion)?|set)\b/gi,
		message: "Static SVG variants must not contain SMIL animation elements.",
	},
];

const JAVASCRIPT_URL = /j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi;
const REFERENCE_ATTRIBUTE =
	/\s((?:xlink:)?href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const ID_ATTRIBUTE = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function context(source: string, index: number, length: number): string {
	const start = Math.max(0, index - CONTEXT_RADIUS);
	const end = Math.min(source.length, index + length + CONTEXT_RADIUS);
	let snippet = source.slice(start, end).replace(/\s+/g, " ");
	if (snippet.length > CONTEXT_MAX)
		snippet = `${snippet.slice(0, CONTEXT_MAX)}...`;
	return `${start > 0 ? "..." : ""}${snippet}${end < source.length ? "..." : ""}`;
}

function violation(
	code: ViolationCode,
	message: string,
	source: string,
	index: number,
	length: number,
): Violation {
	return { code, message, context: context(source, index, length) };
}

function codePoint(value: number): string {
	return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
		? String.fromCodePoint(value)
		: "\uFFFD";
}

/** Decodes the XML/HTML character references that can hide a URL scheme. */
function decodeEntities(value: string): string {
	return value
		.replace(/&#x([\da-f]+);?/gi, (_match, hex: string) =>
			codePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);?/g, (_match, decimal: string) =>
			codePoint(Number.parseInt(decimal, 10)),
		)
		.replace(/&colon;/gi, ":")
		.replace(/&tab;/gi, "\t")
		.replace(/&newline;/gi, "\n")
		.replace(/&quot;/gi, '"')
		.replace(/&apos;/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&amp;/gi, "&");
}

/** URL parsers ignore embedded tabs/newlines, so compare schemes without them. */
function withoutWhitespaceOrControls(value: string): string {
	return Array.from(value)
		.filter((character) => (character.codePointAt(0) ?? 0) > 0x20)
		.join("");
}

function attribute(attributes: string, name: string): string | undefined {
	const match = new RegExp(
		String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`,
		"i",
	).exec(attributes);
	return match === null ? undefined : (match[1] ?? match[2] ?? "");
}

function decodeBase64Utf8(payload: string): string | undefined {
	try {
		const binary = atob(payload);
		const bytes = Uint8Array.from(binary, (character) =>
			character.charCodeAt(0),
		);
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return undefined;
	}
}

function patternViolations(
	source: string,
	rules: readonly PatternRule[],
): Violation[] {
	const found: Violation[] = [];
	for (const rule of rules) {
		for (const match of source.matchAll(rule.pattern)) {
			found.push(
				violation(
					rule.code,
					rule.message,
					source,
					match.index,
					match[0].length,
				),
			);
		}
	}
	return found;
}

type ContentScope = Readonly<{
	ids: ReadonlySet<string> | undefined;
	allowSvgDataUri: boolean;
	static: boolean;
	label: string;
}>;

/**
 * Checks markup that must be safe whether it is the published document or an
 * embedded SVG image: dangerous elements/attributes, URL schemes, references.
 */
function contentViolations(source: string, scope: ContentScope): Violation[] {
	const found = patternViolations(source, CONTENT_RULES);
	if (scope.static) found.push(...patternViolations(source, STATIC_RULES));

	const referenceRanges: [number, number][] = [];
	for (const match of source.matchAll(REFERENCE_ATTRIBUTE)) {
		const index = match.index;
		referenceRanges.push([index, index + match[0].length]);
		const name = match[1] ?? "href";
		const value = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "").trim();
		const compact = withoutWhitespaceOrControls(value);
		const at = (code: ViolationCode, message: string) =>
			found.push(violation(code, message, source, index, match[0].length));
		if (/^javascript:/i.test(compact)) {
			at("javascript-url", `${name} must not use a javascript: URL.`);
		} else if (value.startsWith("#")) {
			if (!LOCAL_REFERENCE.test(value)) {
				at(
					"invalid-local-reference",
					`${name}="${value}" is not a valid local fragment reference.`,
				);
			} else if (scope.ids !== undefined && !scope.ids.has(value.slice(1))) {
				at(
					"dangling-reference",
					`${name}="${value}" does not reference an id in this SVG.`,
				);
			}
		} else if (/^data:/i.test(compact)) {
			const allowed = ALLOWED_DATA_URI.exec(compact);
			if (!scope.allowSvgDataUri || allowed === null) {
				at(
					"data-uri-not-allowed",
					scope.allowSvgDataUri
						? `${name} data URI must be data:image/svg+xml;base64.`
						: `${name} data URIs are not allowed in ${scope.label}.`,
				);
			} else {
				const nested = decodeBase64Utf8(allowed[1] ?? "");
				if (nested === undefined) {
					at(
						"data-uri-not-allowed",
						`${name} data URI is not valid base64-encoded UTF-8 SVG.`,
					);
				} else {
					for (const inner of contentViolations(nested, {
						ids: undefined,
						allowSvgDataUri: false,
						static: scope.static,
						label: "an embedded SVG image",
					})) {
						found.push({
							...inner,
							message: `Embedded SVG image: ${inner.message}`,
						});
					}
				}
			}
		} else {
			at(
				"external-reference",
				`${name} must be a local "#id" reference or the embedded SVG emoji; got "${value.slice(0, 60)}".`,
			);
		}
	}

	let outsideReferences = "";
	let cursor = 0;
	for (const [start, end] of referenceRanges) {
		outsideReferences += `${source.slice(cursor, start)} `;
		cursor = end;
	}
	outsideReferences += source.slice(cursor);
	const decoded = decodeEntities(outsideReferences);
	for (const match of decoded.matchAll(JAVASCRIPT_URL)) {
		found.push(
			violation(
				"javascript-url",
				"javascript: URLs are not allowed.",
				decoded,
				match.index,
				match[0].length,
			),
		);
	}
	for (const match of decoded.matchAll(/data:/gi)) {
		found.push(
			violation(
				"data-uri-not-allowed",
				"data: URIs are only allowed as the embedded SVG emoji href.",
				decoded,
				match.index,
				match[0].length,
			),
		);
	}
	return found;
}

function idViolations(svg: string): Readonly<{
	ids: ReadonlySet<string>;
	violations: Violation[];
}> {
	const ids = new Set<string>();
	const found: Violation[] = [];
	for (const match of svg.matchAll(ID_ATTRIBUTE)) {
		const id = match[1] ?? match[2] ?? "";
		if (ids.has(id)) {
			found.push(
				violation(
					"duplicate-id",
					`id "${id}" is used more than once.`,
					svg,
					match.index,
					match[0].length,
				),
			);
		}
		ids.add(id);
	}
	return { ids, violations: found };
}

function accessibilityViolations(svg: string): Violation[] {
	const root = ROOT_PATTERN.exec(svg);
	if (root === null) {
		return [
			violation(
				"root-missing",
				"Document must start with an <svg> root element.",
				svg,
				0,
				0,
			),
		];
	}
	const rootAttributes = root[1] ?? "";
	const rootTag = root[0].length;
	const found: Violation[] = [];
	const title = FIRST_CHILD_TITLE_PATTERN.exec(svg.slice(rootTag));
	const titleId = title === null ? undefined : attribute(title[1] ?? "", "id");
	if (title === null) {
		found.push(
			violation(
				"title-missing",
				'The first child of <svg> must be <title id="...">.',
				svg,
				rootTag,
				0,
			),
		);
	} else if (titleId === undefined || titleId.trim().length === 0) {
		found.push(
			violation(
				"title-id-missing",
				"The first-child <title> must have a non-empty id.",
				svg,
				rootTag,
				title[0].length,
			),
		);
	}
	if (attribute(rootAttributes, "role") !== "img") {
		found.push(
			violation(
				"role-missing",
				'The <svg> root must have role="img".',
				svg,
				0,
				rootTag,
			),
		);
	}
	const labelledBy = attribute(rootAttributes, "aria-labelledby");
	if (
		labelledBy === undefined ||
		titleId === undefined ||
		labelledBy.trim() !== titleId
	) {
		found.push(
			violation(
				"aria-labelledby-mismatch",
				`The <svg> root aria-labelledby must reference the title id (expected "${titleId ?? ""}", got "${labelledBy ?? ""}").`,
				svg,
				0,
				rootTag,
			),
		);
	}
	return found;
}

/**
 * Validates a published SVG asset against the profile security and
 * accessibility policy. Pure: no I/O; reports every violation it finds.
 */
export function validateSvg(
	svg: string,
	opts: ValidateSvgOptions,
): Result<void, Violation[]> {
	const { ids, violations: duplicateIds } = idViolations(svg);
	const violations: Violation[] = [
		...accessibilityViolations(svg),
		...duplicateIds,
		...contentViolations(svg, {
			ids,
			allowSvgDataUri: opts.kind === "banner",
			static: opts.static,
			label: `${opts.kind} assets`,
		}),
	];
	const bytes = new TextEncoder().encode(svg).byteLength;
	const limit = SVG_KIND_SIZE_LIMITS[opts.kind];
	if (bytes > limit) {
		violations.push({
			code: "size-limit-exceeded",
			message: `SVG is ${bytes} bytes; the ${opts.kind} limit is ${limit} bytes.`,
			context: `${bytes} > ${limit}`,
		});
	}
	return violations.length === 0 ? ok(undefined) : err(violations);
}
