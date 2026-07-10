# ADR-010: Page Overrides and Resolved Scene Contract

Status: proposed 2026-07-09 — does not override `project/spec/**` without explicit maintainer ratification.

## Context

The authoritative format reference omitted implemented page override fields, model prose used both “data override layer” and “layout instance,” and dangling element references could either fail or be silently ignored.

## Proposed decision

- A page is an ordered list of `PageElementInstance` override records, not an independent element definition store. Root entries establish included subtrees and root z-order; optional descendant entries override nodes inside an included subtree.
- Each instance requires `elementId`, `transform`, and `visible`, and may provide `content`, partial `style`, and `assetId` overrides.
- Every `elementId` must reference a document element. A descendant entry is valid only when its top-level ancestor root is included earlier on the page. Duplicate references, missing elements, orphan descendant overrides, and invalid topological order are validation errors.
- Canonical model validation never silently ignores dangling references. The load/recovery boundary may quarantine an invalid payload and offer last-valid recovery without mutating the original bytes.
- `ResolvedSceneSnapshot` applies component expansion, document hierarchy, ordered page instances/overrides, variables/data, and animation/runtime state in the documented order while retaining provenance for each resolved value.
- All renderer, editor, playback, player, and exporter consumers use the same snapshot or differential-oracle-equivalent resolver.

## Consequences

Page identity, layout, content variants, collaboration, paste, and imports share one deterministic scene contract. Existing incomplete format-reference tables must be corrected before scene implementation.

## Verification

Nested/rotated hierarchy, root ordering, descendant transform/content/style/visibility/asset overrides, duplicate/dangling/orphan references, component instances, provenance, differential rendering, and immutable snapshot tests are required.
