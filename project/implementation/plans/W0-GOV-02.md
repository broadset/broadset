# W0-GOV-02 Documentation and Architecture Integrity Plan

> **For agentic workers:** execute this plan task-by-task. Subagent execution is optional; the evidence requirements are mandatory.

**Goal:** Make active agent guidance, commands, architecture baselines, and documentation references mechanically accurate.

**Architecture:** A dependency-free Node.js checker reads Markdown and package manifests, validates the documentation graph, and compares a deterministic manifest baseline embedded in `architecture.md`. Root scripts and CI run the checker before expensive gates.

**Tech stack:** Node.js 24 ESM, `node:test`, npm scripts, Markdown, GitHub Actions.

**Execution status:** documentation-reconciliation scope completed 2026-07-09. W0-GOV-02 remains `proposed` in the portfolio tracker until a named DRI and the initiative's full release evidence are approved.

## Global Constraints

- Preserve unrelated working-tree changes.
- Use manifests as the dependency/version oracle.
- Report all documentation failures in one run.
- Do not weaken an existing gate.

### Task 1: Documentation checker

**Files:**

- Create: `scripts/check-documentation.mjs`
- Create: `scripts/check-documentation.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces `checkDocumentation(rootDir): Promise<readonly DocumentationFinding[]>`.
- Produces `renderManifestBaseline(rootDir): Promise<string>`.
- CLI supports check mode and `--write-architecture` generation mode.

- [x] Write failing `node:test` cases for broken local links, malformed tables, stale phase vocabulary, missing initiative tracker rows, and manifest drift.
- [x] Run `node --test scripts/check-documentation.test.mjs`; expect failures because the module is absent.
- [x] Implement the checker and deterministic diagnostics.
- [x] Add `docs:check` and `test:docs` scripts and prepend `docs:check` to `gate:full`.
- [x] Run the focused tests and repository checker; expect zero failures after later reconciliation tasks.

### Task 2: Manifest-derived architecture

**Files:**

- Modify: `project/implementation/architecture.md`

- [x] Replace handwritten toolchain/dependency tables with generated marker blocks.
- [x] Preserve package boundaries and behavioral architecture prose.
- [x] Run `node scripts/check-documentation.mjs --write-architecture` and verify a second run produces no diff.

### Task 3: Active agent instructions

**Files:**

- Modify: `agents/ralph.agent.md`
- Modify: `agents/instructions/testing.instructions.md`
- Modify: `agents/instructions/workflow.instructions.md`
- Modify: `agents/instructions/ways-of-working.instructions.md`
- Modify: `CONTRIBUTING.md`
- Modify: `.claude/agents/code-reviewer.md`

- [x] Replace phase-file execution with stable initiative and child-plan execution.
- [x] Correct current file/function names and `ct:all`/quality command descriptions.
- [x] Replace `[DONE]` with lifecycle/evidence updates.
- [x] Remove historical-plan authority from the code reviewer.
- [x] Run `npm run docs:check`.
