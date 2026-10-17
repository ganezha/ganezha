import { readFile } from "node:fs/promises";
import { TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import { beforeAll, describe, expect, it } from "vitest";
import { renderActivityCard as renderActivityCardResult } from "./activity-card";
import {
	assertSvgSize as assertSvgSizeResult,
	optimizeSvg as optimizeSvgResult,
	svgSizeLimit,
} from "./optimize";
import { expectResult, expectResultAsync } from "./result-test-utils";
import { renderTextPaths, type SatoriFont } from "./text";

let baseSnapshot: ProfileSnapshot;
let text: (
	value: string,
	options: Parameters<typeof renderTextPaths>[2],
) => ReturnType<typeof renderTextPaths>;

const renderActivityCard = (
	...args: Parameters<typeof renderActivityCardResult>
) => expectResultAsync(renderActivityCardResult(...args));
const optimizeSvg = (...args: Parameters<typeof optimizeSvgResult>) =>
	expectResult(optimizeSvgResult(...args));
const assertSvgSize = (...args: Parameters<typeof assertSvgSizeResult>) =>
	expectResult(assertSvgSizeResult(...args));

function makeSnapshot(
	calendar: readonly Readonly<{ date: string; count: number }>[],
): ProfileSnapshot {
	return { ...baseSnapshot, calendar };
}

function animationTags(svg: string): string[] {
	return [...svg.matchAll(/<animate(?:Transform|Motion)?\b[^>]*>/gi)].map(
		(match) => match[0],
	);
}

function idList(svg: string): string[] {
	return [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? "");
}

function visibleLabels(svg: string): string[] {
	return [...svg.matchAll(/<g\b[^>]*aria-label="([^"]+)"/g)].map(
		(match) => match[1] ?? "",
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

describe("activity card", () => {
	it("matches the accessible SVG structure snapshot", async () => {
		const snapshot = makeSnapshot([
			{ date: "2026-10-14", count: 1 },
			{ date: "2026-10-15", count: 0 },
			{ date: "2026-10-16", count: 3 },
		]);
		const svg = await renderActivityCard(snapshot, { animated: false }, text);
		const title = svg.match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? null;
		expect({
			viewBox: svg.match(/\bviewBox="([^"]+)"/)?.[1] ?? null,
			titleIsFirstChild: /<svg\b[^>]*><title\b/.test(svg),
			title,
			labels: visibleLabels(svg),
			animations: animationTags(svg).length,
		}).toMatchSnapshot();
	});

	it("shows placeholders when calendar data or pushed-repository data is absent", async () => {
		const missing = await renderActivityCard(
			makeSnapshot([]),
			{ animated: false },
			text,
		);
		const zeroCalendar = await renderActivityCard(
			makeSnapshot([
				{ date: "2026-10-15", count: 0 },
				{ date: "2026-10-16", count: 0 },
			]),
			{ animated: false },
			text,
		);
		expect(
			visibleLabels(missing).filter((label) => label === "—"),
		).toHaveLength(5);
		expect(visibleLabels(zeroCalendar)).toContain("0 days");
		expect(visibleLabels(zeroCalendar)).toContain("0");
		expect(visibleLabels(missing)).toContain("—");
	});

	it("keeps static output still and uses only light decorative animation", async () => {
		const snapshot = makeSnapshot([
			{ date: "2026-10-16", count: 1 },
			{ date: "2026-10-17", count: 2 },
		]);
		const [staticSvg, animatedSvg] = await Promise.all([
			renderActivityCard(snapshot, { animated: false }, text),
			renderActivityCard(snapshot, { animated: true }, text),
		]);
		expect(animationTags(staticSvg)).toHaveLength(0);
		expect(animationTags(animatedSvg)).toHaveLength(2);
		expect(animatedSvg).toContain("prefers-reduced-motion:reduce");
	});

	it("has a first-child accessible title and unique prefixed IDs", async () => {
		const svg = await renderActivityCard(
			makeSnapshot([{ date: "2026-10-17", count: 1 }]),
			{ animated: false },
			text,
		);
		const root = svg.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/);
		const rootAttributes = root?.[1] ?? "";
		const body = root?.[2] ?? "";
		const title = body.match(/^<title\b([^>]*)>([\s\S]*?)<\/title>/);
		const titleId = title?.[1]?.match(/\bid="([^"]+)"/)?.[1];
		expect(root).not.toBeNull();
		expect(rootAttributes).toContain('role="img"');
		expect(rootAttributes).toContain(`aria-labelledby="${titleId}"`);
		const ids = idList(svg);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.every((id) => id.startsWith("activity-"))).toBe(true);
	});

	it("uses token paints and Satori paths without external references or live text", async () => {
		const svg = await renderActivityCard(
			makeSnapshot([{ date: "2026-10-17", count: 2 }]),
			{ animated: true },
			text,
		);
		expect(svg).not.toMatch(/<\s*text\b/i);
		expect(svg).toContain("prefers-color-scheme:light");
		expect(svg).toContain("var(--gz-text)");
		expect(svg).toContain("var(--gz-gold-text)");
		expect(svg).not.toMatch(/\burl\s*\(/i);
		expect(svg).not.toMatch(/\b(?:xlink:)?href\s*=/i);
		expect(svg).not.toMatch(
			/<(?:path|g)\b[^>]*\b(?:fill|stroke)="#?[\da-f]{3,8}"/i,
		);
	});

	it("optimizes both modes below the 40 KB asset limit", async () => {
		const snapshot = makeSnapshot(
			Array.from({ length: 371 }, (_, index) => ({
				date: new Date(Date.UTC(2025, 9, 12 + index))
					.toISOString()
					.slice(0, 10),
				count: index % 7,
			})),
		);
		for (const animated of [true, false]) {
			const svg = await renderActivityCard(snapshot, { animated }, text);
			const optimized = optimizeSvg(svg, animated);
			assertSvgSize(optimized, "activity");
			expect(
				new TextEncoder().encode(optimized).byteLength,
			).toBeLessThanOrEqual(svgSizeLimit("activity"));
			expect(optimized).not.toMatch(/<\s*text\b/i);
		}
	});
});
