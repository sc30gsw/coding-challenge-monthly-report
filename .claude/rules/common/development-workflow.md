---
description: Vite+ (vp) command conventions — short table; AGENTS.md is the source of truth
globs: []
alwaysApply: false
---

# Development Workflow

Command pitfalls and project facts live in [AGENTS.md](../../../AGENTS.md). Coding conventions: [CODING_GUIDELINES.md](../../../CODING_GUIDELINES.md) §ツール設定.

All operations go through **`vp`**. Never call `pnpm`, `npm`, or `yarn` directly. Import config/test utilities from `vite-plus` / `vite-plus/test`.

| Command      | Purpose                                   |
| ------------ | ----------------------------------------- |
| `vp check`   | Format + lint + typecheck (warnings fail) |
| `vp run fix` | `vp check --fix`                          |
| `vp test`    | Tests                                     |
| `vp build`   | Production build                          |
| `vp lint`    | Lint only                                 |

Before calling work done: `vp check` and `vp test`. Before a PR, also `vp build`. Use `vp run fallow` when removing or renaming exports.
