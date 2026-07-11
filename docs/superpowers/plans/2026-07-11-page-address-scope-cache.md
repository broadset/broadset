# Page Address Scope Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every semantic-validation page-root address scope once and reuse it for root and descendant overrides without changing public resolver behavior.

**Architecture:** A document-local `PageAddressScopes` map in `semantic-validation-pages.ts` owns page/root scopes for one validation call. `resolved-address.ts` adds an in-scope page-element resolver; the existing public resolver remains a wrapper.

**Tech Stack:** TypeScript, Zod-parsed Broadset v1 fixtures, Vitest, ESLint.

## Global Constraints

- No module-global mutable cache or hidden runtime state.
- Build ordinary and component root scopes exactly once per document/page/root during semantic validation.
- Preserve deterministic diagnostics and existing public resolver semantics.
- Use TDD and retain exact ambiguity behavior.

---

### Task 1: Instrument the scaling regression

**Files:**
- Modify: `packages/model/src/v1/semantic-validation-performance.test.ts`

**Interfaces:**
- Consumes: `validateBroadsetProjectV1Semantics(project)`.
- Produces: a regression that counts hierarchy traversal through instrumented element `parentId` getters.

- [ ] **Step 1: Write the failing test**

Create 2,000 ordinary descendants and matching descendant overrides. Define `parentId` getters before semantic validation, count reads, assert `diagnostics` is empty and reads are at most a small multiple of element count. Add a component-root page alongside it and assert its component-property override remains valid. Include duplicate nested entities and assert their addressed target remains unresolved.

- [ ] **Step 2: Verify RED**

Run `npm run test -w @broadset/model -- --run src/v1/semantic-validation-performance.test.ts`. Expect the traversal-count assertion to fail because scope construction currently repeats per descendant override.

### Task 2: Reuse validation-local scopes

**Files:**
- Modify: `packages/model/src/v1/resolved-address.ts`
- Modify: `packages/model/src/v1/semantic-validation-pages.ts`

**Interfaces:**
- Produces: `resolvePageInstanceElementInScope(scope, address)` for an already-created page scope.
- Produces: `PageAddressScopes = ReadonlyMap<Id, ReadonlyMap<Id, PageAddressScope>>` local to page semantic validation.

- [ ] **Step 1: Add the minimal in-scope resolver**

Move the entity-address construction into `resolvePageInstanceElementInScope`. Keep `resolvePageInstanceElement(document, page, address)` unchanged and delegate after looking up the root and constructing its standalone scope.

- [ ] **Step 2: Build validation scopes once**

At the start of document page validation, map each page ID to each root ID and one `createPageAddressScope(document, page, root)` result. Pass the relevant scope to root-override and descendant-override validation. Use `resolvePageInstanceElementInScope` and never call `createPageAddressScope` inside an override loop.

- [ ] **Step 3: Verify GREEN and correctness**

Run the focused performance test and resolver/page semantic tests. Expect the traversal counter to be linear, the valid stress document to have zero diagnostics, component-root validation to remain valid, and ambiguous nested resolution to remain rejected.

### Task 3: Document and verify

**Files:**
- Modify: `project/spec/model/format-reference.md`
- Modify: `.superpowers/sdd/final-semantic-report.md` (ignored)

**Interfaces:**
- Produces: additive scope-reuse requirement and final verification record.

- [ ] **Step 1: Clarify the performance requirement**

Add that page-root hierarchy and nested-entity indexes are constructed once per validation scope and reused for all root/descendant overrides.

- [ ] **Step 2: Run gates**

Run focused tests, model strict, `npm run lint:dead`, `npm run docs:check`, diff/size/security review, and `npm run quality:strict`.

- [ ] **Step 3: Commit**

Stage only task files and commit with `fix(model): cache page address scopes`. Confirm the worktree is clean and update the ignored final report.
