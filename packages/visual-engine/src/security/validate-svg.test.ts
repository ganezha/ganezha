import { readFile } from "node:fs/promises";
import { TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import * as fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { createActivityCard } from "../activity-card";
import { createBanner, type SvgComponent } from "../banner";
import { createBrankasCard } from "../brankas-card";
import { optimizeSvg } from "../optimize";
import { expectResult } from "../result-test-utils";
import { createSkyline } from "../skyline";
import { createStatsCard } from "../stats-card";
import { renderTextPaths, type SatoriFont } from "../text";
import {
	assetFileName,
	describeAssetFile,
	EXPECTED_ASSET_FILE_NAMES,
	SVG_ASSET_SCHEMES,
	type SvgAssetFile,
	validateAssets,
} from "./assets";
import {
	SVG_KIND_SIZE_LIMITS,
	type ValidateSvgOptions,
	validateSvg,
} from "./validate-svg";

const CARD: ValidateSvgOptions = { kind: "card", static: false };
const BANNER: ValidateSvgOptions = { kind: "banner", static: false };
const EMOJI_URI = `data:image/svg+xml;base64,${btoa(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="#FFCC4D"/></svg>',
)}`;

function svg(
	body: string,
	options: Readonly<{ root?: string; head?: string }> = {},
): string {
	const root = options.root ?? 'role="img" aria-labelledby="t"';
	const head = options.head ?? '<title id="t">Accessible title</title>';
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" ${root}>${head}${body}</svg>\n`;
}

function codes(
	source: string,
	options: ValidateSvgOptions = CARD,
): readonly string[] {
	const result = validateSvg(source, options);
	return result.ok ? [] : result.error.map((violation) => violation.code);
}

describe("validateSvg", () => {
	it("accepts a minimal accessible SVG", () => {
		expect(validateSvg(svg('<path d="M0 0h1"/>'), CARD)).toEqual({
			ok: true,
			value: undefined,
		});
	});

	it("accepts local references and the embedded SVG emoji in banners", () => {
		const source = svg(
			`<defs><g id="shape"><path d="M0 0h1"/></g></defs><use href="#shape"/><image href="${EMOJI_URI}"/>`,
		);
		expect(codes(source, BANNER)).toEqual([]);
	});

	it.each([
		["script", "<script>alert(1)</script>", "script-element"],
		["onload", '<g onload="alert(1)"/>', "event-handler-attribute"],
		["onclick", '<path ONCLICK = "x" d="M0 0"/>', "event-handler-attribute"],
		[
			"foreignObject",
			"<foreignObject><div/></foreignObject>",
			"foreign-object-element",
		],
		["javascript: href", '<a href="javascript:alert(1)"/>', "javascript-url"],
		[
			"entity-encoded javascript: href",
			'<a href="&#106;avascript&#58;alert(1)"/>',
			"javascript-url",
		],
		[
			"javascript: elsewhere",
			'<g style="behavior:javascript:x"/>',
			"javascript-url",
		],
		[
			"https href",
			'<image href="https://example.invalid/x.svg"/>',
			"external-reference",
		],
		[
			"http xlink:href",
			'<use xlink:href="http://example.invalid/x.svg#a"/>',
			"external-reference",
		],
		[
			"protocol-relative href",
			'<image href="//example.invalid/x.svg"/>',
			"external-reference",
		],
		["dangling local href", '<use href="#missing"/>', "dangling-reference"],
		[
			"data: non-svg href",
			'<image href="data:image/png;base64,AAAA"/>',
			"data-uri-not-allowed",
		],
		[
			"url(http)",
			"<style>svg{background:url(http://example.invalid/a.png)}</style>",
			"css-external-url",
		],
		[
			"url(//)",
			"<style>svg{background:url( '//example.invalid/a.png')}</style>",
			"css-external-url",
		],
		[
			"@import",
			'<style>@import "https://example.invalid/a.css";</style>',
			"css-import",
		],
		["text", "<text>live</text>", "text-element"],
		["duplicate id", '<g id="a"/><g id="b"/><g id="a"/>', "duplicate-id"],
	])("rejects %s", (_label, body, code) => {
		expect(codes(svg(body), BANNER)).toContain(code);
	});

	it("rejects an embedded SVG data image outside the banner", () => {
		expect(codes(svg(`<image href="${EMOJI_URI}"/>`), CARD)).toContain(
			"data-uri-not-allowed",
		);
	});

	it("rejects unsafe content hidden inside the embedded SVG data image", () => {
		const nested = `data:image/svg+xml;base64,${btoa("<svg><script>x</script></svg>")}`;
		expect(codes(svg(`<image href="${nested}"/>`), BANNER)).toContain(
			"script-element",
		);
	});

	it("rejects a data: URI outside an href", () => {
		expect(
			codes(svg('<g style="mask:x" data-x="data:text/html,x"/>'), BANNER),
		).toContain("data-uri-not-allowed");
	});

	it("rejects a missing title", () => {
		expect(codes(svg('<path d="M0 0"/>', { head: "" }))).toContain(
			"title-missing",
		);
	});

	it("rejects a title that is not the first child", () => {
		expect(
			codes(svg("", { head: '<desc>x</desc><title id="t">Title</title>' })),
		).toContain("title-missing");
	});

	it("rejects a title without an id", () => {
		expect(codes(svg("", { head: "<title>Title</title>" }))).toContain(
			"title-id-missing",
		);
	});

	it("rejects a wrong aria-labelledby", () => {
		expect(
			codes(svg("", { root: 'role="img" aria-labelledby="other"' })),
		).toEqual(["aria-labelledby-mismatch"]);
	});

	it("rejects a missing aria-labelledby", () => {
		expect(codes(svg("", { root: 'role="img"' }))).toEqual([
			"aria-labelledby-mismatch",
		]);
	});

	it("rejects a missing role", () => {
		expect(codes(svg("", { root: 'aria-labelledby="t"' }))).toEqual([
			"role-missing",
		]);
	});

	it("rejects a document without an svg root", () => {
		expect(codes('<html><svg role="img"></svg></html>')).toContain(
			"root-missing",
		);
	});

	it("rejects SVGs over the byte limit of their kind, counting UTF-8 bytes", () => {
		const head = svg("");
		const fill = (bytes: number) =>
			svg(
				`<desc>${"\u00e9".repeat(Math.ceil((bytes - head.length) / 2))}</desc>`,
			);
		const card = fill(SVG_KIND_SIZE_LIMITS.card + 2);
		expect(card.length).toBeLessThan(SVG_KIND_SIZE_LIMITS.card);
		expect(codes(card)).toEqual(["size-limit-exceeded"]);
		expect(codes(card, { kind: "banner", static: false })).toEqual([]);
		expect(
			codes(fill(SVG_KIND_SIZE_LIMITS.skyline + 2), {
				kind: "skyline",
				static: false,
			}),
		).toEqual(["size-limit-exceeded"]);
		expect(SVG_KIND_SIZE_LIMITS).toEqual({
			banner: 61440,
			skyline: 61440,
			card: 40960,
		});
	});

	it.each([
		'<animate attributeName="x" values="0;1" dur="1s"/>',
		'<animateTransform attributeName="transform" type="scale"/>',
		'<animateMotion dur="1s" path="M0 0h1"/>',
		'<set attributeName="opacity" to="1"/>',
	])("rejects SMIL in static variants: %s", (animation) => {
		const source = svg(`<g>${animation}</g>`);
		expect(codes(source, { kind: "card", static: true })).toEqual([
			"animation-in-static",
		]);
		expect(codes(source, { kind: "card", static: false })).toEqual([]);
	});

	it("reports every violation with code, message, and context", () => {
		const result = validateSvg(
			svg("<script>x</script><text>y</text>", { root: "" }),
			CARD,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.map((violation) => violation.code).sort()).toEqual([
			"aria-labelledby-mismatch",
			"role-missing",
			"script-element",
			"text-element",
		]);
		for (const violation of result.error) {
			expect(violation.message.length).toBeGreaterThan(0);
			expect(violation.context.length).toBeGreaterThan(0);
		}
	});

	const idArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{0,12}$/);

	it("property: unique ids always pass", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(idArbitrary, { minLength: 0, maxLength: 25 }),
				(ids) => {
					const body = ids.map((id) => `<g id="n-${id}"/>`).join("");
					return validateSvg(svg(body), CARD).ok;
				},
			),
		);
	});

	it("property: any duplicated id always fails with duplicate-id", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(idArbitrary, { minLength: 1, maxLength: 25 }),
				fc.nat(),
				fc.nat(),
				(ids, pick, position) => {
					const duplicate = ids[pick % ids.length] ?? "x";
					const elements = ids.map((id) => `<g id="n-${id}"/>`);
					elements.splice(
						position % (elements.length + 1),
						0,
						`<path id="n-${duplicate}"/>`,
					);
					const result = validateSvg(svg(elements.join("")), CARD);
					return (
						!result.ok &&
						result.error.filter(
							(violation) => violation.code === "duplicate-id",
						).length === 1
					);
				},
			),
		);
	});
});

describe("asset names", () => {
	it("derives kind from the asset and static from the variant", () => {
		expect(describeAssetFile("banner.svg")).toEqual({
			asset: "banner",
			scheme: "auto",
			animated: true,
			kind: "banner",
		});
		expect(describeAssetFile("skyline-light-static.svg")).toEqual({
			asset: "skyline",
			scheme: "light",
			animated: false,
			kind: "skyline",
		});
		expect(describeAssetFile("brankas-dark.svg")?.kind).toBe("card");
		expect(describeAssetFile("stats-static.svg")?.kind).toBe("card");
		expect(describeAssetFile("activity-light.svg")?.kind).toBe("card");
		expect(describeAssetFile("../banner.svg")).toBeUndefined();
		expect(describeAssetFile("banner-sepia.svg")).toBeUndefined();
	});

	it("expects exactly the 30 published files", () => {
		expect(EXPECTED_ASSET_FILE_NAMES).toHaveLength(30);
		expect(new Set(EXPECTED_ASSET_FILE_NAMES).size).toBe(30);
		for (const name of EXPECTED_ASSET_FILE_NAMES) {
			expect(describeAssetFile(name)).toBeDefined();
		}
	});
});

describe("current rendered output", () => {
	let fixture: ProfileSnapshot;
	let renderers: readonly Readonly<{
		name: "banner" | "stats" | "brankas" | "skyline" | "activity";
		render: SvgComponent;
	}>[];

	beforeAll(async () => {
		const loaded = JSON.parse(
			await readFile(
				new URL("../../fixtures/profile.json", import.meta.url),
				"utf8",
			),
		) as ProfileSnapshot;
		fixture = {
			...loaded,
			calendar: Array.from({ length: 371 }, (_, index) => ({
				date: new Date(Date.UTC(2025, 9, 11 + index))
					.toISOString()
					.slice(0, 10),
				count: (index * 7) % 30,
			})),
		};
		const [regular, bold] = await Promise.all([
			readFile(
				new URL(
					"../../assets/fonts/JetBrainsMono-Regular.ttf",
					import.meta.url,
				),
			),
			readFile(
				new URL("../../assets/fonts/JetBrainsMono-Bold.ttf", import.meta.url),
			),
		]);
		const fonts: readonly SatoriFont[] = [
			{
				name: TOKENS.type.fontFamily,
				data: regular,
				weight: 400,
				style: "normal",
			},
			{
				name: TOKENS.type.fontFamily,
				data: bold,
				weight: 700,
				style: "normal",
			},
		];
		const text = (
			value: string,
			options: Parameters<typeof renderTextPaths>[2],
		) => renderTextPaths(value, fonts, options);
		renderers = [
			{ name: "banner", render: createBanner(text) },
			{ name: "stats", render: createStatsCard(text) },
			{ name: "brankas", render: createBrankasCard(text) },
			{ name: "skyline", render: createSkyline(text) },
			{ name: "activity", render: createActivityCard(text) },
		];
	});

	it("passes validation for all 30 asset variants", {
		timeout: 120_000,
	}, async () => {
		const files: SvgAssetFile[] = [];
		for (const { name, render } of renderers) {
			for (const { scheme } of SVG_ASSET_SCHEMES) {
				for (const animated of [true, false]) {
					const rendered = expectResult(
						await render(fixture, TOKENS, { animated, scheme }),
					);
					const contents = `${expectResult(optimizeSvg(rendered, animated))}\n`;
					const fileName = assetFileName(name, scheme, animated);
					const descriptor = describeAssetFile(fileName);
					const result = validateSvg(contents, {
						kind: descriptor?.kind ?? "card",
						static: !animated,
					});
					expect(result, fileName).toEqual({ ok: true, value: undefined });
					files.push({ name: fileName, contents });
				}
			}
		}
		expect(files).toHaveLength(30);
		expect(validateAssets(files).ok).toBe(true);
	});
});
