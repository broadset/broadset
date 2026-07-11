# Page address scope cache design

## Problem

Semantic page validation reconstructs an ordinary page root's descendant map and nested-entity indexes for every descendant override. `resolvePageInstanceElement` builds one scope, then descendant target validation builds the same scope again. Root override validation also constructs the same root scope independently. Valid documents with thousands of descendants therefore repeat a linear hierarchy traversal per override.

## Design

`semantic-validation-pages.ts` will build one validation-local page-address-scope index for each document. The index is keyed by page ID and root-instance ID and contains exactly one `AddressScope` created for every page root, including component roots. Root override validation and descendant override validation will receive and reuse these scopes.

`resolved-address.ts` will expose an internal module helper that resolves a page-instance element from an already-created page scope. The existing package-public `resolvePageInstanceElement(document, page, address)` wrapper remains unchanged and delegates to the in-scope helper after constructing its standalone scope. This preserves external behavior without module-global caches, object mutation, or a dependency from semantic indexes back to the resolver.

Missing page/root entries retain their current diagnostics. Nested IDs that are ambiguous in a reused scope remain unresolved because the existing kind-specific nested indexes retain all owners and resolution still requires exactly one match.

## Verification

A valid 2,000–5,000 descendant override regression will instrument `parentId` reads on ordinary document elements. It will assert zero diagnostics and a traversal count proportional to element count, proving the hierarchy is not rebuilt per override. A component-root case will instrument scope creation inputs to prove one scope per root. Existing and focused ambiguity tests will confirm that caching does not change resolver correctness.

The model strict gate, dead-code analysis, documentation check, diff/size/security review, and full workspace strict gate will run before the final commit.
