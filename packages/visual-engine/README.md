# Visual engine error handling

Public visual-engine operations return a `Result<T>` instead of throwing for
expected failures. A successful result has `{ ok: true, value }`; a failed
result has `{ ok: false, error }`, where `error.code` identifies the failure
category and `error.message` is suitable for a diagnostic.

Rendering components, text path rendering, SVG optimization, SVG size checks,
and SVG primitives follow this contract. Callers should check `ok` and either
continue with `value` or propagate/report `error`. Do not turn a failed result
back into an exception for ordinary invalid input, unavailable local assets,
rendering failures, unsafe SVG, or size-limit violations.

Use `throw` only for bugs: violated internal invariants or programmer errors
that indicate the implementation cannot continue correctly. Do not use it for
conditions callers can reasonably encounter during normal use. When handling a
failure from an external dependency, catch it at that boundary and return a
typed `Result` error without swallowing programming defects elsewhere.
