---
description: Bulletproof React features/* layout, ~ alias, feature inter-dependencies
globs: ["src/**/*.{ts,tsx}"]
alwaysApply: true
---

# Project Structure

Full conventions: [CODING_GUIDELINES.md](../../../CODING_GUIDELINES.md) §プロジェクト構造.

## Feature layout

Target layout — create directories as features land, not upfront:

```
src/
├── features/[feature]/{components,hooks,schemas,types}/
├── routes/
├── lib/theme.ts
└── styles.css
```

`src/components/`, `src/hooks/`, `src/utils/` are created only when something is shared across features. Do not add `features/*/api/` until Elysia is installed ([ADR 0001](../../../docs/adr/0001-elysia-mounted-inside-tanstack-start.md)). There is no generated-client directory.

## `~` alias (relative paths forbidden)

`~/*` → `src/*` is declared in `tsconfig.json` (`compilerOptions.paths`). Vite picks it up via `resolve.tsconfigPaths: true`. Add new mappings to tsconfig only.

```typescript
// CORRECT
import { theme } from "~/lib/theme";

// WRONG — even in the same directory
import { helper } from "./helper";
```

## Feature inter-dependencies forbidden

Extract shared UI to `src/components/` instead of importing across features.

## Routes

Route files use `export const Route = createFileRoute(...)`. Keep them as wiring; put logic in features.

`vite.config.ts` overrides:

| Path                            | Override                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/router.tsx`, `*.config.ts` | `no-default-export: off`                                                                                     |
| `src/routes/**`                 | `react-doctor/no-multi-comp` and `react-doctor/only-export-components` off. `no-default-export` stays **on** |
