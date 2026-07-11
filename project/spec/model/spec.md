# Model — Document Specification

## Purpose

Defines the strict `BroadsetDocumentV1` contract inside a canonical project and the deterministic validation and scene-resolution semantics shared by editors, renderers, players, and exporters.

## Requirements

### Requirement: Canonical Document Vocabulary

Every document MUST contain `id`, `name`, `kind`, `surface`, `color`, `elements`, `components`, `pages`, `sequences`, `stateMachines`, `viewModels`, `bindings`, `selectedVariableModes`, `outputProfileIds`, and `extensions`. It MAY contain `metadata`, `timebase`, and `lifecycle`. Core document objects are strict; unknown fields are errors.

`kind` MUST be `motion`, `static`, or `print`. `id` MUST be stable and unique within the project.

#### Acceptance Criteria

- [ ] Given every required document field and no unknown field, structural validation succeeds
- [ ] Given an unknown document field or unsupported kind, structural validation fails
- [ ] Given duplicate document IDs, whole-project semantic validation fails

### Requirement: Surface

`surface` MUST define positive finite `size` as a two-value tuple, `unit` as `px`, `mm`, or `in`, positive finite `dpi`, the fixed coordinate system `{ origin: 'top-left', xAxis: 'right', yAxis: 'down' }`, a typed `background` paint, non-negative `padding`, ordered `guides`, and ordered `broadcastSafeAreas`. It MAY contain non-negative print `prepress` bleed, trim, and safe insets.

Spatial values use the declared surface unit unless their type explicitly declares another basis. DPI converts physical units and pixels but does not reinterpret stored physical coordinates.

Optional document metadata is strict `{description?, authors, keywords, rights?}`; authors and
keywords are explicit arrays of non-empty strings and may be empty. It contains no timestamps,
locale, or UI state. Surface insets are strict non-negative finite `{top,right,bottom,left}` values.
Guides are strict `{id,name,axis:'x'|'y',position,locked}` records with finite position. Named
broadcast-safe areas are strict `{id,name,insets:[top,right,bottom,left]}` records with every
percentage from 0 through 50. Working color space is either a named v1 color space or an ICC asset
reference with an explicit `rgb`, `cmyk`, `gray`, or `lab` model.

#### Acceptance Criteria

- [ ] Given a positive surface size and the fixed coordinate system, validation succeeds
- [ ] Given a zero, negative, non-finite size or unsupported axis direction, validation fails
- [ ] Given physical coordinates at a different DPI, their stored physical values remain unchanged

### Requirement: Document Color

`color` MUST define a typed working space and `compositing: 'linear-premultiplied'`. An optional output intent MUST reference an ICC-profile asset and declare rendering intent and black-point compensation. Working space, display preview, and output targets are distinct domains.

#### Acceptance Criteria

- [ ] Given a valid working-space definition and linear-premultiplied compositing, validation succeeds
- [ ] Given an output intent referencing a non-ICC asset, semantic validation fails
- [ ] Given a wide-gamut source color, its authoritative channels are retained rather than replaced with an sRGB approximation

### Requirement: Document Elements

`elements` MUST be a flat ordered array of closed discriminated element variants. Stable IDs, `parentId`, depth-first preorder, and contiguous subtrees define hierarchy and sibling stacking. Element IDs MUST be unique within the document and every hierarchy reference MUST resolve without cycles.

#### Acceptance Criteria

- [ ] Given a parent followed by a contiguous descendant subtree, hierarchy validation succeeds
- [ ] Given a missing parent, cycle, child before parent, or interleaved subtree, semantic validation fails
- [ ] Given sibling elements, their relative array order defines stacking order

### Requirement: Document Components

`components` MUST contain document-owned component definitions with stable local identity, typed exposed properties, component-local elements, and optional sequences. Component definitions MUST NOT be represented as hidden document elements. Nested component dependencies MUST resolve and remain acyclic.

#### Acceptance Criteria

- [ ] Given a component instance referencing an acyclic document component, validation succeeds
- [ ] Given a missing component or a direct or indirect dependency cycle, validation fails
- [ ] Given one component master used by many instances, canonical data stores the definition once

### Requirement: Document Pages

`pages` MUST contain at least one page. A page contains ordered root instances with identity separate from element-definition identity, typed descendant overrides, variable-mode selections, and optional sample-data and sequence references. The same root element definition MAY be instantiated more than once.

Root-instance order defines root z-order. Override targets MUST resolve through stable instance paths, be schema-approved as overridable, and receive type-compatible values.

#### Acceptance Criteria

- [ ] Given two root instances of one element definition with different instance IDs, both resolve independently
- [ ] Given an orphan override, invalid path, forbidden target, or incompatible value, semantic validation fails
- [ ] Given an empty page array, document validation fails

### Requirement: Document Sequences and Lifecycle

`sequences` MUST be an ordered collection of stable sequence definitions using the document timebase. Optional `lifecycle` maps IN, HOLD/UPDATE, and OUT behavior to resolving sequence or state-machine actions. Every timed cross-reference MUST resolve.

#### Acceptance Criteria

- [ ] Given lifecycle bindings to existing sequences or events, validation succeeds
- [ ] Given a missing sequence, state-machine event, track target, or cue asset, semantic validation fails
- [ ] Given direct evaluation and sequential playback at the same tick and event log, both produce the same declarative state

### Requirement: State Machines

`stateMachines` MUST contain stable states and transitions with typed triggers, closed expression guards, deterministic priority, and optional sequence actions. State-machine dependency and transition references MUST resolve.

#### Acceptance Criteria

- [ ] Given multiple eligible transitions, deterministic priority selects the same transition in every consumer
- [ ] Given an invalid guard or target state, semantic validation fails
- [ ] Given the same canonical data, input data, event log, and tick, evaluation is deterministic

### Requirement: View Models and Bindings

`viewModels` declare recursive typed runtime data contracts and sample data sets. `bindings` use stable field IDs, stable property targets, closed expression ASTs, optional deterministic formatter pipelines, and typed fallback values. Arbitrary code and unparsed expression strings are forbidden.

#### Acceptance Criteria

- [ ] Given a type-correct binding expression and target, semantic validation succeeds
- [ ] Given a missing field, invalid operand, unknown function, or incompatible target, validation fails
- [ ] Given the same locale-explicit input, binding evaluation returns the same result in every consumer

### Requirement: Selected Variable Modes

`selectedVariableModes` maps project variable-collection IDs to resolving mode IDs. A page MAY sparsely override document selections. Every referenced collection and mode MUST resolve and variable aliases MUST be acyclic and type-compatible.

#### Acceptance Criteria

- [ ] Given a document mode selection and no page override, the document selection is used
- [ ] Given a page override, it supersedes the document selection for that collection
- [ ] Given a missing collection or mode, semantic validation fails

### Requirement: Output Profile References

`outputProfileIds` MUST contain unique references to project `resources.outputProfiles`. Multiple profiles MAY describe distinct output targets without altering document authoring truth. Export-command options remain outside the document.

#### Acceptance Criteria

- [ ] Given several compatible output-profile references, the document remains one authoring source
- [ ] Given a missing or incompatible output profile, semantic validation or export preflight fails with a typed diagnostic
- [ ] Given an export preset change, canonical document content does not change

### Requirement: Exact Timebase by Document Kind

`timebase` is REQUIRED for motion documents and OPTIONAL for static and print documents. When present it MUST satisfy the rational timebase contract.

#### Acceptance Criteria

- [ ] Given a motion document with a valid timebase, validation proceeds
- [ ] Given a motion document without a timebase, validation fails at `timebase`
- [ ] Given a static or print document without timed content, omission of `timebase` is valid

### Requirement: Deterministic Resolution Order

Every visual and export consumer MUST resolve properties in this order:

1. element and component definition defaults;
2. component-instance exposed-property values;
3. page root and descendant overrides;
4. variable-mode resolution;
5. sample or live data bindings;
6. state-machine values;
7. sequence evaluation and runtime lifecycle state.

Every resolved property MUST retain its complete provenance chain. Consumers MUST NOT independently merge persisted layers.

#### Acceptance Criteria

- [ ] Given conflicting values at multiple layers, the later layer in the defined order wins
- [ ] Given a resolved value, its provenance identifies every contributing layer and the effective source
- [ ] Given identical project, page, data, state, and tick inputs, every consumer obtains a semantically identical scene

### Requirement: Strict Validation and Recovery Boundary

Structural validation MUST reject unknown core fields and invalid primitive shapes. Whole-project semantic validation MUST reject duplicate identity, unresolved or wrong-kind references, invalid ordering, cycles, incompatible values, and invalid target paths. Neither stage mutates or repairs input.

Whole-project semantic validation accepts a structurally parsed `BroadsetProjectV1`. Structural
collection invariants, including duplicate track IDs and time values outside a sequence duration,
are reported by structural parsing rather than being reintroduced as impossible semantic-validator
inputs. Cross-reference, type, ordering, and graph invariants that require project-wide indexes are
reported by semantic validation with deterministic codes and JSON Pointers.

Persisted property targets use a closed v1 allowlist. Collection array indexes are never target
identity; fixed tuple positions are semantic components. The resolver first resolves the addressed
entity and variant, then accepts only the following target families and derives the listed value
type:

- element geometry bounds `width|height` as `length`, origin as `point3d`, affine matrix `0..3` as
  `number` and `4..5` as `length`, matrix3d `0..11|15` as `number` and `12..14` as `length`;
- element opacity as `number`, accessibility label/description as `string`, and the closed
  type-specific image, video, audio, clock, ticker, QR, text-layout, text-path, group, and foreign
  properties defined in the format reference;
- page-root visibility as `boolean` and transform tuple positions using the same matrix mapping;
- stable nested `text-run`, `paragraph`, `fill`, `stroke`, `effect`, `gradient-stop`, `path-point`,
  and `guide` entities using their closed format-reference mappings.

Core identity, discriminants, hierarchy/order, lock/editor state, extensions, shared-style links,
component definition/value links, and raw plugin or foreign payloads are never overridable.

The load boundary preserves original bytes and typed diagnostics for invalid input. A structurally invalid project MUST NOT produce a partial scene or default project.

#### Acceptance Criteria

- [ ] Given a stale animation reference, semantic validation rejects the project
- [ ] Given invalid source bytes, loading returns a quarantined result that preserves those bytes
- [ ] Given a structurally invalid project, resolution does not produce a scene snapshot
- [ ] Given duplicate track IDs or an out-of-duration keyframe, structural aggregate parsing fails at the offending collection member
- [ ] Given a structurally valid project with multiple semantic defects, validation returns every independently establishable diagnostic sorted by pointer then code
- [ ] Given an approved stable entity and pointer, target resolution returns its deterministic `ValueType`
- [ ] Given a collection index, identity field, hierarchy field, raw payload, or pointer not approved for the resolved variant, target resolution fails

## Sub-Specs

| Sub-Spec                                   | Scope                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| [project.md](project.md)                   | Project identity, root vocabulary, metadata, ownership                   |
| [assets.md](assets.md)                     | Project resources, assets, blobs, fonts, variables, shared styles        |
| [element.md](element.md)                   | Element variants, identity, geometry, hierarchy, structured text         |
| [style.md](style.md)                       | Appearance, paints, effects, clips, and masks                            |
| [components.md](components.md)             | Component definitions, instances, exposed properties, nesting, unlink    |
| [data-schema.md](data-schema.md)           | View models, typed values, expressions, bindings, and repeaters          |
| [timebase.md](timebase.md)                 | Rational frame rates, integer ticks, intervals, and timecode             |
| [animation.md](animation.md)               | Sequences, tracks, keyframes, lifecycle, and state machines              |
| [color-management.md](color-management.md) | Color values, working spaces, ICC intent, alpha, and compositing         |
| [output-spec.md](output-spec.md)           | Reusable motion, screen, and print output profiles                       |
| [interop.md](interop.md)                   | External-source preservation, foreign fallback, and extensions           |
| [changes.md](changes.md)                   | Atomic change batches and persistence/collaboration boundary             |
| [format-reference.md](format-reference.md) | Canonical field reference, validation stages, serialization, and package |
| [config.md](config.md)                     | Host editor configuration outside persisted project truth                |
| [utilities.md](utilities.md)               | Model utilities and unit conversion                                      |
| [capabilities.md](capabilities.md)         | Editor capability presentation derived from element variants             |

## Spec Gaps

- Resolved-scene implementation, persistence codecs, and format adapters are owned by follow-on programs; their normative inputs and outputs are fixed here.

## Non-Goals

- Rendering implementation details
- Editor mutation UX
- Persistence-adapter implementation
- Compatibility parsing of legacy Broadset-owned draft formats
