---
description: Core coding style — naming, comments, immutability, ~ alias, type over interface
globs: ["**/*.{ts,tsx,js,jsx}"]
alwaysApply: true
---

# Coding Style

Full conventions: [CODING_GUIDELINES.md](../../../CODING_GUIDELINES.md) §コードスタイル and §React/TypeScript規約.

Formatting (quotes, semicolons, import order, line length) is owned by oxfmt via `vp check`. Do not restate it here.

## Immutability

Return new values; never mutate in place.

## Naming

| Target         | Convention       | Example             |
| -------------- | ---------------- | ------------------- |
| Variables / fn | lowerCamelCase   | `reportTitle`       |
| Components     | UpperCamelCase   | `ReportTable`       |
| Types          | UpperCamelCase   | `CreateReportInput` |
| Constants      | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`   |
| Files          | kebab-case       | `report-table.tsx`  |

## Bans

- **No `interface`** — `type` everywhere
- **No relative imports** — `~/` even for the same directory
- **No `export default`** outside `src/router.tsx` and `*.config.ts`
- **No `console.log`** in committed code

## File size (soft)

Typical 200–400 lines; extract before a file becomes hard to navigate. One primary responsibility per file.
