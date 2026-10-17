import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ProfileSnapshot } from "./model";
import { ProfileSnapshotSchema } from "./schema";

const VALID_SNAPSHOT = {
	login: "ganezha",
	name: null,
	followers: 0,
	publicRepos: 0,
	totalStars: 0,
	topLanguages: [],
	contributions: { total: 0, commits: 0, prs: 0, issues: 0 },
	calendar: [{ date: "2026-10-17", count: 0 }],
	brankas: null,
	fetchedAt: "2026-10-17T00:00:00.000Z",
} satisfies ProfileSnapshot;

function corruptSnapshot(index: number, fuzz: unknown): unknown {
	switch (index) {
		case 0:
			return { ...VALID_SNAPSHOT, login: { fuzz } };
		case 1:
			return { ...VALID_SNAPSHOT, followers: { fuzz } };
		case 2:
			return { ...VALID_SNAPSHOT, topLanguages: [{ fuzz }] };
		case 3:
			return {
				...VALID_SNAPSHOT,
				contributions: { ...VALID_SNAPSHOT.contributions, total: { fuzz } },
			};
		case 4:
			return {
				...VALID_SNAPSHOT,
				calendar: [{ date: "2026-99-99", count: fuzz }],
			};
		case 5:
			return {
				...VALID_SNAPSHOT,
				brankas: {
					stars: -1,
					latestTag: null,
					publishedAt: null,
				},
			};
		default:
			return { ...VALID_SNAPSHOT, fetchedAt: { fuzz } };
	}
}

describe("ProfileSnapshotSchema", () => {
	it("accepts the canonical snapshot shape", () => {
		expect(ProfileSnapshotSchema.safeParse(VALID_SNAPSHOT).success).toBe(true);
	});

	it("rejects fuzzed corruptions across snapshot fields", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 6 }),
				fc.anything(),
				(index, fuzz) =>
					ProfileSnapshotSchema.safeParse(corruptSnapshot(index, fuzz))
						.success === false,
			),
			{ numRuns: 250 },
		);
	});

	it("does not throw when fuzzed unknown JSON is parsed", () => {
		fc.assert(
			fc.property(fc.jsonValue(), (candidate) => {
				const parsed = ProfileSnapshotSchema.safeParse(candidate);
				return (
					!parsed.success ||
					ProfileSnapshotSchema.safeParse(parsed.data).success
				);
			}),
			{ numRuns: 250 },
		);
	});
});
