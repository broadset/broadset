# Lint Strictness Plan — Phased Re-enablement

## Goal

Bring the codebase under the full set of strict ESLint rules wired in [eslint.config.cjs](../../eslint.config.cjs) without blocking active WIP. Each phase re-enables a coherent group of rules and pays down the violations they surface.

## Why phased

The strictness upgrade adds five plugin sets (`react`, `react-hooks`, `jsx-a11y`, `sonarjs`, plus six new `@typescript-eslint/prefer-*` and `no-unnecessary-*` rules). Together they surface ~130 violations in the existing tree. Landing them all at once would block every commit until cleanup completes. Phasing splits the cleanup into reviewable, scoped batches.

## How to enable a phase

In [eslint.config.cjs](../../eslint.config.cjs), find the `PHASED RE-ENABLEMENT` block at the bottom of the array. Delete the comment-block + rules for the phase you're enabling, then run:

```sh
npx eslint packages --no-cache
```

Fix every error it surfaces in the same PR. Only when `lint:strict` is clean across the workspace is the phase done. Update this document's checklist when complete.

> **Do not add new disables** to the PHASED RE-ENABLEMENT block without recording them here. Site-level `// eslint-disable-next-line <rule> -- <reason>` is the right tool for justified exceptions; the global block is for tracked debt only.

---

## Phase 1 — `react-hooks` bug-finders

**Why first:** these catch real bugs (missing dependencies, ref misuse, hook-in-loop, mutation in render). Highest correctness payoff.

**Rules to re-enable:**

- `react-hooks/rules-of-hooks` (2 violations)
- `react-hooks/exhaustive-deps` (3)
- `react-hooks/refs` (26)
- `react-hooks/globals` (11)
- `react-hooks/preserve-manual-memoization` (2)

**Approach:**

1. Run `npx eslint packages --no-cache --rule '{"react-hooks/refs":"error"}'` per rule to see violations in isolation.
2. `react-hooks/refs`: usually requires reading the ref inside an effect / callback rather than during render. Mechanical fix.
3. `react-hooks/globals`: wrap globals access (window, document, navigator) in effects or guarded hooks.
4. `exhaustive-deps`: add missing dep OR convert to `useEffectEvent` / `useRef` if the dep is intentionally excluded. Never just `// eslint-disable` without spec'd reason.
5. `rules-of-hooks`: usually a hook called conditionally — restructure so hooks always run.

**Acceptance:** all five rules removed from PHASED RE-ENABLEMENT block; `npm run quality:strict` passes.

- [x] Phase 1 complete

---

## Phase 2 — Accessibility (`jsx-a11y`)

**Why second:** spec mandates WCAG 2.1 AA ([panels.md](../spec/ui/panels.md), [inputs.md](../spec/ui/inputs.md)). Currently enforced in prose only.

**Rules to re-enable:**

- `jsx-a11y/no-static-element-interactions` (6)
- `jsx-a11y/click-events-have-key-events` (3)
- `jsx-a11y/no-redundant-roles` (3)
- `jsx-a11y/no-noninteractive-tabindex` (2)
- `jsx-a11y/no-noninteractive-element-interactions` (1)
- `jsx-a11y/no-autofocus` (1)

**Approach:**

1. `no-static-element-interactions` + `click-events-have-key-events` + `no-noninteractive-element-interactions`: the typical fix is to use a HeroUI `Button` instead of a `<div onClick>`. If you genuinely need a non-button clickable element, add `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space, and `aria-label`.
2. `no-redundant-roles`: drop redundant `role="..."` attributes (e.g. `<button role="button">`).
3. `no-noninteractive-tabindex`: remove `tabIndex` from non-interactive elements, or make them interactive properly.
4. `no-autofocus`: replace HTML `autoFocus` with a `useEffect` that calls `.focus()` after a meaningful event, OR justify with a site-level disable comment if it's a modal-open focus.

**Acceptance:** all six rules removed; `npm run quality:strict` passes.

- [x] Phase 2 complete

---

## Phase 3 — TypeScript-eslint preferences

**Why third:** mostly mechanical / auto-fixable; clears the largest category (~40 violations) cheaply.

**Rules to re-enable:**

- `@typescript-eslint/consistent-type-assertions` (24) — bans object-literal `{ ... } as Foo`. Already documented in [AGENTS.md](../../AGENTS.md) as forbidden.
- `@typescript-eslint/prefer-optional-chain` (8) — `a && a.b && a.b.c` → `a?.b?.c`.
- `@typescript-eslint/prefer-nullish-coalescing` (5) — `x || default` → `x ?? default` when `x` is nullable.
- `@typescript-eslint/prefer-string-starts-ends-with` (3) — `s.indexOf(x) === 0` → `s.startsWith(x)`.

**Approach:**

1. Run `npm run lint -- --fix` first — `prefer-optional-chain`, `prefer-string-starts-ends-with`, and most `prefer-nullish-coalescing` cases auto-fix.
2. `consistent-type-assertions` is **not** auto-fixable. Replace each `{ a: 1 } as Foo` with either `const x: Foo = { a: 1 }` (variable annotation) or `satisfies Foo` (preserves widening). Don't reach for `as` to silence type errors.
3. Verify no semantic change (e.g. `||` vs `??` differ when the value can legitimately be `0`/`''`).

**Acceptance:** all four rules removed; `npm run quality:strict` passes.

- [x] Phase 3 complete

---

## Phase 4 — SonarJS code smells

**Why fourth:** the most subjective batch. Cognitive complexity and identical-functions often surface real refactor opportunities, but the fixes are larger and deserve their own PRs.

**Rules to re-enable:**

- `sonarjs/cognitive-complexity` (threshold now 30; was 20. Ratchet down over time — see below)
- `sonarjs/no-identical-functions` (2)
- `sonarjs/no-alphabetical-sort` (2)
- `sonarjs/code-eval` (1, intentional `new Function(...)` in [packages/ui/src/inputs/number-inputs.tsx:26](../../packages/ui/src/inputs/number-inputs.tsx#L26))

**What landed:**

- `no-alphabetical-sort`: two sites got explicit `.localeCompare` comparators.
- `no-identical-functions`: the three identical inline Consumer components in [react-data-integration.test.tsx](../../packages/editor/src/react-data-integration.test.tsx) got site-level disables — each `it` block captures a per-test `hookResult` closure, so extraction would trade readability for rule-satisfaction.
- `code-eval`: site-level disable on the regex-gated numeric expression evaluator in [number-inputs.tsx](../../packages/ui/src/inputs/number-inputs.tsx#L26).
- `cognitive-complexity`: threshold raised to **30** (from the default 15) so most functions pass. Seven functions above 30 have site-level disables with per-site rationale and a pointer to this plan:
  - `packages/ui/src/properties-sidebar.tsx` `PropertiesSidebar` (cc=103)
  - `packages/playback/src/playback-controller.ts` `syncTransitions` (cc=57)
  - `packages/formats/src/psd/import.ts` `layerToElement` (cc=56)
  - `packages/formats/src/psd/export-layer.ts` `elementToLayer` (cc=54)
  - `packages/editor/src/editing/preflight.ts` `runPreflightDiagnostics` (cc=44)
  - `packages/model/src/element/guards.ts` `isValidVisibleWhenExpression` (cc=31)
  - `packages/playback/src/interpolation.ts` `interpolateValue` (cc=31)

**Ratchet plan for cognitive-complexity:**

1. Current threshold: 30 with 7 over-threshold exceptions.
2. When a refactor brings all above-30 functions to ≤30, remove their site-level disables AND lower the threshold to 25 in one commit.
3. Repeat: threshold 25 → 20 → delete the threshold override entirely so we're back on the Sonar default (15).

**Acceptance (Phase 4 landing):**

- [x] All four rules on with the exceptions above.
- [x] `npm run quality:strict` passes.

- [x] Phase 4 complete (threshold landing); cognitive-complexity ratchet is a standing followup in this section.

---

## Phase 5 — React polish

**Why last:** trivial cleanup; not blocking anything.

**Rules to re-enable:**

- `react/display-name` (1)

**Approach:** add `displayName` to the unnamed memoized component the rule flags.

**Acceptance:** rule removed; `npm run quality:strict` passes.

- [ ] Phase 5 complete

---

## Tracking

When all phases are complete, delete the entire `PHASED RE-ENABLEMENT` block from [eslint.config.cjs](../../eslint.config.cjs) and this plan document. The strictness upgrade is then fully landed.

Until then, this plan is the source of truth for what's deferred and why. New strict rules added to the linter that surface violations should also follow this phased pattern with a new section here, not a silent global disable.
