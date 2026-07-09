# ADR-007: Component Definitions, Instances, and Overrides

Status: proposed 2026-07-09 — does not override `project/spec/**` without explicit maintainer ratification.

## Context

The element spec placed overrides inside `componentRef`; the config spec required `instanceId` and placed overrides on pages; the format reference did not define the shape. No authoritative master-storage contract existed.

## Proposed decision

- `BroadsetDocument.components` owns reusable `ComponentDefinition` records.
- A definition has stable `id`, `name`, local `elements`, `rootElementIds`, local `animations`, and typed `exposedProperties`. Definition-local element IDs are unique within that definition.
- A rendered component instance is a `group` host with `componentRef: { componentId, instanceId, overrides }`. `instanceId` is stable and unique within its containing document/definition collection; resolved nested nodes use composite instance-path identity.
- Component overrides are typed entries keyed by definition-local element ID plus an allowed property path. They live on `componentRef`, never in page overrides.
- Page overrides are a later independent layer. They may override the instance host's transform/visibility/content/style/asset and may provide typed `componentOverrides` addressed only by exposed-property ID for that page; generic definition-local paths remain owned by `componentRef`.
- Resolution order is definition → component instance overrides → page overrides → live data → animation/runtime state.
- Nested components are permitted; definition dependency cycles are validation errors.
- Unlink materializes resolved component elements into ordinary document elements with fresh document IDs in one undoable transaction.
- Component masters are not hidden rendered document elements. They exist only in the component registry until instantiated.

## Consequences

Definitions and instances have unambiguous ownership, page variants remain independent, propagation is deterministic, and collaboration can address stable component/instance IDs.

## Verification

Schema, propagation, nesting, cycle, override, unlink, page-variant, collaboration, and 100-instance performance tests are required before components leave experimental status.
