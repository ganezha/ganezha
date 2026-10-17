import { readFileSync } from "node:fs";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ProfileSnapshotInput } from "./model";
import { toSnapshot } from "./model";
import { ProfileDataSchema } from "./schema";

const FIXTURE_PATH = new URL("../fixtures/profile.json", import.meta.url);
const FIXED_FETCHED_AT = "2026-10-17T00:00:00.000Z";

function readFixtureInput(): ProfileSnapshotInput {
	const fixtureJson: unknown = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
	if (
		typeof fixtureJson !== "object" ||
		fixtureJson === null ||
		!("data" in fixtureJson)
	) {
		throw new Error("The sample fixture must contain a data field.");
	}

	const profile = ProfileDataSchema.parse(fixtureJson.data);
	if (profile.user === null)
		throw new Error("The sample profile must not be null.");
	return { ...profile, user: profile.user, fetchedAt: FIXED_FETCHED_AT };
}

describe("toSnapshot", () => {
	it("maps profile data and computes repository stars and language shares", () => {
		const snapshot = toSnapshot(readFixtureInput());

		expect(snapshot.login).toBe("sample-profile");
		expect(snapshot.followers).toBe(42);
		expect(snapshot.publicRepos).toBe(7);
		expect(snapshot.totalStars).toBe(350);
		expect(snapshot.topLanguages).toHaveLength(5);
		expect(snapshot.topLanguages.length).toBeLessThanOrEqual(6);
		expect(
			snapshot.topLanguages.reduce(
				(total, language) => total + language.share,
				0,
			),
		).toBeCloseTo(1, 12);
		expect(snapshot.contributions).toEqual({
			total: 147,
			commits: 120,
			prs: 18,
			issues: 9,
		});
		expect(snapshot.calendar).toHaveLength(5);
		expect(snapshot.brankas).toEqual({
			stars: 321,
			latestTag: "v1.2.3",
			publishedAt: "2026-10-01T12:00:00Z",
		});
		expect(snapshot.fetchedAt).toBe(FIXED_FETCHED_AT);
	});

	it("keeps only the six most common languages", () => {
		const input = readFixtureInput();
		const languages = [
			"Ada",
			"C",
			"Dart",
			"Elixir",
			"Fortran",
			"Haskell",
			"OCaml",
			"Zig",
		];
		const nodes = languages.map((name, index) => ({
			name: `sample-${name.toLowerCase()}`,
			stargazerCount: index,
			primaryLanguage: { name, color: null },
		}));
		const snapshot = toSnapshot({
			...input,
			user: {
				...input.user,
				repositories: { totalCount: nodes.length, nodes },
			},
		});

		expect(snapshot.topLanguages).toHaveLength(6);
	});

	it("keeps every generated language share within zero and one", () => {
		const input = readFixtureInput();

		fc.assert(
			fc.property(
				fc.array(fc.string({ minLength: 1, maxLength: 16 }), {
					minLength: 0,
					maxLength: 40,
				}),
				(languageNames) => {
					const nodes = languageNames.map((name, index) => ({
						name: `generated-${index}`,
						stargazerCount: index,
						primaryLanguage: { name, color: null },
					}));
					const snapshot = toSnapshot({
						...input,
						user: {
							...input.user,
							repositories: { totalCount: nodes.length, nodes },
						},
					});

					return snapshot.topLanguages.every(
						({ share }) => share >= 0 && share <= 1,
					);
				},
			),
		);
	});
});
