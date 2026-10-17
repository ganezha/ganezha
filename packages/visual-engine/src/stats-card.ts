import { type DesignTokens, TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import {
	resolveSvgRenderOptions,
	type SvgComponent,
	type TextRenderer,
} from "./banner";
import { frame, networkMotif } from "./primitives";
import { collect } from "./result";

function numberText(value: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
		value,
	);
}

export function createStatsCard(text: TextRenderer): SvgComponent {
	return async (
		snapshot: ProfileSnapshot,
		tokens: DesignTokens = TOKENS,
		options = "animated",
	) => {
		const { animated, scheme } = resolveSvgRenderOptions(options);
		const labels = [
			{
				value: snapshot.login.toUpperCase(),
				x: 16,
				y: 9,
				width: 370,
				height: 20,
				fontSize: tokens.type.size.sm,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.goldText,
				colorVariable: "gold-text" as const,
			},
			{
				value: numberText(snapshot.contributions.total),
				x: 16,
				y: 34,
				width: 120,
				height: 36,
				fontSize: tokens.type.size.xl,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.goldText,
				colorVariable: "gold-text" as const,
			},
			{
				value: "TOTAL CONTRIBUTIONS",
				x: 16,
				y: 68,
				width: 175,
				height: 16,
				fontSize: tokens.type.size.xs,
				fontWeight: tokens.type.weight.regular,
				color: tokens.color.textMuted,
				colorVariable: "text-muted" as const,
			},
			...[
				{
					label: "COMMITS",
					value: snapshot.contributions.commits,
					x: 186,
				},
				{
					label: "PULL REQUESTS",
					value: snapshot.contributions.prs,
					x: 292,
				},
				{
					label: "ISSUES",
					value: snapshot.contributions.issues,
					x: 408,
				},
			].flatMap(({ label, value, x }) => [
				{
					value: numberText(value),
					x,
					y: 39,
					width: label === "PULL REQUESTS" ? 96 : 74,
					height: 22,
					fontSize: tokens.type.size.md,
					fontWeight: tokens.type.weight.bold,
					color: tokens.color.text,
					colorVariable: "text" as const,
				},
				{
					value: label,
					x,
					y: 60,
					width: label === "PULL REQUESTS" ? 105 : 75,
					height: 15,
					fontSize: tokens.type.size.xs,
					fontWeight: tokens.type.weight.regular,
					color: tokens.color.textMuted,
					colorVariable: "text-muted" as const,
				},
			]),
			{
				value: numberText(snapshot.totalStars),
				x: 16,
				y: 91,
				width: 115,
				height: 26,
				fontSize: tokens.type.size.lg,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.goldText,
				colorVariable: "gold-text" as const,
			},
			{
				value: "PUBLIC STARS",
				x: 16,
				y: 116,
				width: 125,
				height: 15,
				fontSize: tokens.type.size.xs,
				fontWeight: tokens.type.weight.regular,
				color: tokens.color.textMuted,
				colorVariable: "text-muted" as const,
			},
			{
				value: numberText(snapshot.publicRepos),
				x: 166,
				y: 91,
				width: 100,
				height: 26,
				fontSize: tokens.type.size.lg,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.text,
				colorVariable: "text" as const,
			},
			{
				value: "PUBLIC REPOSITORIES",
				x: 166,
				y: 116,
				width: 190,
				height: 15,
				fontSize: tokens.type.size.xs,
				fontWeight: tokens.type.weight.regular,
				color: tokens.color.textMuted,
				colorVariable: "text-muted" as const,
			},
			{
				value: "TOP LANGUAGES",
				x: 16,
				y: 136,
				width: 160,
				height: 14,
				fontSize: tokens.type.size.xs,
				fontWeight: tokens.type.weight.bold,
				color: tokens.color.textMuted,
				colorVariable: "text-muted" as const,
			},
			...snapshot.topLanguages.slice(0, 6).map((language, index) => ({
				value: language.name,
				x: 16 + index * 77,
				y: 152,
				width: 72,
				height: 15,
				fontSize: tokens.type.size.xs,
				fontWeight: tokens.type.weight.regular,
				color: tokens.color.text,
				colorVariable: "text" as const,
			})),
		];

		const textResults = await Promise.all(
			labels.map(({ value, colorVariable, ...layout }, index) =>
				text(value, {
					...layout,
					colorVariable,
					idPrefix: `stats-label-${index}`,
				}),
			),
		);
		const textLayers = collect(textResults);
		if (!textLayers.ok) return textLayers;
		const languageBars = snapshot.topLanguages
			.slice(0, 6)
			.map((language, index) => {
				const x = 16 + index * 77;
				const width = Math.max(2, Math.min(68, language.share * 68));
				return `<rect x="${x}" y="172" width="68" height="4" rx="${tokens.radius.sm / 2}" fill="var(--gz-border)" /><rect x="${x}" y="172" width="${width}" height="4" rx="${tokens.radius.sm / 2}" fill="var(--gz-gold)" />`;
			})
			.join("");
		const divider = `<line x1="16" y1="84" x2="479" y2="84" stroke="var(--gz-border)" stroke-width="${tokens.stroke.thin}" />`;
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
			`${motif.value}${divider}${languageBars}${textLayers.value.join("")}`,
			{ id: "ganezha-statistics-title", title: "ganezha GitHub statistics" },
			scheme,
		);
	};
}
