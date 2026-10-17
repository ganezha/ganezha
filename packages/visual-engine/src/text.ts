import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { TOKENS } from "@ganezha/config";
import satori from "satori";
import { err, ok, type Result, visualError } from "./result";

type SatoriOptions = Parameters<typeof satori>[1];
export type SatoriFont = NonNullable<SatoriOptions["fonts"]>[number];
type LoadAdditionalAsset = NonNullable<SatoriOptions["loadAdditionalAsset"]>;

const PLEADING_FACE = "🥺";
const PLEADING_FACE_ASSET = new URL(
	"../assets/emoji/1f97a.svg",
	import.meta.url,
);

export type TextPathOptions = Readonly<{
	width: number;
	height: number;
	x: number;
	y: number;
	fontSize: number;
	fontWeight: 400 | 700;
	color: string;
	colorVariable: "text" | "gold-text" | "text-muted" | "gold";
	idPrefix: string;
}>;

function number(value: number): string {
	return Object.is(value, -0) ? "0" : String(value);
}

function escapeAttribute(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

async function loadPleadingFaceDataUri(): Promise<Result<string>> {
	let source: string;
	try {
		source = await readFile(PLEADING_FACE_ASSET, "utf8");
	} catch (cause) {
		return err(
			visualError(
				"asset-unavailable",
				"Required local Twemoji asset is missing or unreadable: assets/emoji/1f97a.svg.",
				cause,
			),
		);
	}

	if (
		!/^<svg\b[\s\S]*<\/svg>\s*$/i.test(source.trim()) ||
		/<\s*(?:script|foreignObject|text)\b/i.test(source) ||
		/\b(?:xlink:)?href\s*=|url\s*\(/i.test(source)
	) {
		return err(
			visualError(
				"invalid-svg",
				"Local Twemoji asset assets/emoji/1f97a.svg is not a safe standalone SVG.",
			),
		);
	}

	return ok(
		`data:image/svg+xml;base64,${Buffer.from(source, "utf8").toString("base64")}`,
	);
}

function prefixSvgIds(svg: string, prefix: string): Result<string> {
	if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(prefix)) {
		return err(
			visualError(
				"invalid-input",
				"Satori SVG id prefix must be a valid identifier.",
			),
		);
	}

	const ids = [...svg.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]);
	const replacements = new Map<string, string>();
	for (const id of ids) {
		if (id === undefined) continue;
		if (replacements.has(id)) {
			return err(
				visualError("invalid-svg", `Satori returned duplicate SVG id "${id}".`),
			);
		}
		replacements.set(id, `${prefix}-${id}`);
	}

	let output = svg.replace(/\bid="([^"]+)"/gi, (_attribute, id: string) => {
		const replacement = replacements.get(id);
		if (replacement === undefined) {
			throw new Error(
				`Satori SVG id mapping invariant was violated for "${id}".`,
			);
		}
		return `id="${replacement}"`;
	});
	output = output.replace(
		/#([A-Za-z_][A-Za-z0-9_.:-]*)/g,
		(reference, id: string) => {
			const replacement = replacements.get(id);
			return replacement === undefined ? reference : `#${replacement}`;
		},
	);
	output = output.replace(
		/\b(aria-labelledby|aria-describedby)="([^"]+)"/gi,
		(_attribute, name: string, value: string) => {
			const references = value
				.split(/\s+/)
				.map((id) => replacements.get(id) ?? id)
				.join(" ");
			return `${name}="${references}"`;
		},
	);
	return ok(output);
}

/**
 * Converts one line of text to SVG paths with Satori. Font bytes are injected by
 * the caller; only the fixed local emoji asset is loaded here when requested.
 */
export async function renderTextPaths(
	text: string,
	fonts: readonly SatoriFont[],
	options: TextPathOptions,
): Promise<Result<string>> {
	if (text.length === 0)
		return err(visualError("invalid-input", "Text must not be empty."));
	if (
		![
			options.width,
			options.height,
			options.fontSize,
			options.x,
			options.y,
		].every(Number.isFinite)
	) {
		return err(
			visualError(
				"invalid-input",
				"Text coordinates, dimensions, and font size must be finite.",
			),
		);
	}
	if (options.width <= 0 || options.height <= 0 || options.fontSize <= 0) {
		return err(
			visualError(
				"invalid-input",
				"Text dimensions and font size must be greater than zero.",
			),
		);
	}
	if (fonts.length < 2) {
		return err(
			visualError(
				"invalid-input",
				"JetBrains Mono Regular and Bold font faces are required.",
			),
		);
	}
	if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(options.idPrefix)) {
		return err(
			visualError(
				"invalid-input",
				"Text id prefix must be a valid identifier.",
			),
		);
	}

	let emojiDataUri = "";
	if (text.includes(PLEADING_FACE)) {
		const loadedEmoji = await loadPleadingFaceDataUri();
		if (!loadedEmoji.ok) return loadedEmoji;
		emojiDataUri = loadedEmoji.value;
	}
	const loadAdditionalAsset: LoadAdditionalAsset = async (code, segment) => {
		return code === "emoji" && segment === PLEADING_FACE ? emojiDataUri : "";
	};

	const element = {
		type: "div",
		props: {
			style: {
				display: "flex",
				width: `${options.width}px`,
				height: `${options.height}px`,
				alignItems: "center",
				justifyContent: "flex-start",
				fontFamily: TOKENS.type.fontFamily,
				fontSize: options.fontSize,
				fontWeight: options.fontWeight,
				lineHeight: 1,
				whiteSpace: "nowrap",
				color: options.color,
			},
			children: text,
		},
	};
	let rendered: string;
	try {
		rendered = await satori(element as never, {
			width: options.width,
			height: options.height,
			fonts: [...fonts],
			loadAdditionalAsset,
		});
	} catch (cause) {
		return err(
			visualError(
				"render-failed",
				"Satori could not render the requested text.",
				cause,
			),
		);
	}
	const inner = rendered.match(/^<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/i)?.[1];
	if (inner === undefined)
		return err(
			visualError("invalid-svg", "Satori returned an invalid SVG root."),
		);
	if (/<\s*text\b/i.test(inner)) {
		return err(
			visualError(
				"invalid-svg",
				"Satori returned live text instead of vector paths.",
			),
		);
	}
	const prefixedResult = prefixSvgIds(inner, options.idPrefix);
	if (!prefixedResult.ok) return prefixedResult;
	const prefixedInner = prefixedResult.value;
	const paths = prefixedInner
		.replace(/\s+fill=(?:"[^"]*"|'[^']*')/gi, "")
		.replace(
			/\s+stroke=(?:"[^"]*"|'[^']*')/gi,
			` stroke="var(--gz-${options.colorVariable})"`,
		);
	if (!/<path\b/i.test(paths)) {
		return err(
			visualError("invalid-svg", "Satori did not return any glyph paths."),
		);
	}

	return ok(
		`<g transform="translate(${number(options.x)},${number(options.y)})" aria-label="${escapeAttribute(text)}" fill="var(--gz-${options.colorVariable})">${paths}</g>`,
	);
}
