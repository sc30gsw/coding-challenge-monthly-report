import { createTheme } from "@mantine/core";

/**
 * Mantine theme overrides — the single source of truth for palette, spacing, and radii.
 *
 * Adding custom colors here does NOT expose them as Tailwind classes on its own.
 * To get `bg-<name>-6` style aliases, switch `src/styles.css` to the generated
 * stylesheet and add the `tailwind-preset-mantine/vite` plugin with
 * `{ input: "./src/lib/theme.ts" }`.
 */
export const theme = createTheme({});
