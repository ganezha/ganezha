import type { Result } from "./result";

/** Unwraps a Result in a test and fails immediately if production returned Err. */
export function expectResult<T, E>(result: Result<T, E>): T {
	if (!result.ok) {
		throw new Error(
			`Expected Ok, received Err: ${JSON.stringify(result.error)}`,
		);
	}
	return result.value;
}

export async function expectResultAsync<T, E>(
	result: Promise<Result<T, E>>,
): Promise<T> {
	return expectResult(await result);
}
