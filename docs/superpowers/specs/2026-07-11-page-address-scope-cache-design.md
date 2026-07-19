# Page address scope cache design

## Problem

Semantic page validation originally reconstructed an ordinary page root's descendant map and nested-entity indexes for every descendant override. Validation-local reuse closed that loop, but constructing the local index still invokes the standalone full-document scope builder once per ordinary root. A document with many independent roots therefore repeats a full hierarchy scan per root.

## Design

`resolved-address.ts` will provide a bulk page-address-scope builder. It collects the selected ordinary root element IDs across all pages, resolves each document element's selected-root ownership with a memoized parent-chain traversal, partitions elements by selected root, and builds nested-entity indexes once per partition. Valid independent roots therefore cost `O(elements + roots)` rather than `O(elements × roots)`. Cycles and elements outside a selected root fail closed. Component page roots continue to use their component's prebuilt element and nested-entity indexes.

The module will also expose an internal in-scope helper that resolves a page-instance element from an already-created page scope. The existing package-public `resolvePageInstanceElement(document, page, address)` wrapper remains unchanged and delegates to it after constructing its standalone scope. Both bulk and in-scope helpers are excluded from the v1/package barrels through an explicit list of the existing resolved-address public exports, preserving the exact compiler API inventory. There is no module-global cache, object mutation, or dependency from semantic indexes back to the resolver.

Missing page/root entries retain their current diagnostics. Nested IDs that are ambiguous in a reused scope remain unresolved because the existing kind-specific nested indexes retain all owners and resolution still requires exactly one match.

## Verification

A 2,000-root regression will instrument `parentId` reads and require a count proportional to elements plus roots, proving the hierarchy is not rebuilt per root. The existing 2,000-descendant regression remains. A mixed ordinary/component fixture will verify descendant correctness, component-scope reuse, zero diagnostics, and fail-closed nested ambiguity.

The model strict gate, dead-code analysis, documentation check, diff/size/security review, and full workspace strict gate will run before the final commit.
