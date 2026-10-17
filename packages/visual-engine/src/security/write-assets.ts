import { randomBytes } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { join } from "node:path";
import {
	err,
	ok,
	type Result,
	type VisualEngineError,
	visualError,
} from "../result";
import {
	type AssetViolations,
	EXPECTED_ASSET_FILE_NAMES,
	type SvgAssetFile,
	validateAssets,
} from "./assets";

/** The file-system operations used for publishing; injectable for tests. */
export type AssetFileSystem = Readonly<{
	mkdir: (path: string) => Promise<void>;
	writeFile: (path: string, contents: string) => Promise<void>;
	rename: (from: string, to: string) => Promise<void>;
	copyFile: (from: string, to: string) => Promise<void>;
	rm: (path: string) => Promise<void>;
	size: (path: string) => Promise<number>;
}>;

export const NODE_ASSET_FILE_SYSTEM: AssetFileSystem = {
	mkdir: async (path) => {
		await nodeFs.mkdir(path, { recursive: true });
	},
	writeFile: (path, contents) => nodeFs.writeFile(path, contents, "utf8"),
	rename: (from, to) => nodeFs.rename(from, to),
	copyFile: (from, to) => nodeFs.copyFile(from, to),
	rm: (path) => nodeFs.rm(path, { force: true }),
	size: async (path) => (await nodeFs.stat(path)).size,
};

export type WrittenAsset = Readonly<{ name: string; bytes: number }>;

export type PublishAssetsError =
	| Readonly<{
			code: "validation-failed";
			message: string;
			files: readonly AssetViolations[];
	  }>
	| VisualEngineError;

const SAFE_FILE_NAME = /^[a-z0-9][a-z0-9-]*\.svg$/;

function isMissingFile(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function removeAll(
	fs: AssetFileSystem,
	paths: Iterable<string>,
): Promise<string[]> {
	const failures: string[] = [];
	for (const path of paths) {
		try {
			await fs.rm(path);
		} catch (error) {
			failures.push(`${path}: ${describe(error)}`);
		}
	}
	return failures;
}

/**
 * Publishes files all-or-none: every file is first written to a sibling
 * `.tmp`, existing outputs are backed up, then each `.tmp` is renamed over its
 * destination. Any failure removes the temporaries and restores the previous
 * outputs, so the directory never keeps a partial new set on purpose.
 */
export async function writeAssetsAtomically(
	directory: string,
	files: readonly SvgAssetFile[],
	fs: AssetFileSystem = NODE_ASSET_FILE_SYSTEM,
): Promise<Result<readonly WrittenAsset[], VisualEngineError>> {
	const unsafe = files.find((file) => !SAFE_FILE_NAME.test(file.name));
	if (unsafe !== undefined) {
		return err(
			visualError(
				"invalid-input",
				`Refusing to write unsafe asset file name "${unsafe.name}".`,
			),
		);
	}
	if (new Set(files.map((file) => file.name)).size !== files.length) {
		return err(
			visualError("invalid-input", "Asset file names must be unique."),
		);
	}

	const token = `${process.pid}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
	const temporary = new Map<string, string>();
	const backups = new Map<string, string>();
	const installed: string[] = [];
	const destination = (name: string) => join(directory, name);

	try {
		await fs.mkdir(directory);
		for (const file of files) {
			const path = join(directory, `${file.name}.${token}.tmp`);
			temporary.set(file.name, path);
			await fs.writeFile(path, file.contents);
		}
		for (const file of files) {
			const backup = join(directory, `${file.name}.${token}.bak`);
			try {
				await fs.copyFile(destination(file.name), backup);
				backups.set(file.name, backup);
			} catch (error) {
				if (!isMissingFile(error)) throw error;
			}
		}
		for (const file of files) {
			const path = temporary.get(file.name);
			if (path === undefined)
				throw new Error("Temporary path invariant violated.");
			await fs.rename(path, destination(file.name));
			temporary.delete(file.name);
			installed.push(file.name);
		}
	} catch (cause) {
		const rollbackFailures: string[] = [];
		for (const name of installed.reverse()) {
			const backup = backups.get(name);
			try {
				if (backup === undefined) await fs.rm(destination(name));
				else {
					await fs.rename(backup, destination(name));
					backups.delete(name);
				}
			} catch (error) {
				rollbackFailures.push(`${name}: ${describe(error)}`);
			}
		}
		rollbackFailures.push(
			...(await removeAll(fs, temporary.values())),
			...(await removeAll(fs, backups.values())),
		);
		const suffix =
			rollbackFailures.length === 0
				? " Previous outputs were left intact."
				: ` Rollback was incomplete: ${rollbackFailures.join("; ")}`;
		return err(
			visualError(
				"write-failed",
				`Could not publish assets to ${directory}: ${describe(cause)}.${suffix}`,
				cause,
			),
		);
	}

	await removeAll(fs, backups.values());
	const written: WrittenAsset[] = [];
	for (const file of files) {
		let bytes: number;
		try {
			bytes = await fs.size(destination(file.name));
		} catch {
			bytes = new TextEncoder().encode(file.contents).byteLength;
		}
		written.push({ name: file.name, bytes });
	}
	return ok(written);
}

/**
 * Fail-closed publish: validates every in-memory asset first and writes
 * nothing unless all of them pass.
 */
export async function publishAssets(
	directory: string,
	files: readonly SvgAssetFile[],
	options: Readonly<{
		expected?: readonly string[];
		fs?: AssetFileSystem;
	}> = {},
): Promise<Result<readonly WrittenAsset[], PublishAssetsError>> {
	const validated = validateAssets(
		files,
		options.expected ?? EXPECTED_ASSET_FILE_NAMES,
	);
	if (!validated.ok) {
		return err({
			code: "validation-failed",
			message: `${validated.error.length} asset file(s) failed validation; nothing was written.`,
			files: validated.error,
		});
	}
	return writeAssetsAtomically(directory, validated.value, options.fs);
}
