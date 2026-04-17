# Master Implementation Plan

Each plan lives in its own file to keep agent context
small when working on a single phase.

For repo guidance, see `../../README.md` and `../../AGENTS.md`.

---

## TDD Convention (“Ralph Loop”)

Every unit below is implemented test-first using the acceptance criteria in the
corresponding spec file:

1. **Red** — translate the spec’s `- [ ]` acceptance criteria into failing Jest tests
2. **Green** — write the minimum production code to make them pass
3. **Refactor** — clean up without breaking tests; commit

Each checklist item therefore has two sub-checks:

```
- [ ] tests: red   ← spec ACs translated into a failing test file
- [ ] impl: green  ← production code written; all tests pass
```

A unit is **done** only when both boxes are checked and `npm run quality` passes in
its package.

---

## Current Status

Agent is told by the user at the start what plan to follow.
