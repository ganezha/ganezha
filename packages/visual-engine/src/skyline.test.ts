import { readFile } from "node:fs/promises";
import { TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import {
	assertSvgSize as assertSvgSizeResult,
	optimizeSvg as optimizeSvgResult,
	svgSizeLimit,
} from "./optimize";
import { expectResult, expectResultAsync } from "./result-test-utils";
import {
	contributionHeight as contributionHeightResult,
	renderSkyline as renderSkylineResult,
} from "./skyline";
import { renderTextPaths, type SatoriFont } from "./text";

let baseSnapshot: ProfileSnapshot;
let text: (
	value: string,
	options: Parameters<typeof renderTextPaths>[2],
) => ReturnType<typeof renderTextPaths>;

const renderSkyline = (...args: Parameters<typeof renderSkylineResult>) =>
	expectResultAsync(renderSkylineResult(...args));
const contributionHeight = (count: number) =>
	expectResult(contributionHeightResult(count));
const optimizeSvg = (...args: Parameters<typeof optimizeSvgResult>) =>
	expectResult(optimizeSvgResult(...args));
const assertSvgSize = (...args: Parameters<typeof assertSvgSizeResult>) =>
	expectResult(assertSvgSizeResult(...args));

function makeSnapshot(counts: readonly number[]): ProfileSnapshot {
	const calendar = counts.map((count, index) => ({
		date: new Date(Date.UTC(2025, 9, 12 + index)).toISOString().slice(0, 10),
		count,
	}));
	const total = counts.reduce((sum, count) => sum + count, 0);
	return {
		...baseSnapshot,
		contributions: { ...baseSnapshot.contributions, total },
		calendar,
	};
}

function dayBlockCount(svg: string): number {
	return (svg.match(/class="skyline-day"/g) ?? []).length;
}

function animationTags(svg: string): string[] {
	return [...svg.matchAll(/<animate(?:Transform|Motion)?\b[^>]*>/gi)].map(
		(match) => match[0],
	);
}

beforeAll(async () => {
	baseSnapshot = JSON.parse(
		await readFile(
			new URL("../fixtures/profile.json", import.meta.url),
			"utf8",
		),
	) as ProfileSnapshot;
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
	text = (value, options) => renderTextPaths(value, fonts, options);
});

describe("contribution skyline", () => {
	it("matches the SVG structure snapshot", async () => {
		const snapshot = makeSnapshot([
			0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
		]);
		const svg = await renderSkyline(snapshot, { animated: false }, text);
		const title = svg.match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? null;
		const labels = [...svg.matchAll(/<g\b[^>]*aria-label="([^"]+)"/g)].map(
			(match) => match[1],
		);
		expect({
			viewBox: svg.match(/\bviewBox="([^"]+)"/)?.[1] ?? null,
			titleIsFirstChild: /<svg\b[^>]*><title\b/.test(svg),
			title,
			labels,
			dayBlocks: dayBlockCount(svg),
			weeks: (svg.match(/id="skyline-week-/g) ?? []).length,
			shapeLevels: (svg.match(/<g id="skyline-shape-/g) ?? []).length,
		}).toMatchSnapshot();
	});

	it("renders one isometric block for each calendar day", async () => {
		const snapshot = makeSnapshot(
			Array.from({ length: 371 }, (_, index) => index % 26),
		);
		const svg = await renderSkyline(snapshot, { animated: false }, text);
		expect(dayBlockCount(svg)).toBe(snapshot.calendar.length);
	});

	it("keeps bar height monotonic with contribution count", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 25 }),
				fc.integer({ min: 0, max: 25 }),
				(first, second) => {
					const lower = Math.min(first, second);
					const higher = Math.max(first, second);
					return contributionHeight(lower) <= contributionHeight(higher);
				},
			),
		);
	});

	it("returns a typed error for invalid contribution counts", () => {
		expect(contributionHeightResult(-1)).toMatchObject({
			ok: false,
			error: { code: "invalid-input" },
		});
	});

	it("handles an empty calendar and a 371-day all-zero calendar", async () => {
		const empty = makeSnapshot([]);
		const allZero = makeSnapshot(Array.from({ length: 371 }, () => 0));
		const [emptySvg, zeroSvg] = await Promise.all([
			renderSkyline(empty, { animated: false }, text),
			renderSkyline(allZero, { animated: false }, text),
		]);
		expect(dayBlockCount(emptySvg)).toBe(0);
		expect(dayBlockCount(zeroSvg)).toBe(371);
		expect(emptySvg).toContain("no date range");
		expect(zeroSvg).toContain("2025-10-12 to 2026-10-17");
	});

	it("keeps static output still and staggers animated weeks within 2.5 seconds", async () => {
		const snapshot = makeSnapshot(Array.from({ length: 371 }, () => 1));
		const [staticSvg, animatedSvg] = await Promise.all([
			renderSkyline(snapshot, { animated: false }, text),
			renderSkyline(snapshot, { animated: true }, text),
		]);
		expect(animationTags(staticSvg)).toHaveLength(0);
		const animations = animationTags(animatedSvg);
		expect(animations).toHaveLength(53);
		const last = animations[animations.length - 1];
		expect(last).toContain('begin="1664ms"');
		expect(last).toContain('dur="750ms"');
		expect(1664 + 750).toBeLessThanOrEqual(2500);
		expect(animatedSvg).toContain("prefers-reduced-motion:reduce");
		expect(animatedSvg).toContain(
			".skyline-week__growth{transform:scale(1,1)!important}",
		);
	});

	it("has accessible title-first SVG output and unique prefixed IDs", async () => {
		const snapshot = makeSnapshot([0, 3, 4]);
		const svg = await renderSkyline(snapshot, { animated: true }, text);
		const root = svg.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/);
		expect(root).not.toBeNull();
		const rootAttributes = root?.[1] ?? "";
		const body = root?.[2] ?? "";
		const title = body.match(/^<title\b([^>]*)>([\s\S]*?)<\/title>/);
		const titleId = title?.[1]?.match(/\bid="([^"]+)"/)?.[1];
		expect(title?.[2]).toContain("7 total contributions");
		expect(title?.[2]).toContain("2025-10-12 to 2025-10-14");
		expect(rootAttributes).toContain('role="img"');
		expect(rootAttributes).toContain(`aria-labelledby="${titleId}"`);
		const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(
			(match) => match[1] ?? "",
		);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.every((id) => id.startsWith("skyline-"))).toBe(true);
	});

	it("uses Satori paths, token colors, and no external references", async () => {
		const snapshot = makeSnapshot([0, 1, 2, 3]);
		const svg = await renderSkyline(snapshot, { animated: true }, text);
		expect(svg).not.toMatch(/<\s*text\b/i);
		expect(svg).toContain("prefers-color-scheme:light");
		expect(svg).toContain("var(--gz-skyline-top)");
		expect(svg).toContain("var(--gz-skyline-left)");
		expect(svg).toContain("var(--gz-skyline-right)");
		expect(svg).not.toMatch(/\burl\s*\(/i);
		const hrefs = [...svg.matchAll(/\bhref="([^"]+)"/g)].map(
			(match) => match[1] ?? "",
		);
		expect(hrefs.every((href) => href.startsWith("#skyline-shape-"))).toBe(
			true,
		);
		const definitions = svg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] ?? "";
		expect(definitions).not.toMatch(/#[\da-f]{3,8}\b/i);
	});

	it("optimizes animated and static assets within the 60 KB limit", async () => {
		const snapshot = makeSnapshot(
			Array.from({ length: 371 }, (_, index) => index % 26),
		);
		for (const animated of [true, false]) {
			const svg = await renderSkyline(snapshot, { animated }, text);
			const optimized = optimizeSvg(svg, animated);
			assertSvgSize(optimized, "skyline");
			expect(
				new TextEncoder().encode(optimized).byteLength,
			).toBeLessThanOrEqual(svgSizeLimit("skyline"));
			expect(optimized).not.toMatch(/<\s*text\b/i);
		}
	});
});
