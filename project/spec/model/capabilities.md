# Model — Element Capability Matrix

## Purpose

Defines the per-type capability flags that control which editing features and style properties are available for each element type. These flags drive UI panel visibility, handle rendering, and constraint enforcement. This spec ensures any consumer can determine what editing features apply to any element type. It does NOT cover how capabilities are rendered in UI (→ `project/spec/ui/panels.md`) or how plugins override capabilities (→ `project/spec/renderer/spec.md`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Capability Flag Set

Every element type MUST resolve to a capability profile containing exactly these boolean flags: `borderRadius`, `typography`, `appearance`, `boxEffects`, `clipPath`, `objectFit`, `svgStrokeFill`, `pathEditing`, `squareConstrained`, `instantPlace`.

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
- [ ] Given a text element, clipPath, objectFit, svgStrokeFill, pathEditing, squareConstrained, and instantPlace are disabled

---

### Requirement: Rectangle Element Capabilities

Rectangle elements MUST enable: borderRadius, appearance, boxEffects, clipPath. All other flags MUST be disabled.

#### Scenario: Rectangle capabilities

- GIVEN an element of type `rectangle`
- WHEN its capability profile is resolved
- THEN borderRadius, appearance, boxEffects, clipPath are true; all others are false

#### Acceptance Criteria

- [ ] Given a rectangle element, borderRadius, appearance, boxEffects, and clipPath are enabled
- [ ] Given a rectangle element, typography, objectFit, svgStrokeFill, pathEditing, squareConstrained, and instantPlace are disabled

---

### Requirement: Ellipse Element Capabilities

Ellipse elements MUST enable: appearance, boxEffects, clipPath. borderRadius MUST be disabled (ellipses always render 50% radius). All other flags MUST be disabled.

#### Scenario: Ellipse capabilities

- GIVEN an element of type `ellipse`
- WHEN its capability profile is resolved
- THEN appearance, boxEffects, clipPath are true; borderRadius and all others are false

#### Acceptance Criteria

- [ ] Given an ellipse element, appearance, boxEffects, and clipPath are enabled
- [ ] Given an ellipse element, borderRadius is disabled

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

### Requirement: SVG Element Capabilities

SVG elements MUST enable: borderRadius, appearance, boxEffects, clipPath, objectFit. All other flags MUST be disabled.

#### Scenario: SVG capabilities

- GIVEN an element of type `svg`
- WHEN its capability profile is resolved
- THEN borderRadius, appearance, boxEffects, clipPath, objectFit are true; all others are false

#### Acceptance Criteria

- [ ] Given an SVG element, borderRadius, appearance, boxEffects, clipPath, and objectFit are enabled

---

### Requirement: Path Element Capabilities

Path elements MUST enable: svgStrokeFill, pathEditing, instantPlace. All other flags MUST be disabled.

#### Scenario: Path capabilities

- GIVEN an element of type `path`
- WHEN its capability profile is resolved
- THEN svgStrokeFill, pathEditing, instantPlace are true; all others are false

#### Acceptance Criteria

- [ ] Given a path element, svgStrokeFill, pathEditing, and instantPlace are enabled
- [ ] Given a path element, borderRadius, typography, appearance, boxEffects, clipPath, objectFit, and squareConstrained are disabled

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

### Requirement: Unknown Type Fallback

Unknown element types MUST resolve to a capability profile with all flags disabled.

#### Scenario: Unknown type

- GIVEN an element with a type not in the built-in list and no plugin override
- WHEN its capability profile is resolved
- THEN all 10 flags are false

#### Acceptance Criteria

- [ ] Given an unknown element type, all capability flags are false

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Plugin capability override merging → see `project/spec/renderer/spec.md`
- Which UI panels are shown based on capabilities → see `project/spec/ui/panels.md`
- Which properties are editable per type → see `project/spec/editor/editing.md`
