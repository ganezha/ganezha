import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
	type ProfileSnapshot,
	ProfileSnapshotSchema,
} from "@ganezha/github-data";

export type SnapshotRename = (
	source: string,
	destination: string,
) => Promise<void>;

export class InvalidSnapshotError extends Error {
	constructor() {
		super("Snapshot does not match the validated profile schema.");
		this.name = "InvalidSnapshotError";
	}
}

async function readValidSnapshot(
	path: string,
): Promise<ProfileSnapshot | null> {
	let source: string;
	try {
		source = await readFile(path, "utf8");
	} catch {
		return null;
	}

	let value: unknown;
	try {
		value = JSON.parse(source);
	} catch {
		return null;
	}
	const result = ProfileSnapshotSchema.safeParse(value);
	return result.success ? result.data : null;
}

/** Returns the newest schema-valid snapshot from the primary and backup files. */
export async function loadLatestValidSnapshot(
	currentPath: string,
	lastValidPath: string,
): Promise<ProfileSnapshot> {
	const [current, lastValid] = await Promise.all([
		readValidSnapshot(currentPath),
		readValidSnapshot(lastValidPath),
	]);
	let latest: ProfileSnapshot | null;
	if (current !== null && lastValid !== null) {
		latest =
			Date.parse(current.fetchedAt) >= Date.parse(lastValid.fetchedAt)
				? current
				: lastValid;
	} else {
		latest = current ?? lastValid;
	}
	if (latest === null) {
		throw new Error(
			"No valid current or last-valid profile snapshot is available.",
		);
	}
	if (
		lastValid === null ||
		JSON.stringify(lastValid) !== JSON.stringify(latest)
	) {
		await writeTextAtomically(
			lastValidPath,
			`${JSON.stringify(latest, null, 2)}\n`,
			rename,
		);
	}
	return latest;
}

async function writeTextAtomically(
	path: string,
	contents: string,
	renameFile: SnapshotRename,
): Promise<void> {
	const directory = dirname(path);
	const temporaryPath = `${path}.${randomUUID()}.tmp`;
	await mkdir(directory, { recursive: true });
	try {
		await writeFile(temporaryPath, contents, {
			encoding: "utf8",
			flag: "wx",
		});
		await renameFile(temporaryPath, path);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

/** Validates first, then atomically updates the last-valid and current files. */
export async function writeSnapshotAtomically(
	value: unknown,
	currentPath: string,
	lastValidPath: string,
	renameFile: SnapshotRename = rename,
): Promise<ProfileSnapshot> {
	if (resolve(currentPath) === resolve(lastValidPath)) {
		throw new RangeError("Current and last-valid snapshot paths must differ.");
	}
	const result = ProfileSnapshotSchema.safeParse(value);
	if (!result.success) throw new InvalidSnapshotError();

	const contents = `${JSON.stringify(result.data, null, 2)}\n`;
	await writeTextAtomically(lastValidPath, contents, renameFile);
	await writeTextAtomically(currentPath, contents, renameFile);
	return result.data;
}
