---
description: 'Use when writing or reviewing TypeScript code. Covers strict typing rules, null safety, immutability, and runtime validation for the headless template editor.'
applyTo: '**/*.{ts,tsx}'
---

# TypeScript Strictness Rules

- **No `any` types.** If a type is unknown, use `unknown` and perform type narrowing.
- **No `@ts-ignore` or `@ts-expect-error`.** Fix the underlying interface or generic instead.
- **No unsafe `as` casts.** Type assertions that widen or lie about types are forbidden. Use type narrowing, discriminated unions, or Zod parsing instead. `as const` is fine.
- **Explicit return types** on every function and React component.
- **Strict null checks.** Handle `null` and `undefined` safely — optional chaining (`?.`) and nullish coalescing (`??`) are mandatory.
- **Immutable state.** Never mutate arrays or objects directly in Zustand actions; use spread operators or structured cloning.
- **Readonly by default.** All interface and type properties must be `readonly` unless mutation is explicitly required. Use `ReadonlyArray<T>` or `readonly T[]` for array types. Mutable properties require a comment justifying the exception.
- **Runtime validation.** When parsing JSON schemas or external data, use Zod to guarantee type safety at runtime.
- **No magic numbers.** Extract numeric and string literals into named constants (`const DEFAULT_ZOOM = 1`, `const MM_PER_INCH = 25.4`). Exceptions: `0`, `1`, `-1`, and values obvious from immediate context (e.g., array index, string split limit).
- **No dead code.** Remove unused imports, unreachable branches, commented-out code, and unused variables. Never commit code "for later."
- **No `console.log` in production code.** Remove all debug logging before committing. If structured logging is needed in the future, it will be added as a proper utility.
- **Regex worst-case must stay linear.** Any regex that runs on attacker-influenceable input (importers, user-pasted strings, CSS/SVG/path parsing, etc.) must execute in time linear to the input length. The classic catastrophic-backtracking traps are nested unbounded quantifiers (`(a+)+`, `(a*)*`), overlapping alternation (`(a|a)+`, `(\d+\.\d+|\d+\.\d*)`), and ambiguous adjacent quantifiers (`\d+\d*`, `.*.*`). Prefer non-overlapping atoms separated by literal anchors (`\d+\.\d+|\d+`), bounded character classes terminated by literals (`[^"]*"`), or splitting one tangled regex into a small parser. When in doubt, sketch the worst-case input on paper before shipping.
- **Modular files.** Soft limit of **500 non-empty lines** per file. When a file approaches this, split it — separate interfaces/types (`types.ts`), utilities, Zustand stores (`store.ts`), and React components into their own files.
- **Single responsibility.** Each file, function, and class should do one thing well. If a function has multiple unrelated responsibilities (e.g., validate input AND transform data AND persist results), split it into focused, composable pieces. A good heuristic: if you can't describe what a function does without saying "and," it should be split.
- **No utility dumping.** Never add standalone utility logic (color conversion, path math, string helpers, date formatting, etc.) into a file whose primary purpose is something else (schemas, config, store). If it's a distinct concern, it gets its own file — even if it's small. A 30-line `color.ts` is better than burying `hslToRgb` inside `config.ts`. Ask: "Would someone looking for this logic look in this file?" If not, move it.
- **Extract reusable logic.** When logic appears in more than one place — or is likely to — extract it into a shared utility. Prefer pure functions that take inputs and return outputs over functions that reach into external state. Place shared utilities in the appropriate package (`model` for data logic, `editor` for editor-specific helpers, etc.).
- **Cohesive grouping.** Group related functions, types, and constants in the same file. Don't scatter closely related pieces across many files, but also don't dump unrelated utilities into a single grab-bag file. Each file should have a clear theme visible from its name (e.g., `color.ts` for color parsing/conversion, `validation.ts` for input validators).
- **Barrel exports.** Every package must have a well-maintained `index.ts` that explicitly re-exports the public API. Consumers must be able to import from the package root — never force imports from internal file paths.
- **Maximize type reuse.** Never define a local type alias, interface, or inline type when a shared one already exists or could be created. Before defining any type, search the codebase for an existing match. If a type is used in more than one file, it belongs in a dedicated `types.ts` file — never import types from business-logic or implementation files. Co-locating a type inside a single implementation file is acceptable only when the type is truly private to that file and unlikely to be reused.
- **Max 3 positional parameters.** Functions with more than 3 parameters must use a named options object. Destructure in the signature for clarity.
- **Guard clauses over nesting.** Prefer early returns for precondition checks instead of deeply nested `if/else` chains.
- **Self-documenting names.** Use descriptive, verb-first names: `calculateNearestAnchor`, `handleCanvasVoidClick`.
- **JSDoc on complex math.** Write JSDoc comments above complex mathematical functions and Zustand actions explaining _why_ the logic exists.
