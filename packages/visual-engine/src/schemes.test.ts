import { readFile } from "node:fs/promises";
import { contrastRatio, type DesignTokens, TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import { beforeAll, describe, expect, it } from "vitest";
import { createActivityCard } from "./activity-card";
import { createBanner, type SvgComponent } from "./banner";
import { createBrankasCard } from "./brankas-card";
import {
	assertSvgSize as assertSvgSizeResult,
	optimizeSvg as optimizeSvgResult,
	type SvgAssetName,
	svgSizeLimit,
} from "./optimize";
import { type ColorScheme, paletteForScheme } from "./primitives";
import { expectResult, expectResultAsync } from "./result-test-utils";
import { createSkyline } from "./skyline";
import { createStatsCard } from "./stats-card";
import { renderTextPaths, type SatoriFont } from "./text";

let fixture: ProfileSnapshot;
type StringComponent = (...args: Parameters<SvgComponent>) => Promise<string>;
let renderers: readonly Readonly<{
	name: SvgAssetName;
	render: StringComponent;
}>[];

function stringComponent(component: SvgComponent): StringComponent {
	return (...args) => expectResultAsync(component(...args));
}

const optimizeSvg = (...args: Parameters<typeof optimizeSvgResult>) =>
	expectResult(optimizeSvgResult(...args));
const assertSvgSize = (...args: Parameters<typeof assertSvgSizeResult>) =>
	expectResult(assertSvgSizeResult(...args));

function hexPaints(svg: string): string[] {
	return [...svg.matchAll(/#[\da-f]{3,8}\b/gi)].map((match) =>
		(match[0] ?? "").toUpperCase(),
	);
}

function assertAccessibleAndSafe(svg: string, animated: boolean): void {
	const root = svg.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i);
	const rootAttributes = root?.[1] ?? "";
	const body = root?.[2] ?? "";
	const title = body.match(/^<title\b([^>]*)>([\s\S]*?)<\/title>/i);
	const titleId = title?.[1]?.match(/\bid="([^"]+)"/)?.[1];
	const ids = [...svg.matchAll(/\bid="([^"]+)"/gi)].map(
		(match) => match[1] ?? "",
	);
	const hrefs = [...svg.matchAll(/\b(?:xlink:)?href="([^"]+)"/gi)].map(
		(match) => match[1] ?? "",
	);

	expect(root).not.toBeNull();
	expect(title).not.toBeNull();
	expect(rootAttributes).toContain('role="img"');
	expect(rootAttributes).toContain(`aria-labelledby="${titleId}"`);
	expect(new Set(ids).size).toBe(ids.length);
	expect(svg).not.toMatch(/<\s*text\b/i);
	expect(svg).not.toMatch(/\burl\s*\(/i);
	expect(
		hrefs.every(
			(href) =>
				href.startsWith("data:image/svg+xml;base64,") ||
				(/^#[A-Za-z_][\w.:-]*$/.test(href) && ids.includes(href.slice(1))),
		),
	).toBe(true);
	if (animated) expect(svg).toMatch(/<animate(?:Transform|Motion)?\b/i);
	else expect(svg).not.toMatch(/<animate(?:Transform|Motion)?\b/i);
}

function expectedPalette(
	tokens: DesignTokens,
	scheme: ColorScheme,
): Set<string> {
	return new Set(
		hexPaints(Object.values(paletteForScheme(tokens, scheme)).join(" ")),
	);
}

beforeAll(async () => {
	const loaded = JSON.parse(
		await readFile(
			new URL("../fixtures/profile.json", import.meta.url),
			"utf8",
		),
	) as ProfileSnapshot;
	fixture = {
		...loaded,
		calendar: Array.from({ length: 14 }, (_, index) => ({
			date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
			count: (index % 4) + 1,
		})),
	};
	const [regular, bold] = await Promise.all([
		readFile(
			new URL("../assets/fonts/JetBrainsMono-Regular.ttf", import.meta.url),
		),
		readFile(
			new URL("../assets/fonts/JetBrainsMono-Bold.ttf", import.meta.url),
		),
	]);
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
	renderers = [
		{ name: "banner", render: stringComponent(createBanner(text)) },
		{ name: "stats", render: stringComponent(createStatsCard(text)) },
		{ name: "brankas", render: stringComponent(createBrankasCard(text)) },
		{ name: "skyline", render: stringComponent(createSkyline(text)) },
		{ name: "activity", render: stringComponent(createActivityCard(text)) },
	];
});

describe("explicit SVG color schemes", () => {
	it("keeps every asset variant inside its selected token palette", async () => {
		for (const scheme of ["dark", "light"] as const) {
			const palette = expectedPalette(TOKENS, scheme);
			for (const { name, render } of renderers) {
				for (const animated of [true, false]) {
					const svg = await render(fixture, TOKENS, { scheme, animated });
					expect(svg).not.toContain("prefers-color-scheme");
					assertAccessibleAndSafe(svg, animated);
					for (const color of hexPaints(svg)) {
						expect(
							palette.has(color),
							`${name} ${scheme} contains ${color}`,
						).toBe(true);
					}
					const optimized = optimizeSvg(svg, animated);
					assertSvgSize(optimized, name);
					expect(
						new TextEncoder().encode(optimized).byteLength,
					).toBeLessThanOrEqual(svgSizeLimit(name));
					assertAccessibleAndSafe(optimized, animated);
				}
			}
		}
	});

	it("keeps primary text at WCAG AA contrast in dark and light palettes", () => {
		for (const scheme of ["dark", "light"] as const) {
			const palette = paletteForScheme(TOKENS, scheme);
			for (const foreground of [
				palette.text,
				palette.textMuted,
				palette.goldText,
			]) {
				for (const background of [palette.bg, palette.surface]) {
					expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
						4.5,
					);
				}
			}
		}
	});
});
