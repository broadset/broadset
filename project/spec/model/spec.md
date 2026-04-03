# Model Specification

## Purpose

Defines the structural rules and invariants for `BroadsetDocument` — the root data type of the
broadset document model. All consumers (validators, serializers, mutation operations,
renderers) MUST preserve every requirement in this spec.

---

## Requirements

### Requirement: Document Identity

The system MUST assign a non-empty string `id` to every document, and `documentMode` MUST
be either `'screen'` or `'print'`.

#### Scenario: Empty document creation

- GIVEN a call to `createEmptyBroadsetDocument()`
- WHEN the result is inspected
- THEN `id` is a non-empty string
- AND `documentMode` is `'screen'`

#### Scenario: Invalid document mode rejected

- GIVEN a document with `documentMode: 'web'`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a call to `createEmptyBroadsetDocument()`, `id` is a non-empty string and `documentMode` is `'screen'`
- [ ] Given a document with `documentMode: 'web'`, validation fails

---

### Requirement: Document Mode Immutability

The system MUST NOT allow `documentMode` to be mutated after document creation.

#### Scenario: Mutation is prevented at the type and runtime level

- GIVEN a `BroadsetDocument` instance
- WHEN a developer attempts to reassign `documentMode` on an existing document
- THEN the mode value MUST NOT be changed after document creation. Implementations SHOULD enforce this via the type system (e.g., `readonly`) and MUST reject any runtime attempt to mutate the mode.

#### Acceptance Criteria

- [ ] Given a `BroadsetDocument` instance, any attempt to mutate documentMode after creation is rejected

---

### Requirement: Canvas Dimensions

The system MUST reject canvas `width` or `height` values that are zero, negative, or
non-finite. All spatial values MUST be expressed in millimeters.

#### Scenario: Positive dimensions accepted

- GIVEN a canvas with `width: 508` and `height: 285.75`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: Zero width rejected

- GIVEN a canvas with `width: 0`
- WHEN the document is validated
- THEN validation fails

#### Scenario: mm unit convention

- GIVEN the sample document `sampleDocument.ts`
- WHEN canvas dimensions are converted to pixels at 96 dpi
- THEN `508 mm × 285.75 mm` equals `1920 px × 1080 px`

#### Acceptance Criteria

- [ ] Given a canvas with `width: 508` and `height: 285.75`, validation succeeds
- [ ] Given a canvas with `width: 0`, validation fails
- [ ] Given the sample document `sampleDocument.ts`, `508 mm × 285.75 mm` equals `1920 px × 1080 px`

---

### Requirement: Canvas Padding

The system MUST store canvas padding as a 4-tuple `[top, right, bottom, left]` of
non-negative finite numbers.

#### Scenario: Valid padding accepted

- GIVEN a canvas padding of `[10, 10, 10, 10]`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: Invalid tuple length rejected

- GIVEN a canvas padding of `[10, 10]`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a canvas padding of `[10, 10, 10, 10]`, validation succeeds
- [ ] Given a canvas padding of `[10, 10]`, validation fails

---

### Requirement: Non-Empty Pages

The system MUST maintain at least one page in a document at all times. An empty `pages`
array is invalid.

#### Scenario: Document starts with one page

- GIVEN a call to `createEmptyBroadsetDocument()`
- WHEN the result is inspected
- THEN `pages.length` equals `1`
- AND `pages[0].elements` is an empty array

#### Scenario: Empty pages array rejected

- GIVEN a document with `pages: []`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a call to `createEmptyBroadsetDocument()`, `pages.length` equals `1` and `pages[0].elements` is an empty array
- [ ] Given a document with `pages: []`, validation fails

---

### Requirement: Flat Element Tree

The system MUST store elements as a flat array per page. Elements MUST NOT be structurally
nested; parent-child relationships MUST be expressed via `parentId` references.

#### Scenario: Page structure is a flat array

- GIVEN a page with parent and child elements
- WHEN the page structure is inspected
- THEN elements are stored as a flat array with no recursive nesting

#### Acceptance Criteria

- [ ] Given a page with parent and child elements, elements are stored as a flat array with no recursive nesting

---

### Requirement: Element Identity and Uniqueness

The system MUST give every element a non-empty string `id`. Element `id` values MUST be
unique within their page.

#### Scenario: Duplicate IDs on the same page are rejected

- GIVEN two elements with `id: 'a'` on the same page
- WHEN the document is passed to the validator
- THEN validation fails

#### Acceptance Criteria

- [ ] Given two elements with `id: 'a'` on the same page, validation fails

---

### Requirement: Element Dimensions

The system MUST reject element `width` or `height` values that are zero, negative, or
non-finite.

#### Scenario: Zero width rejected

- GIVEN an element with `width: 0`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given an element with `width: 0`, validation fails

---

### Requirement: Parent-Child Integrity

The system MUST enforce that `parentId` references are intra-page only, and the `parentId`
graph MUST be acyclic.

#### Scenario: Cross-page parentId rejected

- GIVEN element A on page 0 with `parentId` pointing to an element on page 1
- WHEN the document is validated
- THEN validation fails

#### Scenario: Circular parentId rejected

- GIVEN element A with `parentId: 'b'` and element B with `parentId: 'a'` on the same page
- WHEN the document is validated
- THEN validation fails

#### Scenario: Deleting a parent removes all descendants

- GIVEN a parent element with two child elements
- WHEN the parent is deleted via the editor store
- THEN the page contains neither the parent nor its children

#### Acceptance Criteria

- [ ] Given element A on page 0 with `parentId` pointing to an element on page 1, validation fails
- [ ] Given element A with `parentId: 'b'` and element B with `parentId: 'a'` on the same page, validation fails
- [ ] Given a parent element with two child elements, the page contains neither the parent nor its children

---

### Requirement: Animation Registry Integrity

The system MUST store at most one registry entry per element `id`. Stale entries
(referencing deleted elements) MUST be silently ignored by all consumers.

#### Scenario: Duplicate registry entries rejected

- GIVEN two `animationRegistry` entries with the same element `id`
- WHEN the document is validated
- THEN validation fails

#### Scenario: Stale registry entry does not throw

- GIVEN a document with an `animationRegistry` entry for a deleted element
- WHEN the playback controller processes the document
- THEN no error is thrown

#### Acceptance Criteria

- [ ] Given two `animationRegistry` entries with the same element `id`, validation fails
- [ ] Given a document with an `animationRegistry` entry for a deleted element, no error is thrown

---

## Sub-Specs

| Sub-Spec                                   | Scope                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [element.md](element.md)                   | Element data contract — type vocabulary, geometry, content, hierarchy                     |
| [style.md](style.md)                       | Element style contract — typography, backgrounds, borders, effects, SVG                   |
| [screen.md](screen.md)                     | Screen properties — anchors, visibility, states, modifiers, 3D, masking                   |
| [animation.md](animation.md)               | Animation types — registry, timelines, keyframes, state/modifier bindings                 |
| [changes.md](changes.md)                   | Change stream types — discriminated mutation events for collaboration                     |
| [config.md](config.md)                     | Configuration types — editor config, features, canvas, plugins, media                     |
| [utilities.md](utilities.md)               | Utilities — document clone, clip-path normalization, unit conversion                      |
| [capabilities.md](capabilities.md)         | Element capability matrix — per-type editing feature flags                                |
| [format-reference.md](format-reference.md) | Full BroadsetDocument JSON format — field shapes, constraints, examples, unit conversions |

---

### Requirement: No Hard Page or Element Limits

The document model MUST NOT impose hard upper limits on the number of pages per document or elements per page. However, implementations SHOULD document that the renderer targets 60fps performance with up to 100 visible elements per page. Exceeding this count MAY degrade rendering performance.

#### Scenario: Document with many pages

- GIVEN a document with 500 pages
- WHEN validation runs
- THEN the document is valid

#### Scenario: Page with many elements

- GIVEN a page with 1000 elements
- WHEN validation runs
- THEN the page is valid

#### Acceptance Criteria

- [ ] Given a document with more than 100 pages, validation succeeds
- [ ] Given a page with more than 100 elements, validation succeeds

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Persistence or transmission format → see `project/spec/formats/spec.md`
- Rendering behavior → see `project/spec/renderer/spec.md`
- Animation playback semantics → see `project/spec/playback/spec.md`
- Mutation operations → see `project/spec/editor/spec.md`
