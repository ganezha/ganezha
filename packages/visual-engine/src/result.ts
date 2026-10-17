/** Expected failures are values so callers must handle them explicitly. */
export type VisualEngineErrorCode =
	| "invalid-input"
	| "asset-unavailable"
	| "render-failed"
	| "invalid-svg"
	| "size-limit-exceeded"
	| "write-failed";

export type VisualEngineError = Readonly<{
	code: VisualEngineErrorCode;
	message: string;
	cause?: unknown;
}>;

export type Result<T, E = VisualEngineError> =
	| Readonly<{ ok: true; value: T }>
	| Readonly<{ ok: false; error: E }>;

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}

export function visualError(
	code: VisualEngineErrorCode,
	message: string,
	cause?: unknown,
): VisualEngineError {
	return cause === undefined ? { code, message } : { code, message, cause };
}

export function collect<T>(
	results: readonly Result<T>[],
): Result<readonly T[]> {
	const values: T[] = [];
	for (const result of results) {
		if (!result.ok) return result;
		values.push(result.value);
	}
	return ok(values);
}
