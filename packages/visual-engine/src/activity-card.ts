import { type DesignTokens, TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import { calculateActivityMetrics } from "./activity-metrics";
import {
	resolveSvgRenderOptions,
	type SvgComponent,
	type SvgRenderOptions,
	type TextRenderer,
} from "./banner";
import { frame, networkMotif } from "./primitives";
import { collect, type Result } from "./result";
import type { TextPathOptions } from "./text";

export type ActivityCardOptions = SvgRenderOptions;

function numberText(value: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
		value,
	);
}

function textOptions(
	idPrefix: string,
	x: number,
	y: number,
	width: number,
	height: number,
	fontSize: number,
	fontWeight: 400 | 700,
	color: string,
	colorVariable: TextPathOptions["colorVariable"],
): TextPathOptions {
	return {
		idPrefix,
		x,
		y,
		width,
		height,
		fontSize,
		fontWeight,
		color,
		colorVariable,
	};
}

function withoutHardcodedTextPaint(svg: string): string {
	return svg.replace(/\s+(?:fill|stroke)=(['"])#[\da-f]{3,8}\1/gi, "");
}

/** Renders a compact summary of the available contribution calendar data. */
export async function renderActivityCard(
	snapshot: ProfileSnapshot,
	options: ActivityCardOptions,
	text: TextRenderer,
	tokens: DesignTokens = TOKENS,
): Promise<Result<string>> {
	const { animated, scheme } = resolveSvgRenderOptions(options);
	const metrics = calculateActivityMetrics(snapshot.calendar);
	const mostActive = metrics.mostActiveDay;
	const values = [
		mostActive === null
			? "—"
			: `${mostActive.date} · ${numberText(mostActive.count)}`,
		metrics.hasCalendarData ? `${metrics.currentStreak} days` : "—",
		metrics.hasCalendarData ? `${metrics.longestStreak} days` : "—",
		metrics.last30DaysTotal === null
			? "—"
			: numberText(metrics.last30DaysTotal),
	];
	const textResults = await Promise.all([
		text(
			"Activity",
			textOptions(
				"activity-heading",
				18,
				10,
				280,
				28,
				tokens.type.size.lg,
				tokens.type.weight.bold,
				tokens.color.text,
				"text",
			),
		),
		...[
			{ label: "MOST ACTIVE DAY", x: 18, y: 45, valueY: 60 },
			{ label: "CURRENT STREAK", x: 258, y: 45, valueY: 60 },
			{ label: "LONGEST STREAK", x: 18, y: 96, valueY: 111 },
			{ label: "LAST 30 DAYS", x: 258, y: 96, valueY: 111 },
		].flatMap(({ label, x, y, valueY }, index) => [
			text(
				label,
				textOptions(
					`activity-label-${index}`,
					x,
					y,
					220,
					14,
					tokens.type.size.xs,
					tokens.type.weight.bold,
					tokens.color.textMuted,
					"text-muted",
				),
			),
			text(
				values[index] ?? "—",
				textOptions(
					`activity-value-${index}`,
					x,
					valueY,
					220,
					25,
					tokens.type.size.md,
					tokens.type.weight.bold,
					tokens.color.goldText,
					"gold-text",
				),
			),
		]),
		text(
			"LAST PUSHED PUBLIC REPO",
			textOptions(
				"activity-repo-label",
				18,
				148,
				330,
				14,
				tokens.type.size.xs,
				tokens.type.weight.bold,
				tokens.color.textMuted,
				"text-muted",
			),
		),
		text(
			"—",
			textOptions(
				"activity-repo-value",
				18,
				163,
				450,
				23,
				tokens.type.size.sm,
				tokens.type.weight.regular,
				tokens.color.text,
				"text",
			),
		),
	]);
	const textLayers = collect(textResults);
	if (!textLayers.ok) return textLayers;
	const title = `GitHub activity for ${snapshot.login}; ${numberText(snapshot.contributions.total)} total contributions; ${snapshot.calendar[0]?.date ?? "—"} to ${snapshot.calendar[snapshot.calendar.length - 1]?.date ?? "—"}`;
	const divider = `<line x1="18" y1="140" x2="477" y2="140" stroke="var(--gz-border)" stroke-width="${tokens.stroke.thin}" />`;
	const motif = networkMotif(
		[
			{ x: 424, y: 16 },
			{ x: 449, y: 27 },
			{ x: 478, y: 15 },
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
		`${motif.value}${divider}${textLayers.value.map(withoutHardcodedTextPaint).join("")}`,
		{ id: "activity-title", title },
		scheme,
	);
}

export function createActivityCard(text: TextRenderer): SvgComponent {
	return (snapshot, tokens = TOKENS, options = "animated") => {
		const resolved = resolveSvgRenderOptions(options);
		return renderActivityCard(snapshot, resolved, text, tokens);
	};
}
