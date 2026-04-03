---
description: 'Use when writing or reviewing TypeScript code. Covers strict typing rules, null safety, immutability, and runtime validation for the headless template editor.'
applyTo: '**/*.{ts,tsx}'
---

# TypeScript Strictness Rules

- **No `any` types.** If a type is unknown, use `unknown` and perform type narrowing.
- **No `@ts-ignore` or `@ts-expect-error`.** Fix the underlying interface or generic instead.
- **Explicit return types** on every function and React component.
- **Strict null checks.** Handle `null` and `undefined` safely — optional chaining (`?.`) and nullish coalescing (`??`) are mandatory.
- **Immutable state.** Never mutate arrays or objects directly in Zustand actions; use spread operators or structured cloning.
- **Runtime validation.** When parsing JSON schemas or external data, use Zod to guarantee type safety at runtime.
- **Modular files.** Do not write 500+ line files. Separate interfaces/types (`types.ts`), utilities, Zustand stores (`store.ts`), and React components into their own files.
- **Self-documenting names.** Use descriptive, verb-first names: `calculateNearestAnchor`, `handleCanvasVoidClick`.
- **JSDoc on complex math.** Write JSDoc comments above complex mathematical functions and Zustand actions explaining _why_ the logic exists.
