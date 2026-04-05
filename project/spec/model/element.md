# Model — Element Data Contract

## Purpose

Defines the structural shape and invariant rules for `BroadsetElement` — the fundamental building block of every page. Every element carries geometry, content, visual style, screen properties, and hierarchy references. This spec ensures any consumer can reconstruct the element data layer from these contracts alone. It does NOT cover element mutation operations (→ `project/spec/editor/`) or visual rendering (→ `project/spec/renderer/`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Element Type Vocabulary

The system MUST support exactly these built-in element types: `text`, `image`, `svg`, `path`, `rectangle`, `ellipse`, `qrcode`, `group`. Additional types MAY be registered via the component plugin system.

#### Scenario: All built-in types are accepted

- GIVEN an element with each built-in type value
- WHEN the element is used in a document
- THEN the system accepts it without error

#### Scenario: Custom plugin type is accepted

- GIVEN a component plugin registered with type `countdown`
- WHEN an element with `type: 'countdown'` is added
- THEN the system accepts it as a valid element

#### Acceptance Criteria

- [ ] Given an element with any of text, image, svg, path, rectangle, ellipse, qrcode, or group as its type, the system accepts it
- [ ] Given a registered component plugin with a custom type, elements of that type are accepted

---

### Requirement: Element Position and Dimensions

Every element MUST have a position with numeric `x` and `y` coordinates, numeric `width` (> 0), `height` (> 0), and `rotation` in degrees. All spatial values are in millimeters.

#### Scenario: Valid geometry accepted

- GIVEN an element with `position: {x: 10, y: 20}`, `width: 80`, `height: 50`, `rotation: 45`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: Zero width rejected

- GIVEN an element with `width: 0`
- WHEN the document is validated
- THEN validation fails

#### Scenario: Negative height rejected

- GIVEN an element with `height: -10`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given an element with valid position, width, height, and rotation, validation succeeds
- [ ] Given an element with zero width, validation fails
- [ ] Given an element with negative height, validation fails

---

### Requirement: Element Content Semantics

The `content` field carries type-specific payload data. The system MUST interpret content according to the element type:

- `text` → display text (rich text HTML or plain text)
- `image` → image source URL
- `svg` → inline SVG markup
- `path` → SVG path `d` attribute data
- `qrcode` → string to encode as QR code
- `rectangle`, `ellipse`, `group` → content is empty or ignored

#### Scenario: Text element carries display text

- GIVEN a text element with `content: 'Hello World'`
- WHEN the element is rendered
- THEN the display text is `'Hello World'`

#### Scenario: Image element carries a URL

- GIVEN an image element with `content: 'https://example.com/photo.jpg'`
- WHEN the element is rendered
- THEN the image source is the content URL

#### Acceptance Criteria

- [ ] Given a text element, its content is used as display text
- [ ] Given an image element, its content is used as the image source URL
- [ ] Given a path element, its content is used as SVG path data

---

### Requirement: Element Hierarchy

Elements use `parentId` and `groupId` to express hierarchy. `parentId` references a group-type element on the same page (or `null` for root elements). `groupId` identifies visual group membership for multi-select operations.

#### Scenario: Root element has null parentId

- GIVEN an element with `parentId: null`
- WHEN the document structure is inspected
- THEN the element is a root-level element on its page

#### Scenario: Child element references a parent

- GIVEN element A with `type: 'group'` and element B with `parentId: 'A'`
- WHEN the document structure is inspected
- THEN element B is a child of element A

#### Scenario: groupId links elements for multi-select

- GIVEN elements A and B both with `groupId: 'g1'`
- WHEN one member is selected
- THEN both elements are treated as a single selection unit

#### Acceptance Criteria

- [ ] Given an element with null parentId, it is a root-level element
- [ ] Given a child element with a valid parentId, it is recognized as a child of the referenced parent
- [ ] Given elements sharing a groupId, they are treated as a single selection unit

---

### Requirement: Element Default Values

Newly created elements MUST have deterministic default values for screen properties and style. Screen defaults MUST include: anchorX `'left'`, anchorY `'top'`, visibility `'onscreen'`, locked `false`, maskType `'none'`, all 3D rotations `0`, clipChildren `false`. Style defaults MUST include opacity `1`.

#### Scenario: Default screen properties

- GIVEN a newly created element
- WHEN its screen properties are inspected
- THEN anchorX is `'left'`, anchorY is `'top'`, visibility is `'onscreen'`, locked is `false`, maskType is `'none'`

#### Scenario: Default style properties

- GIVEN a newly created element
- WHEN its style is inspected
- THEN opacity is `1`

#### Acceptance Criteria

- [ ] Given a newly created element, screen properties match the documented defaults
- [ ] Given a newly created element, style opacity is 1

---

### Requirement: parentId and groupId Independence

`parentId` and `groupId` are independent axes. An element MAY have both a `parentId` (placing it in a parent-child hierarchy under a group-type element) and a `groupId` (placing it in a visual multi-select group) simultaneously. The two fields serve different purposes: `parentId` defines structural hierarchy, `groupId` defines ephemeral selection grouping.

#### Scenario: Both fields coexist on the same element

- GIVEN an element with `parentId` referencing a group element AND `groupId` referencing a different visual group
- WHEN validation runs
- THEN both fields are accepted as valid

#### Scenario: Only parentId set

- GIVEN an element with only `parentId` set
- WHEN validation runs
- THEN the element is valid

#### Scenario: Only groupId set

- GIVEN an element with only `groupId` set
- WHEN validation runs
- THEN the element is valid

#### Acceptance Criteria

- [ ] Given an element with both parentId and groupId set to different values, validation succeeds
- [ ] Given an element with parentId set and groupId undefined, validation succeeds
- [ ] Given an element with groupId set and parentId undefined, validation succeeds

---

### Requirement: Rotation Normalization

The `rotate` field accepts any finite numeric value in degrees. Negative values and values exceeding 360 are valid inputs. Implementations SHOULD normalize rotation to the [0, 360) range for display purposes but MUST preserve the original value in the document model.

#### Scenario: Negative rotation is preserved

- GIVEN an element with `rotate: -90`
- WHEN stored in the document
- THEN the value -90 is preserved

#### Scenario: Rotation exceeding 360 is preserved

- GIVEN an element with `rotate: 450`
- WHEN stored in the document
- THEN the value 450 is preserved

#### Scenario: NaN rotation is rejected

- GIVEN an element with `rotate: NaN`
- WHEN validation runs
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a rotation of -90, the value is stored as-is in the document
- [ ] Given a rotation of 450, the value is stored as-is in the document
- [ ] Given a rotation of NaN, validation rejects the element
- [ ] Given a rotation of Infinity, validation rejects the element

---

### Requirement: Position Finite Validation

Element position fields `x` and `y` MUST be finite numbers. `NaN` and `Infinity` values MUST be rejected by validation.

#### Scenario: NaN x is rejected

- GIVEN an element with `x: NaN`
- WHEN validation runs
- THEN validation fails

#### Scenario: Infinite y is rejected

- GIVEN an element with `y: Infinity`
- WHEN validation runs
- THEN validation fails

#### Scenario: Negative coordinates are valid

- GIVEN an element with `x: -500, y: -200`
- WHEN validation runs
- THEN validation succeeds (negative positions are valid)

#### Acceptance Criteria

- [ ] Given x set to NaN, validation rejects the element
- [ ] Given y set to NaN, validation rejects the element
- [ ] Given x set to Infinity, validation rejects the element
- [ ] Given y set to -Infinity, validation rejects the element
- [ ] Given negative x and y values, validation succeeds

---

### Requirement: Content Validation by Element Type

Element content MUST be validated at the model boundary based on the element's type:

- **text**: content MUST be sanitized to strip disallowed HTML tags. Allowed tags: `<b>`, `<i>`, `<u>`, `<br>`, `<span>`, `<strong>`, `<em>`. All other tags and all attributes except `style` MUST be stripped.
- **image**: content MUST be a valid URL string (absolute or relative path). Empty string is allowed (placeholder image).
- **path**: content MUST be a syntactically valid SVG path `d` attribute string. An empty string produces an empty path. Non-empty paths MUST begin with an `M` or `m` command. The valid command set is: `M`, `m`, `L`, `l`, `H`, `h`, `V`, `v`, `C`, `c`, `S`, `s`, `Q`, `q`, `T`, `t`, `A`, `a`, `Z`, `z`. Any non-numeric token that is not in the valid command set MUST cause validation to fail.
- **svg**: content MUST be well-formed SVG markup.
- **qrcode**: content MUST be a non-empty string (the data to encode).
- **rectangle**, **ellipse**, **group**: content SHOULD be empty or undefined.

#### Scenario: Text content is sanitized

- GIVEN a text element with content `<script>alert('xss')</script>Hello`
- WHEN validation runs
- THEN content is sanitized to `Hello`

#### Scenario: Image content with valid URL

- GIVEN an image element with content `https://example.com/img.png`
- WHEN validation runs
- THEN content is accepted

#### Scenario: Path element with valid SVG d attribute

- GIVEN a path element with content `M 0 0 L 10 10`
- WHEN validation runs
- THEN content is accepted

#### Scenario: Path element with invalid d attribute

- GIVEN a path element with content `not a path`
- WHEN validation runs
- THEN validation fails

#### Scenario: QR code with empty content

- GIVEN a qrcode element with empty content
- WHEN validation runs
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a text element with script tags in content, the tags are stripped during validation
- [ ] Given a text element with allowed tags (b, i, u, br, span, strong, em), the tags are preserved
- [ ] Given an image element with a valid URL, validation succeeds
- [ ] Given a path element with valid SVG d attribute syntax, validation succeeds
- [ ] Given a path element with invalid d attribute syntax, validation fails
- [ ] Given a qrcode element with empty content, validation fails

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Element mutation operations → see `project/spec/editor/spec.md`
- Element rendering → see `project/spec/renderer/spec.md`
- Style property details → see [style.md](style.md)
- Screen property details → see [screen.md](screen.md)
