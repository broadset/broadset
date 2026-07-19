# Model — Element Capability Matrix

## Purpose

Defines runtime capability flags derived from canonical element `kind` and, for vectors, `geometryData.kind`. Flags drive UI visibility and command availability but are never persisted and never replace structural or semantic validation.

---

## Requirements

### Requirement: Capability Flag Set

Every element MUST resolve to a capability profile containing exactly these boolean flags: `borderRadius`, `typography`, `appearance`, `boxEffects`, `clipPath`, `objectFit`, `vectorStrokeFill`, `pathEditing`, `squareConstrained`, `instantPlace`. The historical UI label `clipPath` authors typed `appearance.clip`; it never stores CSS clip text.

#### Scenario: Profile shape

- GIVEN any element type
- WHEN its capability profile is resolved
- THEN the profile contains exactly the 10 defined boolean flags

#### Acceptance Criteria

- [ ] Given any element type, the resolved profile contains all 10 capability flags as booleans

---

### Requirement: Text Element Capabilities

Text elements MUST enable: borderRadius, typography, appearance, boxEffects. All other flags MUST be disabled.

#### Scenario: Text capabilities

- GIVEN an element of type `text`
- WHEN its capability profile is resolved
- THEN borderRadius, typography, appearance, boxEffects are true; all others are false

#### Acceptance Criteria

- [ ] Given a text element, borderRadius, typography, appearance, and boxEffects are enabled
- [ ] Given a text element, clipPath, objectFit, vectorStrokeFill, pathEditing, squareConstrained, and instantPlace are disabled

---

### Requirement: Vector Rectangle Capabilities

Vector elements with `geometryData.kind: 'rectangle'` MUST enable borderRadius, appearance, boxEffects, and clipPath. All other flags MUST be disabled. Border-radius controls edit typed `cornerRadii`; clipPath controls edit typed `appearance.clip`.

#### Scenario: Rectangle capabilities

- GIVEN `kind: 'vector'` with `geometryData.kind: 'rectangle'`
- WHEN its capability profile is resolved
- THEN borderRadius, appearance, boxEffects, clipPath are true; all others are false

#### Acceptance Criteria

- [ ] Given a vector rectangle, borderRadius, appearance, boxEffects, and clipPath are enabled
- [ ] Given a vector rectangle, typography, objectFit, vectorStrokeFill, pathEditing, squareConstrained, and instantPlace are disabled

---

### Requirement: Vector Ellipse Capabilities

Vector elements with `geometryData.kind: 'ellipse'` MUST enable appearance, boxEffects, and clipPath. BorderRadius and all other flags MUST be disabled.

#### Scenario: Ellipse capabilities

- GIVEN `kind: 'vector'` with `geometryData.kind: 'ellipse'`
- WHEN its capability profile is resolved
- THEN appearance, boxEffects, clipPath are true; borderRadius and all others are false

#### Acceptance Criteria

- [ ] Given a vector ellipse, appearance, boxEffects, and clipPath are enabled
- [ ] Given a vector ellipse, borderRadius is disabled

---

### Requirement: Image Element Capabilities

Image elements MUST enable: borderRadius, appearance, boxEffects, clipPath, objectFit. All other flags MUST be disabled.

#### Scenario: Image capabilities

- GIVEN an element of type `image`
- WHEN its capability profile is resolved
- THEN borderRadius, appearance, boxEffects, clipPath, objectFit are true; all others are false

#### Acceptance Criteria

- [ ] Given an image element, borderRadius, appearance, boxEffects, clipPath, and objectFit are enabled

---

### Requirement: Safe Foreign Vector Capabilities

A foreign element using `safeRenderMode: 'sanitized-vector'` MUST enable appearance, boxEffects, clipPath, and objectFit while keeping source content inert. Preview-only foreign elements enable only objectFit and diagnostic actions.

#### Scenario: Sanitized-vector foreign capabilities

- GIVEN a foreign element with `safeRenderMode: 'sanitized-vector'`
- WHEN its capability profile is resolved
- THEN appearance, boxEffects, clipPath, and objectFit are true; all others are false

#### Acceptance Criteria

- [ ] Given sanitized-vector foreign content, appearance, boxEffects, clipPath, and objectFit are enabled without exposing executable source markup
- [ ] Given preview-only foreign content, objectFit and diagnostics are enabled while vector editing is disabled

---

### Requirement: Vector Path Capabilities

Vector elements with `geometryData.kind: 'path'` MUST enable vectorStrokeFill, pathEditing, appearance, and instantPlace. Other subtype-only flags MUST be disabled.

#### Scenario: Path capabilities

- GIVEN `kind: 'vector'` with `geometryData.kind: 'path'`
- WHEN its capability profile is resolved
- THEN vectorStrokeFill, pathEditing, appearance, and instantPlace are true; all others are false

#### Acceptance Criteria

- [ ] Given a vector path, vectorStrokeFill, pathEditing, appearance, and instantPlace are enabled
- [ ] Given a vector path, borderRadius, typography, objectFit, and squareConstrained are disabled

---

### Requirement: QR Code Element Capabilities

QR code elements MUST enable: squareConstrained. All other flags MUST be disabled.

#### Scenario: QR code capabilities

- GIVEN an element of type `qrcode`
- WHEN its capability profile is resolved
- THEN squareConstrained is true; all others are false

#### Acceptance Criteria

- [ ] Given a qrcode element, squareConstrained is enabled and all other flags are disabled

---

### Requirement: Group Element Capabilities

Group elements MUST enable: appearance, clipPath. All other flags MUST be disabled.

#### Scenario: Group capabilities

- GIVEN an element of type `group`
- WHEN its capability profile is resolved
- THEN appearance and clipPath are true; all others are false

#### Acceptance Criteria

- [ ] Given a group element, appearance and clipPath are enabled and all other flags are disabled

---

### Requirement: Plugin and Unknown Fallback

Canonical plugin elements without an authorized registered capability override and unknown untrusted discriminants MUST resolve to all flags disabled. Registration MAY enable UI capabilities but cannot bypass canonical validation.

#### Scenario: Unknown type

- GIVEN a plugin element without an authorized capability override
- WHEN its capability profile is resolved
- THEN all 10 flags are false

#### Acceptance Criteria

- [ ] Given an unregistered plugin element, all capability flags are false
- [ ] Given an unknown core discriminant, structural validation fails before capability resolution

---

### Requirement: Video Element Capabilities

Video elements MUST enable: borderRadius, appearance, boxEffects, clipPath, objectFit. All other flags MUST be disabled.

#### Scenario: Video capabilities

- GIVEN an element of type `video`
- WHEN its capability profile is resolved
- THEN borderRadius, appearance, boxEffects, clipPath, objectFit are true; all others are false

#### Acceptance Criteria

- [ ] Given a video element, borderRadius, appearance, boxEffects, clipPath, and objectFit are enabled
- [ ] Given a video element, typography, vectorStrokeFill, pathEditing, squareConstrained, and instantPlace are disabled

---

### Requirement: Clock Element Capabilities

Clock elements MUST enable: typography, appearance, boxEffects. All other flags MUST be disabled.

#### Scenario: Clock capabilities

- GIVEN an element of type `clock`
- WHEN its capability profile is resolved
- THEN typography, appearance, boxEffects are true; all others are false

#### Acceptance Criteria

- [ ] Given a clock element, typography, appearance, and boxEffects are enabled
- [ ] Given a clock element, borderRadius, clipPath, objectFit, vectorStrokeFill, pathEditing, squareConstrained, and instantPlace are disabled

---

### Requirement: Ticker Element Capabilities

Ticker elements MUST enable: typography, appearance, boxEffects. All other flags MUST be disabled.

#### Scenario: Ticker capabilities

- GIVEN an element of type `ticker`
- WHEN its capability profile is resolved
- THEN typography, appearance, boxEffects are true; all others are false

#### Acceptance Criteria

- [ ] Given a ticker element, typography, appearance, and boxEffects are enabled
- [ ] Given a ticker element, borderRadius, clipPath, objectFit, vectorStrokeFill, pathEditing, squareConstrained, and instantPlace are disabled

---

### Requirement: Audio and Component Instance Capabilities

Audio elements MUST enable binding and timeline commands outside this visual capability profile while all ten visual flags remain disabled. Component-instance elements MUST derive the visible capabilities of schema-approved exposed properties; unexposed internal fields remain unavailable.

#### Acceptance Criteria

- [ ] Given an audio element, all ten visual capability flags are disabled while audio/binding/timeline panels remain available through their owning capability domains
- [ ] Given a component instance, only controls backed by exposed-property schemas are enabled
- [ ] Given an unexposed component-local property, no ordinary instance control targets it

---

### Requirement: Vector Boolean Capabilities

Vector elements with `geometryData.kind: 'boolean'` MUST enable appearance and boolean operand/operation editing through their typed payload. Path point editing is disabled because operand geometry remains owned by the referenced vector elements.

#### Acceptance Criteria

- [ ] Given a vector boolean, appearance is enabled and typed operand/operation controls are available
- [ ] Given a vector boolean, direct structured-path point editing is disabled
- [ ] Given invalid or cyclic operands, the editing command is rejected by semantic validation

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Plugin capability override merging → see `project/spec/renderer/spec.md`
- Which UI panels are shown based on capabilities → see `project/spec/ui/panels.md`
- Which properties are editable per type → see `project/spec/editor/editing.md`
