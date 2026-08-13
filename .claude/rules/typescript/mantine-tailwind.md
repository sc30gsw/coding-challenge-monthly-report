---
description: Mantine 9 first, Tailwind for wrapper layout, cn(), tailwind-preset-mantine
globs: ["src/**/*.tsx", "src/lib/theme.ts"]
alwaysApply: true
---

# Mantine + Tailwind

Full conventions: [CODING_GUIDELINES.md](../../../CODING_GUIDELINES.md) §UI（Mantine と Tailwind）. [ADR 0003](../../../docs/adr/0003-mantine-with-tailwind-preset.md).

## Mantine first

Use Mantine components and props for composite UI. Tailwind is for wrapper layout only. Do not override Mantine props that already exist, and do not target Mantine internals with arbitrary selectors.

## `cn()`

`cn` from `cnfast` is the only class-merging helper. oxfmt Tailwind sorting is configured for `cn` only.

## Theme

`src/lib/theme.ts` is the palette/spacing source of truth, applied via `MantineProvider` in `src/routes/__root.tsx`. `src/styles.css` imports `tailwind-preset-mantine` — do not add a bare `@import "tailwindcss"`.

Custom colors in `createTheme` work as Mantine props immediately. They are **not** Tailwind classes until the generated-stylesheet + `tailwind-preset-mantine/vite` plugin is wired.
