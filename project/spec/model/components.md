# Model — Components

## Purpose

Defines document-owned component definitions, component-local identity, exposed properties, nested instances, sparse propagation, resolved identity, and unlink behavior.

## Requirements

### Requirement: Component Definitions

A component definition MUST contain stable `id`, `name`, ordered component-local `elements`, ordered `rootElementIds`, ordered `sequences`, ordered `exposedProperties`, and ordered `extensions`. Component IDs MUST be unique within a document. Root IDs MUST resolve to root elements in that definition.

#### Acceptance Criteria

- [ ] Given uniquely identified local elements and resolving root IDs, validation succeeds
- [ ] Given a duplicate component ID, local element ID, or missing root, semantic validation fails
- [ ] Given one definition with many instances, canonical data stores the definition only once

### Requirement: Component-Local Element Scope

Component elements use the same closed discriminated union as document elements but resolve identity within the owning definition. Hierarchy order and references MUST remain valid within that local scope unless a reference type explicitly addresses project or document resources.

#### Acceptance Criteria

- [ ] Given identical local element IDs in different component definitions, both are valid
- [ ] Given a local parent reference crossing into another definition, semantic validation fails
- [ ] Given a local media reference to a project asset, the project resource resolves normally

### Requirement: Nested Components

Component-instance elements MAY occur in document and component-local element arrays. Every instance MUST reference a component definition in the owning document. The complete component dependency graph MUST be acyclic.

#### Acceptance Criteria

- [ ] Given an acyclic nested component definition, validation succeeds
- [ ] Given a component that directly or indirectly contains itself, semantic validation fails
- [ ] Given a missing nested component definition, validation fails at the reference

### Requirement: Exposed Properties

An exposed property MUST have stable ID, label, group, typed value schema, type-compatible default, validation constraints, and one or more internal typed bindings. Instance values MUST address exposed-property IDs only; generic internal paths are not the ordinary instance contract.

#### Acceptance Criteria

- [ ] Given a type-compatible instance value for an exposed property, validation succeeds
- [ ] Given an unknown property ID or constraint-violating value, validation fails
- [ ] Given a definition-internal refactor that preserves exposed IDs, instance contracts remain valid

### Requirement: Sparse Instance Values and Propagation

Definitions contain defaults; component instances store only intentional exposed-property values. Definition changes propagate to instances that do not override the affected property. Resolution retains definition, nested instance, and exposed-property provenance.

#### Acceptance Criteria

- [ ] Given a default change and no instance value, the resolved instance reflects the new default
- [ ] Given an intentional instance value, a default change does not replace it
- [ ] Given an effective property, provenance identifies definition and instance contributions

### Requirement: Resolved Nested Identity

Resolved component-local entities MUST use composite identity formed from the root page instance and nested component-instance path plus local entity ID. Array position MUST NOT be part of durable identity.

#### Acceptance Criteria

- [ ] Given two instances of one definition, their resolved descendants have distinct composite identities
- [ ] Given a reorder with unchanged stable IDs, resolved identity remains attached to the same logical instance
- [ ] Given a property target with an invalid nested path, semantic validation fails

### Requirement: Component Sequences

Component-local sequences MAY target component-local elements and exposed-property-driven values. Their targets and keyframe types MUST validate within the component identity scope and participate in dependency-cycle validation.

#### Acceptance Criteria

- [ ] Given a component sequence targeting a local property, validation succeeds
- [ ] Given a target outside the permitted component scope, validation fails
- [ ] Given a nested sequence dependency cycle, semantic validation fails

### Requirement: Unlink

Unlink MUST materialize the fully resolved component instance into ordinary document elements with fresh stable IDs in one atomic transaction. It MUST preserve visible semantics, hierarchy, resource references, and authorable values while removing component dependency.

#### Acceptance Criteria

- [ ] Given unlink, resolved appearance and content before and after are semantically equivalent
- [ ] Given unlink, every materialized document entity receives a fresh non-conflicting ID
- [ ] Given any failure during unlink, no partial materialization becomes visible

## Spec Gaps

- Exact exposed-property constraint variants and editor propagation UX are owned by the components and view-model program.

## Non-Goals

- Storing component masters as hidden document elements
- Copying component definitions into each instance
- Generic arbitrary internal-property access for ordinary instance authors
