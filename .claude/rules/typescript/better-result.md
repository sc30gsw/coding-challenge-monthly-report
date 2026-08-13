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

Keep `Result` instances in-process. Class instances never cross a boundary.

**This project's only boundary is HTTP, and it does not use `Result.serialize` / `Result.deserialize`** — HTTP already has a vocabulary for failure. `toHttpFailure` (`src/server/http-failure.ts`) maps the tag to a status and returns a plain `{ message, tag }`; `toResult` (`src/lib/api/result.ts`) rebuilds a `Result` on the client. Layering a Result envelope inside HTTP would give the API two error protocols and make the OpenAPI document unreadable. The tag survives the crossing, which is the property that mattered. See [ADR-0005](../../../docs/adr/0005-better-result-for-expected-failures.md).

Do not hand-roll a second envelope shape anywhere else. If a non-HTTP boundary appears, reach for `Result.serialize` there.

## Testing

Cover success and expected error variants. Narrow with `Result.isOk` / `Result.isError` before asserting fields. Include at least one short-circuit case for composed flows.
