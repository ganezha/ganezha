import { type DesignTokens, SLOGAN, TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import { type ColorScheme, frame, networkMotif } from "./primitives";
import { collect, type Result } from "./result";
import type { TextPathOptions } from "./text";

export type RenderMode = "animated" | "static";
export type SvgRenderOptions = Readonly<{
	animated?: boolean;
	scheme?: ColorScheme;
}>;
export type ResolvedSvgRenderOptions = Readonly<{
	animated: boolean;
	scheme: ColorScheme;
}>;

export function resolveSvgRenderOptions(
	options: RenderMode | SvgRenderOptions = "animated",
): ResolvedSvgRenderOptions {
	if (typeof options === "string") {
		return { animated: options === "animated", scheme: "auto" };
	}
	return {
		animated: options.animated ?? true,
		scheme: options.scheme ?? "auto",
	};
}

export type TextRenderer = (
	text: string,
	options: TextPathOptions,
) => Promise<Result<string>>;
export type SvgComponent = (
	snapshot: ProfileSnapshot,
	tokens: DesignTokens,
	options?: RenderMode | SvgRenderOptions,
) => Promise<Result<string>>;

const NETWORK_NODES = [
	{ x: 870, y: 75 },
	{ x: 970, y: 119 },
	{ x: 1090, y: 65 },
	{ x: 1134, y: 165 },
	{ x: 1035, y: 232 },
	{ x: 900, y: 205 },
] as const;

export function createBanner(text: TextRenderer): SvgComponent {
	return async (_snapshot, tokens = TOKENS, options = "animated") => {
		const { animated, scheme } = resolveSvgRenderOptions(options);
		const sloganResults = await Promise.all(
			SLOGAN.map((line, index) =>
				text(line, {
					idPrefix: `banner-slogan-${index}`,
					width: 820,
					height: index === 0 ? 24 : 22,
					x: 44,
					y: index === 0 ? 86 : 123 + (index - 1) * 34,
					fontSize: index === 0 ? tokens.type.size.md : tokens.type.size.sm,
					fontWeight:
						index === 0 ? tokens.type.weight.bold : tokens.type.weight.regular,
					color: tokens.color.goldText,
					colorVariable: "gold-text",
				}),
			),
		);
		const wordmarkResult = await text("ganezha", {
			idPrefix: "banner-wordmark",
			width: 760,
			height: 48,
			x: 44,
			y: 27,
			fontSize: tokens.type.size.xl,
			fontWeight: tokens.type.weight.bold,
			color: tokens.color.text,
			colorVariable: "text",
		});
		const collected = collect([...sloganResults, wordmarkResult]);
		if (!collected.ok) return collected;
		const sloganLayers = collected.value.slice(0, sloganResults.length);
		const wordmark = collected.value[sloganResults.length];
		if (wordmark === undefined) {
			throw new Error("Banner text result invariant was violated.");
		}
		const motif = networkMotif(NETWORK_NODES, tokens, animated, scheme);
		if (!motif.ok) return motif;
		return frame(
			tokens.banner.width,
			tokens.banner.height,
			tokens,
			`${motif.value}${wordmark}${sloganLayers.join("")}`,
			{ id: "ganezha-banner-title", title: "ganezha banner" },
			scheme,
		);
	};
}
