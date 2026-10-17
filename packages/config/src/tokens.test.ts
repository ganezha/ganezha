import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { TOKENS } from "./tokens";

const darkColors = [
	TOKENS.color.bg,
	TOKENS.color.surface,
	TOKENS.color.border,
	TOKENS.color.gold,
	TOKENS.color.goldText,
	TOKENS.color.goldMuted,
	TOKENS.color.text,
	TOKENS.color.textMuted,
	TOKENS.color.accent,
];

const lightColors = Object.values(TOKENS.color.light);

const hexChannel = fc.integer({ min: 0, max: 255 });
const hexColor = fc
	.tuple(hexChannel, hexChannel, hexChannel)
	.map(
		([red, green, blue]) =>
			`#${[red, green, blue]
				.map((channel) => channel.toString(16).padStart(2, "0"))
				.join("")}`,
	);

describe("design tokens", () => {
	it("uses valid #RRGGBB values for every color token", () => {
		expect(
			[...darkColors, ...lightColors].every((hex) =>
				/^#[\da-fA-F]{6}$/.test(hex),
			),
		).toBe(true);
	});

	it("meets WCAG text contrast in dark and light modes", () => {
		for (const colors of [TOKENS.color, TOKENS.color.light]) {
			for (const foreground of [
				colors.text,
				colors.goldText,
				colors.textMuted,
			]) {
				expect(contrastRatio(foreground, colors.bg)).toBeGreaterThanOrEqual(
					4.5,
				);
			}
		}
	});

	it("meets graphic contrast in dark and light modes", () => {
		const modes = [
			{
				bg: TOKENS.color.bg,
				gold: TOKENS.color.gold,
				accent: TOKENS.color.accent,
			},
			{
				bg: TOKENS.color.light.bg,
				gold: TOKENS.color.light.gold,
				accent: TOKENS.color.light.accent,
			},
		];

		for (const mode of modes) {
			expect(contrastRatio(mode.gold, mode.bg)).toBeGreaterThanOrEqual(3);
			expect(contrastRatio(mode.accent, mode.bg)).toBeGreaterThanOrEqual(3);
		}
	});

	it("keeps contrast symmetric and between 1 and 21", () => {
		fc.assert(
			fc.property(hexColor, hexColor, (a, b) => {
				const ratio = contrastRatio(a, b);
				return ratio === contrastRatio(b, a) && ratio >= 1 && ratio <= 21;
			}),
		);
	});
});
