# Model — Configuration Type Contracts

## Purpose

Defines the shape and semantics of host-provided configuration types: `EditorConfig`, `EditorFeatureConfig`, `CanvasSettings`, plugin registration, and `MediaSourceConfig`. These contracts govern editor behavior, feature availability, canvas display, canonical plugin elements, and media integration without becoming project fields. It does NOT cover runtime editor commands or UI rendering.

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

### Requirement: Document Kind Feature Defaults

The feature config MUST be derivable from canonical document `kind`. `motion` MUST enable animations, 3D transforms, and broadcast-specific features by default. `static` MUST disable animations while retaining static screen-authoring tools. `print` MUST disable animations and 3D editing by default and enable prepress tools. Host overrides via `updateFeatureConfig` MUST merge on top of kind-derived defaults without enabling commands that would produce invalid canonical state.

#### Scenario: Motion defaults

- GIVEN a document with `kind: 'motion'`
- WHEN the default feature config is derived
- THEN `animations`, `transforms3d`, and `broadcastPreview` are `true`

#### Scenario: Print defaults

- GIVEN a document with `kind: 'print'`
- WHEN the default feature config is derived
- THEN `animations` and `transforms3d` are `false`

#### Scenario: Host override merges with defaults

- GIVEN motion defaults with `animations: true`
- WHEN the host provides `updateFeatureConfig({ animations: false })`
- THEN animations is overridden to `false` while other motion defaults remain

#### Acceptance Criteria

- [ ] Given motion document kind, default feature config enables animations and transforms3d
- [ ] Given static document kind, default feature config disables animations
- [ ] Given print document kind, default feature config disables animations and transforms3d
- [ ] Given a host override, the override merges on top of kind-derived defaults without bypassing schema validation

---

### Requirement: Canvas Settings Shape

`CanvasSettings` MUST contain: `units` (`'px'` | `'mm'` | `'in'`), `viewMode` (`'broadcast'` | `'print'` | `'none'`), `guides` (array of guide lines), `showRulers` (boolean), `originX`/`originY` (ruler origin in px), `perspective` (CSS perspective in px, default 1000), `zoom` (number, 1 = 100%), `panX`/`panY` (pan offset in px), `grid` (grid settings with `gridSize` in mm, `showGrid`, `snapToGrid`, `snapThreshold` in px), `showExperimentalFeatures` (boolean, default `true` so advanced authoring surfaces are discoverable in new editor sessions), and optional `backgroundPdf` (data URI string for PDF background overlay).

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
- [ ] Given a newly initialized editor, `showExperimentalFeatures` defaults to true
- [ ] Given a guide, it has id, type, position, and locked flag
- [ ] Given backgroundPdf is set to a data URI, the canvas renders a PDF background overlay
- [ ] Given backgroundPdf is omitted, no PDF background is rendered

---

### Requirement: Plugin Element Contract

A plugin registration MUST provide `pluginId`, `elementType`, plugin payload schema version, label, and an authorized renderer factory. Optional fields are a safe icon, typed canonical plugin-element defaults, property panel, and capability overrides. Creation MUST produce `kind: 'plugin'` with inert JSON payload and optional preview asset; registration MUST NOT add arbitrary core element discriminants.

#### Scenario: Plugin registers a plugin element schema

- GIVEN a plugin with `pluginId: 'com.example.clock'`, `elementType: 'countdown'`, `label: 'Countdown Timer'`, and a renderer factory
- WHEN the plugin is registered via EditorConfig
- THEN canonical plugin elements with that plugin identity can be created, rendered in the authorized sandbox, and edited

#### Scenario: Plugin with custom property panel

- GIVEN a plugin with a propertyPanel provided
- WHEN a matching canonical plugin element is selected
- THEN the custom property panel is shown in the properties sidebar instead of the default panel

#### Scenario: Plugin with capability overrides

- GIVEN a plugin with `capabilities: { borderRadius: false }`
- WHEN a matching canonical plugin element is selected
- THEN border-radius editing controls are hidden

#### Acceptance Criteria

- [ ] Given a registered plugin, matching canonical plugin variants can be created and rendered
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

The system MUST provide bidirectional conversion between pixels, millimeters, and inches using the active document's positive `surface.dpi`. Conversion formulas are `px → mm = px × 25.4 / dpi`, `mm → px = mm × dpi / 25.4`, `px → in = px / dpi`, and `in → px = in × dpi`.

#### Scenario: Pixel to millimeter conversion at 96 DPI

- GIVEN a value of 96 pixels and `surface.dpi: 96`
- WHEN converted to millimeters
- THEN the result is 25.4 mm

#### Scenario: Millimeter to pixel conversion at 96 DPI

- GIVEN a value of 25.4 millimeters and `surface.dpi: 96`
- WHEN converted to pixels
- THEN the result is 96 px

#### Scenario: Pixel to millimeter conversion at 300 DPI

- GIVEN a value of 300 pixels and `surface.dpi: 300`
- WHEN converted to millimeters
- THEN the result is 25.4 mm

#### Acceptance Criteria

- [ ] Given 96 pixels at 96 DPI, conversion to millimeters yields 25.4
- [ ] Given 25.4 millimeters at 96 DPI, conversion to pixels yields 96
- [ ] Given 300 pixels at 300 DPI, conversion to millimeters yields 25.4
- [ ] Given a document's `surface.dpi`, conversions use that value instead of a hardcoded default

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

### Requirement: Color Parsing at the UI Boundary

Color controls MUST accept 3/4/6/8-digit hex, `rgb()`, `rgba()`, `hsl()`, `hsla()`, and CSS named colors as UI input. Before project mutation, input MUST be parsed into a typed concrete `ColorValue` with authoritative sRGB channels and alpha. Transport strings MUST NOT be persisted as canonical color values.

#### Scenario: CSS named color is normalized

- GIVEN a color value `red`
- WHEN it enters the document model
- THEN it commits `{ kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 }`

#### Scenario: rgb() color is normalized

- GIVEN a color value `rgb(255, 128, 0)`
- WHEN it enters the document model
- THEN it commits an sRGB `ColorValue` with channels `[1, 128 / 255, 0]` and alpha 1

#### Scenario: hsl() color is normalized

- GIVEN a color value `hsl(120, 100%, 50%)`
- WHEN it enters the document model
- THEN it commits an sRGB `ColorValue` with channels `[0, 1, 0]` and alpha 1

#### Scenario: 3-digit hex is expanded

- GIVEN a color value `#abc`
- WHEN it enters the document model
- THEN it commits the equivalent typed sRGB channels and alpha 1

#### Scenario: 6-digit hex is stored unchanged

- GIVEN a color value `#aabbcc`
- WHEN it enters the document model
- THEN parsing commits the equivalent typed sRGB channels without precision loss at 8-bit input fidelity

#### Acceptance Criteria

- [ ] Given a CSS named color, parsing produces a typed sRGB color
- [ ] Given an rgb() color value, parsing produces equivalent typed channels
- [ ] Given an hsl() color value, parsing produces equivalent typed channels
- [ ] Given 3/4/6/8-digit hex, parsing preserves equivalent channel and alpha values
- [ ] Given invalid color text, parsing reports an error and commits no project mutation

---

### Requirement: Exact Frame Rate Configuration

A motion document's rational `timebase.frameRate` defines authoring time. Supported presets MAY include 24000/1001, 24/1, 25/1, 30000/1001, 30/1, 50/1, 60000/1001, and 60/1, but arbitrary reduced positive rationals remain valid when `ticksPerSecond` makes every frame start integral. Timeline display MAY show frame numbers and derived clock time; keyframes persist only exact integer ticks.

#### Scenario: Default frame rate

- GIVEN a new motion-document preset with no host rate override
- WHEN its canonical timebase is created
- THEN the preset uses reduced `50/1` with an exact compatible tick rate

#### Scenario: Valid frame rate accepted

- GIVEN a requested preset rate of 30000/1001 and compatible `ticksPerSecond`
- WHEN validation runs
- THEN the value is accepted

#### Scenario: Non-standard frame rate rejected

- GIVEN a non-reduced rate of 60000/2002
- WHEN validation runs
- THEN validation fails because the rational is not reduced

#### Scenario: Frame-to-tick conversion

- GIVEN `frameRate: { numerator: 25, denominator: 1 }` and `ticksPerSecond: 1000`
- WHEN frame 10 is converted to ticks
- THEN the result is exactly 400 ticks

#### Acceptance Criteria

- [ ] Given the default motion preset, its rational rate is reduced 50/1 and frame starts are exact ticks
- [ ] Given supported preset rationals with compatible tick rates, validation succeeds
- [ ] Given a non-reduced or non-positive rational, validation fails
- [ ] Given a frame rate and frame number, conversion returns the exact integer tick

---

### Requirement: Safe Area Configuration

The document `surface.broadcastSafeAreas` array MUST support named broadcast safety regions with four percentage insets `[top, right, bottom, left]`. Each percentage value MUST be in the range 0–50. A host new-document preset supplies these defaults when the array is initially created:

| Name        | Insets (%)           | Standard |
| ----------- | -------------------- | -------- |
| Action Safe | [3.5, 3.5, 3.5, 3.5] | EBU R95  |
| Title Safe  | [5, 5, 5, 5]         | EBU R95  |

Safe area overlays are rendered by the editor canvas as non-printing guides. The preflight `title-safe` rule MUST use the `titleSafe` inset values (or 5% default) for its boundary check.

#### Scenario: Default safe areas

- GIVEN a new document preset with no safe-area override
- WHEN safe areas are resolved
- THEN two default areas are provided: Action Safe ([3.5, 3.5, 3.5, 3.5]) and Title Safe ([5, 5, 5, 5])

#### Scenario: Custom safe areas

- GIVEN `surface.broadcastSafeAreas` contains `{ name: 'Graphics Safe', insets: [5, 5, 10, 20] }`
- WHEN safe areas are resolved
- THEN the custom safe area is available alongside actionSafe and titleSafe

#### Scenario: Inset validation

- GIVEN a safe area with an inset value of 60
- WHEN validation runs
- THEN validation fails — each inset must be 0–50

#### Acceptance Criteria

- [ ] Given a new document preset without overrides, default Action Safe and Title Safe entries are created
- [ ] Given custom safe areas, they appear alongside the standard areas
- [ ] Given a safe area inset outside 0–50, validation fails
- [ ] Given safe areas, overlays are rendered as non-printing guides on the editor canvas

---

### Requirement: Content Template Configuration

The editor config MUST support an optional `templates` array providing pre-built canonical v1 document templates. Each entry MUST contain unique `id`, display `name`, `category`, thumbnail URL, and a complete `BroadsetDocumentV1` plus every project resource dependency required to instantiate it. Templates are presented in the New Document flow and are read-only. Categories sort alphabetically; templates within a category retain array order. Instantiation assigns fresh document/entity IDs where duplication requires them and passes whole-project semantic validation.

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
- [ ] Given a template selection, a complete canonical document and its required project resources are instantiated with valid identity

---

### Requirement: Component Definitions and Instances

Creating a component MUST write a document-owned `ComponentDefinition` with component-local elements, root IDs, sequences, and typed exposed properties. Instantiation creates a `component-instance` element referencing the component ID and storing only sparse type-compatible values addressed by exposed-property ID. Definition structure and defaults propagate; intentional instance values remain. Unlink materializes the resolved instance into ordinary document elements with fresh IDs in one atomic transaction.

#### Scenario: Create component from group

- GIVEN a group element with children selected for component creation
- WHEN the command commits
- THEN a document-owned component definition with fresh stable ID and component-local elements is created

#### Scenario: Create instance

- GIVEN a component definition with `id: 'cmp-1'`
- WHEN a `component-instance` element referencing `cmp-1` is created
- THEN resolution expands the definition structure and appearance

#### Scenario: Content override on instance

- GIVEN an instance with an exposed text property
- WHEN its value is changed
- THEN the sparse exposed-property value is stored on the instance and does not affect the definition default

#### Scenario: Master structure change propagates

- GIVEN a component definition that adds a new local element
- WHEN instances are resolved
- THEN all instances gain the new child element

#### Scenario: Unlink instance

- GIVEN a component-instance element
- WHEN unlink commits
- THEN its fully resolved structure becomes ordinary document elements with fresh IDs and equivalent visible semantics

#### Acceptance Criteria

- [ ] Given a document-owned component definition, it can be instantiated by ID
- [ ] Given a component instance, resolution inherits definition structure and defaults
- [ ] Given an exposed-property value, it does not alter the definition default
- [ ] Given a definition structure change, all instances reflect it unless a schema-approved sparse value applies
- [ ] Given unlink, ordinary elements with fresh IDs preserve resolved semantics atomically

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Runtime config validation with error messages → see `project/spec/editor/editing.md`
- Feature config impact on rendered UI → see `project/spec/ui/spec.md`
- Canvas settings mutation via store actions → see `project/spec/editor/store-actions.md`
