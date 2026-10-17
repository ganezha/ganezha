import {
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileSnapshot } from "@ganezha/github-data";
import { afterEach, describe, expect, it } from "vitest";
import {
	loadLatestValidSnapshot,
	type SnapshotRename,
	writeSnapshotAtomically,
} from "./snapshot-store";

const SNAPSHOT: ProfileSnapshot = {
	login: "ganezha",
	name: null,
	followers: 1,
	publicRepos: 2,
	totalStars: 3,
	topLanguages: [],
	contributions: { total: 4, commits: 3, prs: 1, issues: 0 },
	calendar: [{ date: "2026-10-17", count: 4 }],
	brankas: null,
	fetchedAt: "2026-10-17T00:00:00.000Z",
};

const temporaryDirectories: string[] = [];

async function makePaths(): Promise<
	Readonly<{
		directory: string;
		currentPath: string;
		lastValidPath: string;
	}>
> {
	const directory = await mkdtemp(join(tmpdir(), "ganezha-snapshot-"));
	temporaryDirectories.push(directory);
	return {
		directory,
		currentPath: join(directory, "snapshot.json"),
		lastValidPath: join(directory, "snapshot.last-valid.json"),
	};
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("profile snapshot storage", () => {
	it("creates an atomic last-valid copy from a valid current snapshot", async () => {
		const { directory, currentPath, lastValidPath } = await makePaths();
		await writeFile(currentPath, `${JSON.stringify(SNAPSHOT)}\n`, "utf8");

		await expect(
			loadLatestValidSnapshot(currentPath, lastValidPath),
		).resolves.toEqual(SNAPSHOT);
		await expect(JSON.parse(await readFile(lastValidPath, "utf8"))).toEqual(
			SNAPSHOT,
		);
		expect(
			(await readdir(directory)).some((name) => name.endsWith(".tmp")),
		).toBe(false);
	});

	it("uses the latest valid backup if the current snapshot is corrupted", async () => {
		const { currentPath, lastValidPath } = await makePaths();
		await writeSnapshotAtomically(SNAPSHOT, currentPath, lastValidPath);
		await writeFile(currentPath, '{"truncated":', "utf8");

		await expect(
			loadLatestValidSnapshot(currentPath, lastValidPath),
		).resolves.toEqual(SNAPSHOT);
	});

	it("keeps snapshot files complete when the current-file rename fails", async () => {
		const { directory, currentPath, lastValidPath } = await makePaths();
		await writeSnapshotAtomically(SNAPSHOT, currentPath, lastValidPath);
		const previousCurrentContents = await readFile(currentPath, "utf8");
		const newerSnapshot = {
			...SNAPSHOT,
			contributions: { ...SNAPSHOT.contributions, total: 9 },
			fetchedAt: "2026-10-18T00:00:00.000Z",
		};
		const failCurrentRename: SnapshotRename = async (source, destination) => {
			if (destination === currentPath) {
				throw new Error("simulated current snapshot rename failure");
			}
			await rename(source, destination);
		};

		await expect(
			writeSnapshotAtomically(
				newerSnapshot,
				currentPath,
				lastValidPath,
				failCurrentRename,
			),
		).rejects.toThrow("simulated current snapshot rename failure");
		expect(await readFile(currentPath, "utf8")).toBe(previousCurrentContents);
		await expect(
			loadLatestValidSnapshot(currentPath, lastValidPath),
		).resolves.toEqual(newerSnapshot);
		expect(
			(await readdir(directory)).some((name) => name.endsWith(".tmp")),
		).toBe(false);
	});
});
