---
description: Named exports, function declarations, Utility-type props, as const satisfies, react-compiler
globs: ["src/**/*.tsx", "src/**/hooks/*.ts"]
alwaysApply: true
---

# React Conventions

Full conventions: [CODING_GUIDELINES.md](../../../CODING_GUIDELINES.md) §React/TypeScript規約 and §型定義規約.

## Named exports only

Exception: `src/router.tsx` and `*.config.ts` (`no-default-export` off). Route files do **not** get that exception.

```typescript
export function ReportTable({ reports }: ReportTableProps) {
  /* ... */
}
```

## Function declarations

Components and custom hooks use `function`, not `const` + arrow.

## Utility-type props

- **1–2 props**: inline `Pick` / `Omit` / `Record`
- **3+ props**: named `type` next to the component

## `as const satisfies` for constants

Preserve literal types; do not annotate as `Record<K, string>` (widens to `string`).

## Prefer type inference

Do not annotate return types unless inference is `unknown`/`any`, or the function is an explicit public boundary.

## react-compiler

Do not add `useMemo` / `useCallback` without a profiler measurement.

## Related skills

- `react-doctor` — `vp run doctor`
