import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok } from "./index";

describe("Result", () => {
	it("constructs a successful result and narrows its guards", () => {
		const result = ok(42);

		expect(result).toEqual({ ok: true, value: 42 });
		expect(isOk(result)).toBe(true);
		expect(isErr(result)).toBe(false);
	});

	it("constructs an error result and narrows its guards", () => {
		const result = err("unavailable");

		expect(result).toEqual({ ok: false, error: "unavailable" });
		expect(isOk(result)).toBe(false);
		expect(isErr(result)).toBe(true);
	});

	it("preserves every generated string in a successful result", () => {
		fc.assert(
			fc.property(fc.string(), (value) => {
				const result = ok(value);

				return (
					result.ok && result.value === value && isOk(result) && !isErr(result)
				);
			}),
		);
	});
});
