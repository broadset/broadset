# Demo — Editor Configuration Specification

## Purpose

Defines the EditorConfig that the demo host application provides to the editor engine: font list, color palette, document size presets, required elements, media source, custom component plugins, grid defaults, undo limits, and change stream callback. This spec ensures any developer can reconstruct the demo's configuration from these contracts. It does NOT define EditorConfig type shape (→ `project/spec/model/config.md`) or how config is validated (→ `project/spec/editor/editing.md`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Font Configuration

The demo MUST configure at least 5 web fonts with downloadable URLs. Font families MUST include a mix of sans-serif and serif typefaces.

#### Scenario: Fonts available

- GIVEN the demo EditorConfig
- WHEN the font list is inspected
- THEN at least 5 fonts are configured, each with a family name and a URL

#### Acceptance Criteria

- [ ] Given the demo config, at least 5 web fonts are configured with family and URL
- [ ] Given the configured fonts, they include both sans-serif and serif typefaces

---

### Requirement: Default Color Palette

The demo MUST configure a default palette with at least 8 colors including black (`#000000`) and white (`#ffffff`).

#### Scenario: Palette contents

- GIVEN the demo EditorConfig
- WHEN the default palette is inspected
- THEN at least 8 CSS color strings are present including black and white

#### Acceptance Criteria

- [ ] Given the demo config, the default palette has at least 8 colors
- [ ] Given the palette, black and white are included

---

### Requirement: Document Size Presets

The demo MUST include presets covering at least five categories: Broadcast, Print, Social Media, Commercial, and Large Format. Each preset MUST specify: name, category, width, height, units (`'px'` or `'mm'`), and viewMode (`'broadcast'` or `'print'`).

**Minimum Preset Categories:**

| Category     | Example presets                                  |
| ------------ | ------------------------------------------------ |
| Broadcast    | 1080p (1920×1080), 720p, 4K UHD                  |
| Print        | A4, A3, Letter, Tabloid                          |
| Social Media | Instagram Post, Facebook Cover, Twitter/X Header |
| Commercial   | Billboard, Banner ad, Leaderboard                |
| Large Format | Poster, Roll-up, Exhibition panel                |

#### Scenario: Preset categories

- GIVEN the demo EditorConfig
- WHEN document size presets are inspected
- THEN at least one preset exists for Broadcast, Print, Social Media, Commercial, and Large Format categories

#### Acceptance Criteria

- [ ] Given the demo config, at least one preset exists per category (Broadcast, Print, Social Media, Commercial, Large Format)
- [ ] Given each preset, it specifies name, category, width, height, units, and viewMode (`'broadcast'`, `'print'`, or `'none'`)

---

### Requirement: Required Elements

The demo MUST configure at least one required element that cannot be deleted by the user (e.g., score overlay elements for live sports).

#### Scenario: Required elements prevent deletion

- GIVEN the demo EditorConfig
- WHEN required elements are inspected
- THEN at least one element with type and id is listed as required

#### Acceptance Criteria

- [ ] Given the demo config, at least one required element ID is configured

---

### Requirement: Media Source Configuration

The demo MUST configure a media source providing sample assets for the media library modal.

#### Scenario: Media source available

- GIVEN the demo EditorConfig
- WHEN the media source is inspected
- THEN a media source config is present with sample assets

#### Acceptance Criteria

- [ ] Given the demo config, a media source is configured with sample assets

---

### Requirement: Custom Component Plugin

The demo MUST register at least one custom component plugin with: type identifier, display label, SVG icon markup, rendererFactory, propertyPanel, defaults (width, height, content), and capabilities.

#### Scenario: Custom plugin registered

- GIVEN the demo EditorConfig
- WHEN the components list is inspected
- THEN at least one plugin is registered with all required fields

#### Scenario: Plugin appears in element toolbar

- GIVEN a custom plugin registered in config
- WHEN the element toolbar renders
- THEN the plugin's type appears as an additional element button

#### Acceptance Criteria

- [ ] Given the demo config, at least one custom component plugin is registered
- [ ] Given the plugin, it provides type, label, icon, rendererFactory, propertyPanel, defaults, and capabilities
- [ ] Given the plugin, its type appears in the element toolbar

---

### Requirement: Change Stream Logging

The demo MUST configure an `onChanges` callback that logs each batch of document changes to the browser console with a running count.

#### Scenario: Changes logged

- GIVEN the editor emits a batch of 3 changes
- WHEN the onChanges callback fires
- THEN the console shows the batch and a cumulative change count

#### Acceptance Criteria

- [ ] Given document changes, each batch is logged to the console with a cumulative count

---

### Requirement: Grid and Undo Defaults

The demo MUST configure grid defaults (gridSize=10, showGrid=false, snapToGrid=true, snapThreshold=5) and a maximum undo history of 50 steps.

#### Scenario: Grid defaults

- GIVEN the demo EditorConfig
- WHEN grid defaults are inspected
- THEN gridSize is 10, showGrid is false, snapToGrid is true, snapThreshold is 5

#### Acceptance Criteria

- [ ] Given the demo config, grid defaults are gridSize=10, snapToGrid=true
- [ ] Given the demo config, maxUndoSteps is 50

---

## Spec Gaps

- **viewMode `'none'`:** The existing spec limits viewMode to `'broadcast'` or `'print'`, but Social Media and Commercial presets are neither broadcast nor print. The `DocumentPreset` type and canvas system support `'none'` as a third mode, which disables broadcast/print-specific features (safe areas, bleed). Presets in non-broadcast/non-print categories SHOULD use `mode: 'none'`.
- **Required elements are IDs:** The acceptance criterion mentions "type and id" but the EditorConfig schema (`requiredElements: z.array(z.string())`) and the editor store enforce deletion prevention by **element ID only**. The element's type is implicit — it is determined by the element with that ID in the document. The config array is therefore `string[]` of element IDs, not `{type, id}` objects.

---

## Non-Goals

- EditorConfig type shape and constraints → see `project/spec/model/config.md`
- Runtime config validation → see `project/spec/editor/editing.md`
- Component plugin rendering internals → see `project/spec/renderer/spec.md`
