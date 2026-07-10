# Resolved Scene and Data-Binding Integrity Design

Status: proposed design note. This document does not override `project/spec/**`. It records a
non-authoritative technical design for the resolved-scene, component, and data-binding work already tracked
by the roadmap and by [ADR-010](../decisions/ADR-010-resolved-scene-pages.md); current spec behavior
remains authoritative until a maintainer ratifies any behavioral change and owns the corresponding spec
edit.

## Initiatives informed

| Initiative    | Role of this design                                                            |
| ------------- | ------------------------------------------------------------------------------ |
| W1-SCENE-01   | Single `ResolvedSceneSnapshot` resolver, ordering semantics, and provenance    |
| W2-COMP-01    | Component expansion order and stable synthetic identity                        |
| W0-COLLAB-01  | Page-override and document-level change semantics feeding the resolver          |
| W2-DATA-01    | Data-binding referential-integrity validator                                   |
| W2-VAR-01     | Scoped variable environments consumed by binding validation                    |

See [plan.md](../plan.md) and [plan-progress.md](../plan-progress.md).

## Governing insight

This is a language-design problem. The spec contradiction (`Pages as Data Override Layers` versus `Pages as
Layout Instances` in [model/spec.md](../../spec/model/spec.md)) and the five divergent per-package resolvers
persist because there is no operational semantics. The fix is one: a strictly staged pure pipeline with a
single linear precedence order and two deliberate restrictions that delete entire ambiguity classes.

## Design

### The resolver

```text
resolveScene : (Project, DocumentId, PageId, DataContext, t) → ResolvedSceneSnapshot   — pure, total
```

Fixed stage order, no back-edges:

1. **Component expansion** — hygienic macro-expansion with a static occurs-check (cycles are a validation
   error, never a resolve-time one). Expanded elements get deterministic path-based synthetic IDs
   (`instancePath ⊳ elementId`). This one decision is what makes animation targeting, page overrides, and
   the reconciliation identity of the fidelity design all stable across re-resolution.
2. **Hierarchy normalization** — flatten to paint order.
3. **Page application** — see the stratification below.
4. **Data binding** — repeaters expand to clones with IDs `elementId[i]` and lexically scoped field
   environments (item scope shadows outer; nested repeaters nest). `visibleWhen=false` prunes after
   expansion so sibling indices stay stable.
5. **Animation overlay** — apply runtime/animation state last.

### Pages: the contradiction resolved by stratification

A page is an ordered list of `PageElementInstance`, each carrying both roles, separated:

- **Layout-instance role** — instance-level transform/geometry for the referenced root element.
- **Override-layer role** — a map keyed by element path (root id plus descendant path; descendant overrides
  are simply path length greater than one), values are partial patches of `{content, style, visible,
  assetId}`.

One linear precedence chain (lowest to highest) is the entire merge algebra:

```text
component defaults → component-instance overrides → document element
  → page instance layout → page descendant overrides → data binding → animation overlay
```

Merge is pinned as shallow per style-property key — never a deep merge of nested style objects, which is the
classic ambiguity source.

### The two restrictions that make it provable

1. **Page overrides may not target repeater clone indices** — only the template. Clone counts are
   data-dependent; index-targeted overrides would make page correctness a function of runtime data.
   Deleting the feature deletes the ambiguity class.
2. **Stage purity** — no stage may read a later stage's output. Enforced by construction: each stage is a
   total function on the previous result.

### The snapshot

```ts
interface ResolvedSceneSnapshot {
  readonly sceneKey: string; // content-address of all inputs (shares the bsh1 serializer)
  readonly elements: readonly ResolvedElement[]; // flat, paint order equals array order
  readonly provenance: ReadonlyMap<
    ResolvedElementId,
    {
      readonly sourceElementId: ElementId;
      readonly componentPath: readonly InstanceId[];
      readonly repeaterIndexPath: readonly number[];
      readonly overridesApplied: readonly OverrideRef[];
    }
  >;
}
```

Provenance is what makes editing on the resolved scene sound: every resolved element knows which authoring
construct produced it, so the editor's write-routing rule is definable ("page-scope edits write page
overrides; document-scope edits write the element") and invertible — the piece the current per-package
resolvers each fake differently.

### Five-consumer equivalence

`resolveScene` lives in `model` (respecting the boundary matrix — every package may import `model`). Raw
page/component traversal helpers become package-internal and a lint rule forbids importing them elsewhere.
Equivalence stops being a theorem to prove and becomes "there is only one code path," pinned by a golden
conformance corpus (documents × pages × data contexts → committed canonical snapshots).

### Data-binding integrity validator

Turn the "validation fails" statements in [data-schema.md](../../spec/model/data-schema.md) into a real
`superRefine`. One `O(n)` tree walk carries a scope stack of typed environments `Γ` built from `dataSchema`:

- **V1** `dataField.fieldName ∈ Γ`, scalar type compatible with the element's content kind.
- **V2** `visibleWhen` parsed to an AST (extend the existing syntax-only guard with identifier resolution);
  every identifier is in the current scope and operand types check.
- **V3** `repeater.dataArrayField ∈ Γ` with an array type; inner bindings validate against the item schema
  pushed onto the stack.
- **V4** Shadowing is lexical and silent capture is an error: a binding that resolves only in an outer scope
  while shadowed fails loudly.
- **V5** Bindings inside page-override content validate in the target element's scope.

One genuine structural finding falls out: descendant-override paths resolve against the post-expansion tree,
so page-override validation needs component definitions in view — it must move from document-level to
project-level validation. The current root-only page-reference check is not merely too strict; it is at the
wrong layer.

### Canonicalization interplay

Hash the authoring model for reconciliation identity (that pipeline runs pre-resolution — imports produce
authoring elements) and hash the resolved snapshot for `sceneKey`, using the same canonical serializer core
with two versioned field-set profiles, never mixed. Page overrides hash into a separate per-page
fingerprint. This also separates the package-level `.bsp` digest (transport integrity) from element
fingerprints (semantic identity): three contracts, three jobs, zero overlap.

## Acceptance criteria

- [ ] (W1-SCENE-01) All five consumers, fed the same document/page/data context, produce byte-identical
      resolved geometry via one shared `resolveScene`.
- [ ] (W1-SCENE-01) The staged precedence order is documented and the `Pages as …` contradiction is
      resolved by the layout/override stratification.
- [ ] (W2-COMP-01) Component expansion assigns deterministic path-based synthetic IDs; a repeater inside a
      component inside an overridden page resolves to one unambiguous scene.
- [ ] (W2-DATA-01) A document binding a `dataField` / `visibleWhen` / `repeater` to a non-existent field
      fails validation; shadowed silent capture fails loudly.
- [ ] (W0-COLLAB-01) Page-override and document-level edits route through provenance-defined write targets
      and remain invertible.

## Verification

- `packages/model`: unit and property tests for staged resolution ordering, synthetic-ID determinism, and
  the binding validator; a golden conformance corpus for cross-consumer equivalence.
- Negative fixtures assert every "validation fails" statement in the data-schema spec is enforced.

## References

- [model/spec.md](../../spec/model/spec.md), [data-schema.md](../../spec/model/data-schema.md),
  [collaboration.md](../../spec/editor/collaboration.md) — governing specs.
- [ADR-010](../decisions/ADR-010-resolved-scene-pages.md) — resolved-scene proposal this design elaborates.
