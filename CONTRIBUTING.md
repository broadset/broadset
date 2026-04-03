# Contributing to Broadset

## Working Agreements

- Prefer **spec-first** and **test-first** changes for behavioral work.
- Keep package boundaries intact and respect the dependency graph in `spec/implementation/architecture.md`.
- Use the demo app as the integration validation surface for user-facing features.
- Prefer small, reviewable increments over large mixed changes.
- Put **WHAT** in `spec/openspec/`; put **HOW** in `spec/implementation/`.

## Quality Gates

Run the relevant verification before considering work complete:

- `npm run quality` — lint, formatting, typecheck, and unit tests for the demo package
- `npm run quality:all` — quality gate across **all** packages
- `npm run ct` — Playwright component tests when UI/editor behavior is affected
- `npm run build` — production build verification when package or bundling changes are involved

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

### Backpropagate Bugs Into Specs

When a bug reveals a missing or unclear requirement:

1. Add or update the requirement in OpenSpec.
2. Add or update the validation/tests.
3. Remove any related item from `## Spec Gaps` only when it is genuinely covered.

### RFC 2119 Keywords

- **MUST / SHALL** — absolute requirement
- **MUST NOT / SHALL NOT** — absolute prohibition
- **SHOULD** — recommended default
- **MAY** — optional behavior
