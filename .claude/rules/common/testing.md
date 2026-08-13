---
description: Test user-visible behavior — role/text queries, no data-testid, Vitest via vite-plus
globs: ["**/*.{test,spec}.{ts,tsx}"]
alwaysApply: true
---

# Testing

Full guidance: [CODING_GUIDELINES.md](../../../CODING_GUIDELINES.md) §テストを念頭に入れたコーディング.

## Philosophy

Assert on what the user sees and can interact with, not implementation details.

## Query priority

1. `getByRole`
2. `getByText`
3. `getByLabelText` / `getByPlaceholderText`
4. `getByAltText`

`data-testid` is forbidden. Add an `aria-label` if the element has no accessible name.

## Vitest via vite-plus

```typescript
import { describe, expect, it } from "vite-plus/test";
```

Do not import from `vitest`. Run with `vp test`. Only `src/**/*.test.ts(x)` are collected.
