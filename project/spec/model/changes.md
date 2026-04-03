# Model — Change Stream Type Contracts

## Purpose

Defines the discriminated union of document mutation events emitted by the change stream. These change types enable collaboration (OT/CRDT), undo/redo, and real-time synchronization between editor instances. This spec defines _what_ changes look like; not how they are emitted or applied (→ `project/spec/editor/collaboration.md`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Change Variant Vocabulary

The change stream MUST emit exactly these discriminated variants, each identified by a `type` field:

- `element:add` — a new element was added to a page
- `element:remove` — an element was removed from a page
- `element:update` — an element property was modified
- `element:reorder` — an element was moved within its page's element list
- `animation:update` — an animation registry entry was modified
- `page:add` — a new page was added
- `page:remove` — a page was removed
- `settings:update` — a document-level setting was modified

#### Scenario: All variant types are emitted

- GIVEN an editing session that adds an element, updates it, reorders it, removes it, adds a page, removes a page, and changes settings
- WHEN the change stream is observed
- THEN each corresponding change type is emitted in order

#### Scenario: Unknown change types are not emitted

- GIVEN any editing operation
- WHEN the change stream is observed
- THEN the change type is always one of the eight defined variants

#### Acceptance Criteria

- [ ] Given a complete editing workflow, all eight change variant types can be emitted
- [ ] Given any editing operation, the emitted change type is always one of the defined variants

---

### Requirement: Change Payload Contracts

Each change variant MUST carry the minimum data needed to apply or invert the mutation:

- `element:add` — `pageIndex`, `elementId`, full `element` data
- `element:remove` — `pageIndex`, `elementId`, full `element` data (for undo)
- `element:update` — `pageIndex`, `elementId`, dot-separated `path`, `oldValue`, `newValue`
- `element:reorder` — `pageIndex`, `elementId`, `fromIndex`, `toIndex`
- `animation:update` — `elementId`, dot-separated `path`, `oldValue`, `newValue`
- `page:add` — `pageIndex`
- `page:remove` — `pageIndex`
- `settings:update` — dot-separated `path`, `oldValue`, `newValue`

#### Scenario: Element add change carries full element

- GIVEN a new element added to page 0
- WHEN the `element:add` change is emitted
- THEN it contains `pageIndex: 0`, the `elementId`, and the complete `element` data

#### Scenario: Element update carries old and new values

- GIVEN an element whose `position.x` changes from `10` to `50`
- WHEN the `element:update` change is emitted
- THEN it contains `path: 'position.x'`, `oldValue: 10`, `newValue: 50`

#### Scenario: Element reorder carries from/to indices

- GIVEN an element moved from index 0 to index 2 in its page
- WHEN the `element:reorder` change is emitted
- THEN it contains `fromIndex: 0` and `toIndex: 2`

#### Scenario: Element remove carries full element for undo

- GIVEN an element removed from the document
- WHEN the `element:remove` change is emitted
- THEN it contains the full element data to support undo/re-add

#### Acceptance Criteria

- [ ] Given an element add, the change contains pageIndex, elementId, and full element data
- [ ] Given an element update, the change contains path, oldValue, and newValue
- [ ] Given an element reorder, the change contains fromIndex and toIndex
- [ ] Given an element remove, the change contains full element data for undo support

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Change stream emission middleware → see `project/spec/editor/collaboration.md`
- Remote change application and echo loop prevention → see `project/spec/editor/collaboration.md`
- Undo/redo tracking → see `project/spec/editor/store-actions.md`
