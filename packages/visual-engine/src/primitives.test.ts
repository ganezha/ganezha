import { TOKENS } from "@ganezha/config";
import { describe, expect, it } from "vitest";
import {
	frame as frameResult,
	networkMotif as networkMotifResult,
	SVG_STYLE_BLOCK,
} from "./primitives";
import { expectResult } from "./result-test-utils";

const frame = (...args: Parameters<typeof frameResult>) =>
	expectResult(frameResult(...args));
const networkMotif = (...args: Parameters<typeof networkMotifResult>) =>
	expectResult(networkMotifResult(...args));

describe("SVG primitives", () => {
	it("matches the frame structure snapshot", () => {
		const svg = frame(120, 60);
		expect({
			root: svg.match(/<svg[^>]+>/)?.[0],
			background: svg.includes(`fill="var(--gz-bg,${TOKENS.color.bg})"`),
			borderRadius: svg.includes(`rx="${TOKENS.radius.lg}"`),
		}).toMatchInlineSnapshot(`
			{
			  "background": true,
			  "borderRadius": true,
			  "root": "<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60">",
			}
		`);
	});

	it("matches the static and animated network motif snapshots", () => {
		const nodes = [
			{ x: 10, y: 20 },
			{ x: 30, y: 40 },
		] as const;
		const staticMotif = networkMotif(nodes);
		const animatedMotif = networkMotif(nodes, TOKENS, true);
		expect({
			staticEdges: (staticMotif.match(/<line\b/g) ?? []).length,
			staticNodes: (staticMotif.match(/<circle\b/g) ?? []).length,
			staticAnimations: (staticMotif.match(/<animate\b/g) ?? []).length,
			animatedAnimations: (animatedMotif.match(/<animate\b/g) ?? []).length,
			accent: staticMotif.includes(
				`stroke="var(--gz-accent,${TOKENS.color.accent})"`,
			),
			gold: staticMotif.includes(`fill="var(--gz-gold,${TOKENS.color.gold})"`),
		}).toMatchInlineSnapshot(`
			{
			  "accent": true,
			  "animatedAnimations": 1,
			  "gold": true,
			  "staticAnimations": 0,
			  "staticEdges": 1,
			  "staticNodes": 2,
			}
		`);
	});

	it("supports light color scheme and reduced-motion preferences", () => {
		expect(SVG_STYLE_BLOCK).toContain("prefers-color-scheme:light");
		expect(SVG_STYLE_BLOCK).toContain("prefers-reduced-motion:reduce");
		expect(SVG_STYLE_BLOCK).toContain("svg animate{display:none!important}");
	});

	it("contains no prohibited or external SVG features", () => {
		const outputs = [
			frame(600, 120),
			networkMotif([
				{ x: 1, y: 2 },
				{ x: 3, y: 4 },
			]),
			networkMotif(
				[
					{ x: 1, y: 2 },
					{ x: 3, y: 4 },
				],
				TOKENS,
				true,
			),
			SVG_STYLE_BLOCK,
		];
		const forbidden = [
			/<\s*script\b/i,
			/<\s*text\b/i,
			/\bon[a-z]+\s*=/i,
			/<\s*foreignObject\b/i,
			/\b(?:xlink:)?href\s*=/i,
			/url\s*\(/i,
		];

		for (const output of outputs) {
			for (const pattern of forbidden) expect(output).not.toMatch(pattern);
		}
	});

	it("returns typed errors for invalid dimensions and node coordinates", () => {
		expect(frameResult(0, 100)).toMatchObject({
			ok: false,
			error: { code: "invalid-input" },
		});
		expect(networkMotifResult([{ x: Number.NaN, y: 1 }])).toMatchObject({
			ok: false,
			error: { code: "invalid-input" },
		});
	});
});
