---
description: Valibot schemas under features/*/schemas/, InferOutput, Formisch + Mantine
globs: ["src/features/**/schemas/*.ts", "src/features/**/components/*-form.tsx"]
alwaysApply: true
---

# Valibot Validation

Full conventions: [CODING_GUIDELINES.md](../../../CODING_GUIDELINES.md) §フォームと検証（Valibot / Formisch）. [ADR 0004](../../../docs/adr/0004-valibot-and-formisch-for-forms.md).

## Placement

`features/[feature]/schemas/[name].ts`. Derive types with `v.InferOutput` — do not hand-write a parallel type.

## Forms: Formisch + Mantine

Pass the Valibot schema to `useForm({ schema })`. No TanStack Form, no adapter.

Mantine inputs rarely expose a native element — bind `value` / `onChange` / `onBlur` instead of spreading `field.props`.

```tsx
<TextInput
  error={field.errors?.[0]}
  onBlur={field.props.onBlur}
  onChange={(event) => field.onChange(event.currentTarget.value)}
  value={field.input}
/>
```

Validation messages live in the schema. Full Formisch API: `formisch` skill.

## Boundaries only

Validate user input and external data. Do not add Valibot to pure internal transformations.
