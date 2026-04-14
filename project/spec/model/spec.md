# Model — Document Specification

## Purpose

Defines the structural rules and invariants for `BroadsetDocument` — a single template or graphic within a `BroadsetProject`. A document contains the element layout, animation definitions, data schema, optional output specification, and pages (data override layers). All consumers (validators, serializers, renderers, playout systems) MUST preserve every requirement in this spec.

For the project-level container that holds documents, see [project.md](project.md).

---

## Requirements

### Requirement: Document Identity

Every document MUST have a non-empty string `id`, a `name` string, and `documentMode` MUST be either `'screen'` or `'print'`.

#### Scenario: Valid document

- GIVEN a document with `id: 'doc-001'`, `name: 'Scorebug'`, `documentMode: 'screen'`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: Empty ID rejected

- GIVEN a document with `id: ''`
- WHEN the document is validated
- THEN validation fails

#### Scenario: Invalid document mode rejected

- GIVEN a document with `documentMode: 'web'`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a valid document with id, name, and valid documentMode, validation succeeds
- [ ] Given a document with empty id, validation fails
- [ ] Given a document with invalid documentMode, validation fails

---

### Requirement: Document Mode Immutability

The system MUST NOT allow `documentMode` to be mutated after document creation. Implementations SHOULD enforce this via the type system (`readonly`) and MUST reject any runtime mutation attempt.

#### Acceptance Criteria

- [ ] Given a `BroadsetDocument` instance, any attempt to mutate documentMode after creation is rejected

---

### Requirement: Canvas

Every document MUST have a `canvas` with:

- `width`: positive number (> 0)
- `height`: positive number (> 0)
- `unit`: `'px'` | `'mm'` | `'in'` — declares the unit for all spatial values in the document
- `dpi`: positive number — default `96` for screen mode, `300` for print mode
- `padding`: 4-tuple `[top, right, bottom, left]` of non-negative numbers
- `backgroundColor` (optional): CSS color string for canvas background
- `backgroundMode`: `'transparent'` | `'solid'` — default `'transparent'` for screen, `'solid'` for print
- `safeAreas` (optional): action-safe and title-safe insets (see Safe Areas below)

Screen-mode documents SHOULD use `unit: 'px'` with pixel dimensions (e.g., `1920 × 1080`). Print-mode documents SHOULD use `unit: 'mm'` or `unit: 'in'` with physical dimensions (e.g., `210 × 297 mm`).

#### Scenario: Screen-mode canvas in pixels

- GIVEN a canvas with `width: 1920`, `height: 1080`, `unit: 'px'`, `dpi: 96`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: Print-mode canvas in millimeters

- GIVEN a canvas with `width: 210`, `height: 297`, `unit: 'mm'`, `dpi: 300`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: Zero width rejected

- GIVEN a canvas with `width: 0`
- WHEN the document is validated
- THEN validation fails

#### Scenario: Transparent background default

- GIVEN a screen-mode document with no `backgroundMode` set
- WHEN defaults are applied
- THEN `backgroundMode` is `'transparent'`

#### Acceptance Criteria

- [ ] Given a canvas with positive width, height, valid unit, and valid dpi, validation succeeds
- [ ] Given a canvas with zero or negative dimensions, validation fails
- [ ] Given a canvas with `unit: 'px'`, all spatial values are in pixels
- [ ] Given a canvas with `unit: 'mm'`, all spatial values are in millimeters
- [ ] Given a screen-mode document, default backgroundMode is `'transparent'`
- [ ] Given a print-mode document, default backgroundMode is `'solid'`

---

### Requirement: Safe Areas

The canvas MAY declare safe areas as percentage insets (0–50):

- `actionSafe`: EBU R95 default 3.5% or SMPTE RP 218 5%
- `titleSafe`: EBU R95 default 5% or SMPTE RP 218 10%
- `custom`: array of named safe areas (e.g., `'lower-third-zone'`, `'bug-area'`)

Each inset is a 4-tuple `[top, right, bottom, left]` as percentage of canvas dimension.

#### Scenario: Standard safe areas

- GIVEN a canvas with `safeAreas: { actionSafe: [3.5, 3.5, 3.5, 3.5], titleSafe: [5, 5, 5, 5] }`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: Custom safe area

- GIVEN a canvas with `safeAreas: { custom: [{ name: 'bug-area', insets: [5, 5, 90, 80] }] }`
- WHEN the document is validated
- THEN validation succeeds

#### Acceptance Criteria

- [ ] Given valid percentage insets (0–50), safe area validation succeeds
- [ ] Given insets outside 0–50 range, validation fails
- [ ] Given custom named safe areas, they are preserved on round-trip

---

### Requirement: Document-Level Elements

Elements are defined at the document level as a flat array. This is the single element set for the template. Pages do NOT carry independent element arrays — they carry override layers that reference document-level elements by `elementId`.

#### Scenario: Elements on the document

- GIVEN a document with `elements: [{ id: 'el-1', ... }, { id: 'el-2', ... }]`
- WHEN the document is inspected
- THEN the element set is defined on the document, not on pages

#### Scenario: Element IDs unique within document

- GIVEN a document with two elements both having `id: 'el-dup'`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a document with elements, they are stored as a flat array on the document
- [ ] Given duplicate element IDs within a document, validation fails

---

### Requirement: Flat Element Tree

Elements MUST be stored as a flat array. Parent-child relationships MUST be expressed via `parentId` references, not structural nesting. The `parentId` graph MUST be acyclic and all references MUST point to elements within the same document.

#### Scenario: Flat array structure

- GIVEN a document with parent and child elements
- WHEN the element array is inspected
- THEN elements are stored flat with parentId references

#### Scenario: Circular parentId rejected

- GIVEN element A with `parentId: 'B'` and element B with `parentId: 'A'`
- WHEN the document is validated
- THEN validation fails

#### Scenario: Deleting a parent removes all descendants

- GIVEN a parent element with two child elements
- WHEN the parent is deleted via the editor store
- THEN the document contains neither the parent nor its children

#### Acceptance Criteria

- [ ] Given parent-child elements, they are stored flat with parentId references
- [ ] Given circular parentId references, validation fails
- [ ] Given a parentId referencing a non-existent element, validation fails
- [ ] Given a parent deletion, all descendants are also removed

---

### Requirement: Element Dimensions

The system MUST reject element `width` or `height` values that are zero, negative, or non-finite.

#### Scenario: Zero width rejected

- GIVEN an element with `width: 0`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given an element with zero or negative width/height, validation fails
- [ ] Given an element with NaN or Infinity dimensions, validation fails

---

### Requirement: Document Animations

Animation definitions are stored at the document level as a flat array, each pairing an `elementId` with animation configuration. At most one animation definition per element ID. Stale entries (referencing deleted elements) MUST be silently ignored by all consumers. See [animation.md](animation.md) for the animation type contracts.

#### Scenario: Duplicate elementId rejected

- GIVEN two animation definitions both targeting `elementId: 'el-1'`
- WHEN the document is validated
- THEN validation fails

#### Scenario: Stale animation entry does not throw

- GIVEN a document with an animation entry for a deleted element
- WHEN the playback controller processes the document
- THEN no error is thrown

#### Acceptance Criteria

- [ ] Given a document with animations, they are stored as a flat array on the document
- [ ] Given duplicate elementId in animations, validation fails
- [ ] Given an animation referencing a deleted element, no error is thrown

---

### Requirement: Pages as Data Override Layers

### Requirement: Pages as Layout Instances

Pages define layout variants by explicitly specifying template element instances and their per-page properties. Elements are defined once as templates on the document; each page lists the instances it uses with page-specific 3D transform (`position`, `rotation`, `scale`) and visibility.

Each page has:

- `id`: non-empty string, unique within the document
- `name`: human-readable string
- `elements`: array of `PageElementInstance`, each referencing a template element by `elementId`
- `locale` (optional): BCP 47 language tag for localization
- `extensions` (optional): vendor extension data

A document MUST have at least one page. Pages list only root-level template elements; child relationships are inherited from the document template.

#### Scenario: Page with element instances

- GIVEN a page with elements array specifying transform and visibility of two template elements
- WHEN the page is applied
- THEN the page displays those elements with their specified transform and visibility

#### Scenario: Instance references valid element

- GIVEN a page element instance with `elementId: 'el-999'` referencing a non-existent template
- WHEN the document is validated
- THEN validation fails (or the instance is silently ignored)

#### Scenario: Element instance visibility

- GIVEN a page element instance with `{ elementId: 'el-subtitle', visible: false }`
- WHEN the page is applied
- THEN the element is hidden on this page

#### Scenario: Instance per-page positioning

- GIVEN a template element at (0,0) 100x50 and a page instance of the same element with position (200,100,0) and scale (1.5,1.5,1)
- WHEN the page is applied
- THEN the page displays the element at (200,100) with rendered size 150x75; template properties (name, type, content, style, base width, base height) are unchanged

#### Acceptance Criteria

- [ ] Given a document, it has at least one page
- [ ] Given a page with element instances, each instance references a valid template element
- [ ] Given a page with visibility override false, the element is hidden
- [ ] Given a page with different instance transforms, the page displays elements with those transforms
- [ ] Given a page instance referencing a non-existent element, validation fails or it is ignored
- [ ] Given duplicate page IDs within a document, validation fails

---

### Requirement: Data Schema

Every document MUST have a `dataSchema` declaring the template's data contract. See [data-schema.md](data-schema.md) for the full specification. The data schema defines what external data the template accepts — operators, playout automation, and live data feeds enumerate fields from the schema.

#### Acceptance Criteria

- [ ] Given a document, it has a dataSchema (which may have an empty fields array)
- [ ] Given element dataField.fieldName values, each must match a dataSchema field

---

### Requirement: Output Specification (Optional)

A document MAY carry an `output` object specifying broadcast output constraints. See [output-spec.md](output-spec.md) for the full specification.

When absent, the consumer picks its own output profile. When present, animation timing SHOULD be quantized to the specified frame rate.

#### Acceptance Criteria

- [ ] Given a valid output spec with supported frame rate and color space, validation succeeds
- [ ] Given no output spec, the document is still valid

---

### Requirement: No Hard Page or Element Limits

The document model MUST NOT impose hard upper limits on the number of pages per document or elements per document. However, implementations SHOULD document that the renderer targets 60fps performance with up to 100 visible elements. Exceeding this count MAY degrade rendering performance.

#### Acceptance Criteria

- [ ] Given a document with more than 100 pages, validation succeeds
- [ ] Given a document with more than 100 elements, validation succeeds

---

### Requirement: Extension Points

Every document and every page MAY carry an `extensions` property — a `Record<string, unknown>` keyed by reverse-domain vendor prefix. The core model MUST preserve but MUST NOT interpret extensions.

#### Scenario: Round-trip preservation

- GIVEN a document with `extensions: { "com.example.analytics": { views: 42 } }`
- WHEN the document is serialized and deserialized
- THEN the extensions object is preserved exactly

#### Acceptance Criteria

- [ ] Given a document with extensions, they are preserved on round-trip
- [ ] Given unknown extension keys, the model does not reject or modify them

---

## Sub-Specs

| Sub-Spec                                   | Scope                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [project.md](project.md)                   | Project container — settings, assets, document collection                                 |
| [element.md](element.md)                   | Element data contract — type vocabulary, geometry, content, hierarchy, data binding       |
| [style.md](style.md)                       | Element style contract — typography, backgrounds, borders, effects, masking, 3D, SVG      |
| [animation.md](animation.md)               | Animation types — definitions, timelines, keyframes, state/modifier bindings              |
| [data-schema.md](data-schema.md)           | Data schema — field definitions, constraints, overflow, repeaters, conditional visibility |
| [output-spec.md](output-spec.md)           | Output specification — frame rate, color space, dynamic range, timecode                   |
| [assets.md](assets.md)                     | Asset library — asset kinds, sources, ZIP packaging                                       |
| [changes.md](changes.md)                   | Change stream types — discriminated mutation events for collaboration                     |
| [config.md](config.md)                     | Configuration types — editor config, features, canvas, plugins, media                     |
| [utilities.md](utilities.md)               | Utilities — document clone, clip-path normalization, unit conversion                      |
| [capabilities.md](capabilities.md)         | Element capability matrix — per-type editing feature flags                                |
| [format-reference.md](format-reference.md) | Full BroadsetProject JSON format — field shapes, constraints, examples                    |

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Persistence or transmission format → see `project/spec/formats/spec.md`
- Rendering behavior → see `project/spec/renderer/spec.md`
- Animation playback semantics → see `project/spec/playback/spec.md`
- Mutation operations → see `project/spec/editor/spec.md`
- Alpha/keying model → deferred to future phase
- Playout control protocol → deferred to future phase
- Page transitions → deferred to future phase
