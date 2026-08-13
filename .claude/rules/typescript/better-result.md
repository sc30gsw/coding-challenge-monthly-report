---
description: better-result — expected failures, TaggedError, gen, serialize/deserialize
globs: ["src/**/*.ts", "src/**/*.tsx"]
alwaysApply: true
---

# better-result

Full conventions: [CODING_GUIDELINES.md](../../../CODING_GUIDELINES.md) §エラーハンドリング（better-result）. Official index: https://better-result.dev/llms.txt

Also: [Mental model](https://better-result.dev/getting-started/mental-model), [Extracting values](https://better-result.dev/core/extracting-values), [Result codecs](https://better-result.dev/serialization/result-codecs), [ADR 0005](../../../docs/adr/0005-better-result-for-expected-failures.md).

## Expected failures only

Use `Result` + `TaggedError` for business/integration failures. Programmer defects stay as throws / `Panic`. Do not wrap every throw.

Wrap throwing third-party calls with `Result.try` / `Result.tryPromise`. `catch` must **return** an error, not throw.

## Compose, then extract

- `Result.gen` + `yield*` + `Result.await` — do not unwrap early
- `.match({ ok, err })` **or** `Result.isOk` / `Result.isError` — both are valid
- `matchError` for tagged-error unions
- `.unwrap()` only for invariants (throws `Panic` on Err)
- Prefer `unwrapOr` for fallbacks
- No `Result<T, any>`

```typescript
class ReportNotFound extends TaggedError("ReportNotFound")<{
  cause?: unknown;
  id: string;
  message: string;
}>() {}
```

## Serialization boundaries

Keep `Result` instances in-process. Across process boundaries use `Result.serialize` / `Result.deserialize` — not a hand-rolled `{ error: true, data }`. `deserialize` validates the envelope only; parse the payload with Valibot.

## Testing

Cover success and expected error variants. Narrow with `Result.isOk` / `Result.isError` before asserting fields. Include at least one short-circuit case for composed flows.
