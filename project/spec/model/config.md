# Model — Configuration Type Contracts

## Purpose

Defines the shape and semantics of host-provided configuration types: `EditorConfig`, `EditorFeatureConfig`, `CanvasSettings`, `ComponentPlugin`, and `MediaSourceConfig`. These contracts govern how host applications customize editor behavior, feature availability, canvas display, custom element types, and media asset integration. This spec ensures any host can configure the editor from these contracts alone. It does NOT cover how config is validated at runtime (→ `project/spec/editor/editing.md`) or how features are rendered in UI (→ `project/spec/ui/`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Editor Configuration Shape

`EditorConfig` MUST support these host-provided settings: `allowedFonts` (font definitions), optional `defaultPalette` (color strings), optional `allowedDocumentSizes` (size presets), optional `requiredElements` (elements that cannot be deleted), optional `mediaSource` (media library config), optional `shortcuts` (shortcut overrides), optional `gridDefaults` (grid setting overrides), optional `maxUndoSteps` (undo history limit), optional `components` (custom element plugins), and optional `onChanges` (change stream callback). The `allowedFonts` array MAY be empty or undefined. When empty or undefined, the system MUST provide fallback system fonts as specified in the Fallback System Fonts requirement.

#### Scenario: Minimal config with only required fonts

- GIVEN an EditorConfig with only `allowedFonts` specified
- WHEN the editor initializes
- THEN the editor starts with the provided fonts and system defaults for all other settings

#### Scenario: Full config with all options

- GIVEN an EditorConfig with all optional fields provided
- WHEN the editor initializes
- THEN all settings are applied: fonts, palette, document sizes, required elements, media, shortcuts, grid, undo limit, plugins, and change callback

#### Acceptance Criteria

- [ ] Given a minimal EditorConfig with only allowedFonts, the editor initializes with defaults for all other settings
- [ ] Given a full EditorConfig with all optional fields, every setting is applied

---

### Requirement: Feature Configuration Gating

`EditorFeatureConfig` MUST contain boolean flags gating these features: `transforms3d`, `clipChildren`, `animations`, `importSvg`, `importPsd`, `importPptx`, `exportHtml`, `exportSvg`, `exportPdf`, `exportPsd`, `exportPptx`, `exportPng`, `exportJpeg`, `exportSvgEmbedded`, `exportOgraf`, `exportMp4`, `exportWebm`, `broadcastPreview`. Features with `false` MUST be hidden from the UI and disabled in the API.

#### Scenario: Feature disabled hides UI control

- GIVEN a feature config with `exportPdf: false`
- WHEN the export UI is rendered
- THEN the PDF export option is not visible

#### Scenario: All features enabled

- GIVEN a feature config with all flags `true`
- WHEN the editor UI is rendered
- THEN all import, export, and transform controls are available

#### Acceptance Criteria

- [ ] Given a feature flag set to false, the corresponding UI control is hidden
- [ ] Given all feature flags set to true, all controls are available

---

### Requirement: Document Mode Feature Defaults

The feature config MUST be derivable from `DocumentMode`. `'screen'` mode MUST enable animations, 3D transforms, and broadcast-specific features by default. `'print'` mode MUST disable animations and 3D transforms by default. Host overrides via `updateFeatureConfig` MUST merge on top of mode-derived defaults.

#### Scenario: Screen mode defaults

- GIVEN a document with `documentMode: 'screen'`
- WHEN the default feature config is derived
- THEN `animations`, `transforms3d`, and `broadcastPreview` are `true`

#### Scenario: Print mode defaults

- GIVEN a document with `documentMode: 'print'`
- WHEN the default feature config is derived
- THEN `animations` and `transforms3d` are `false`

#### Scenario: Host override merges with defaults

- GIVEN screen mode defaults with `animations: true`
- WHEN the host provides `updateFeatureConfig({ animations: false })`
- THEN animations is overridden to `false` while other screen defaults remain

#### Acceptance Criteria

- [ ] Given screen document mode, default feature config enables animations and transforms3d
- [ ] Given print document mode, default feature config disables animations and transforms3d
- [ ] Given a host override, the override merges on top of mode-derived defaults

---

### Requirement: Canvas Settings Shape

`CanvasSettings` MUST contain: `units` (`'px'` | `'mm'` | `'in'`), `viewMode` (`'broadcast'` | `'print'` | `'none'`), `guides` (array of guide lines), `showRulers` (boolean), `originX`/`originY` (ruler origin in px), `perspective` (CSS perspective in px, default 1000), `zoom` (number, 1 = 100%), `panX`/`panY` (pan offset in px), `grid` (grid settings with `gridSize` in mm, `showGrid`, `snapToGrid`, `snapThreshold` in px), and optional `backgroundPdf` (data URI string for PDF background overlay).

#### Scenario: Default canvas settings

- GIVEN a newly initialized editor
- WHEN canvas settings are inspected
- THEN all fields are present with deterministic defaults

#### Scenario: Guide structure

- GIVEN a guide with `id: 'g1'`, `type: 'h'`, `pos: 100`, `locked: false`
- WHEN the guide is inspected
- THEN it has id, type (horizontal or vertical), position in mm, and locked flag

#### Acceptance Criteria

- [ ] Given a newly initialized editor, all canvas settings fields are present with deterministic defaults
- [ ] Given a guide, it has id, type, position, and locked flag
- [ ] Given backgroundPdf is set to a data URI, the canvas renders a PDF background overlay
- [ ] Given backgroundPdf is omitted, no PDF background is rendered

---

### Requirement: Component Plugin Contract

A `ComponentPlugin` MUST provide: `type` (unique identifier string), `label` (display name), and `rendererFactory` (function that creates a renderer for this type). Optional fields: `icon` (SVG markup), `defaults` (width/height/content for element factory), `propertyPanel` (custom UI component for the properties sidebar), and `capabilities` (capability flag overrides).

#### Scenario: Plugin registers a custom element type

- GIVEN a plugin with `type: 'countdown'`, `label: 'Countdown Timer'`, and a renderer factory
- WHEN the plugin is registered via EditorConfig
- THEN elements of type `'countdown'` can be created, rendered, and edited

#### Scenario: Plugin with custom property panel

- GIVEN a plugin with a propertyPanel provided
- WHEN an element of that type is selected
- THEN the custom property panel is shown in the properties sidebar instead of the default panel

#### Scenario: Plugin with capability overrides

- GIVEN a plugin with `capabilities: { hasBorderRadius: false }`
- WHEN an element of that type is selected
- THEN border-radius editing controls are hidden

#### Acceptance Criteria

- [ ] Given a registered plugin, elements of the custom type can be created and rendered
- [ ] Given a plugin with a propertyPanel, the custom panel is shown when elements of that type are selected
- [ ] Given a plugin with capability overrides, the overridden capabilities affect UI control visibility

---

### Requirement: Media Source Configuration

`MediaSourceConfig` MUST provide: `assets` (array of media assets with id, name, url, optional thumbnailUrl, optional mimeType, optional metadata), optional `onUploadRequest` callback (host handles upload, returns new asset or null), and optional `categories` (array of category filters with id and name). The editor MUST NOT handle file uploads directly — it delegates to the host callback.

#### Scenario: Media library with assets

- GIVEN a media source with three assets and two categories
- WHEN the media library UI is opened
- THEN all three assets are available, filtered by the two categories

#### Scenario: Upload delegated to host

- GIVEN a media source with an onUploadRequest callback
- WHEN a user initiates an upload in the media library
- THEN the editor calls the host callback with the file and waits for the result

#### Acceptance Criteria

- [ ] Given a media source config with assets and categories, the media library displays them
- [ ] Given an onUploadRequest callback, file uploads are delegated to the host

---

### Requirement: Shortcut Configuration

`ShortcutMap` MUST map each `ShortcutAction` to a `ShortcutBinding` with `key` (keyboard key), optional `modifiers` (ctrl, shift, alt, meta booleans), and `label` (display label). The system MUST support exactly these actions: nudge (4 directions × 2 sizes), copy, paste, duplicate, delete, select-all, toggle-lock, layer reorder (4 directions), undo, redo, zoom (in, out, reset), group, ungroup.

#### Scenario: Default shortcuts are complete

- GIVEN the default shortcut map
- WHEN all shortcut actions are enumerated
- THEN every action has a corresponding binding with key and label

#### Scenario: Host overrides individual shortcuts

- GIVEN a host config with `shortcuts: { delete: { key: 'x', label: 'Delete' } }`
- WHEN shortcuts are resolved
- THEN the delete action uses key `'x'` while all other actions keep their defaults

#### Acceptance Criteria

- [ ] Given the default shortcut map, every ShortcutAction has a binding
- [ ] Given host shortcut overrides, only the overridden actions change while others keep defaults

---

### Requirement: Unit Conversion

The system MUST provide bidirectional conversion between pixels, millimeters, and inches using the document's `canvas.dpi` value (default 96 for screen, 300 for print). Conversion formulas: `px → mm = px × 25.4 / dpi`, `mm → px = mm × dpi / 25.4`, `px → in = px / dpi`, `in → px = in × dpi`. See [format-reference.md](format-reference.md) §16 for the full conversion table.

#### Scenario: Pixel to millimeter conversion at 96 DPI

- GIVEN a value of 96 pixels and `canvas.dpi: 96`
- WHEN converted to millimeters
- THEN the result is 25.4 mm

#### Scenario: Millimeter to pixel conversion at 96 DPI

- GIVEN a value of 25.4 millimeters and `canvas.dpi: 96`
- WHEN converted to pixels
- THEN the result is 96 px

#### Scenario: Pixel to millimeter conversion at 300 DPI

- GIVEN a value of 300 pixels and `canvas.dpi: 300`
- WHEN converted to millimeters
- THEN the result is 25.4 mm

#### Acceptance Criteria

- [ ] Given 96 pixels at 96 DPI, conversion to millimeters yields 25.4
- [ ] Given 25.4 millimeters at 96 DPI, conversion to pixels yields 96
- [ ] Given 300 pixels at 300 DPI, conversion to millimeters yields 25.4
- [ ] Given a document's canvas.dpi, conversions use that value instead of hardcoded 96

---

### Requirement: Default Canvas Settings

When no canvas settings are provided, the editor MUST initialize with these defaults: units=`'px'`, viewMode=`'none'`, showRulers=`true`, originX=0, originY=0, perspective=1000, zoom=1, panX=0, panY=0, empty guides array, and default grid settings.

#### Scenario: Default canvas state

- GIVEN no canvas settings override
- WHEN the editor initializes
- THEN canvas settings match the defined defaults

#### Acceptance Criteria

- [ ] Given no canvas settings override, units is 'px' and viewMode is 'none'
- [ ] Given no canvas settings override, zoom is 1 and pan offsets are 0
- [ ] Given no canvas settings override, showRulers is true and perspective is 1000

---

### Requirement: Default Grid Settings

The default grid MUST have: gridSize=5 (in mm), showGrid=false, snapToGrid=false, snapThreshold=5 (in px).

#### Scenario: Default grid

- GIVEN no grid settings override
- WHEN the editor initializes
- THEN grid settings match the defined defaults

#### Acceptance Criteria

- [ ] Given no grid settings override, gridSize is 5, showGrid is false, snapToGrid is false, snapThreshold is 5

---

### Requirement: Fallback System Fonts

When no fonts are configured via EditorConfig, the editor MUST provide fallback system fonts: Arial, Courier New, Times New Roman, Georgia.

#### Scenario: No fonts configured

- GIVEN an EditorConfig with no allowedFonts
- WHEN the editor resolves its font list
- THEN the font list contains Arial, Courier New, Times New Roman, and Georgia

#### Acceptance Criteria

- [ ] Given no allowedFonts in config, the editor provides Arial, Courier New, Times New Roman, and Georgia as fallbacks

---

### Requirement: URL-Based Experimental Feature Overrides

The system MUST support enabling experimental features via a `?experimental=true` URL parameter. When present, experimental feature flags MUST be merged into the feature config, overriding mode-derived defaults.

#### Scenario: Experimental param enables features

- GIVEN a URL with `?experimental=true`
- WHEN the editor resolves its feature config
- THEN experimental feature flags are enabled

#### Scenario: No experimental param

- GIVEN a URL without the experimental parameter
- WHEN the editor resolves its feature config
- THEN no experimental overrides are applied

#### Acceptance Criteria

- [ ] Given ?experimental=true in the URL, experimental feature flags are merged into the config
- [ ] Given no experimental parameter, the feature config uses only mode-derived defaults

---

### Requirement: Host-Provided Save Callback

`EditorConfig` MUST support an optional `onSave` callback field. When provided, the save action invokes this callback with the current `BroadsetProject` as its argument. When `onSave` is not provided, the save action MUST be a no-op and save-related UI controls SHOULD be hidden or disabled.

#### Scenario: Save with onSave callback

- GIVEN an EditorConfig with `onSave` defined
- WHEN the user triggers save
- THEN the callback is invoked with the current BroadsetProject

#### Scenario: No onSave in config

- GIVEN an EditorConfig without `onSave`
- WHEN the editor initializes
- THEN save UI controls are hidden or disabled

#### Acceptance Criteria

- [ ] Given onSave callback in config, triggering save invokes the callback with the current BroadsetProject
- [ ] Given no onSave callback in config, save UI controls are hidden or disabled

---

### Requirement: Color Normalization at Model Boundary

All color values entering the document model MUST be normalized to 6-digit or 8-digit hexadecimal format (`#RRGGBB` or `#RRGGBBAA`). Input formats that MUST be accepted and converted: 3-digit hex (`#RGB`), 4-digit hex (`#RGBA`), `rgb()`, `rgba()`, `hsl()`, `hsla()`, and CSS named colors. After normalization, all color values stored in the document are guaranteed to be hex strings, enabling consistent handling in interpolation, rendering, and export.

#### Scenario: CSS named color is normalized

- GIVEN a color value `red`
- WHEN it enters the document model
- THEN it is stored as `#ff0000`

#### Scenario: rgb() color is normalized

- GIVEN a color value `rgb(255, 128, 0)`
- WHEN it enters the document model
- THEN it is stored as `#ff8000`

#### Scenario: hsl() color is normalized

- GIVEN a color value `hsl(120, 100%, 50%)`
- WHEN it enters the document model
- THEN it is stored as `#00ff00`

#### Scenario: 3-digit hex is expanded

- GIVEN a color value `#abc`
- WHEN it enters the document model
- THEN it is stored as `#aabbcc`

#### Scenario: 6-digit hex is stored unchanged

- GIVEN a color value `#aabbcc`
- WHEN it enters the document model
- THEN it is stored unchanged

#### Acceptance Criteria

- [ ] Given a CSS named color, it is normalized to hex format
- [ ] Given an rgb() color value, it is normalized to hex format
- [ ] Given an hsl() color value, it is normalized to hex format
- [ ] Given a 3-digit hex color, it is expanded to 6-digit hex
- [ ] Given a 4-digit hex color, it is expanded to 8-digit hex
- [ ] Given a 6-digit hex color, it is stored unchanged
- [ ] Given an 8-digit hex color, it is stored unchanged

---

### Requirement: Frame Rate Configuration

The document's output specification (`output.frameRate`) defines the frame rate. See [output-spec.md](output-spec.md). Valid values are standard broadcast and cinema rates: `23.976`, `24`, `25`, `29.97`, `30`, `50`, `59.94`, `60`. Default: `50` (PAL broadcast standard). The editor canvas settings MAY cache the active document's frame rate for timeline display and keyframe snapping. When the timeline UI displays time positions, it MUST offer a frame-number display mode alongside milliseconds (e.g., frame 25 at 50fps = 500ms). Keyframe offsets MAY be snapped to frame boundaries: `offset = round(offset / (1000 / frameRate)) * (1000 / frameRate)`.

#### Scenario: Default frame rate

- GIVEN canvas settings with no `frameRate` field
- WHEN the frame rate is resolved
- THEN the default is `50` fps

#### Scenario: Valid frame rate accepted

- GIVEN canvas settings with `frameRate: 29.97`
- WHEN validation runs
- THEN the value is accepted

#### Scenario: Non-standard frame rate rejected

- GIVEN canvas settings with `frameRate: 33`
- WHEN validation runs
- THEN validation fails — only standard broadcast/cinema rates are accepted

#### Scenario: Frame-to-millisecond conversion

- GIVEN `frameRate: 25`
- WHEN frame 10 is converted to milliseconds
- THEN the result is 400ms

#### Acceptance Criteria

- [ ] Given no `frameRate`, the default is 50 fps
- [ ] Given a standard frame rate value (23.976, 24, 25, 29.97, 30, 50, 59.94, 60), validation succeeds
- [ ] Given a non-standard frame rate, validation fails
- [ ] Given a frame rate and frame number, the millisecond conversion is accurate

---

### Requirement: Safe Area Configuration

The document canvas MUST support a `safeAreas` object defining broadcast safety regions. The shape MUST match the document model defined in [format-reference.md](format-reference.md) §5: `actionSafe` (4-element percentage tuple `[top, right, bottom, left]`), `titleSafe` (4-element percentage tuple), and optional `custom` (array of named safe areas with per-side insets). Each percentage value MUST be in the range 0–50. Default safe areas when none are configured:

| Name        | Insets (%)           | Standard |
| ----------- | -------------------- | -------- |
| Action Safe | [3.5, 3.5, 3.5, 3.5] | EBU R95  |
| Title Safe  | [5, 5, 5, 5]         | EBU R95  |

Safe area overlays are rendered by the editor canvas as non-printing guides. The preflight `title-safe` rule MUST use the `titleSafe` inset values (or 5% default) for its boundary check.

#### Scenario: Default safe areas

- GIVEN a canvas with no `safeAreas` object
- WHEN safe areas are resolved
- THEN two default areas are provided: Action Safe ([3.5, 3.5, 3.5, 3.5]) and Title Safe ([5, 5, 5, 5])

#### Scenario: Custom safe areas

- GIVEN a canvas with `safeAreas.custom: [{ name: 'Graphics Safe', insets: [5, 5, 90, 80] }]`
- WHEN safe areas are resolved
- THEN the custom safe area is available alongside actionSafe and titleSafe

#### Scenario: Inset validation

- GIVEN a safe area with an inset value of 60
- WHEN validation runs
- THEN validation fails — each inset must be 0–50

#### Acceptance Criteria

- [ ] Given no `safeAreas`, default Action Safe and Title Safe are provided
- [ ] Given custom safe areas, they appear alongside the standard areas
- [ ] Given a safe area inset outside 0–50, validation fails
- [ ] Given safe areas, overlays are rendered as non-printing guides on the editor canvas

---

### Requirement: Content Template Configuration

The editor config MUST support an optional `templates` array providing pre-built document templates. Each template entry MUST contain `id` (unique string), `name` (display name), `category` (string for grouping, e.g., `'Lower Thirds'`, `'Full Screen'`, `'Tickers'`), `thumbnail` (URL string for preview image), and `document` (a complete `BroadsetDocument` object ready to load). Templates are presented in the New Document flow and allow users to start from professionally designed layouts. The template system is read-only — users cannot modify the template library from within the editor. Categories MUST be sorted alphabetically, and templates within a category MUST maintain their array order.

#### Scenario: Templates available in new document flow

- GIVEN an editor config with `templates: [{ id: 't1', name: 'News Lower Third', category: 'Lower Thirds', thumbnail: '...', document: {...} }]`
- WHEN the user creates a new document
- THEN the "News Lower Third" template is available for selection

#### Scenario: Templates grouped by category

- GIVEN templates with categories `'Lower Thirds'` and `'Full Screen'`
- WHEN the template list is displayed
- THEN templates are grouped by category with categories sorted alphabetically

#### Scenario: No templates configured

- GIVEN an editor config with no `templates` array
- WHEN the user creates a new document
- THEN only blank document sizes are available (no template section shown)

#### Acceptance Criteria

- [ ] Given templates in config, they are available in the new document flow
- [ ] Given templates with categories, they are grouped and categories are alphabetically sorted
- [ ] Given no templates, the template section is not shown in new document flow
- [ ] Given a template selection, the template's complete document is loaded as a new document

---

### Requirement: Component Linking

Elements MAY participate in a component relationship via the `componentRef` field (see [element.md](element.md)). A `componentRef` contains `componentId` (string — the master component's ID) and `instanceId` (string — this instance's unique ID). The master element is the authoritative source for structure, styles, and animation. Instance elements inherit the master's children structure, element styles, and animation bindings. Instance elements MAY override `content` and `style` fields on individual child elements — these overrides are stored as page-level `ElementOverride` entries. Structure changes to the master (adding/removing children, reordering, resizing) propagate to all instances. Style changes to the master propagate unless the instance has a local override for that property. An instance can be "unlinked" by clearing its `componentRef` field, which makes it an independent element retaining its current structure and overrides.

#### Scenario: Create component from group

- GIVEN a group element with children
- WHEN the element is designated as a component master
- THEN it receives a unique `componentId` and can be instantiated

#### Scenario: Create instance

- GIVEN a component master with `componentId: 'cmp-1'`
- WHEN a new element is created with `componentRef: { componentId: 'cmp-1', instanceId: 'inst-1' }`
- THEN the new element inherits the master's children structure and styles

#### Scenario: Content override on instance

- GIVEN an instance element with a child text element
- WHEN the instance's text content is changed
- THEN the change is stored as a local override and does not affect the master

#### Scenario: Master structure change propagates

- GIVEN a master element that adds a new child element
- WHEN instances are resolved
- THEN all instances gain the new child element

#### Scenario: Unlink instance

- GIVEN an instance element with `componentRef`
- WHEN `componentRef` is cleared (set to `null`)
- THEN the element becomes independent with its current structure preserved

#### Acceptance Criteria

- [ ] Given a component master, it is recognized and can be instantiated
- [ ] Given an element with `componentRef` referencing a valid component, it inherits the master's structure
- [ ] Given an instance with content overrides, the overrides do not affect the master
- [ ] Given a structure change on the master, all instances reflect the change
- [ ] Given an unlinked instance, it becomes independent with current structure preserved

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Runtime config validation with error messages → see `project/spec/editor/editing.md`
- Feature config impact on rendered UI → see `project/spec/ui/spec.md`
- Canvas settings mutation via store actions → see `project/spec/editor/store-actions.md`
