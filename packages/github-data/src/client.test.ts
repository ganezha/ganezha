import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fetchProfile } from "./client";
import { ProfileDataSchema } from "./schema";

const FIXTURE_PATH = new URL("../fixtures/profile.json", import.meta.url);
const TOKEN = "test-token-never-print";
const FIXED_NOW = new Date("2026-10-17T00:00:00.000Z");

function readFixture(): unknown {
	return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(payload), {
		headers: { "Content-Type": "application/json" },
		...init,
	});
}

function dependencies(response: Response) {
	const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
	return {
		deps: { token: TOKEN, fetch: fetchMock, now: () => new Date(FIXED_NOW) },
		fetchMock,
	};
}

describe("fetchProfile", () => {
	it("sends the authenticated query and returns a snapshot", async () => {
		const { deps, fetchMock } = dependencies(jsonResponse(readFixture()));
		const result = await fetchProfile(deps, "sample-profile");

		expect(result.ok).toBe(true);
		if (!result.ok)
			throw new Error(`Expected success, received ${result.error.kind}`);
		expect(result.value.login).toBe("sample-profile");
		expect(result.value.fetchedAt).toBe(FIXED_NOW.toISOString());
		expect(fetchMock).toHaveBeenCalledOnce();
		const request = fetchMock.mock.calls[0]?.[1];
		expect(new Headers(request?.headers).get("authorization")).toBe(
			`Bearer ${TOKEN}`,
		);
		expect(new Headers(request?.headers).get("user-agent")).toBe(
			"ganezha-profile",
		);
		const body = JSON.parse(String(request?.body)) as {
			query: string;
			variables: { login: string };
		};
		expect(body.query).toContain("query ProfileData($login: String!)");
		expect(body.variables.login).toBe("sample-profile");
	});

	it("maps HTTP 401 to auth", async () => {
		const { deps } = dependencies(
			new Response("unauthorized", { status: 401 }),
		);
		const result = await fetchProfile(deps, "sample-profile");

		expect(result).toEqual({ ok: false, error: { kind: "auth" } });
	});

	it("maps HTTP 429 and its reset header to rate_limit", async () => {
		const { deps } = dependencies(
			new Response("rate limited", {
				status: 429,
				headers: { "x-ratelimit-reset": "1792195200" },
			}),
		);
		const result = await fetchProfile(deps, "sample-profile");

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a rate limit error.");
		expect(result.error.kind).toBe("rate_limit");
		if (result.error.kind === "rate_limit") {
			expect(result.error.resetAt).toBe("2026-10-17T00:00:00.000Z");
		}
	});

	it("maps HTTP 403 with remaining quota to auth", async () => {
		const { deps } = dependencies(
			new Response("forbidden", {
				status: 403,
				headers: { "x-ratelimit-remaining": "4999" },
			}),
		);
		const result = await fetchProfile(deps, "sample-profile");

		expect(result).toEqual({ ok: false, error: { kind: "auth" } });
	});

	it("maps HTTP 403 with exhausted quota to rate_limit and resetAt", async () => {
		const { deps } = dependencies(
			new Response("rate limited", {
				status: 403,
				headers: {
					"x-ratelimit-remaining": "0",
					"x-ratelimit-reset": "1792195200",
				},
			}),
		);
		const result = await fetchProfile(deps, "sample-profile");

		expect(result).toEqual({
			ok: false,
			error: {
				kind: "rate_limit",
				resetAt: "2026-10-17T00:00:00.000Z",
			},
		});
	});

	it("maps malformed JSON to schema and does not expose the token", async () => {
		const { deps } = dependencies(new Response("{ malformed", { status: 200 }));
		const result = await fetchProfile(deps, "sample-profile");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.kind).toBe("schema");
			expect(JSON.stringify(result.error)).not.toContain(TOKEN);
		}
	});

	it("maps GraphQL errors and redacts any echoed token", async () => {
		const { deps } = dependencies(
			jsonResponse({ errors: [{ message: `Rejected ${TOKEN}` }] }),
		);
		const result = await fetchProfile(deps, "sample-profile");

		expect(result).toEqual({
			ok: false,
			error: { kind: "graphql", messages: ["Rejected [redacted]"] },
		});
	});

	it("maps a fetch exception to a safe network error", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error(`Request failed with ${TOKEN}`));
		const result = await fetchProfile(
			{ token: TOKEN, fetch: fetchMock, now: () => new Date(FIXED_NOW) },
			"sample-profile",
		);

		expect(result).toEqual({
			ok: false,
			error: { kind: "network", message: "GitHub request failed." },
		});
		expect(JSON.stringify(result)).not.toContain(TOKEN);
	});

	it("rejects unexpected fields in the GraphQL data schema", async () => {
		const fixture = readFixture() as { data: Record<string, unknown> };
		const validData = ProfileDataSchema.parse(fixture.data);
		const { deps } = dependencies(
			jsonResponse({ data: { ...validData, unexpected: true } }),
		);
		const result = await fetchProfile(deps, "sample-profile");

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.kind).toBe("schema");
	});
});
