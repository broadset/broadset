# Editor — Data Store Specification

## Purpose

Defines the runtime data injection store (BroadsetDataStore) used to feed dynamic values (e.g. broadcast scoreboards, live text) into rendered elements without modifying the document model. Each store instance is independent and supports per-element CRUD with selector-based subscription isolation.

---

## Requirements

### Requirement: Store Initialization

The system MUST create a data store with empty elements by default. It MUST accept an optional initial elements map.

#### Scenario: Empty store

- GIVEN no initial elements
- WHEN a store is created
- THEN `elements` is an empty object

#### Scenario: Pre-populated store

- GIVEN initial elements `{ "el-1": { text: "hello" } }`
- WHEN a store is created
- THEN `elements["el-1"].text` is `"hello"`

#### Acceptance Criteria

- [ ] Given no initial elements, `elements` is an empty object
- [ ] Given initial elements `{ "el-1": { text: "hello" } }`, `elements["el-1"].text` is `"hello"`

---

### Requirement: Element Data Merge Update

The system MUST merge partial data into existing element data without losing other fields. Creating data for a new element MUST work when no prior entry exists.

#### Scenario: Merge preserves existing fields

- GIVEN element `el-1` with `{ text: "old", data: { keep: true } }`
- WHEN `updateElementData("el-1", { text: "updated" })` is called
- THEN `text` is `"updated"` and `data.keep` is still `true`

#### Scenario: Other elements unaffected

- GIVEN elements `el-1` and `el-2`
- WHEN `el-1` is updated
- THEN `el-2` data is unchanged

#### Acceptance Criteria

- [ ] Given element `el-1` with `{ text: "old", data: { keep: true } }`, `text` is `"updated"` and `data.keep` is still `true`
- [ ] Given elements `el-1` and `el-2`, `el-2` data is unchanged

---

### Requirement: Element Data Full Replacement

The system MUST support full replacement of element data, discarding all prior fields.

#### Scenario: Replace removes old fields

- GIVEN element `el-1` with `{ text: "old", data: { extra: true } }`
- WHEN `setElementData("el-1", { text: "new" })` is called
- THEN `text` is `"new"` and `data` is undefined

#### Acceptance Criteria

- [ ] Given element `el-1` with `{ text: "old", data: { extra: true } }`, `text` is `"new"` and `data` is undefined

---

### Requirement: Bulk Update

The system MUST update multiple elements in a single transaction, firing exactly one subscription notification. Existing element data MUST be merge-updated.

#### Scenario: Batch update three elements

- GIVEN an empty store
- WHEN `bulkUpdate` is called with three elements
- THEN all three elements exist and exactly one notification fires

#### Acceptance Criteria

- [ ] Given an empty store, all three elements exist and exactly one notification fires

---

### Requirement: Selector Isolation

The system MUST support selector-based subscriptions where changes to one element do not trigger selectors watching a different element.

#### Scenario: Selector for el-1 ignores el-2 changes

- GIVEN a selector watching `elements["el-1"].text`
- WHEN `el-2` is updated
- THEN the selector does not fire

#### Acceptance Criteria

- [ ] Given a selector watching `elements["el-1"].text`, the selector does not fire

---

### Requirement: Store Instance Independence

Multiple store instances MUST be fully independent. Mutations to one MUST NOT affect the other.

#### Scenario: Two stores isolated

- GIVEN storeA and storeB both with `el-1`
- WHEN storeA updates `el-1`
- THEN storeB's `el-1` is unchanged

#### Acceptance Criteria

- [ ] Given storeA and storeB both with `el-1`, storeB's `el-1` is unchanged

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Document model editing → see [editing.md](editing.md)
- Change stream collaboration → see [collaboration.md](collaboration.md)
