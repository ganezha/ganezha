import type { SvgAssetName } from "../optimize";
import type { ColorScheme } from "../primitives";
import { err, ok, type Result } from "../result";
import { type SvgKind, type Violation, validateSvg } from "./validate-svg";

export const SVG_ASSET_NAMES = [
	"banner",
	"stats",
	"brankas",
	"skyline",
	"activity",
] as const satisfies readonly SvgAssetName[];

export const SVG_ASSET_SCHEMES = [
	{ scheme: "auto", suffix: "" },
	{ scheme: "dark", suffix: "-dark" },
	{ scheme: "light", suffix: "-light" },
] as const satisfies readonly Readonly<{
	scheme: ColorScheme;
	suffix: string;
}>[];

/** A fully rendered asset held in memory before anything is published. */
export type SvgAssetFile = Readonly<{ name: string; contents: string }>;

export type SvgAssetDescriptor = Readonly<{
	asset: SvgAssetName;
	scheme: ColorScheme;
	animated: boolean;
	kind: SvgKind;
}>;

/** Violations grouped by output file name. */
export type AssetViolations = Readonly<{
	file: string;
	violations: readonly Violation[];
}>;

export function svgKindForAsset(asset: SvgAssetName): SvgKind {
	if (asset === "banner" || asset === "skyline") return asset;
	return "card";
}

export function assetFileName(
	asset: SvgAssetName,
	scheme: ColorScheme,
	animated: boolean,
): string {
	const suffix = scheme === "auto" ? "" : `-${scheme}`;
	return `${asset}${suffix}${animated ? "" : "-static"}.svg`;
}

const FILE_NAME_PATTERN =
	/^(banner|stats|brankas|skyline|activity)(?:-(dark|light))?(-static)?\.svg$/;

/** Derives asset kind and variant from a published file name. */
export function describeAssetFile(
	fileName: string,
): SvgAssetDescriptor | undefined {
	const match = FILE_NAME_PATTERN.exec(fileName);
	if (match === null) return undefined;
	const asset = SVG_ASSET_NAMES.find((name) => name === match[1]);
	if (asset === undefined) return undefined;
	const scheme: ColorScheme =
		match[2] === "dark" ? "dark" : match[2] === "light" ? "light" : "auto";
	return {
		asset,
		scheme,
		animated: match[3] === undefined,
		kind: svgKindForAsset(asset),
	};
}

/** The 30 published files: 5 assets x 3 schemes x animated/static. */
export const EXPECTED_ASSET_FILE_NAMES: readonly string[] =
	SVG_ASSET_NAMES.flatMap((asset) =>
		SVG_ASSET_SCHEMES.flatMap(({ scheme }) =>
			[true, false].map((animated) => assetFileName(asset, scheme, animated)),
		),
	);

function fileViolation(
	file: string,
	code: string,
	message: string,
): AssetViolations {
	return {
		file,
		violations: [{ code, message, context: file }],
	};
}

/**
 * Validates every in-memory asset and the completeness of the set. Pure; the
 * result is Ok only when every file passes, so callers can publish all-or-none.
 */
export function validateAssets(
	files: readonly SvgAssetFile[],
	expected: readonly string[] = EXPECTED_ASSET_FILE_NAMES,
): Result<readonly SvgAssetFile[], readonly AssetViolations[]> {
	const failures: AssetViolations[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		if (seen.has(file.name)) {
			failures.push(
				fileViolation(file.name, "duplicate-file", "File is generated twice."),
			);
			continue;
		}
		seen.add(file.name);
		const descriptor = describeAssetFile(file.name);
		if (descriptor === undefined) {
			failures.push(
				fileViolation(
					file.name,
					"unknown-asset",
					"File name does not match a known asset variant.",
				),
			);
			continue;
		}
		const result = validateSvg(file.contents, {
			kind: descriptor.kind,
			static: !descriptor.animated,
		});
		if (!result.ok)
			failures.push({ file: file.name, violations: result.error });
	}
	for (const name of expected) {
		if (!seen.has(name)) {
			failures.push(
				fileViolation(
					name,
					"missing-asset",
					"Expected asset was not generated.",
				),
			);
		}
	}
	return failures.length === 0 ? ok(files) : err(failures);
}

/** Human-readable, one-line-per-violation report suitable for stderr. */
export function formatAssetViolations(
	failures: readonly AssetViolations[],
): string {
	return failures
		.map(
			({ file, violations }) =>
				`${file}:\n${violations
					.map(
						(violation) =>
							`  - [${violation.code}] ${violation.message}\n      at: ${violation.context}`,
					)
					.join("\n")}`,
		)
		.join("\n");
}
