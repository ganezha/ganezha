import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchProfile } from "@ganezha/github-data";
import {
	InvalidSnapshotError,
	writeSnapshotAtomically,
} from "./snapshot-store";

const OUTPUT_PATH = fileURLToPath(
	new URL("../../../data/snapshot.json", import.meta.url),
);
const LAST_VALID_PATH = join(dirname(OUTPUT_PATH), "snapshot.last-valid.json");

async function main(): Promise<number> {
	const token = Bun.env.GANEZHA_TOKEN?.trim() || Bun.env.GITHUB_TOKEN?.trim();
	if (!token) {
		console.error("auth");
		return 1;
	}

	const result = await fetchProfile(
		{ token, fetch, now: () => new Date() },
		"ganezha",
	);
	if (!result.ok) {
		console.error(result.error.kind);
		return 1;
	}

	try {
		await writeSnapshotAtomically(result.value, OUTPUT_PATH, LAST_VALID_PATH);
		return 0;
	} catch (error) {
		console.error(error instanceof InvalidSnapshotError ? "schema" : "network");
		return 1;
	}
}

process.exitCode = await main().catch(() => {
	console.error("network");
	return 1;
});
