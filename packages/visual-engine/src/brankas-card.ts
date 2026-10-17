import { type DesignTokens, TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import {
	resolveSvgRenderOptions,
	type SvgComponent,
	type TextRenderer,
} from "./banner";
import { frame, networkMotif } from "./primitives";
import { collect } from "./result";

function dateText(value: string | null): string {
	if (value === null) return "—";
	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp)
		? "—"
		: new Date(timestamp).toISOString().slice(0, 10);
}

function numberText(value: number | null): string {
	return value === null
		? "—"
		: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
				value,
			);
}

export function createBrankasCard(text: TextRenderer): SvgComponent {
	return async (
		snapshot: ProfileSnapshot,
		tokens: DesignTokens = TOKENS,
		options = "animated",
	) => {
		const { animated, scheme } = resolveSvgRenderOptions(options);
		const brankas = snapshot.brankas;
		const labels = [
			{
				value: "Brankas",
				x: 18,
				y: 12,
				width: 340,
				height: 33,
				fontSize: tokens.type.size.xl,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.goldText,
				colorVariable: "gold-text" as const,
			},
			{
				value: "Kotlin / Compose",
				x: 18,
				y: 47,
				width: 300,
				height: 19,
				fontSize: tokens.type.size.sm,
				fontWeight: tokens.type.weight.regular,
				color: tokens.color.textMuted,
				colorVariable: "text-muted" as const,
			},
			{
				value: "LATEST RELEASE",
				x: 18,
				y: 83,
				width: 180,
				height: 16,
				fontSize: tokens.type.size.xs,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.textMuted,
				colorVariable: "text-muted" as const,
			},
			{
				value: brankas?.latestTag ?? "—",
				x: 18,
				y: 100,
				width: 185,
				height: 26,
				fontSize: tokens.type.size.md,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.text,
				colorVariable: "text" as const,
			},
			{
				value: "PUBLISHED",
				x: 245,
				y: 83,
				width: 185,
				height: 16,
				fontSize: tokens.type.size.xs,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.textMuted,
				colorVariable: "text-muted" as const,
			},
			{
				value: dateText(brankas?.publishedAt ?? null),
				x: 245,
				y: 100,
				width: 220,
				height: 26,
				fontSize: tokens.type.size.md,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.text,
				colorVariable: "text" as const,
			},
			{
				value: numberText(brankas?.stars ?? null),
				x: 18,
				y: 146,
				width: 120,
				height: 29,
				fontSize: tokens.type.size.lg,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.goldText,
				colorVariable: "gold-text" as const,
			},
			{
				value: "STARS",
				x: 89,
				y: 152,
				width: 120,
				height: 18,
				fontSize: tokens.type.size.xs,
				fontWeight: tokens.type.weight.regular,
				color: tokens.color.textMuted,
				colorVariable: "text-muted" as const,
			},
		];
		const textResults = await Promise.all(
			labels.map(({ value, colorVariable, ...layout }, index) =>
				text(value, {
					...layout,
					colorVariable,
					idPrefix: `brankas-label-${index}`,
				}),
			),
		);
		const textLayers = collect(textResults);
		if (!textLayers.ok) return textLayers;
		const divider = `<line x1="18" y1="75" x2="477" y2="75" stroke="var(--gz-border)" stroke-width="${tokens.stroke.thin}" />`;
		const motif = networkMotif(
			[
				{ x: 424, y: 18 },
				{ x: 448, y: 28 },
				{ x: 478, y: 16 },
			],
			tokens,
			animated,
			scheme,
		);
		if (!motif.ok) return motif;

		return frame(
			tokens.card.width,
			tokens.card.height,
			tokens,
			`${motif.value}${divider}${textLayers.value.join("")}`,
			{ id: "brankas-release-card-title", title: "Brankas release card" },
			scheme,
		);
	};
}
