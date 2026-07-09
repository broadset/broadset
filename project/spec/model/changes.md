# Model — Change Stream Type Contracts

## Purpose

Defines the discriminated union of document and project mutation events emitted by the change stream. These change types enable collaboration (OT/CRDT), undo/redo, and real-time synchronization between editor instances. This spec defines _what_ changes look like; not how they are emitted or applied (→ `project/spec/editor/collaboration.md`). See [conventions](../../README.md).

**Key structural note:** Elements live on the **document**, not on pages. Pages are override layers. See [spec.md](spec.md) and [format-reference.md](format-reference.md).

---

## Requirements

### Requirement: Change Variant Vocabulary

The change stream MUST emit exactly these discriminated variants, each identified by a `type` field:

**Element changes (document-level):**

- `element:add` — a new element was added to a document
- `element:remove` — an element was removed from a document
- `element:update` — an element property was modified
- `element:reorder` — an element was moved within its document's element list

**Animation changes:**

- `animation:update` — an animation definition was modified

**Page changes:**

- `page:add` — a new page (override layer) was added
- `page:remove` — a page was removed
- `page:override:update` — a page override was added, modified, or removed

**Document settings:**

- `settings:update` — a document-level setting was modified

**Data schema changes:**

- `dataSchema:update` — the data schema was modified (fields added, removed, or changed)

**Asset changes (project-level):**

- `asset:add` — an asset was added to the project
- `asset:remove` — an asset was removed from the project
- `asset:update` — an asset was modified

**Project settings:**

- `project:settings:update` — a project-level setting was modified (fonts, palette)

#### Scenario: All variant types are emitted

- GIVEN an editing session that adds/updates/reorders/removes elements, modifies animations, manages pages and overrides, updates settings, modifies data schema, and manages assets
- WHEN the change stream is observed
- THEN each corresponding change type is emitted in order

#### Scenario: Unknown change types are not emitted

- GIVEN any editing operation
- WHEN the change stream is observed
- THEN the change type is always one of the defined variants

#### Acceptance Criteria

- [ ] Given a complete editing workflow, all change variant types can be emitted
- [ ] Given any editing operation, the emitted change type is always one of the defined variants

---

### Requirement: Change Payload Contracts

Each change variant MUST carry the minimum data needed to apply or invert the mutation:

**Element changes (`documentId` required on all):**

- `element:add` — `documentId`, `elementId`, full `element` data
- `element:remove` — `documentId`, `elementId`, full `element` data (for undo)
- `element:update` — `documentId`, `elementId`, dot-separated `path`, `oldValue`, `newValue`
- `element:reorder` — `documentId`, `elementId`, `fromIndex`, `toIndex`

**Animation changes:**

- `animation:update` — `documentId`, `elementId`, dot-separated `path`, `oldValue`, `newValue`

**Page changes:**

- `page:add` — `documentId`, `pageId`, full `page` data
- `page:remove` — `documentId`, `pageId`, full `page` data (for undo)
- `page:override:update` — `documentId`, `pageId`, `elementId`, `field` (which override field changed), `oldValue`, `newValue`

**Data schema changes:**

- `dataSchema:update` — `documentId`, dot-separated `path`, `oldValue`, `newValue`

**Asset changes:**

- `asset:add` — `assetId`, full `asset` data
- `asset:remove` — `assetId`, full `asset` data (for undo)
- `asset:update` — `assetId`, dot-separated `path`, `oldValue`, `newValue`

**Settings changes:**

- `settings:update` — `documentId`, dot-separated `path`, `oldValue`, `newValue`
- `project:settings:update` — dot-separated `path`, `oldValue`, `newValue`

#### Scenario: Element add change carries full element

- GIVEN a new element added to a document
- WHEN the `element:add` change is emitted
- THEN it contains `documentId`, the `elementId`, and the complete `element` data

#### Scenario: Element update carries old and new values

- GIVEN an element whose `position.x` changes from `10` to `50`
- WHEN the `element:update` change is emitted
- THEN it contains `path: 'position.x'`, `oldValue: 10`, `newValue: 50`

#### Scenario: Element reorder carries from/to indices

- GIVEN an element moved from index 0 to index 2 in its document
- WHEN the `element:reorder` change is emitted
- THEN it contains `fromIndex: 0` and `toIndex: 2`

#### Scenario: Element remove carries full element for undo

- GIVEN an element removed from the document
- WHEN the `element:remove` change is emitted
- THEN it contains the full element data to support undo/re-add

#### Scenario: Page override update carries field details

- GIVEN a page override where the content of element "el-title" changes from "Hello" to "Goodbye"
- WHEN the `page:override:update` change is emitted
- THEN it contains `pageId`, `elementId: 'el-title'`, `field: 'content'`, `oldValue: 'Hello'`, `newValue: 'Goodbye'`

#### Scenario: Asset add change carries full asset

- GIVEN a new asset added to the project
- WHEN the `asset:add` change is emitted
- THEN it contains `assetId` and the complete asset data

#### Acceptance Criteria

- [ ] Given an element add, the change contains documentId, elementId, and full element data
- [ ] Given an element update, the change contains path, oldValue, and newValue
- [ ] Given an element reorder, the change contains fromIndex and toIndex
- [ ] Given an element remove, the change contains full element data for undo support
- [ ] Given a page override update, the change contains pageId, elementId, field, oldValue, and newValue
- [ ] Given an asset add, the change contains assetId and full asset data

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Change stream emission middleware → see `project/spec/editor/collaboration.md`
- Remote change application and echo loop prevention → see `project/spec/editor/collaboration.md`
- Undo/redo tracking → see `project/spec/editor/store-actions.md`
