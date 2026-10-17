import { readFile } from "node:fs/promises";
import { SLOGAN, TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import { beforeAll, describe, expect, it } from "vitest";
import { createBanner, type SvgComponent } from "./banner";
import { createBrankasCard } from "./brankas-card";
import {
	assertSvgSize as assertSvgSizeResult,
	optimizeSvg as optimizeSvgResult,
	svgSizeLimit,
} from "./optimize";
import { expectResult, expectResultAsync } from "./result-test-utils";
import { createStatsCard } from "./stats-card";
import { renderTextPaths, type SatoriFont } from "./text";

let fixture: ProfileSnapshot;
let sloganSource: string[];
let emojiDataUri: string;
type StringComponent = (...args: Parameters<SvgComponent>) => Promise<string>;
let banner: StringComponent;
let stats: StringComponent;
let brankas: StringComponent;

function stringComponent(component: SvgComponent): StringComponent {
	return (...args) => expectResultAsync(component(...args));
}

const optimizeSvg = (...args: Parameters<typeof optimizeSvgResult>) =>
	expectResult(optimizeSvgResult(...args));
const assertSvgSize = (...args: Parameters<typeof assertSvgSizeResult>) =>
	expectResult(assertSvgSizeResult(...args));

function summary(svg: string) {
	const viewBox = svg.match(/\bviewBox="([^"]+)"/)?.[1] ?? null;
	const dimensions = svg.match(
		/<svg\b[^>]*\bwidth="([^"]+)"[^>]*\bheight="([^"]+)"/,
	);
	return {
		viewBox,
		dimensions:
			dimensions === null ? null : `${dimensions[1]}x${dimensions[2]}`,
		networkEdges: (svg.match(/class="network-motif__edge"/g) ?? []).length,
		nodes: (svg.match(/class="network-motif__node"/g) ?? []).length,
		textGroups: (svg.match(/\baria-label="/g) ?? []).length,
		animations: (svg.match(/<animate\b/gi) ?? []).length,
	};
}

function labels(svg: string): string[] {
	return [...svg.matchAll(/\baria-label="([^"]*)"/g)].map((match) =>
		(match[1] ?? "").replaceAll("&quot;", '"').replaceAll("&amp;", "&"),
	);
}

function expectAccessibleTitle(svg: string, expectedTitle: string): void {
	const root = svg.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i);
	expect(root).not.toBeNull();
	const rootAttributes = root?.[1] ?? "";
	const content = root?.[2] ?? "";
	const title = content.match(/^<title\b([^>]*)>([\s\S]*?)<\/title>/i);
	expect(title).not.toBeNull();

	const titleId = title?.[1]?.match(/\bid="([^"]+)"/)?.[1];
	const titleText = title?.[2]?.trim();
	const role = rootAttributes.match(/\brole="([^"]+)"/)?.[1];
	const labelledBy = rootAttributes.match(/\baria-labelledby="([^"]+)"/)?.[1];

	expect(titleText).toBe(expectedTitle);
	expect(titleId).toBeTruthy();
	expect(role).toBe("img");
	expect(labelledBy).toBe(titleId);
}

function expectUniqueIds(svg: string): void {
	const ids = [...svg.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]);
	expect(new Set(ids).size).toBe(ids.length);
}

function dataImageReferences(svg: string): string[] {
	return [...svg.matchAll(/<image\b[^>]*\bhref="([^"]+)"[^>]*\/?\s*>/gi)].map(
		(match) => match[1] ?? "",
	);
}

function withoutAllowedEmojiDataUri(svg: string): string {
	return svg.replace(
		/<image\b[^>]*\bhref="data:image\/svg\+xml;base64,[a-z\d+/]+={0,2}"[^>]*\/?\s*>/gi,
		"",
	);
}

beforeAll(async () => {
	fixture = JSON.parse(
		await readFile(
			new URL("../fixtures/profile.json", import.meta.url),
			"utf8",
		),
	) as ProfileSnapshot;
	sloganSource = (
		await readFile(new URL("../fixtures/slogan.txt", import.meta.url), "utf8")
	)
		.replaceAll("\r\n", "\n")
		.replace(/\n$/, "")
		.split("\n");
	const [regular, bold, emoji] = await Promise.all([
		readFile(
			new URL("../assets/fonts/JetBrainsMono-Regular.ttf", import.meta.url),
		),
		readFile(
			new URL("../assets/fonts/JetBrainsMono-Bold.ttf", import.meta.url),
		),
		readFile(new URL("../assets/emoji/1f97a.svg", import.meta.url)),
	]);
	emojiDataUri = `data:image/svg+xml;base64,${emoji.toString("base64")}`;
	const fonts: readonly SatoriFont[] = [
		{
			name: TOKENS.type.fontFamily,
			data: regular,
			weight: 400,
			style: "normal",
		},
		{ name: TOKENS.type.fontFamily, data: bold, weight: 700, style: "normal" },
	];
	const text = (
		value: string,
		options: Parameters<typeof renderTextPaths>[2],
	) => renderTextPaths(value, fonts, options);
	banner = stringComponent(createBanner(text));
	stats = stringComponent(createStatsCard(text));
	brankas = stringComponent(createBrankasCard(text));
});

describe("profile SVG components", () => {
	it("matches the banner SVG snapshot", async () => {
		const svg = await banner(fixture, TOKENS, "animated");
		expect(summary(svg)).toMatchInlineSnapshot(`
			{
			  "animations": 5,
			  "dimensions": "1200x300",
			  "networkEdges": 5,
			  "nodes": 6,
			  "textGroups": 5,
			  "viewBox": "0 0 1200 300",
			}
		`);
	});

	it("matches the stats-card SVG snapshot", async () => {
		const svg = await stats(fixture, TOKENS, "animated");
		expect(summary(svg)).toMatchInlineSnapshot(`
			{
			  "animations": 2,
			  "dimensions": "495x195",
			  "networkEdges": 2,
			  "nodes": 3,
			  "textGroups": 15,
			  "viewBox": "0 0 495 195",
			}
		`);
	});

	it("matches the Brankas-card SVG snapshot", async () => {
		const svg = await brankas(fixture, TOKENS, "animated");
		expect(summary(svg)).toMatchInlineSnapshot(`
			{
			  "animations": 2,
			  "dimensions": "495x195",
			  "networkEdges": 2,
			  "nodes": 3,
			  "textGroups": 8,
			  "viewBox": "0 0 495 195",
			}
		`);
	});

	it("gives every animated and static component an accessible first-child title", async () => {
		const outputs = [
			{
				svg: await banner(fixture, TOKENS, "animated"),
				title: "ganezha banner",
			},
			{ svg: await banner(fixture, TOKENS, "static"), title: "ganezha banner" },
			{
				svg: await stats(fixture, TOKENS, "animated"),
				title: "ganezha GitHub statistics",
			},
			{
				svg: await stats(fixture, TOKENS, "static"),
				title: "ganezha GitHub statistics",
			},
			{
				svg: await brankas(fixture, TOKENS, "animated"),
				title: "Brankas release card",
			},
			{
				svg: await brankas(fixture, TOKENS, "static"),
				title: "Brankas release card",
			},
		];

		for (const { svg, title } of outputs) {
			expectAccessibleTitle(svg, title);
			expectAccessibleTitle(optimizeSvg(svg, svg.includes("<animate")), title);
		}
	});

	it("uses the four slogan lines verbatim from the source fixture", async () => {
		const svg = await banner(fixture, TOKENS, "static");
		expect(sloganSource).toEqual(SLOGAN);
		expect(labels(svg).slice(1)).toEqual(sloganSource);
	});

	it("preserves exact slogan aria-labels and embeds the local pleading-face emoji", async () => {
		const outputs = [
			{ svg: await banner(fixture, TOKENS, "animated"), animated: true },
			{ svg: await banner(fixture, TOKENS, "static"), animated: false },
		];
		for (const { svg, animated } of outputs) {
			for (const output of [svg, optimizeSvg(svg, animated)]) {
				expect(labels(output).slice(1)).toEqual(SLOGAN);
				expect(output).toContain("🥺");
				expect(dataImageReferences(output)).toEqual([emojiDataUri]);
			}
		}
	});

	it("prefixes Satori ids and keeps ids unique in each rendered dist SVG", async () => {
		const outputs = [
			{
				svg: await banner(fixture, TOKENS, "animated"),
				prefix: /^(?:banner-wordmark|banner-slogan-\d+)-/,
			},
			{
				svg: await banner(fixture, TOKENS, "static"),
				prefix: /^(?:banner-wordmark|banner-slogan-\d+)-/,
			},
			{
				svg: await stats(fixture, TOKENS, "animated"),
				prefix: /^stats-label-\d+-/,
			},
			{
				svg: await stats(fixture, TOKENS, "static"),
				prefix: /^stats-label-\d+-/,
			},
			{
				svg: await brankas(fixture, TOKENS, "animated"),
				prefix: /^brankas-label-\d+-/,
			},
			{
				svg: await brankas(fixture, TOKENS, "static"),
				prefix: /^brankas-label-\d+-/,
			},
		];

		for (const { svg, prefix } of outputs) {
			const optimized = optimizeSvg(svg, svg.includes("<animate"));
			for (const current of [svg, optimized]) {
				expectUniqueIds(current);
				const titleId = current.match(/<title\b[^>]*\bid="([^"]+)"/)?.[1];
				const generatedIds = [...current.matchAll(/\bid="([^"]+)"/gi)]
					.map((match) => match[1])
					.filter((id) => id !== titleId);
				for (const id of generatedIds) expect(id).toMatch(prefix);
			}
		}
	});

	it("renders a null Brankas value as em dashes without throwing", async () => {
		const svg = await brankas(
			{ ...fixture, brankas: null },
			TOKENS,
			"animated",
		);
		expect(labels(svg).filter((label) => label === "—")).toHaveLength(3);
	});

	it("removes all SMIL animation from every static fallback", async () => {
		const outputs = await Promise.all([
			banner(fixture, TOKENS, "static"),
			stats(fixture, TOKENS, "static"),
			brankas(fixture, TOKENS, "static"),
		]);
		for (const svg of outputs) expect(svg).not.toMatch(/<animate\b/i);
	});

	it("keeps SMIL animations on decorative connector lines only", async () => {
		const outputs = await Promise.all([
			banner(fixture, TOKENS, "animated"),
			stats(fixture, TOKENS, "animated"),
			brankas(fixture, TOKENS, "animated"),
		]);
		for (const svg of outputs) {
			const animatedLines = [
				...svg.matchAll(
					/<line\b[^>]*class="network-motif__edge"[^>]*>[\s\S]*?<animate\b[\s\S]*?<\/line>/g,
				),
			];
			expect(animatedLines).toHaveLength(
				(svg.match(/<animate\b/g) ?? []).length,
			);
			expect(svg).not.toMatch(
				/<g\b[^>]*aria-label="[^"]*"[^>]*>[\s\S]*?<animate\b/i,
			);
		}
	});

	it("enforces optimized SVG size limits", async () => {
		const outputs = await Promise.all([
			banner(fixture, TOKENS, "animated"),
			stats(fixture, TOKENS, "animated"),
			brankas(fixture, TOKENS, "animated"),
		]);
		const names = ["banner", "stats", "brankas"] as const;
		for (const [index, svg] of outputs.entries()) {
			const name = names[index];
			if (name === undefined) throw new Error("Missing SVG fixture name.");
			const optimized = optimizeSvg(svg, true);
			assertSvgSize(optimized, name);
			expect(
				new TextEncoder().encode(optimized).byteLength,
			).toBeLessThanOrEqual(svgSizeLimit(name));
		}
	});

	it("rejects external links and non-SVG data images during optimization", () => {
		expect(
			optimizeSvgResult(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="https://example.invalid/emoji.svg" /></svg>',
				false,
			),
		).toMatchObject({
			ok: false,
			error: {
				code: "invalid-svg",
				message: expect.stringContaining(
					"reference other than the embedded local emoji image",
				),
			},
		});
		expect(
			optimizeSvgResult(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="data:image/png;base64,AAAA" /></svg>',
				false,
			),
		).toMatchObject({
			ok: false,
			error: {
				code: "invalid-svg",
				message: expect.stringContaining(
					"reference other than the embedded local emoji image",
				),
			},
		});
	});

	it("keeps SVG output safe and permits only the local emoji data image", async () => {
		const outputs = [
			{ svg: await banner(fixture, TOKENS, "animated"), hasEmoji: true },
			{ svg: await banner(fixture, TOKENS, "static"), hasEmoji: true },
			{ svg: await stats(fixture, TOKENS, "animated"), hasEmoji: false },
			{ svg: await stats(fixture, TOKENS, "static"), hasEmoji: false },
			{ svg: await brankas(fixture, TOKENS, "animated"), hasEmoji: false },
			{ svg: await brankas(fixture, TOKENS, "static"), hasEmoji: false },
		];
		const forbidden = [
			/<\s*script\b/i,
			/<\s*text\b/i,
			/\bon[a-z]+\s*=/i,
			/<\s*foreignObject\b/i,
			/\b(?:xlink:)?href\s*=/i,
			/url\s*\(/i,
		];
		for (const { svg, hasEmoji } of outputs) {
			const dataHrefs = dataImageReferences(svg);
			expect(dataHrefs).toEqual(hasEmoji ? [emojiDataUri] : []);
			const sanitized = withoutAllowedEmojiDataUri(svg);
			for (const pattern of forbidden) expect(sanitized).not.toMatch(pattern);
			expect(sanitized).not.toMatch(/\bdata:/i);
			expect(svg).toContain("@media(prefers-reduced-motion:reduce)");
			const optimized = optimizeSvg(svg, svg.includes("<animate"));
			for (const pattern of forbidden) {
				expect(withoutAllowedEmojiDataUri(optimized)).not.toMatch(pattern);
			}
		}
		for (const file of ["banner.ts", "stats-card.ts", "brankas-card.ts"]) {
			const source = await readFile(
				new URL(`./${file}`, import.meta.url),
				"utf8",
			);
			expect(source).not.toMatch(/#[\da-f]{6}\b/i);
		}
	});

	it("preserves the light-scheme and reduced-motion token rules", async () => {
		const output = await banner(fixture, TOKENS, "animated");
		expect(output).toContain("prefers-color-scheme:light");
		expect(output).toContain("prefers-reduced-motion:reduce");
	});
});
