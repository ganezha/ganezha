import { type DesignTokens, TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import {
	resolveSvgRenderOptions,
	type SvgComponent,
	type SvgRenderOptions,
	type TextRenderer,
} from "./banner";
import { frame } from "./primitives";
import { collect, err, ok, type Result, visualError } from "./result";
import type { TextPathOptions } from "./text";

export type SkylineOptions = SvgRenderOptions;

const WIDTH = 1200;
const HEIGHT = 300;
const ORIGIN_X = 174;
const ORIGIN_Y = 170;
const WEEK_X = 18;
const WEEK_Y = -1.25;
const DAY_X = -9;
const DAY_Y = 15.6;
const ZERO_HEIGHT = 1.5;
const MAX_DAILY_CONTRIBUTIONS = 25;
const MAX_BAR_HEIGHT = 66;
const ANIMATION_STAGGER_MS = 32;
const ANIMATION_DURATION_MS = 750;

function number(value: number): string {
	return String(Number(value.toFixed(3)));
}

function numberText(value: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
		value,
	);
}

function contributionLevel(count: number): number {
	return Math.min(count, MAX_DAILY_CONTRIBUTIONS);
}

function contributionHeightUnchecked(count: number): number {
	const level = contributionLevel(count);
	if (level === 0) return ZERO_HEIGHT;
	return (
		ZERO_HEIGHT + Math.sqrt(level / MAX_DAILY_CONTRIBUTIONS) * MAX_BAR_HEIGHT
	);
}

/** Fixed-scale square-root height; zero-contribution days remain a thin base. */
export function contributionHeight(count: number): Result<number> {
	if (!Number.isSafeInteger(count) || count < 0) {
		return err(
			visualError(
				"invalid-input",
				"Calendar contribution counts must be non-negative integers.",
			),
		);
	}
	return ok(contributionHeightUnchecked(count));
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

function dateRange(snapshot: ProfileSnapshot): string {
	const first = snapshot.calendar[0]?.date;
	const last = snapshot.calendar[snapshot.calendar.length - 1]?.date;
	if (first === undefined || last === undefined) return "no date range";
	return first === last ? first : `${first} to ${last}`;
}

function shapeDefinition(level: number): string {
	const height = number(contributionHeightUnchecked(level));
	const weekX = number(WEEK_X);
	const weekY = number(WEEK_Y);
	const dayX = number(DAY_X);
	const dayY = number(DAY_Y);
	const top =
		"M0," +
		number(-contributionHeightUnchecked(level)) +
		"l" +
		weekX +
		"," +
		weekY +
		"l" +
		dayX +
		"," +
		dayY +
		"l" +
		number(-WEEK_X) +
		"," +
		number(-WEEK_Y) +
		"z";
	const left = `M0,0v-${height}l${dayX},${dayY}v${height}z`;
	const right = `M0,0v-${height}l${weekX},${weekY}v${height}z`;
	return (
		'<g id="skyline-shape-' +
		level +
		'"><path class="skyline-face--top" d="' +
		top +
		'"/><path class="skyline-face--left" d="' +
		left +
		'"/><path class="skyline-face--right" d="' +
		right +
		'"/></g>'
	);
}

function blockUse(index: number, count: number): string {
	const level = contributionLevel(count);
	const day = index % 7;
	return (
		'<use class="skyline-day" href="#skyline-shape-' +
		level +
		'" transform="translate(' +
		number(day * DAY_X) +
		"," +
		number(day * DAY_Y) +
		')"/>'
	);
}

function weekGroups(
	snapshot: ProfileSnapshot,
	animated: boolean,
): Readonly<{ levels: readonly number[]; markup: string }> {
	const levels = Array.from(
		new Set(snapshot.calendar.map((day) => contributionLevel(day.count))),
	).sort((a, b) => a - b);
	const weekCount = Math.ceil(snapshot.calendar.length / 7);
	const groups: string[] = [];
	for (let week = 0; week < weekCount; week += 1) {
		const from = week * 7;
		const to = Math.min(from + 7, snapshot.calendar.length);
		const uses: string[] = [];
		for (let index = from; index < to; index += 1) {
			const day = snapshot.calendar[index];
			if (day !== undefined) uses.push(blockUse(index, day.count));
		}
		const translate =
			"translate(" +
			number(ORIGIN_X + week * WEEK_X) +
			"," +
			number(ORIGIN_Y + week * WEEK_Y) +
			")";
		const content = uses.join("");
		if (animated) {
			groups.push(
				'<g id="skyline-week-' +
					week +
					'" transform="' +
					translate +
					'"><g class="skyline-week__growth" transform="scale(1 0)">' +
					content +
					'<animateTransform attributeName="transform" type="scale" from="1 0" to="1 1" begin="' +
					week * ANIMATION_STAGGER_MS +
					'ms" dur="' +
					ANIMATION_DURATION_MS +
					'ms" fill="freeze"/></g></g>',
			);
		} else {
			groups.push(
				'<g id="skyline-week-' +
					week +
					'" transform="' +
					translate +
					'">' +
					content +
					"</g>",
			);
		}
	}
	return { levels, markup: groups.join("") };
}

function skylineStyle(): string {
	return (
		"<style>" +
		"svg{--gz-skyline-top:var(--gz-gold-text);--gz-skyline-left:var(--gz-gold-muted);--gz-skyline-right:var(--gz-border)}" +
		".skyline-face--top{fill:var(--gz-skyline-top)}" +
		".skyline-face--left{fill:var(--gz-skyline-left)}" +
		".skyline-face--right{fill:var(--gz-skyline-right)}" +
		"@media(prefers-reduced-motion:reduce){.skyline-week__growth{transform:scale(1,1)!important}}" +
		"</style>"
	);
}

/**
 * Renders the contribution calendar using an injected Satori text renderer.
 * The function does not mutate the snapshot or perform I/O.
 */
export async function renderSkyline(
	snapshot: ProfileSnapshot,
	options: SkylineOptions,
	text: TextRenderer,
	tokens: DesignTokens = TOKENS,
): Promise<Result<string>> {
	const { animated, scheme } = resolveSvgRenderOptions(options);
	if (
		!Array.isArray(snapshot.calendar) ||
		snapshot.calendar.some(
			(day) => !Number.isSafeInteger(day.count) || day.count < 0,
		)
	) {
		return err(
			visualError(
				"invalid-input",
				"Snapshot calendar days must have non-negative integer contribution counts.",
			),
		);
	}
	const { levels, markup } = weekGroups(snapshot, animated);
	const total = numberText(snapshot.contributions.total);
	const range = dateRange(snapshot);
	const textResults = await Promise.all([
		text(
			"Contribution skyline",
			textOptions(
				"skyline-heading",
				34,
				13,
				460,
				29,
				tokens.type.size.lg,
				tokens.type.weight.bold,
				tokens.color.text,
				"text",
			),
		),
		text(
			`Total contributions: ${total}`,
			textOptions(
				"skyline-total",
				34,
				43,
				420,
				20,
				tokens.type.size.sm,
				tokens.type.weight.regular,
				tokens.color.goldText,
				"gold-text",
			),
		),
	]);
	const textLayers = collect(textResults);
	if (!textLayers.ok) return textLayers;
	const title = `Contribution skyline; ${total} total contributions; ${range}`;
	const definitions =
		"<defs>" +
		levels.map((level) => shapeDefinition(level)).join("") +
		"</defs>";
	return frame(
		WIDTH,
		HEIGHT,
		tokens,
		skylineStyle() + definitions + textLayers.value.join("") + markup,
		{ id: "skyline-title", title },
		scheme,
	);
}

export function createSkyline(text: TextRenderer): SvgComponent {
	return (snapshot, tokens = TOKENS, options = "animated") => {
		const resolved = resolveSvgRenderOptions(options);
		return renderSkyline(snapshot, resolved, text, tokens);
	};
}
