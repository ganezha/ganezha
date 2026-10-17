import { type DesignTokens, TOKENS } from "@ganezha/config";
import { err, ok, type Result, visualError } from "./result";

export type NetworkNode = Readonly<{ x: number; y: number }>;
export type SvgAccessibility = Readonly<{ id: string; title: string }>;
export type ColorScheme = "auto" | "dark" | "light";

export type SvgColorPalette = Readonly<{
	bg: string;
	surface: string;
	border: string;
	gold: string;
	goldText: string;
	goldMuted: string;
	text: string;
	textMuted: string;
	accent: string;
}>;

export function paletteForScheme(
	tokens: DesignTokens,
	scheme: ColorScheme,
): SvgColorPalette {
	if (scheme === "light") {
		return {
			...tokens.color.light,
			goldMuted: tokens.color.light.goldText,
		};
	}
	return tokens.color;
}

function paletteVariables(palette: SvgColorPalette): string {
	return (
		"--gz-bg:" +
		palette.bg +
		";--gz-surface:" +
		palette.surface +
		";--gz-border:" +
		palette.border +
		";--gz-gold:" +
		palette.gold +
		";--gz-gold-text:" +
		palette.goldText +
		";--gz-gold-muted:" +
		palette.goldMuted +
		";--gz-text:" +
		palette.text +
		";--gz-text-muted:" +
		palette.textMuted +
		";--gz-accent:" +
		palette.accent
	);
}

function formatNumber(value: number): string {
	return Object.is(value, -0) ? "0" : String(value);
}

function styleBlock(tokens: DesignTokens, scheme: ColorScheme): string {
	const selected = paletteForScheme(
		tokens,
		scheme === "auto" ? "dark" : scheme,
	);
	const light = paletteForScheme(tokens, "light");
	const lightRule =
		scheme === "auto"
			? `@media(prefers-color-scheme:light){svg{${paletteVariables(light)}}}`
			: "";
	return `<style>svg{${paletteVariables(selected)}}${lightRule}@media(prefers-reduced-motion:reduce){svg animate{display:none!important}}</style>`;
}

export const SVG_STYLE_BLOCK = styleBlock(TOKENS, "auto");

/** Creates an SVG frame and inserts children before its closing tag. */
export function frame(
	width: number,
	height: number,
	tokens: DesignTokens = TOKENS,
	children = "",
	accessibility?: SvgAccessibility,
	scheme: ColorScheme = "auto",
): Result<string> {
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	) {
		return err(
			visualError(
				"invalid-input",
				"Frame width and height must be finite and greater than zero.",
			),
		);
	}

	const safeWidth = formatNumber(width);
	const safeHeight = formatNumber(height);
	const palette = paletteForScheme(tokens, scheme);
	if (accessibility !== undefined) {
		if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(accessibility.id)) {
			return err(
				visualError(
					"invalid-input",
					"SVG title id must be a valid XML identifier.",
				),
			);
		}
		if (accessibility.title.trim().length === 0) {
			return err(visualError("invalid-input", "SVG title must not be empty."));
		}
	}
	const accessibleAttributes =
		accessibility === undefined
			? ""
			: ` role="img" aria-labelledby="${accessibility.id}"`;
	const title =
		accessibility === undefined
			? ""
			: `<title id="${accessibility.id}">${escapeXml(accessibility.title)}</title>`;
	return ok(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"${accessibleAttributes}>${title}${styleBlock(tokens, scheme)}<rect width="100%" height="100%" fill="var(--gz-bg,${palette.bg})" stroke="var(--gz-border,${palette.border})" stroke-width="${tokens.stroke.thin}" rx="${tokens.radius.lg}" />${children}</svg>`,
	);
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/** Creates a decorative network motif. SMIL is opt-in so static fallbacks stay still. */
export function networkMotif(
	nodes: readonly NetworkNode[],
	tokens: DesignTokens = TOKENS,
	animated = false,
	scheme: ColorScheme = "auto",
): Result<string> {
	const palette = paletteForScheme(tokens, scheme);
	if (
		nodes.some((node) => !Number.isFinite(node.x) || !Number.isFinite(node.y))
	) {
		return err(
			visualError(
				"invalid-input",
				"Network node coordinates must be finite numbers.",
			),
		);
	}
	const points = nodes.map((node) => ({
		x: formatNumber(node.x),
		y: formatNumber(node.y),
	}));
	const edges = points.slice(1).map((point, index) => {
		const previous = points[index];
		if (previous === undefined) return "";
		const animation = animated
			? `<animate attributeName="stroke-dashoffset" values="0;-36" dur="${tokens.motion.duration.base}" repeatCount="indefinite" />`
			: "";
		return `<line class="network-motif__edge" x1="${previous.x}" y1="${previous.y}" x2="${point.x}" y2="${point.y}" stroke="var(--gz-accent,${palette.accent})" stroke-width="${tokens.stroke.thin}" stroke-linecap="round" stroke-dasharray="8 10" stroke-dashoffset="0" opacity="0.8">${animation}</line>`;
	});
	const circles = points
		.map(
			({ x, y }) =>
				`<circle class="network-motif__node" cx="${x}" cy="${y}" r="${tokens.radius.sm}" fill="var(--gz-gold,${palette.gold})" />`,
		)
		.join("");

	return ok(`<g class="network-motif">${edges.join("")}${circles}</g>`);
}
