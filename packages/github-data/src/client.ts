import type { Result } from "@ganezha/shared";
import { err, ok } from "@ganezha/shared";
import type { DataError } from "./errors";
import type { ProfileSnapshot } from "./model";
import { toSnapshot } from "./model";
import { PROFILE_DATA_QUERY } from "./query";
import { ProfileDataSchema, parseGraphQLResponseEnvelope } from "./schema";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const USER_AGENT = "ganezha-profile";

export type ProfileFetchDependencies = Readonly<{
	token: string;
	fetch: typeof fetch;
	now: () => Date;
}>;

function redactToken(message: string, token: string): string {
	return token.length === 0 ? message : message.replaceAll(token, "[redacted]");
}

function toSchemaIssues(
	error: {
		issues: readonly { path: readonly PropertyKey[]; message: string }[];
	},
	token: string,
): string[] {
	return error.issues.map((issue) => {
		const path = issue.path.map(String).join(".");
		const description =
			path.length === 0 ? issue.message : `${path}: ${issue.message}`;
		return redactToken(description, token);
	});
}

function isRateLimited403(headers: Headers): boolean {
	return (
		headers.get("x-ratelimit-remaining") === "0" || headers.has("retry-after")
	);
}

function getResetAt(headers: Headers, now: () => Date): string | undefined {
	const resetEpoch = headers.get("x-ratelimit-reset");
	if (resetEpoch !== null && /^\d+$/.test(resetEpoch)) {
		const resetDate = new Date(Number(resetEpoch) * 1000);
		if (!Number.isNaN(resetDate.getTime())) return resetDate.toISOString();
	}

	const retryAfter = headers.get("retry-after");
	if (retryAfter === null) return undefined;

	if (/^\d+$/.test(retryAfter)) {
		try {
			const retryDate = new Date(now().getTime() + Number(retryAfter) * 1000);
			return Number.isNaN(retryDate.getTime())
				? undefined
				: retryDate.toISOString();
		} catch {
			return undefined;
		}
	}

	const retryEpoch = Date.parse(retryAfter);
	if (Number.isNaN(retryEpoch)) return undefined;
	return new Date(retryEpoch).toISOString();
}

function rateLimitError(response: Response, now: () => Date): DataError {
	const resetAt = getResetAt(response.headers, now);
	return resetAt === undefined
		? { kind: "rate_limit" }
		: { kind: "rate_limit", resetAt };
}

function networkError(message: string): DataError {
	return { kind: "network", message };
}

export async function fetchProfile(
	deps: ProfileFetchDependencies,
	login: string,
): Promise<Result<ProfileSnapshot, DataError>> {
	let response: Response;
	try {
		response = await deps.fetch(GRAPHQL_ENDPOINT, {
			method: "POST",
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${deps.token}`,
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
			},
			body: JSON.stringify({
				query: PROFILE_DATA_QUERY,
				variables: { login },
			}),
		});
	} catch {
		// Never forward fetch exception text; it may contain request details.
		return err(networkError("GitHub request failed."));
	}

	if (response.status === 401) return err({ kind: "auth" });
	if (response.status === 403 && !isRateLimited403(response.headers)) {
		return err({ kind: "auth" });
	}
	if (response.status === 429 || response.status === 403) {
		return err(rateLimitError(response, deps.now));
	}

	let responseText: string;
	try {
		responseText = await response.text();
	} catch {
		return err(
			networkError(`GitHub request failed with HTTP ${response.status}.`),
		);
	}

	let responseJson: unknown;
	try {
		responseJson = JSON.parse(responseText);
	} catch {
		return response.ok
			? err({ kind: "schema", issues: ["Response body is not valid JSON."] })
			: err(
					networkError(`GitHub request failed with HTTP ${response.status}.`),
				);
	}

	const envelopeResult = parseGraphQLResponseEnvelope(responseJson);
	if (!envelopeResult.success) {
		return err({
			kind: "schema",
			issues: toSchemaIssues(envelopeResult.error, deps.token),
		});
	}

	const graphQLErrors = envelopeResult.data.errors ?? [];
	if (graphQLErrors.length > 0) {
		return err({
			kind: "graphql",
			messages: graphQLErrors.map(({ message }) =>
				redactToken(message, deps.token),
			),
		});
	}

	if (!response.ok) {
		return err(
			networkError(`GitHub request failed with HTTP ${response.status}.`),
		);
	}

	const profileResult = ProfileDataSchema.safeParse(envelopeResult.data.data);
	if (!profileResult.success) {
		return err({
			kind: "schema",
			issues: toSchemaIssues(profileResult.error, deps.token),
		});
	}

	if (profileResult.data.user === null) {
		return err({
			kind: "graphql",
			messages: ["Requested GitHub profile was not found."],
		});
	}

	let fetchedAt: string;
	try {
		fetchedAt = deps.now().toISOString();
	} catch {
		return err(networkError("Unable to timestamp GitHub response."));
	}

	return ok(
		toSnapshot({
			...profileResult.data,
			user: profileResult.data.user,
			fetchedAt,
		}),
	);
}
