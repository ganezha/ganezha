import { optimize } from "svgo";
import { err, ok, type Result, visualError } from "./result";

export type SvgAssetName =
	| "activity"
	| "banner"
	| "stats"
	| "brankas"
	| "skyline";

const SIZE_LIMITS: Readonly<Record<SvgAssetName, number>> = {
	activity: 40 * 1024,
	banner: 60 * 1024,
	stats: 40 * 1024,
	brankas: 40 * 1024,
	skyline: 60 * 1024,
};

function smilAnimationCount(svg: string): number {
	return (svg.match(/<animate(?:Transform|Motion)?\b/gi) ?? []).length;
}

/** Optimizes paths and shapes while retaining the SVG viewBox and SMIL nodes. */
export function optimizeSvg(svg: string, animated: boolean): Result<string> {
	const originalAnimationCount = smilAnimationCount(svg);
	if (animated && originalAnimationCount === 0) {
		return err(
			visualError(
				"invalid-svg",
				"Animated SVG input has no SMIL animation elements.",
			),
		);
	}
	if (!animated && originalAnimationCount !== 0) {
		return err(
			visualError(
				"invalid-svg",
				"Static SVG input contains SMIL animation elements.",
			),
		);
	}

	let optimized: ReturnType<typeof optimize>;
	try {
		optimized = optimize(svg, {
			multipass: true,
			plugins: [
				// This explicit plugin allowlist intentionally leaves removeTitle disabled.
				"removeComments",
				"removeDoctype",
				"removeXMLProcInst",
				"convertShapeToPath",
				"convertPathData",
				"cleanupNumericValues",
				"collapseGroups",
				"removeEmptyAttrs",
				"sortAttrs",
			],
		});
	} catch (cause) {
		return err(
			visualError(
				"invalid-svg",
				"SVGO could not optimize the SVG input.",
				cause,
			),
		);
	}
	const output = optimized.data;
	if (!/<svg\b[^>]*\bviewBox=/i.test(output)) {
		return err(
			visualError(
				"invalid-svg",
				"SVGO output did not preserve the SVG viewBox.",
			),
		);
	}
	const ids = [...output.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]);
	if (new Set(ids).size !== ids.length) {
		return err(
			visualError("invalid-svg", "SVGO output contains duplicate SVG ids."),
		);
	}
	const idSet = new Set(ids);
	const optimizedAnimationCount = smilAnimationCount(output);
	if (optimizedAnimationCount !== originalAnimationCount) {
		return err(
			visualError(
				"invalid-svg",
				"SVGO changed the number of SMIL animation elements.",
			),
		);
	}
	if (/<\s*(?:script|text|foreignObject)\b/i.test(output)) {
		return err(
			visualError("invalid-svg", "SVG output contains a prohibited element."),
		);
	}
	if (/\bon[a-z]+\s*=/i.test(output)) {
		return err(
			visualError(
				"invalid-svg",
				"SVG output contains a prohibited event attribute.",
			),
		);
	}
	if (/url\s*\(/i.test(output)) {
		return err(
			visualError(
				"invalid-svg",
				"SVG output contains an external or embedded URL reference.",
			),
		);
	}
	const hrefs = [...output.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)];
	let internalReferenceCount = 0;
	for (const href of hrefs) {
		const value = href[2] ?? "";
		const tagStart = output.lastIndexOf("<", href.index);
		const tagPrefix = tagStart < 0 ? "" : output.slice(tagStart, href.index);
		if (
			/^<use\b/i.test(tagPrefix) &&
			/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value) &&
			idSet.has(value.slice(1))
		) {
			internalReferenceCount += 1;
			continue;
		}
		if (
			!/^data:image\/svg\+xml;base64,[a-z\d+/]+={0,2}$/i.test(value) ||
			!/^<image\b/i.test(tagPrefix)
		) {
			return err(
				visualError(
					"invalid-svg",
					"SVG output contains a reference other than the embedded local emoji image.",
				),
			);
		}
	}
	const strippedAllowedReferences = output
		.replace(
			/<use\b[^>]*\bhref\s*=\s*(["'])#[A-Za-z_][A-Za-z0-9_.:-]*\1[^>]*\/?\s*>/gi,
			"",
		)
		.replace(
			/<image\b[^>]*\bhref\s*=\s*(["'])data:image\/svg\+xml;base64,[a-z\d+/]+={0,2}\1[^>]*\/?\s*>/gi,
			"",
		);
	if (
		/\b(?:xlink:)?href\s*=/i.test(strippedAllowedReferences) ||
		dataUriCount(output) !== hrefs.length - internalReferenceCount
	) {
		return err(
			visualError(
				"invalid-svg",
				"SVG output contains an unapproved data URI or reference attribute.",
			),
		);
	}
	return ok(output);
}

function dataUriCount(svg: string): number {
	return (svg.match(/data:/gi) ?? []).length;
}

export function assertSvgSize(svg: string, name: SvgAssetName): Result<void> {
	const size = new TextEncoder().encode(svg).byteLength;
	const maximum = SIZE_LIMITS[name];
	if (size > maximum) {
		return err(
			visualError(
				"size-limit-exceeded",
				`${name}.svg is ${size} bytes; limit is ${maximum} bytes.`,
			),
		);
	}
	return ok(undefined);
}

export function svgSizeLimit(name: SvgAssetName): number {
	return SIZE_LIMITS[name];
}
