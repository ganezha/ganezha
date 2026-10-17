import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	describeAssetFile,
	EXPECTED_ASSET_FILE_NAMES,
	type SvgAssetFile,
	validateAssets,
} from "./assets";
import {
	type AssetFileSystem,
	NODE_ASSET_FILE_SYSTEM,
	publishAssets,
	writeAssetsAtomically,
} from "./write-assets";

const temporaryDirectories: string[] = [];

async function makeDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ganezha-dist-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

function validAsset(name: string, marker: string): SvgAssetFile {
	const descriptor = describeAssetFile(name);
	const animation =
		descriptor?.animated === true
			? '<animate attributeName="opacity" values="0;1" dur="1s"/>'
			: "";
	return {
		name,
		contents: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" role="img" aria-labelledby="t"><title id="t">${marker} ${name}</title><path d="M0 0h1">${animation}</path></svg>\n`,
	};
}

function validSet(marker: string): SvgAssetFile[] {
	return EXPECTED_ASSET_FILE_NAMES.map((name) => validAsset(name, marker));
}

async function snapshotDirectory(
	directory: string,
): Promise<Record<string, string>> {
	const entries = (await readdir(directory)).sort();
	const contents: Record<string, string> = {};
	for (const entry of entries) {
		contents[entry] = await readFile(join(directory, entry), "utf8");
	}
	return contents;
}

async function seedPreviousOutput(directory: string): Promise<void> {
	for (const file of validSet("previous")) {
		await writeFile(join(directory, file.name), file.contents, "utf8");
	}
	await writeFile(join(directory, "README.txt"), "unrelated\n", "utf8");
}

function noLeftovers(names: readonly string[]): boolean {
	return !names.some((name) => name.endsWith(".tmp") || name.endsWith(".bak"));
}

describe("validateAssets", () => {
	it("accepts the complete valid set", () => {
		expect(validateAssets(validSet("new")).ok).toBe(true);
	});

	it("reports missing, unknown, and duplicate files", () => {
		const files = validSet("new").slice(1);
		const duplicate = files[0];
		if (duplicate === undefined) throw new Error("fixture invariant");
		const result = validateAssets([
			...files,
			duplicate,
			validAsset("evil.svg", "new"),
		]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		const codes = result.error.flatMap(({ file, violations }) =>
			violations.map((violation) => `${file}:${violation.code}`),
		);
		expect(codes).toEqual(
			expect.arrayContaining([
				`${duplicate.name}:duplicate-file`,
				"evil.svg:unknown-asset",
				`${EXPECTED_ASSET_FILE_NAMES[0]}:missing-asset`,
			]),
		);
	});

	it("validates static variants as static", () => {
		const files = validSet("new").map((file) =>
			file.name === "stats-static.svg"
				? { name: file.name, contents: validAsset("stats.svg", "new").contents }
				: file,
		);
		const result = validateAssets(files);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toEqual([
			{
				file: "stats-static.svg",
				violations: [expect.objectContaining({ code: "animation-in-static" })],
			},
		]);
	});
});

describe("publishAssets (fail-closed generate)", () => {
	it("writes all 30 files and leaves no temporary files", async () => {
		const directory = await makeDirectory();
		await seedPreviousOutput(directory);
		const files = validSet("new");

		const result = await publishAssets(directory, files);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toHaveLength(30);
		const after = await snapshotDirectory(directory);
		for (const file of files) expect(after[file.name]).toBe(file.contents);
		for (const written of result.value) {
			expect(written.bytes).toBe(
				new TextEncoder().encode(after[written.name] ?? "").byteLength,
			);
		}
		expect(after["README.txt"]).toBe("unrelated\n");
		expect(noLeftovers(Object.keys(after))).toBe(true);
	});

	it("writes nothing and keeps the old directory intact when one asset is invalid", async () => {
		const directory = await makeDirectory();
		await seedPreviousOutput(directory);
		const before = await snapshotDirectory(directory);
		const files = validSet("new").map((file) =>
			file.name === "brankas-dark.svg"
				? {
						...file,
						contents: file.contents.replace(
							"</svg>",
							"<script>alert(1)</script></svg>",
						),
					}
				: file,
		);

		const result = await publishAssets(directory, files);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("validation-failed");
		if (result.error.code !== "validation-failed") return;
		expect(result.error.files.map(({ file }) => file)).toEqual([
			"brankas-dark.svg",
		]);
		expect(await snapshotDirectory(directory)).toEqual(before);
	});

	it("does not create the output directory when validation fails", async () => {
		const parent = await makeDirectory();
		const directory = join(parent, "dist");
		const files = validSet("new").slice(0, 29);

		const result = await publishAssets(directory, files);

		expect(result.ok).toBe(false);
		expect(await readdir(parent)).toEqual([]);
	});

	it("restores previous outputs and removes .tmp files when a rename fails midway", async () => {
		const directory = await makeDirectory();
		await seedPreviousOutput(directory);
		const before = await snapshotDirectory(directory);
		let renames = 0;
		const failing: AssetFileSystem = {
			...NODE_ASSET_FILE_SYSTEM,
			rename: async (from, to) => {
				if (from.endsWith(".tmp")) {
					renames += 1;
					if (renames === 7) throw new Error("simulated rename failure");
				}
				await NODE_ASSET_FILE_SYSTEM.rename(from, to);
			},
		};

		const result = await publishAssets(directory, validSet("new"), {
			fs: failing,
		});

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "write-failed",
				message: expect.stringContaining("simulated rename failure"),
			},
		});
		expect(await snapshotDirectory(directory)).toEqual(before);
	});

	it("removes .tmp files and keeps old outputs when a temporary write fails", async () => {
		const directory = await makeDirectory();
		await seedPreviousOutput(directory);
		const before = await snapshotDirectory(directory);
		let writes = 0;
		const failing: AssetFileSystem = {
			...NODE_ASSET_FILE_SYSTEM,
			writeFile: async (path, contents) => {
				writes += 1;
				if (writes === 12) throw new Error("simulated disk full");
				await NODE_ASSET_FILE_SYSTEM.writeFile(path, contents);
			},
		};

		const result = await writeAssetsAtomically(
			directory,
			validSet("new"),
			failing,
		);

		expect(result).toMatchObject({
			ok: false,
			error: { code: "write-failed" },
		});
		expect(await snapshotDirectory(directory)).toEqual(before);
	});

	it("removes newly created files on rollback when there was no previous output", async () => {
		const directory = await makeDirectory();
		let renames = 0;
		const failing: AssetFileSystem = {
			...NODE_ASSET_FILE_SYSTEM,
			rename: async (from, to) => {
				renames += 1;
				if (renames === 3) throw new Error("simulated rename failure");
				await NODE_ASSET_FILE_SYSTEM.rename(from, to);
			},
		};

		const result = await writeAssetsAtomically(
			directory,
			validSet("new"),
			failing,
		);

		expect(result.ok).toBe(false);
		expect(await readdir(directory)).toEqual([]);
	});

	it("refuses unsafe file names before touching the file system", async () => {
		const parent = await makeDirectory();
		const result = await writeAssetsAtomically(join(parent, "dist"), [
			{ name: "../escape.svg", contents: "<svg/>" },
		]);

		expect(result).toMatchObject({
			ok: false,
			error: { code: "invalid-input" },
		});
		expect(await readdir(parent)).toEqual([]);
	});
});
