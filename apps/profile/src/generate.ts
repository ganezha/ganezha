import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOKENS } from "@ganezha/config";
import type { ProfileSnapshot } from "@ganezha/github-data";
import {
	type AssetViolations,
	assetFileName,
	createActivityCard,
	createBanner,
	createBrankasCard,
	createSkyline,
	createStatsCard,
	formatAssetViolations,
	optimizeSvg,
	type PublishAssetsError,
	publishAssets,
	type Result,
	renderTextPaths,
	type SatoriFont,
	SVG_ASSET_SCHEMES,
	type SvgAssetFile,
	type SvgAssetName,
	type TextPathOptions,
	type WrittenAsset,
} from "@ganezha/visual-engine";
import { loadLatestValidSnapshot } from "./snapshot-store";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SNAPSHOT_PATH = join(ROOT, "data", "snapshot.json");
const LAST_VALID_SNAPSHOT_PATH = join(ROOT, "data", "snapshot.last-valid.json");
const FONT_DIR = join(ROOT, "packages", "visual-engine", "assets", "fonts");
const OUTPUT_DIR = join(ROOT, "dist");
const FONT_FAMILY = TOKENS.type.fontFamily;

type BuiltFiles = Readonly<{
	files: readonly SvgAssetFile[];
	failures: readonly AssetViolations[];
}>;

async function loadFonts(): Promise<readonly SatoriFont[]> {
	const [regular, bold] = await Promise.all([
		readFile(join(FONT_DIR, "JetBrainsMono-Regular.ttf")),
		readFile(join(FONT_DIR, "JetBrainsMono-Bold.ttf")),
	]);
	return [
		{ name: FONT_FAMILY, data: regular, weight: 400, style: "normal" },
		{ name: FONT_FAMILY, data: bold, weight: 700, style: "normal" },
	];
}

function createTextRenderer(fonts: readonly SatoriFont[]) {
	return (text: string, options: TextPathOptions) =>
		renderTextPaths(text, fonts, options);
}

/** Renders and optimizes every asset in memory; nothing touches dist here. */
async function buildFiles(snapshot: ProfileSnapshot): Promise<BuiltFiles> {
	const text = createTextRenderer(await loadFonts());
	const components: readonly Readonly<{
		name: SvgAssetName;
		render: ReturnType<typeof createBanner>;
	}>[] = [
		{ name: "banner", render: createBanner(text) },
		{ name: "stats", render: createStatsCard(text) },
		{ name: "brankas", render: createBrankasCard(text) },
		{ name: "skyline", render: createSkyline(text) },
		{ name: "activity", render: createActivityCard(text) },
	];
	const files: SvgAssetFile[] = [];
	const failures: AssetViolations[] = [];
	for (const component of components) {
		for (const { scheme } of SVG_ASSET_SCHEMES) {
			for (const animated of [true, false]) {
				const name = assetFileName(component.name, scheme, animated);
				const rendered = await component.render(snapshot, TOKENS, {
					animated,
					scheme,
				});
				const optimized = rendered.ok
					? optimizeSvg(rendered.value, animated)
					: rendered;
				if (!optimized.ok) {
					failures.push({
						file: name,
						violations: [
							{
								code: optimized.error.code,
								message: optimized.error.message,
								context: rendered.ok ? "optimizeSvg" : "render",
							},
						],
					});
					continue;
				}
				files.push({ name, contents: `${optimized.value}\n` });
			}
		}
	}
	return { files, failures };
}

export type GenerateProfileAssetsError =
	| PublishAssetsError
	| Readonly<{ code: "generation-failed"; message: string; cause?: unknown }>;

/**
 * Fail-closed generation: renders, optimizes, and validates all assets in
 * memory, and publishes to dist atomically only if every asset passes.
 */
export async function generateProfileAssets(
	outputDirectory: string = OUTPUT_DIR,
): Promise<Result<readonly WrittenAsset[], GenerateProfileAssetsError>> {
	try {
		const snapshot: ProfileSnapshot = await loadLatestValidSnapshot(
			SNAPSHOT_PATH,
			LAST_VALID_SNAPSHOT_PATH,
		);
		const { files, failures } = await buildFiles(snapshot);
		if (failures.length > 0) {
			return {
				ok: false,
				error: {
					code: "validation-failed",
					message: `${failures.length} asset file(s) failed to render; nothing was written.`,
					files: failures,
				},
			};
		}
		return await publishAssets(outputDirectory, files);
	} catch (cause) {
		return {
			ok: false,
			error: {
				code: "generation-failed",
				message:
					cause instanceof Error
						? cause.message
						: "Unknown asset generation failure.",
				cause,
			},
		};
	}
}

async function main(): Promise<void> {
	try {
		const result = await generateProfileAssets();
		if (!result.ok) {
			console.error(`SVG generation failed: ${result.error.message}`);
			if (result.error.code === "validation-failed") {
				console.error(formatAssetViolations(result.error.files));
				console.error(`${OUTPUT_DIR} was left unchanged.`);
			}
			process.exitCode = 1;
			return;
		}
		for (const { name, bytes } of result.value)
			console.log(`${name}: ${bytes} bytes`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "unknown generation error";
		console.error(`SVG generation failed: ${message}`);
		process.exitCode = 1;
	}
}

if (import.meta.main) void main();
