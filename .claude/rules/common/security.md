---
description: Secret handling, input validation via Valibot, XSS safety
globs: ["**/*.{ts,tsx}"]
alwaysApply: true
---

# Security

## Secrets

Never hardcode secrets. Read from the environment at startup and fail fast if a required variable is missing. Client-side vars use the `VITE_` prefix. Keep `.env.local` uncommitted.

## Input validation

Validate user input and external data at system boundaries with Valibot. See [valibot-validation.md](../typescript/valibot-validation.md) and [CODING_GUIDELINES.md](../../../CODING_GUIDELINES.md) §フォームと検証.

Do not `as` unvalidated payloads into domain types.

## XSS

Avoid `dangerouslySetInnerHTML`. Sanitize first if HTML rendering is unavoidable.
