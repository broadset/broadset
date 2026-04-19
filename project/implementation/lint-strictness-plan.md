# Cognitive-Complexity Ratchet (Phase 4 Followup)

The five-phase strictness rollout (react-hooks bug-finders → jsx-a11y → typescript-eslint preferences → sonarjs → react polish) is **complete** — every rule we wired in is now active. This document tracks the one remaining exception that was deliberately deferred: the SonarJS cognitive-complexity threshold.

## Current state

[eslint.config.cjs](../../eslint.config.cjs) sets `sonarjs/cognitive-complexity` to **30** (default is 15). Seven functions exceed even 30 and carry site-level `// eslint-disable-next-line sonarjs/cognitive-complexity` comments with a per-site rationale that points at this document.

| File | Function | Score |
|---|---|---|
| [packages/ui/src/properties-sidebar.tsx](../../packages/ui/src/properties-sidebar.tsx) | `PropertiesSidebar` | 103 |

## Ratchet plan

1. Refactor each site (extract helpers, dispatch maps, flatten conditionals — actually reduce branching, don't game the score).
2. As each site drops to ≤30, remove its site-level disable.
3. When all seven are ≤30, lower the threshold to **25** in one commit and add disables for any newly-flagged functions.
4. Repeat for **20**, then **default (15)**.
5. When the threshold override and all per-site disables are gone, delete this document and the threshold override comment in [eslint.config.cjs](../../eslint.config.cjs).

## Refactoring notes

- `PropertiesSidebar`: split per element-type into smaller dispatcher components; keep capability-driven visibility intact.
