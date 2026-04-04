# Contributing to Broadset

## Working Agreements

- Prefer **spec-first** and **test-first** changes for behavioral work.
- Keep package boundaries intact and respect the dependency graph in `project/implementation/architecture.md`.
- Use the demo app as the integration validation surface for user-facing features.
- Prefer small, reviewable increments over large mixed changes.
- Put **WHAT** in `project/spec/`; put **HOW** in `project/implementation/`.

## Quality Gates

Run the relevant verification before considering work complete:

- `npm run quality` — lint, formatting, typecheck, and unit tests for the demo package
- `npm run quality:all` — quality gate across **all** packages
- `npm run ct` — Playwright component tests when UI/editor behavior is affected
- `npm run build` — production build verification when package or bundling changes are involved

## HeroUI Compliance Gate

All React components in `packages/ui` and `packages/demo` **MUST** use `@heroui/react` components for UI chrome. Before committing, verify that no raw HTML elements (`<button>`, `<input>`, `<select>`, `<textarea>`) are used where HeroUI equivalents exist. See `AGENTS.md` and `.github/instructions/heroui.instructions.md` for the full checklist.

## Package Boundary Gate

Imports must respect the dependency graph defined in `project/implementation/architecture.md`. Before committing, verify that no package imports from a workspace package it is not allowed to depend on. See `AGENTS.md` → "Package boundary rules" for the full matrix.

## Barrel Export Gate

Every new public type, function, or component MUST be exported from the package's `index.ts`. Consumers must be able to `import { Foo } from '@broadset/pkg'` — never from internal file paths.

## Development

```bash
npm install
npm run dev          # watch mode build
npm run build        # production build
npm run test         # run tests
npm run lint         # lint source
npm run typecheck    # type-check
npm run quality      # full quality gate for demo (lint + prettier + typecheck + test)
npm run quality:all  # full quality gate for every package
npm run ct           # Playwright component tests
```

## Spec Writing Conventions

### Acceptance Criteria

Every `### Requirement:` block should include an `#### Acceptance Criteria` section with self-contained, testable statements.

```md
#### Acceptance Criteria

- [ ] Given a canvas with zero width, validation fails
- [ ] Given valid dimensions, validation succeeds
```

Acceptance criteria should describe **behavioral truth**, not implementation details, test file names, or shell commands.

### Spec Gaps

If a requirement is known but not yet fully or automatically validated, record it in a `## Spec Gaps` section instead of pretending it is fully closed.

### Keep Parent Specs Concise

Parent `spec.md` files should stay concise. When a domain grows, split it into focused child files under the same domain folder and keep the parent as the index.

### Backpropagate Into Specs

Implementation often surfaces insights the original spec didn't anticipate. It is expected and encouraged to update specs during implementation.

When updating a spec:

1. Add or update the requirement in `project/spec/`.
2. Add or update the corresponding validation/tests.
3. Remove any related item from `## Spec Gaps` only when it is genuinely covered.
4. Commit spec changes alongside (or before) the implementation, never after.

### RFC 2119 Keywords

- **MUST / SHALL** — absolute requirement
- **MUST NOT / SHALL NOT** — absolute prohibition
- **SHOULD** — recommended default
- **MAY** — optional behavior
