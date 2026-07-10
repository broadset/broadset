# Model — Element Data Contract

## Purpose

Defines the structural shape and invariant rules for `BroadsetElement` — the fundamental building block of every document. Every element carries identity, geometry, content, visual style, hierarchy references, and optional data binding / type-specific configuration. This spec ensures any consumer can reconstruct the element data layer from these contracts alone. It does NOT cover element mutation operations (→ `project/spec/editor/`) or visual rendering (→ `project/spec/renderer/`). See [conventions](../../README.md).

**Key structural change:** Elements no longer carry a `screen` property. All visual properties formerly on `screen` (maskType, customClipPath, clipChildren, rotateX/Y/Z, translateZ) have moved to `style`. The `name` and `locked` fields are now top-level on the element. Playback state (visibility, activeState, modifiers) is runtime-only — never serialized.

---

## Requirements

### Requirement: Element Type Vocabulary

The system MUST support exactly these built-in element types: `text`, `image`, `svg`, `path`, `rectangle`, `ellipse`, `qrcode`, `group`, `video`, `clock`, `ticker`. Additional types MAY be registered via the component plugin system.

#### Scenario: All built-in types are accepted

- GIVEN an element with each built-in type value
- WHEN the element is used in a document
- THEN the system accepts it without error

#### Scenario: Custom plugin type is accepted

- GIVEN a component plugin registered with type `countdown`
- WHEN an element with `type: 'countdown'` is added
- THEN the system accepts it as a valid element

#### Acceptance Criteria

- [ ] Given an element with any of text, image, svg, path, rectangle, ellipse, qrcode, group, video, clock, or ticker as its type, the system accepts it
- [ ] Given a registered component plugin with a custom type, elements of that type are accepted

---

### Requirement: Element Identity and Naming

Every element MUST have:

- `id`: non-empty string, unique within the document
- `type`: one of the built-in types or a registered plugin type
- `name`: human-readable display name (string, may be empty)
- `locked`: boolean indicating whether the element is locked from editing (default `false`)

#### Scenario: Valid element identity

- GIVEN an element with `id: 'el-1'`, `type: 'text'`, `name: 'Title'`, `locked: false`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: Empty id rejected

- GIVEN an element with `id: ''`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given an element with valid id, type, name, and locked, validation succeeds
- [ ] Given an element with empty id, validation fails
- [ ] Given duplicate element IDs within a document, validation fails

---

### Requirement: Element Position and Dimensions

Every element MUST have a position with numeric `x` and `y` coordinates, numeric `width` (> 0), `height` (> 0), and `rotation` in degrees. All spatial values are in the document's canvas unit (px, mm, or in).

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

### Requirement: Structured Text Model (`TextBody`)

Per IO-D-01 and IO-D-06 and Phase 1 unit #9, text elements MUST support a structured run/paragraph representation (`TextBody`) alongside the flat plain-string `content`. The field on `BroadsetElement` will become `content: string | TextBody` once the renderer / editor dual-path is in place (a later sub-commit); this requirement defines the structured surface the flip will consume.

```ts
type TextBody = { paragraphs: readonly Paragraph[] };
type Paragraph = { runs: readonly Run[]; props?: ParagraphProps };
type ParagraphProps = {
  align?: 'start' | 'end' | 'center' | 'justify';
  indent?: number;
  lineSpacing?: number; // >= 0
  spaceBefore?: number; // >= 0
  spaceAfter?: number; // >= 0
  bullet?: Bullet;
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
};
type Run = { text: string; props?: RunProps };
type RunProps = {
  style?: Record<string, unknown>; // inline text-style overrides
  lang?: string; // BCP 47 tag
  hyperlink?: { url: string; tooltip?: string; target?: '_blank' | '_self' };
};
type Bullet =
  | { kind: 'none' }
  | { kind: 'char'; char: string; font?: string; color?: BroadsetColor }
  | { kind: 'auto'; format: string; startAt?: number };
```

Contract:

- `paragraphs` MUST contain at least one paragraph; a `TextBody` with zero paragraphs is a structural error.
- Every paragraph MUST contain at least one run; empty-run arrays are rejected.
- `ParagraphProps.level` MUST be an integer `0..8` (9-level OOXML outline cap).
- `ParagraphProps.lineSpacing`, `spaceBefore`, `spaceAfter` MUST be non-negative.
- `RunProps.lang`, when provided, MUST match the BCP 47 grammar (`[A-Za-z]{1,8}` followed by zero or more `-` subtags).
- `RunProps.hyperlink.url` MUST be non-empty when `hyperlink` is present.
- `Bullet.char` on a `char` bullet MUST be non-empty. `Bullet.format` on an `auto` bullet is a free-form string (canonical vocabulary in `CANONICAL_BULLET_FORMATS`) so format-owned extensions survive round-trip.
- A promotion helper `textBodyFromPlainString(content)` MUST split on `\n` into paragraphs so fixtures migrating from `content: string` retain paragraph structure; empty input yields a single paragraph with a single empty run so every output is schema-valid.

#### Acceptance Criteria

- [ ] Given a minimal single-run body, `textBodySchema` accepts it
- [ ] Given a multi-run paragraph with inline style, lang, and hyperlink, validation succeeds
- [ ] Given an empty `paragraphs` array, validation fails
- [ ] Given a paragraph with zero runs, validation fails
- [ ] Given `RunProps.lang` that is not a BCP 47 tag, validation fails
- [ ] Given a `hyperlink` missing its URL, validation fails
- [ ] Given `ParagraphProps.level` outside `0..8`, validation fails
- [ ] Given a `char` bullet with an empty `char`, validation fails
- [ ] Given an unknown bullet `kind`, validation fails
- [ ] `textBodyFromPlainString` splits on `\n` into paragraphs and handles the empty string as `[{ runs: [{ text: '' }] }]`

---

### Requirement: Element Content Semantics

The `content` field carries type-specific payload data. The system MUST interpret content according to the element type:

- `text` → display text (rich text HTML or plain text)
- `image` → image source URL (or empty for placeholder)
- `svg` → inline SVG markup
- `path` → SVG path `d` attribute data
- `qrcode` → string to encode as QR code
- `video` → video source URL
- `clock` → time format pattern (e.g., `'HH:mm:ss'`, `'mm:ss.S'`)
- `ticker` → ticker items as JSON array of strings (e.g., `'["Breaking News", "Weather Update"]'`)
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

### Requirement: Asset Reference

Elements MAY carry an optional `assetId` field referencing an asset in the project's centralized asset library. When `assetId` is present, the element's content is resolved from the asset. See [assets.md](assets.md).

#### Scenario: Image element with asset reference

- GIVEN an image element with `assetId: 'asset-logo-001'`
- WHEN the element is rendered
- THEN the image source is resolved from the asset library

#### Acceptance Criteria

- [ ] Given an element with a valid assetId, the content is resolved from the asset library
- [ ] Given an element with an assetId referencing a non-existent asset, validation fails or a fallback is used

---

### Requirement: Element Hierarchy

Elements use `parentId` and `groupId` to express hierarchy. `parentId` references a group-type element in the same document (or `null` for root elements). `groupId` identifies visual group membership for multi-select operations.

#### Scenario: Root element has null parentId

- GIVEN an element with `parentId: null`
- WHEN the document structure is inspected
- THEN the element is a root-level element

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

### Requirement: parentId and groupId Independence

`parentId` and `groupId` are independent axes. An element MAY have both a `parentId` (structural hierarchy under a group-type element) and a `groupId` (visual multi-select group) simultaneously.

#### Acceptance Criteria

- [ ] Given an element with both parentId and groupId set to different values, validation succeeds
- [ ] Given an element with parentId set and groupId undefined, validation succeeds
- [ ] Given an element with groupId set and parentId undefined, validation succeeds

---

### Requirement: Element Default Values

Newly created elements MUST have deterministic default values. Defaults MUST include: `name: ''`, `locked: false`, `rotation: 0`, `parentId: null`, `groupId: null`. Style defaults MUST include `opacity: 1`.

#### Acceptance Criteria

- [ ] Given a newly created element, name is empty string and locked is false
- [ ] Given a newly created element, style opacity is 1

---

### Requirement: Rotation Normalization

The `rotation` field accepts any finite numeric value in degrees. Negative values and values exceeding 360 are valid inputs. Implementations SHOULD normalize rotation to the [0, 360) range for display purposes but MUST preserve the original value in the document model.

#### Acceptance Criteria

- [ ] Given a rotation of -90, the value is stored as-is in the document
- [ ] Given a rotation of 450, the value is stored as-is in the document
- [ ] Given a rotation of NaN or Infinity, validation rejects the element

---

### Requirement: Position Finite Validation

Element position fields `x` and `y` MUST be finite numbers. `NaN` and `Infinity` values MUST be rejected. Negative coordinates are valid (elements may be positioned off-canvas).

#### Acceptance Criteria

- [ ] Given x or y set to NaN or Infinity, validation rejects the element
- [ ] Given negative x and y values, validation succeeds

---

### Requirement: Content Validation by Element Type

Element content MUST be validated at the model boundary based on the element's type:

- **text**: content MUST be sanitized to strip disallowed HTML tags. Allowed tags: `<b>`, `<i>`, `<u>`, `<br>`, `<span>`, `<strong>`, `<em>`. All other non-script tags and all attributes except `style` MUST be silently stripped. Raw `<script>` tags and HTML event-handler attributes in text content MUST be rejected by validation (see "Script Marker Rejection" below).
- **image**: content MUST be a valid URL string (absolute or relative path). Empty string is allowed (placeholder image).
- **path**: content MUST be a syntactically valid SVG path `d` attribute string. An empty string produces an empty path. Non-empty paths MUST begin with an `M` or `m` command. The valid command set is: `M`, `m`, `L`, `l`, `H`, `h`, `V`, `v`, `C`, `c`, `S`, `s`, `Q`, `q`, `T`, `t`, `A`, `a`, `Z`, `z`. Any non-numeric token that is not in the valid command set MUST cause validation to fail.
- **svg**: content MUST be well-formed SVG markup. Raw `<script>` tags and HTML event-handler attributes MUST be rejected by validation.
- **qrcode**: content MUST be a non-empty string (the data to encode).
- **rectangle**, **ellipse**, **group**: content SHOULD be empty or undefined.

#### Acceptance Criteria

- [ ] Given a text element with disallowed non-script tags (style, iframe, object, embed, form) in content, the tags are silently stripped during validation
- [ ] Given a text element with allowed tags (b, i, u, br, span, strong, em), the tags are preserved
- [ ] Given an image element with a valid URL, validation succeeds
- [ ] Given a path element with valid SVG d attribute syntax, validation succeeds
- [ ] Given a path element with invalid d attribute syntax, validation fails
- [ ] Given a qrcode element with empty content, validation fails

---

### Requirement: Script Marker Rejection

The element schema MUST reject `content` strings that include a raw `<script>` tag opening or an HTML event-handler attribute (e.g. `onclick="…"`, `onload='…'`, `onError=handler`) for element types whose content flows through an HTML / SVG rendering path — specifically `text` and `svg`. Rejection MUST be case-insensitive. The event-handler detection MUST only trigger inside a tag (so plain prose like `"onion=cheese"` passes), achieved by requiring the pattern `<…on[a-z]+\s*=` to appear within an open tag. This guard is a last line of defense after importer-level sanitization: if DOMPurify or `sanitizeTextContent` fail or are bypassed, the schema fails loudly instead of allowing executable markup to reach the renderer.

#### Scenario: Raw script tag in text content is rejected

- GIVEN a text element with `content: "<script>alert(1)</script>Hello"`
- WHEN the element is validated
- THEN validation fails with a `content` path error

#### Scenario: Event-handler attribute in svg content is rejected

- GIVEN an svg element with `content: "<svg><g onload='alert(1)'/></svg>"`
- WHEN the element is validated
- THEN validation fails with a `content` path error

#### Scenario: Benign text is accepted

- GIVEN a text element with `content: "The onion=cheese sandwich"`
- WHEN the element is validated
- THEN validation succeeds because `on[word]=` does not appear inside an open tag

#### Scenario: Non-HTML-rendered types are not affected

- GIVEN an image element whose content is a URL with `?onclick=1` in its query string
- WHEN the element is validated
- THEN validation succeeds because the image path does not render content as HTML

#### Acceptance Criteria

- [ ] Given a text element with a raw `<script>` tag, validation fails
- [ ] Given a text element with case-variant `<ScRiPt>` or `<SCRIPT>`, validation fails
- [ ] Given a text element with an HTML event-handler attribute like `onclick="…"`, validation fails
- [ ] Given an svg element with a `<script>` child or `onload=…` attribute, validation fails
- [ ] Given a text element with safe inline tags (`<b>`, `<i>`, `<strong>`, etc.), validation succeeds
- [ ] Given plain text containing `"onion=cheese"` outside any tag, validation succeeds
- [ ] Given an image, qrcode, path, or other non-HTML-rendered element whose content happens to include `on*=` or `script` substrings, validation succeeds

---

### Requirement: Data Field Binding

Elements MAY carry an optional `dataField` that binds the element to a field in the document's `dataSchema`. See [data-schema.md](data-schema.md) for field definition and constraints. The `dataField` object contains:

- `fieldName`: references a field in the document's `dataSchema.fields` array
- `overflow`: `'clip'` | `'ellipsis'` | `'shrink'` | `'scroll'` — behavior when data exceeds bounds
- `prefix` (optional): string prepended to the data value
- `suffix` (optional): string appended to the data value
- `formatPattern` (optional): format string (e.g., date/number format)

#### Scenario: Text element bound to data field

- GIVEN a text element with `dataField: { fieldName: 'playerName', overflow: 'ellipsis' }`
- WHEN live data provides `playerName: 'John Smith'`
- THEN the element content is updated to `'John Smith'`

#### Acceptance Criteria

- [ ] Given an element with dataField.fieldName, it must match a field in dataSchema
- [ ] Given data that overflows element bounds, the specified overflow behavior is applied

---

### Requirement: Conditional Visibility

Elements MAY carry an optional `visibleWhen` string containing a boolean expression over data schema fields. When the expression evaluates to `false`, the element is hidden. When absent or evaluating to `true`, the element is visible.

Expression syntax supports: field references, comparison operators (`==`, `!=`, `>`, `<`, `>=`, `<=`), logical operators (`&&`, `||`, `!`), and parentheses for grouping.

#### Scenario: Element hidden when condition is false

- GIVEN an element with `visibleWhen: 'showSubtitle == true'`
- WHEN data provides `showSubtitle: false`
- THEN the element is hidden

#### Acceptance Criteria

- [ ] Given visibleWhen evaluating to false, the element is hidden
- [ ] Given visibleWhen evaluating to true or absent, the element is visible
- [ ] Given an invalid expression, validation fails

---

### Requirement: Repeater Configuration

Elements MAY carry an optional `repeater` object that causes the element to be repeated for each item in a data array field. The repeater contains:

- `dataArrayField`: references an array-type field in `dataSchema`
- `direction`: `'horizontal'` | `'vertical'` | `'grid'`
- `gap`: spacing between repeated instances (in canvas units)
- `maxItems` (optional): maximum number of visible instances

#### Scenario: Repeating element for standings data

- GIVEN a group element with `repeater: { dataArrayField: 'standings', direction: 'vertical', gap: 4 }`
- WHEN data provides `standings` with 10 items
- THEN 10 instances of the element are rendered vertically with 4-unit gaps

#### Acceptance Criteria

- [ ] Given a repeater referencing a valid array field, instances are generated per data item
- [ ] Given maxItems set, instances are capped at that count

---

### Requirement: Component Reference

Elements MAY carry an optional `componentRef` linking to a reusable component definition. The component reference contains:

- `componentId`: references a shared component by ID
- `overrides` (optional): property overrides applied on top of the component definition

This enables instanced component patterns where a single component definition is shared across multiple elements.

#### Acceptance Criteria

- [ ] Given a componentRef with valid componentId, the element renders as an instance of that component
- [ ] Given property overrides in componentRef, they are applied on top of the component defaults

---

### Requirement: Element Auto-Sizing Mode

Text elements MUST support an optional `autoSize` field with values `'fixed'` (default — element bounds are explicit width × height), `'auto-height'` (width is fixed, height grows to fit text content), or `'shrink-to-fit'` (font size reduces proportionally until all text fits within the explicit bounds). When `autoSize` is `'auto-height'`, the element's rendered height is determined by the text content and typography settings — the stored `height` value serves as the minimum. When `autoSize` is `'shrink-to-fit'`, the renderer reduces the effective font size in steps until the text fits within width × height, with a minimum effective size of 6pt. Non-text elements MUST ignore this field. Default: `'fixed'`.

#### Acceptance Criteria

- [ ] Given a text element with `autoSize: 'fixed'` or absent, text is clipped to explicit bounds
- [ ] Given a text element with `autoSize: 'auto-height'`, the rendered height grows to fit content
- [ ] Given a text element with `autoSize: 'shrink-to-fit'`, font size reduces to fit bounds with a 6pt minimum
- [ ] Given a non-text element with any `autoSize` value, the field has no effect

---

### Requirement: Type-Specific Configuration

Elements with types `video`, `clock`, and `ticker` MUST support an optional `typeConfig` field containing type-specific behavior configuration. The shape of `typeConfig` is determined by the element type:

**Video typeConfig:**

| Field      | Type           | Default | Description                                         |
| ---------- | -------------- | ------- | --------------------------------------------------- |
| loop       | boolean        | false   | Whether the video loops on completion               |
| autoplay   | boolean        | true    | Whether the video plays automatically on visibility |
| muted      | boolean        | true    | Whether audio is muted                              |
| startTimeS | number         | 0       | Playback start position in seconds                  |
| endTimeS   | number \| null | null    | Playback end position (null = end of video)         |

**Clock typeConfig:**

| Field       | Type           | Default      | Description                                                                                                                                                                           |
| ----------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mode        | string         | `'realtime'` | `'realtime'`, `'countdown'`, `'countup'`, `'stopwatch'`                                                                                                                               |
| startValue  | string \| null | null         | Duration or time for countdown/countup start (e.g., `'00:10:00'`, `'600'`)                                                                                                            |
| targetValue | string \| null | null         | Duration or time for countdown end (e.g., `'00:00:00'`)                                                                                                                               |
| countdownTo | string \| null | null         | ISO 8601 datetime for absolute countdown (e.g., `'2026-04-05T15:00:00Z'`). When set, overrides `startValue`/`targetValue` — the clock shows remaining time until the target datetime. |

When `countdownTo` is set and the target datetime is in the past, the clock MUST display `00:00:00` (or the equivalent in the element's format pattern). When the target is in the future, the clock MUST show the remaining time and update every second (or fraction indicated by the format). The `countdownTo` field MUST be a valid ISO 8601 datetime string with timezone; validation MUST reject non-ISO-8601 values.

**Ticker typeConfig:**

| Field     | Type    | Default  | Description                                                                              |
| --------- | ------- | -------- | ---------------------------------------------------------------------------------------- |
| speed     | number  | 60       | Scroll speed in pixels per second. MUST be a positive finite number in the range 1–2000. |
| direction | string  | `'left'` | `'left'`, `'right'`, `'up'`, or `'down'`                                                 |
| gap       | number  | 40       | Gap in pixels between consecutive items. MUST be a non-negative finite number.           |
| paused    | boolean | false    | Whether ticker scrolling is paused                                                       |

Validation MUST reject `typeConfig` fields that do not match the expected shape for the element type. Elements of other types MUST ignore `typeConfig`.

#### Acceptance Criteria

- [ ] Given a video element with valid video typeConfig, validation succeeds
- [ ] Given a clock element with valid clock typeConfig, validation succeeds
- [ ] Given a ticker element with valid ticker typeConfig, validation succeeds
- [ ] Given a typeConfig shape that does not match the element type, validation fails
- [ ] Given a non-media element with typeConfig, the field is ignored
- [ ] Given a clock with `countdownTo` set to a valid ISO 8601 datetime, validation succeeds
- [ ] Given a clock with `countdownTo` set to a non-ISO-8601 string, validation fails
- [ ] Given a ticker with `speed: 0`, validation fails
- [ ] Given a ticker with `speed: 2001`, validation fails
- [ ] Given a ticker with `speed: 120`, validation succeeds
- [ ] Given a ticker with `gap: -1`, validation fails

---

### Requirement: Text Path Binding

Text elements MAY reference a path element in the same document via an optional `textPathElementId` field. When present and referencing a valid path element, the text MUST render along the path shape. When the referenced element does not exist or is not a path-type element, `textPathElementId` is ignored and text renders normally.

Beyond the per-element field declaration, the document-level validator MUST enforce the following invariants so a corrupt reference fails loudly at load time rather than degrading silently at render time:

- Only elements of `type: 'text'` may carry a non-null `textPathElementId`. A non-text element with the field set is a structural error.
- The referenced id MUST match an element present in the same document.
- The referenced element MUST be of `type: 'path'`.
- Self-references (`textPathElementId === id`) MUST be rejected.

Because the reference target is always a `path` (and paths cannot themselves carry `textPathElementId`), the reference graph is acyclic by construction — an explicit cycle walk is unnecessary once the target-type invariant is enforced. The validator lives in `packages/model/src/text-path-validation.ts` as `hasValidTextPathReferences(items)` and is invoked from `broadsetDocumentSchema.superRefine`.

#### Acceptance Criteria

- [ ] Given a valid `textPathElementId`, text renders along the referenced path shape
- [ ] Given an invalid or missing `textPathElementId`, text renders normally
- [ ] Given a text-on-path element, typography settings are still applied
- [ ] Given a `textPathElementId` pointing to a non-existent element id, document validation fails with an `elements` path issue
- [ ] Given a `textPathElementId` pointing to a non-path element, document validation fails
- [ ] Given a non-text element with `textPathElementId` set, document validation fails
- [ ] Given an element whose `textPathElementId` equals its own id, document validation fails
- [ ] Given multiple text elements referencing the same path, document validation succeeds

---

### Requirement: Boolean Shape Operations

Group elements MAY carry an optional `booleanOperation` field that combines the shapes of child elements using a boolean path operation. When present, the group's visual output is the computed result of applying the boolean operation to its children's paths, rendered as a single combined path.

Valid values: `'union'` | `'subtract'` | `'intersect'` | `'exclude'`

- `union`: The combined area of all children (OR). AKA "add"
- `subtract`: The first child's area minus all subsequent children (first − rest). AKA "minus front"
- `intersect`: Only the area shared by all children (AND)
- `exclude`: The area belonging to exactly one child, excluding overlaps (XOR)

Children are processed in document order (element array position). The resulting path inherits the first child's stroke/fill styling. Non-group elements MUST ignore this field. Groups with fewer than 2 children MUST render normally (operation requires at least 2 shapes).

When `booleanOperation` is `null` or absent, the group renders normally (children stacked visually).

#### Scenario: Union of two rectangles

- GIVEN a group with `booleanOperation: 'union'` containing two overlapping rectangle children
- WHEN the group is rendered
- THEN the output is a single path representing the combined area of both rectangles

#### Scenario: Subtract creates a cutout

- GIVEN a group with `booleanOperation: 'subtract'` where the first child is a large circle and the second is a small circle inside it
- WHEN the group is rendered
- THEN the output is a donut shape (large circle with small circle cut out)

#### Scenario: Intersect shows overlap only

- GIVEN a group with `booleanOperation: 'intersect'` containing two partially overlapping ellipses
- WHEN the group is rendered
- THEN only the overlapping region is visible

#### Scenario: Fewer than 2 children renders normally

- GIVEN a group with `booleanOperation: 'union'` containing only 1 child element
- WHEN the group is rendered
- THEN the single child renders normally (no boolean operation applied)

#### Scenario: Non-group element ignores booleanOperation

- GIVEN a rectangle element with `booleanOperation: 'union'`
- WHEN the element is validated
- THEN the field is ignored (only group elements support boolean operations)

#### Acceptance Criteria

- [ ] Given a group with `booleanOperation: 'union'` and 2+ children, the visual output is the union of child shapes
- [ ] Given `booleanOperation: 'subtract'`, the first child's area minus subsequent children is rendered
- [ ] Given `booleanOperation: 'intersect'`, only the overlapping region is visible
- [ ] Given `booleanOperation: 'exclude'`, only the non-overlapping regions are visible
- [ ] Given a group with fewer than 2 children and a booleanOperation, the group renders normally
- [ ] Given `booleanOperation` as null or absent, the group renders normally
- [ ] Given `booleanOperation` as an invalid string, validation fails
- [ ] Given `booleanOperation` on a non-group element, the field is ignored
- [ ] Given a boolean group, the resulting path inherits stroke/fill styling from the first child

---

### Requirement: Extension Points

Every element MAY carry an `extensions` property — a `Record<string, unknown>` keyed by reverse-domain vendor prefix. The core model MUST preserve but MUST NOT interpret extensions.

#### Acceptance Criteria

- [ ] Given an element with extensions, they are preserved on round-trip
- [ ] Given unknown extension keys, the model does not reject or modify them

---

### Requirement: Format Extensions Registry (IO-D-11)

In addition to free-form vendor extensions above, the model reserves four format-id namespaces — `extensions.psd`, `extensions.pdf`, `extensions.pptx`, `extensions.svg` — for round-trip metadata owned by the matching format package. Each format package registers a Zod schema for its namespace via `registerExtensionsSchema(formatId, schema)` (exported from [`packages/model/src/extensions-types.ts`](../../../packages/model/src/extensions-types.ts)). The element and document Zod schemas validate every present registered namespace at load time. A persisted shape that no longer matches its registered schema fails loudly per IO-D-11 — the model never silently drops or rewrites stale data.

Every per-format extensions payload MUST extend the base `BroadsetFormatExtensions` interface, which mandates a boolean `dirty` flag. Importers MUST set `dirty = false` on every hydrated element / document; the editor middleware (Phase 1 unit #14) MUST flip every present `dirty` flag to `true` on any mutating action that touches the owning entity. Format exporters consult only their own flag: dirty → re-emit from current Broadset state; clean → re-emit the preserved original blob byte-for-byte.

A format-id namespace whose schema has not been registered (e.g. the owning format package is not loaded) is preserved as `unknown` and not validated — forward-compatibility for stripped-down deployments. The four format ids and the registry behavior are owned by `@broadset/model`; concrete schemas live under `packages/formats/src/<format>/types.ts`.

#### Acceptance Criteria

- [ ] `BROADSET_FORMAT_IDS` enumerates exactly `psd`, `pdf`, `pptx`, `svg`
- [ ] `broadsetFormatExtensionsBaseSchema` requires a boolean `dirty` field
- [ ] `registerExtensionsSchema(formatId, schema)` stores (or replaces) the schema for that format
- [ ] `validateExtensions(raw)` throws when a registered schema rejects the persisted shape
- [ ] `validateExtensions(raw)` accepts (without validating) namespaces whose schema is not registered
- [ ] Element parsing surfaces extensions validation failures as Zod issues with path `['extensions', <formatId>, …]`
- [ ] Document parsing surfaces extensions validation failures as Zod issues with path `['extensions', <formatId>, …]`
- [ ] Top-level keys outside the four reserved format ids are not validated by the registry

---

### Requirement: Content-Hash Identity

The model MUST expose `computeElementContentHash(element)` — a pure function returning a deterministic string fingerprint derived from the element's visual identity fields. The fingerprint is used by cross-format reconciliation to recover element identity when an external tool strips `data-bs-*` tags, XMP entries, or PPTX shape names. The fingerprint MUST NOT be stored in `.bsp` — it is a view over other fields and is always recomputed on demand.

**Fields that participate** in the hash (visual identity):

- `type`
- `position.x`, `position.y`, `width`, `height`, `rotation`
- `content`
- `style` — serialised with keys in ASCII-ascending order so literal-ordering differences do NOT change the hash

**Fields that do NOT participate** (identity / container metadata that may differ across reconciliation matches):

- `id`, `name`, `locked`, `parentId`, `groupId`
- `extensions`, `dataField`, `visibleWhen`, `repeater`, `typeConfig`, `componentRef`, `autoSize`, `textPathElementId`, `booleanOperation`, `assetId`

The Phase 1 body uses a simple deterministic non-cryptographic hash. The Phase 2 plan replaces the body with `xxhash-wasm` inside `packages/formats/src/_shared/fingerprint/`; the canonicalisation contract above MUST survive that swap.

#### Scenario: Stable across byte-identical elements

- GIVEN two `BroadsetElement`s whose visual-identity fields are identical
- WHEN `computeElementContentHash` runs on each
- THEN the returned strings are equal

#### Scenario: Independent of container metadata

- GIVEN two elements that differ only in `id`, `name`, `locked`, `parentId`, `groupId`, or `extensions`
- WHEN the hash is computed for each
- THEN the returned strings are equal

#### Scenario: Sensitive to style literal order

- GIVEN two elements whose `style` objects carry the same entries written in different literal order
- WHEN the hash is computed for each
- THEN the returned strings are equal because the style canonicalisation sorts keys

#### Acceptance Criteria

- [ ] Given two elements with identical visual-identity fields, the content hashes are equal
- [ ] Given elements that differ in `type`, `position`, `width`, `height`, `rotation`, `content`, or any style value, the content hashes differ
- [ ] Given elements that differ only in `id`, `name`, `locked`, `parentId`, `groupId`, or `extensions`, the content hashes are equal
- [ ] Given two elements with the same style entries in different literal order, the content hashes are equal
- [ ] The returned value is a non-empty string

---

## Spec Gaps

- [ ] **Proposed component registry and nested instance contract:** ADR-007 proposes document-owned definitions, stable nested instance identity, typed overrides, propagation, and unlink. The current `componentRef` requirement remains authoritative until a maintainer ratifies the new persisted model and updates all affected validation, page, collaboration, serialization, and rendering specs together.

---

## Non-Goals

- Element mutation operations → see `project/spec/editor/spec.md`
- Element rendering → see `project/spec/renderer/spec.md`
- Style property details → see [style.md](style.md)
- Animation configuration → see [animation.md](animation.md)
- Data schema field definitions → see [data-schema.md](data-schema.md)
