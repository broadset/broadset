# BroadsetProject — JSON Format Reference

## Purpose

Defines the complete `BroadsetProject` JSON structure that every implementation MUST produce and accept. This is the authoritative field-level reference — all implementations MUST conform to these shapes and constraints. For behavioral invariants and validation rules see [spec.md](spec.md) and [project.md](project.md).

Spatial values are in the document's declared `canvas.unit` (`'px'`, `'mm'`, or `'in'`). Screen-mode documents default to pixels. Documents are validated with Zod at load time — invalid data is rejected.

---

## Table of Contents

1. [Project Root](#1-project-root)
2. [Project Settings](#2-project-settings)
3. [Assets](#3-assets)
4. [Documents](#4-documents)
5. [Canvas](#5-canvas)
6. [Elements](#6-elements)
7. [Element Types](#7-element-types)
8. [Element Style](#8-element-style)
9. [Data Schema](#9-data-schema)
10. [Pages (Override Layers)](#10-pages-override-layers)
11. [Animations](#11-animations)
12. [Timelines & Keyframes](#12-timelines--keyframes)
13. [States & Modifiers](#13-states--modifiers)
14. [Output Specification](#14-output-specification)
15. [Validation Constraints](#15-validation-constraints)
16. [Unit Conversions](#16-unit-conversions)
17. [Complete Minimal Example](#17-complete-minimal-example)
18. [Full Example with Animations](#18-full-example-with-animations)

---

## 1. Project Root

```jsonc
{
  "$schema": "https://schema.broadset.dev/v1/project.json",  // Optional
  "schemaVersion": 1,                   // Required, positive integer
  "id": "<unique-string>",             // Required, non-empty
  "name": "My Show",                   // Required
  "createdAt": "2026-04-05T12:00:00Z", // ISO 8601
  "updatedAt": "2026-04-05T12:00:00Z", // ISO 8601
  "settings": { ... },                 // Required — ProjectSettings
  "assets": [ ... ],                   // Required (can be empty array)
  "documents": [ ... ],                // Required, at least 1 document
  "templateGroups": [ ... ],            // Optional — multi-format variant links
  "extensions": { ... }                // Optional — vendor extensions
}
```

| Field            | Type                      | Required | Description                                               |
| ---------------- | ------------------------- | -------- | --------------------------------------------------------- |
| `$schema`        | `string`                  | No       | JSON Schema URL for cross-platform validation.            |
| `schemaVersion`  | `number`                  | Yes      | Format version. Initial value: `1`.                       |
| `id`             | `string`                  | Yes      | Unique project identifier, non-empty.                     |
| `name`           | `string`                  | Yes      | Human-readable project name.                              |
| `createdAt`      | `string`                  | Yes      | ISO 8601 timestamp.                                       |
| `updatedAt`      | `string`                  | Yes      | ISO 8601 timestamp.                                       |
| `settings`       | `ProjectSettings`         | Yes      | Fonts, palette, default document mode.                    |
| `assets`         | `Asset[]`                 | Yes      | Centralized media library.                                |
| `documents`      | `BroadsetDocument[]`      | Yes      | At least one document.                                    |
| `templateGroups` | `TemplateGroup[]`         | No       | Multi-format variant links. See [project.md](project.md). |
| `extensions`     | `Record<string, unknown>` | No       | Vendor extensions (reverse-domain keys).                  |

**TemplateGroup:**

```jsonc
{
  "templateGroups": [
    {
      "groupId": "tg-scorebug",
      "name": "Scorebug",
      "members": [
        { "documentId": "doc-hd", "role": "16:9", "label": "HD Primary" },
        { "documentId": "doc-vertical", "role": "9:16", "label": "Social Vertical" },
        { "documentId": "doc-square", "role": "1:1", "label": "Instagram" },
      ],
    },
  ],
}
```

| Field     | Type                    | Required | Description                |
| --------- | ----------------------- | -------- | -------------------------- |
| `groupId` | `string`                | Yes      | Unique within project.     |
| `name`    | `string`                | Yes      | Human-readable group name. |
| `members` | `TemplateGroupMember[]` | Yes      | At least 1 member.         |

**TemplateGroupMember:**

| Field        | Type     | Required | Description                                               |
| ------------ | -------- | -------- | --------------------------------------------------------- |
| `documentId` | `string` | Yes      | References a document in the project.                     |
| `role`       | `string` | Yes      | `"16:9"` \| `"9:16"` \| `"1:1"` \| `"4:3"` \| `"custom"`. |
| `label`      | `string` | No       | Human-readable label.                                     |

**File format:** `.bsp` extension, MIME `application/vnd.broadset.project+json`. May be plain JSON or a ZIP container (see [assets.md](assets.md)).

---

## 2. Project Settings

```jsonc
{
  "fonts": [
    {
      "family": "Roboto",
      "variants": [
        { "weight": 400, "style": "normal" },
        { "weight": 700, "style": "normal" },
        { "weight": 400, "style": "italic" },
      ],
      "source": { "kind": "url", "url": "https://fonts.example.com/roboto.woff2" },
    },
  ],
  "palette": ["#ff0000", "#00ff00", "#0000ff"],
  "defaultDocumentMode": "screen",
}
```

| Field                 | Type                  | Required | Description                                      |
| --------------------- | --------------------- | -------- | ------------------------------------------------ |
| `fonts`               | `FontDefinition[]`    | Yes      | Available fonts (empty = fallback system fonts). |
| `palette`             | `string[]`            | Yes      | Brand color palette (CSS color strings).         |
| `defaultDocumentMode` | `"screen" \| "print"` | Yes      | Default mode for new documents.                  |

**FontDefinition:**

| Field      | Type            | Required | Description                                                               |
| ---------- | --------------- | -------- | ------------------------------------------------------------------------- |
| `family`   | `string`        | Yes      | CSS font-family name.                                                     |
| `variants` | `FontVariant[]` | Yes      | Available weight/style combinations.                                      |
| `source`   | `FontSource`    | No       | `{kind:'system'}`, `{kind:'url',url:…}`, or `{kind:'assetId',assetId:…}`. |

**FontVariant:** `{ weight: 100–900, style: 'normal' | 'italic' }`

---

## 3. Assets

Centralized media library. See [assets.md](assets.md) for full spec.

```jsonc
{
  "assets": [
    {
      "id": "asset-logo",
      "name": "Company Logo",
      "kind": "image",
      "mimeType": "image/png",
      "source": { "type": "url", "url": "https://cdn.example.com/logo.png" },
    },
    {
      "id": "asset-font-bold",
      "name": "Roboto Bold",
      "kind": "font",
      "mimeType": "font/woff2",
      "source": { "type": "file", "path": "assets/roboto-bold.woff2" },
    },
  ],
}
```

| Field           | Type                      | Required | Description                                                            |
| --------------- | ------------------------- | -------- | ---------------------------------------------------------------------- |
| `id`            | `string`                  | Yes      | Unique asset ID.                                                       |
| `name`          | `string`                  | Yes      | Display name.                                                          |
| `kind`          | `string`                  | Yes      | `'image'`, `'video'`, `'font'`, `'audio'`, `'data'`.                   |
| `mimeType`      | `string`                  | Yes      | MIME type.                                                             |
| `source`        | `AssetSource`             | Yes      | `{type:'url',url}`, `{type:'embedded',dataUri}`, `{type:'file',path}`. |
| `fileSizeBytes` | `number`                  | No       | File size.                                                             |
| `metadata`      | `Record<string, unknown>` | No       | Asset-specific metadata (dimensions, duration, etc.).                  |

---

## 4. Documents

Each project contains one or more documents:

```jsonc
{
  "id": "doc-scorebug",
  "name": "Scorebug",
  "documentMode": "screen",
  "canvas": { ... },
  "elements": [ ... ],          // Document-level flat element array
  "animations": [ ... ],        // Animation definitions per element
  "pages": [ ... ],             // Override layers (at least 1)
  "dataSchema": { ... },        // Data binding contract
  "output": { ... },            // Optional broadcast output spec
  "extensions": { ... }         // Optional vendor extensions
}
```

| Field          | Type                      | Required | Description                              |
| -------------- | ------------------------- | -------- | ---------------------------------------- |
| `id`           | `string`                  | Yes      | Unique document ID, non-empty.           |
| `name`         | `string`                  | Yes      | Human-readable name.                     |
| `documentMode` | `"screen" \| "print"`     | Yes      | Immutable after creation.                |
| `canvas`       | `Canvas`                  | Yes      | Dimensions, unit, DPI, safe areas.       |
| `elements`     | `BroadsetElement[]`       | Yes      | The template's element set (flat array). |
| `animations`   | `AnimationDefinition[]`   | Yes      | Animation configs (can be empty `[]`).   |
| `pages`        | `Page[]`                  | Yes      | At least one page (override layers).     |
| `dataSchema`   | `DataSchema`              | Yes      | Data binding contract.                   |
| `output`       | `OutputSpec`              | No       | Broadcast output constraints.            |
| `extensions`   | `Record<string, unknown>` | No       | Vendor extensions.                       |

**Key change from legacy format:** Elements are on the **document**, not on pages. Pages are lightweight override layers, not independent artboards.

---

## 5. Canvas

Spatial values are in the declared `unit`.

```jsonc
{
  "width": 1920,
  "height": 1080,
  "unit": "px",
  "dpi": 96,
  "padding": [0, 0, 0, 0],
  "backgroundColor": "#000000",
  "backgroundGradient": {
    "type": "linear",
    "angle": 90,
    "stops": [
      { "color": { "kind": "rgb", "hex": "#FF0000" }, "position": 0 },
      { "color": { "kind": "rgb", "hex": "#0000FF" }, "position": 100 },
    ],
  },
  "backgroundMode": "transparent",
  "safeAreas": {
    "actionSafe": [3.5, 3.5, 3.5, 3.5],
    "titleSafe": [5, 5, 5, 5],
    "custom": [{ "name": "bug-area", "insets": [5, 5, 90, 80] }],
  },
}
```

| Field                | Type                                     | Required | Default        | Description                                                                                 |
| -------------------- | ---------------------------------------- | -------- | -------------- | ------------------------------------------------------------------------------------------- |
| `width`              | `number`                                 | Yes      | —              | Positive (> 0).                                                                             |
| `height`             | `number`                                 | Yes      | —              | Positive (> 0).                                                                             |
| `unit`               | `"px" \| "mm" \| "in"`                   | Yes      | —              | Unit for all spatial values.                                                                |
| `dpi`                | `number`                                 | Yes      | 96 / 300       | 96 for screen, 300 for print.                                                               |
| `padding`            | `[n, n, n, n]`                           | Yes      | `[0,0,0,0]`    | Top, right, bottom, left.                                                                   |
| `backgroundColor`    | `string`                                 | No       | —              | CSS color string for solid backgrounds and gradient fallback.                               |
| `backgroundGradient` | `BroadsetGradient`                       | No       | —              | Structured gradient used when `backgroundMode` is `"gradient"`; required for gradient mode. |
| `backgroundMode`     | `"transparent" \| "solid" \| "gradient"` | No       | mode-dependent | `transparent` for screen, `solid` for print.                                                |
| `safeAreas`          | `SafeAreas`                              | No       | —              | Safe area insets (percentage, 0–50).                                                        |

**Common canvas sizes:**

| Use Case            | Unit | Width | Height |
| ------------------- | ---- | ----- | ------ |
| Full HD (1920×1080) | px   | 1920  | 1080   |
| 4K UHD (3840×2160)  | px   | 3840  | 2160   |
| 720p (1280×720)     | px   | 1280  | 720    |
| A4 Portrait         | mm   | 210   | 297    |
| A4 Landscape        | mm   | 297   | 210    |
| US Letter           | in   | 8.5   | 11     |

---

## 6. Elements

Every element on a document has this shape. **No `screen` object** — its concerns have been redistributed.

```jsonc
{
  "id": "el-title", // Required, non-empty, unique within document
  "type": "text", // Required (see Element Types)
  "name": "Title", // Required — display name (was screen.name)
  "locked": false, // Required — edit lock (was screen.locked)
  "position": { "x": 80, "y": 40 }, // Required (canvas units)
  "width": 800, // Required, positive
  "height": 140, // Required, positive
  "rotation": 0, // Required (degrees)
  "content": "<b>Broadset Demo</b>", // Required (type-specific)
  "style": { "opacity": 1 }, // Required (see Element Style)
  "parentId": null, // Required (string | null)
  "groupId": null, // Required (string | null)
  "assetId": null, // Optional — asset library reference
  "dataField": null, // Optional — data binding
  "visibleWhen": null, // Optional — conditional visibility expression
  "repeater": null, // Optional — repeater config
  "typeConfig": null, // Optional — type-specific config (video/clock/ticker)
  "componentRef": null, // Optional — component instance link
  "autoSize": "fixed", // Optional — text auto-sizing mode
  "textPathElementId": null, // Optional — text-on-path binding
  "booleanOperation": null, // Optional — boolean shape op (group only)
  "extensions": {}, // Optional — vendor extensions
}
```

| Field               | Type                      | Required | Default   | Description                                                      |
| ------------------- | ------------------------- | -------- | --------- | ---------------------------------------------------------------- |
| `id`                | `string`                  | Yes      | —         | Unique within document.                                          |
| `type`              | `string`                  | Yes      | —         | Built-in or plugin type.                                         |
| `name`              | `string`                  | Yes      | `""`      | Display name in layer panel.                                     |
| `locked`            | `boolean`                 | Yes      | `false`   | Prevents editing in UI.                                          |
| `position`          | `{x, y}`                  | Yes      | —         | Canvas units. Can be negative.                                   |
| `width`             | `number`                  | Yes      | —         | Positive (> 0).                                                  |
| `height`            | `number`                  | Yes      | —         | Positive (> 0).                                                  |
| `rotation`          | `number`                  | Yes      | `0`       | Degrees, any finite number.                                      |
| `content`           | `string`                  | Yes      | `""`      | Type-specific payload.                                           |
| `style`             | `ElementStyle`            | Yes      | —         | Visual properties (see below).                                   |
| `parentId`          | `string \| null`          | Yes      | `null`    | Structural parent element ID.                                    |
| `groupId`           | `string \| null`          | Yes      | `null`    | Selection group ID.                                              |
| `assetId`           | `string \| null`          | No       | `null`    | References project asset by ID.                                  |
| `dataField`         | `DataField \| null`       | No       | `null`    | Data binding. See [data-schema.md](data-schema.md).              |
| `visibleWhen`       | `string \| null`          | No       | `null`    | Boolean expression over data schema fields.                      |
| `repeater`          | `RepeaterConfig \| null`  | No       | `null`    | Replicate for array data items.                                  |
| `typeConfig`        | `object \| null`          | No       | `null`    | Type-specific config (video/clock/ticker).                       |
| `componentRef`      | `ComponentRef \| null`    | No       | `null`    | Component instance link.                                         |
| `autoSize`          | `string`                  | No       | `"fixed"` | `"fixed"`, `"auto-height"`, `"shrink-to-fit"`.                   |
| `textPathElementId` | `string \| null`          | No       | `null`    | ID of path element for text-on-path.                             |
| `booleanOperation`  | `string \| null`          | No       | `null`    | `"union"`, `"subtract"`, `"intersect"`, `"exclude"`. Group only. |
| `extensions`        | `Record<string, unknown>` | No       | `{}`      | Vendor extensions.                                               |

**Position coordinates:** Relative to parent if `parentId` is set, otherwise relative to canvas origin (top-left).

**Playback state:** Visibility (`onscreen`/`offscreen`), `activeState`, and `modifiers` are **runtime-only** — never serialized in the document model.

---

## 7. Element Types

### Built-in Types (11 total)

| Type          | `content` Contains                       | Description                                                                                       |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `"text"`      | Rich text HTML or plain text             | Full typography styling. Allowed HTML: `<b>`, `<i>`, `<u>`, `<br>`, `<span>`, `<strong>`, `<em>`. |
| `"image"`     | URL or data URI (empty = placeholder)    | Rendered as `<img>`. Supports object-fit.                                                         |
| `"svg"`       | Inline SVG markup or URL                 | Raw SVG injection or image loading.                                                               |
| `"path"`      | SVG path `d` attribute string            | Rendered as `<path>` in SVG. Stroke/fill styling.                                                 |
| `"rectangle"` | _(empty)_                                | Styled `<div>`. Background, border, radius.                                                       |
| `"ellipse"`   | _(empty)_                                | Styled `<div>` with `border-radius: 50%`.                                                         |
| `"qrcode"`    | Text/URL to encode                       | QR code SVG. 1:1 aspect ratio.                                                                    |
| `"group"`     | _(empty)_                                | Container. Children via `parentId`. May have background/border (appearance).                      |
| `"video"`     | Video source URL                         | Rendered as `<video>`. Uses `typeConfig`.                                                         |
| `"clock"`     | Time format pattern (e.g., `'HH:mm:ss'`) | Real-time, countdown, stopwatch. Uses `typeConfig`.                                               |
| `"ticker"`    | JSON array of strings                    | Scrolling ticker. Uses `typeConfig`.                                                              |

### Type-Specific Configuration (`typeConfig`)

**Video:**

```jsonc
{ "loop": false, "autoplay": true, "muted": true, "startTimeS": 0, "endTimeS": null }
```

**Clock:**

```jsonc
{ "mode": "realtime", "startValue": null, "targetValue": null, "countdownTo": null }
```

Modes: `"realtime"`, `"countdown"`, `"countup"`, `"stopwatch"`.
`countdownTo`: ISO 8601 datetime (e.g., `"2026-04-05T15:00:00Z"`) — when set, overrides `startValue`/`targetValue` and shows remaining time until target.

**Ticker:**

```jsonc
{ "speed": 60, "direction": "left", "gap": 40, "paused": false }
```

Directions: `"left"`, `"right"`, `"up"`, `"down"`. `speed`: 1–2000 px/s. `gap`: ≥ 0 px.

### Capability Matrix

| Capability        | text | rect | ellipse | image | svg | path | qrcode | group | video | clock | ticker |
| ----------------- | :--: | :--: | :-----: | :---: | :-: | :--: | :----: | :---: | :---: | :---: | :----: |
| borderRadius      |  ✓   |  ✓   |         |   ✓   |  ✓  |      |        |       |   ✓   |       |        |
| typography        |  ✓   |      |         |       |     |      |        |       |       |   ✓   |   ✓    |
| appearance        |  ✓   |  ✓   |    ✓    |   ✓   |  ✓  |      |        |   ✓   |   ✓   |   ✓   |   ✓    |
| boxEffects        |  ✓   |  ✓   |    ✓    |   ✓   |  ✓  |      |        |       |   ✓   |   ✓   |   ✓    |
| clipPath          |      |  ✓   |    ✓    |   ✓   |  ✓  |      |        |   ✓   |   ✓   |       |        |
| objectFit         |      |      |         |   ✓   |  ✓  |      |        |       |   ✓   |       |        |
| svgStrokeFill     |      |      |         |       |     |  ✓   |        |       |       |       |        |
| pathEditing       |      |      |         |       |     |  ✓   |        |       |       |       |        |
| squareConstrained |      |      |         |       |     |      |   ✓    |       |       |       |        |

---

## 8. Element Style

The `style` object controls visual appearance. Only `opacity` is required. **Masking, clipping, and 3D transforms are now part of style** (formerly on the `screen` object).

```jsonc
{
  // ── Required ──────────────────────────────────────
  "opacity": 1,                          // 0.0 – 1.0

  // ── Typography ────────────────────────────────────
  "fontFamily": "Roboto",               // CSS font-family
  "fontSize": 16,                        // Positive number
  "fontColor": "#ffffff",                // CSS color
  "fontWeight": 700,                     // 100–900 (NUMERIC, not string)
  "fontStyle": "normal",                 // "normal" | "italic" | "oblique"
  "textAlignment": "center",            // "left" | "center" | "right" | "justify"
  "textDecoration": "underline",         // CSS text-decoration
  "textTransform": "uppercase",          // CSS text-transform
  "letterSpacing": 2,                    // NUMERIC (document units, not CSS string)
  "lineHeight": 1.5,                    // number or string
  "wordSpacing": 4,                      // NUMERIC (document units, not CSS string)
  "textStroke": "1px black",            // CSS text-stroke shorthand
  "textShadow": "2px 2px 4px rgba(0,0,0,0.5)",

  // ── Background & Border ───────────────────────────
  "backgroundColor": "#1a1a2e",          // CSS color
  "backgroundGradient": { ... },         // BroadsetGradient object or CSS string
  "borderWidth": 2,                      // Non-negative (px)
  "borderColor": "#000000",
  "borderRadius": 8,                     // number OR [tl, tr, br, bl] tuple
  "borderStyle": "solid",               // "none"|"solid"|"dashed"|"dotted"|"double"|...
  "padding": [8, 16, 8, 16],            // [top, right, bottom, left] NUMERIC TUPLE

  // ── Box Effects ───────────────────────────────────
  "boxShadow": "0 4px 6px rgba(0,0,0,0.3)",
  "filter": "blur(2px)",
  "backdropFilter": "blur(10px)",
  "mixBlendMode": "multiply",           // typed union of CSS blend modes
  "isolation": "isolate",               // "auto" | "isolate"

  // ── Media Layout ──────────────────────────────────
  "objectFit": "cover",                 // "fill"|"contain"|"cover"|"none"|"scale-down"

  // ── SVG Stroke & Fill ─────────────────────────────
  "stroke": "#ffcc00",
  "strokeWidth": 2,
  "strokeDasharray": "5,3",
  "strokeDashoffset": 0,
  "strokeLinecap": "round",             // "butt" | "round" | "square"
  "strokeLinejoin": "round",            // "miter" | "round" | "bevel"
  "strokeOpacity": 1,                    // 0.0 – 1.0
  "fill": "none",
  "fillOpacity": 1,                      // 0.0 – 1.0
  "fillRule": "nonzero",                // "nonzero" | "evenodd"

  // ── Masking & Clipping (moved from screen) ────────
  "maskType": "none",                    // "none"|"alpha"|"luminance"|"custom"
  "customClipPath": "",                  // SVG path d string
  "clipChildren": false,                 // Clip children to group bounds

  // ── 3D Transforms (moved from screen) ─────────────
  "rotateX": 0,                          // degrees
  "rotateY": 0,                          // degrees
  "rotateZ": 0,                          // degrees
  "translateZ": 0,                       // document units

  // ── Vertical Text Alignment ───────────────────────
  "verticalAlignment": "top",            // "top" | "middle" | "bottom"

  // ── Trim Path (path/SVG elements) ─────────────────
  "trimStart": 0,                        // 0.0 – 1.0
  "trimEnd": 1,                          // 0.0 – 1.0
  "trimOffset": 0                        // 0.0 – 1.0
}
```

**Key changes from legacy format:**

- `fontWeight`: **numeric only** (100–900). Use `400` not `"normal"`, `700` not `"bold"`.
- `textAlignment`: typed union `"left"|"center"|"right"|"justify"`, not arbitrary string.
- `borderStyle`: typed union, not arbitrary string.
- `padding`: **numeric 4-tuple** `[top, right, bottom, left]`, not CSS string.
- `letterSpacing`, `wordSpacing`: **numeric values**, not CSS strings like `"2px"`.
- `mixBlendMode`: typed union of CSS blend modes.
- `maskType`, `customClipPath`, `clipChildren`, `rotateX/Y/Z`, `translateZ`: **moved from `screen`** to `style`.

---

## 9. Data Schema

Every document carries a `dataSchema` declaring its data contract. See [data-schema.md](data-schema.md).

```jsonc
{
  "dataSchema": {
    "description": "Sports scoreboard data fields",
    "fields": [
      { "name": "homeTeam", "type": "string", "label": "Home Team Name" },
      { "name": "awayTeam", "type": "string", "label": "Away Team Name" },
      { "name": "homeScore", "type": "number", "label": "Home Score", "defaultValue": 0 },
      { "name": "awayScore", "type": "number", "label": "Away Score", "defaultValue": 0 },
      { "name": "showLogo", "type": "boolean", "label": "Show Logo", "defaultValue": true },
      {
        "name": "standings",
        "type": "array",
        "label": "League Standings",
        "arrayItemSchema": [
          { "name": "team", "type": "string" },
          { "name": "points", "type": "number" },
        ],
      },
    ],
  },
}
```

**Element binding example:**

```jsonc
{
  "id": "el-score",
  "type": "text",
  "content": "0",
  "dataField": {
    "fieldName": "homeScore",
    "overflow": "clip",
    "prefix": "",
    "suffix": " pts",
    "formatPattern": "##,###",
  },
  "visibleWhen": "homeScore > 0",
}
```

---

## 10. Pages (Layout Instances)

Pages define layout variants by explicitly specifying which template elements are used on each page and their per-page transform and visibility properties. Elements are defined once as templates on the document; pages list instances of those elements with page-specific transform and visibility.

```jsonc
{
  "pages": [
    {
      "id": "page-layout-a",
      "name": "Layout A",
      "elements": [
        {
          "elementId": "el-title",
          "transform": {
            "position": { "x": 100, "y": 50, "z": 0 },
            "rotation": { "x": 0, "y": 0, "z": 0 },
            "scale": { "x": 1, "y": 1, "z": 1 },
          },
          "visible": true,
        },
        {
          "elementId": "el-subtitle",
          "transform": {
            "position": { "x": 100, "y": 160, "z": 0 },
            "rotation": { "x": 0, "y": 0, "z": 0 },
            "scale": { "x": 1, "y": 1, "z": 1 },
          },
          "visible": true,
        },
      ],
      "locale": "en-US",
      "extensions": {},
    },
    {
      "id": "page-layout-b",
      "name": "Layout B",
      "elements": [
        {
          "elementId": "el-title",
          "transform": {
            "position": { "x": 150, "y": 100, "z": 0 },
            "rotation": { "x": 0, "y": 0, "z": 0 },
            "scale": { "x": 0.75, "y": 1.2, "z": 1 },
          },
          "visible": true,
        },
      ],
      "locale": "en-US",
    },
  ],
}
```

| Field        | Type                      | Required | Description                                         |
| ------------ | ------------------------- | -------- | --------------------------------------------------- |
| `id`         | `string`                  | Yes      | Unique page ID within document.                     |
| `name`       | `string`                  | Yes      | Human-readable page name.                           |
| `elements`   | `PageElementInstance[]`   | Yes      | Element instances used on this page (can be empty). |
| `locale`     | `string \| null`          | No       | BCP 47 language tag for localization.               |
| `extensions` | `Record<string, unknown>` | No       | Vendor extensions.                                  |

**PageElementInstance** — References a template element and specifies its layout on this page:
| Field | Type | Required | Description |
| ------------ | ---------------------- | -------- | -------------------------------------------------------------------- |
| `elementId` | `string` | Yes | References element ID in document. |
| `transform` | `PageElementTransform` | Yes | Per-page 3D transform (`position`, `rotation`, `scale` vectors). |
| `visible` | `boolean` | Yes | Whether this instance is visible. |

**PageElementTransform**
| Field | Type | Required | Description |
| ----------- | --------- | -------- | ---------------------------------------------------- |
| `position` | `Vector3` | Yes | Position offset relative to canvas origin. |
| `rotation` | `Vector3` | Yes | Rotation in degrees for x, y, and z axes. |
| `scale` | `Vector3` | Yes | Scale multipliers for x, y, and z axes (template-driven sizing). |

## **Hierarchy:** Pages list only root-level elements. Children inherit parentId from template and are positioned relative to parent.

## 11. Animations

Stored as a flat `animations` array on the document. Each entry binds an element to its animation config. **Renamed from `animationRegistry`.**

```jsonc
{
  "animations": [
    {
      "elementId": "el-title",
      "config": {
        "timelines": [ ... ],
        "stateTimelineBindings": [ ... ],
        "modifierTimelineBindings": [ ... ],
        "textAnimator": null
      }
    }
  ]
}
```

At most one entry per element ID. Stale entries (referencing deleted elements) are silently ignored.

### Text Animator (Optional)

Per-character / per-word / per-line staggered animation for text elements.

```jsonc
{
  "textAnimator": {
    "rangeMode": "characters",
    "staggerDelayMs": 50,
    "randomOrder": false,
    "timelineId": "tl-char-in",
  },
}
```

| Field            | Type      | Required | Default | Description                                         |
| ---------------- | --------- | -------- | ------- | --------------------------------------------------- |
| `rangeMode`      | `string`  | Yes      | —       | `"characters"` \| `"words"` \| `"lines"`.           |
| `staggerDelayMs` | `number`  | Yes      | —       | Non-negative delay between segments.                |
| `randomOrder`    | `boolean` | No       | `false` | Shuffle segment order.                              |
| `timelineId`     | `string`  | Yes      | —       | References a timeline in the same animation config. |

See [animation.md](animation.md) — Per-Character Text Animation.

---

## 12. Timelines & Keyframes

### Timeline Structure

```jsonc
{
  "id": "tl-title-in",
  "name": "Title Entrance",
  "durationMs": 500, // Optional explicit duration
  "loop": "none", // "none" | "loop" | "ping-pong"
  "loopCount": null, // null = infinite, or positive integer
  "keyframes": [
    // RENAMED from "entries"
    {
      "name": "start",
      "action": "none",
      "offsetMs": 0,
      "properties": {
        "opacity": { "type": "number", "value": 0, "easing": "linear" },
        "translateX": { "type": "string", "value": "-200px", "easing": "ease-out" },
      },
      "timecodeAnnotation": {
        // Optional
        "timecode": "01:00:00:00",
        "frameRate": 25,
      },
    },
    {
      "name": "end",
      "action": "none",
      "offsetMs": 500,
      "properties": {
        "opacity": { "type": "number", "value": 1, "easing": "ease-out" },
        "translateX": { "type": "string", "value": "0px", "easing": "ease-out" },
      },
    },
  ],
  "childTimelines": {},
  "audioCues": [
    // Optional — audio trigger markers
    {
      "assetId": "asset-whoosh",
      "offsetMs": 0,
      "volume": 0.8,
      "loop": false,
    },
  ],
}
```

### Audio Cue

| Field      | Type      | Required | Default | Description                               |
| ---------- | --------- | -------- | ------- | ----------------------------------------- |
| `assetId`  | `string`  | Yes      | —       | References an audio asset in the project. |
| `offsetMs` | `number`  | Yes      | —       | Non-negative offset within the timeline.  |
| `volume`   | `number`  | No       | `1`     | 0–1 playback volume.                      |
| `loop`     | `boolean` | No       | `false` | Whether audio loops.                      |

See [animation.md](animation.md) — Audio Cue Markers.

### KeyframeValue (Discriminated Union)

**Replaces the former untyped `{ value: string, interpolation: string }` shape.**

```jsonc
// Number (opacity, x, y, width, height, rotation, etc.)
{ "type": "number", "value": 0.5, "easing": "ease-out" }

// Color (fontColor, backgroundColor, stroke, fill, etc.)
{ "type": "color", "value": "#ff0000", "easing": "linear" }

// String (CSS transform, content, etc.)
{ "type": "string", "value": "translateX(0px)", "easing": "ease-out" }

// Tuple (padding, position, etc.)
{ "type": "tuple", "value": [8, 16, 8, 16], "easing": "ease-in-out" }
```

### EasingMode Values

| Value                                                    | Description                |
| -------------------------------------------------------- | -------------------------- |
| `"linear"`                                               | Constant speed             |
| `"ease"`                                                 | Default CSS ease           |
| `"ease-in"`                                              | Accelerating from rest     |
| `"ease-out"`                                             | Decelerating to rest       |
| `"ease-in-out"`                                          | Accelerate then decelerate |
| `"step"`                                                 | Discrete snap (strings)    |
| `"cubic-bezier(x1,y1,x2,y2)"`                            | Custom Bezier curve        |
| `"spring(stiffness,damping,mass)"`                       | Physics spring             |
| `"spring-gentle"` / `"spring-bouncy"` / `"spring-stiff"` | Named presets              |

### Keyframe Actions

| Action             | Payload           | Effect                          |
| ------------------ | ----------------- | ------------------------------- |
| `"none"`           | _(ignored)_       | Pure property animation.        |
| `"setState"`       | State name string | Transitions to the named state. |
| `"addModifier"`    | Modifier name     | Activates the named modifier.   |
| `"removeModifier"` | Modifier name     | Deactivates the named modifier. |

---

## 13. States & Modifiers

### States (Exclusive)

Exactly one state active per element. Reserved: `"IN"` (entrance), `"OUT"` (exit).

```jsonc
{
  "stateTimelineBindings": [
    { "stateName": "IN", "timelineId": "tl-title-in" },
    { "stateName": "OUT", "timelineId": "tl-title-out" },
  ],
}
```

Behavior: Switching X → Y plays Y's timeline. If no OUT defined, IN plays in reverse. If neither defined, instant visibility toggle.

### Modifiers (Additive)

Zero or many active simultaneously.

```jsonc
{
  "modifierTimelineBindings": [
    {
      "modifierName": "pulse",
      "inTimelineId": "tl-pulse-in",
      "outTimelineId": "tl-pulse-out",
    },
  ],
}
```

Adding plays `inTimeline`. Removing plays `outTimeline` (or `inTimeline` in reverse if absent).

---

## 14. Output Specification

Optional broadcast output constraints. See [output-spec.md](output-spec.md).

```jsonc
{
  "output": {
    "frameRate": 25,
    "colorSpace": "rec709",
    "dynamicRange": "sdr",
  },
}
```

| Field          | Type                                       | Description               |
| -------------- | ------------------------------------------ | ------------------------- |
| `frameRate`    | `23.976\|24\|25\|29.97\|30\|50\|59.94\|60` | Standard broadcast rates. |
| `colorSpace`   | `"rec709"\|"rec2020"\|"srgb"`              | Color space.              |
| `dynamicRange` | `"sdr"\|"hlg"\|"pq"`                       | Dynamic range.            |

---

## 15. Validation Constraints

Enforced by Zod at load time. Invalid data is **rejected**.

### Project

- `schemaVersion`: positive integer
- `id`: non-empty string
- `documents`: array with at least 1 document
- `assets`: unique IDs
- `templateGroups`: unique `groupId` values; member `documentId` must reference existing documents
- `templateGroups[].members[].role`: `"16:9"` | `"9:16"` | `"1:1"` | `"4:3"` | `"custom"`

### Document

- `id`: non-empty string
- `documentMode`: exactly `"screen"` or `"print"`
- `elements`: unique IDs within document
- `pages`: array with at least 1 page

### Canvas

- `width`, `height`: positive number (> 0)
- `unit`: exactly `"px"`, `"mm"`, or `"in"`
- `dpi`: positive number
- `padding`: exactly 4-element non-negative tuple

### Elements

- `id`: non-empty string, unique within document
- `type`: non-empty string
- `width`, `height`: positive number (> 0)
- `rotation`: any finite number
- `position.x`, `position.y`: any finite number
- `parentId`: string or `null`; acyclic graph
- `groupId`: string or `null`
- `booleanOperation`: `"union"` | `"subtract"` | `"intersect"` | `"exclude"` | `null` (if present)

### Style

- `opacity`: 0 ≤ value ≤ 1
- `fontWeight`: 100–900 (multiples of 100) — **numeric, not string**
- `textAlignment`: `"left"` | `"center"` | `"right"` | `"justify"`
- `borderStyle`: typed union
- `padding`: 4-tuple of non-negative numbers
- `letterSpacing`, `wordSpacing`: finite numbers
- `fontSize`: positive number (if present)
- `borderWidth`, `strokeWidth`: non-negative number (if present)
- `borderRadius`: non-negative number OR 4-tuple of non-negative numbers
- `strokeOpacity`, `fillOpacity`: 0 ≤ value ≤ 1
- `maskType`: `"none"` | `"alpha"` | `"luminance"` | `"custom"`
- `rotateX`, `rotateY`, `rotateZ`, `translateZ`: finite numbers
- `verticalAlignment`: `"top"` | `"middle"` | `"bottom"` (if present)
- `trimStart`, `trimEnd`, `trimOffset`: 0 ≤ value ≤ 1 (if present)

### Animation

- `offsetMs`: non-negative number (≥ 0)
- `action`: `"none"` | `"setState"` | `"addModifier"` | `"removeModifier"`
- `easing`: valid EasingMode string
- `KeyframeValue.type`: `"number"` | `"color"` | `"string"` | `"tuple"`
- `audioCues[].assetId`: non-empty string (should reference audio asset)
- `audioCues[].volume`: 0 ≤ value ≤ 1
- `textAnimator.rangeMode`: `"characters"` | `"words"` | `"lines"` (if present)
- `textAnimator.staggerDelayMs`: non-negative number (if present)
- `textAnimator.timelineId`: must reference a timeline in the same config (if present)

### Data Schema

- `fields[].name`: identifier-safe, unique within schema
- `fields[].type`: `"string"` | `"number"` | `"boolean"` | `"image"` | `"color"` | `"date"` | `"array"`
- `dataField.fieldName`: must reference existing schema field

### Output

- `frameRate`: one of supported values
- `colorSpace`, `dynamicRange`: valid enum values

---

## 16. Unit Conversions

Spatial values are in the document's `canvas.unit`. To convert between units using `canvas.dpi`:

| Conversion | Formula           |
| ---------- | ----------------- |
| px → mm    | `px × 25.4 / dpi` |
| mm → px    | `mm × dpi / 25.4` |
| px → in    | `px / dpi`        |
| in → px    | `in × dpi`        |
| mm → in    | `mm / 25.4`       |
| in → mm    | `in × 25.4`       |

**Examples (at 96 DPI):**

- 1920 px = 508.0 mm = 20.0 in
- 1080 px = 285.75 mm = 11.25 in
- 210 mm = 794.65 px = 8.27 in

---

## 17. Complete Minimal Example

```json
{
  "schemaVersion": 1,
  "id": "proj-minimal",
  "name": "Minimal Project",
  "createdAt": "2026-04-05T12:00:00Z",
  "updatedAt": "2026-04-05T12:00:00Z",
  "settings": {
    "fonts": [],
    "palette": [],
    "defaultDocumentMode": "screen"
  },
  "assets": [],
  "documents": [
    {
      "id": "doc-1",
      "name": "Simple Template",
      "documentMode": "screen",
      "canvas": {
        "width": 1920,
        "height": 1080,
        "unit": "px",
        "dpi": 96,
        "padding": [0, 0, 0, 0]
      },
      "elements": [
        {
          "id": "title",
          "type": "text",
          "name": "Title",
          "locked": false,
          "position": { "x": 100, "y": 120 },
          "width": 300,
          "height": 50,
          "rotation": 0,
          "content": "Hello World",
          "style": {
            "opacity": 1,
            "fontFamily": "Arial",
            "fontSize": 36,
            "fontColor": "#ffffff",
            "fontWeight": 400,
            "textAlignment": "center"
          },
          "parentId": null,
          "groupId": null
        }
      ],
      "animations": [],
      "pages": [
        {
          "id": "page-default",
          "name": "Default",
          "overrides": []
        }
      ],
      "dataSchema": {
        "fields": []
      }
    }
  ]
}
```

---

## 18. Full Example with Animations

A broadcast scorebug with data binding, page overrides, and state animations:

```json
{
  "schemaVersion": 1,
  "id": "proj-sports",
  "name": "Sports Show",
  "createdAt": "2026-04-05T12:00:00Z",
  "updatedAt": "2026-04-05T12:00:00Z",
  "settings": {
    "fonts": [
      {
        "family": "Roboto",
        "variants": [
          { "weight": 400, "style": "normal" },
          { "weight": 700, "style": "normal" }
        ],
        "source": { "kind": "system" }
      }
    ],
    "palette": ["#1a1a2e", "#e94560", "#ffffff"],
    "defaultDocumentMode": "screen"
  },
  "assets": [
    {
      "id": "asset-logo",
      "name": "Network Logo",
      "kind": "image",
      "mimeType": "image/png",
      "source": { "type": "url", "url": "https://cdn.example.com/logo.png" }
    }
  ],
  "documents": [
    {
      "id": "doc-scorebug",
      "name": "Scorebug",
      "documentMode": "screen",
      "canvas": {
        "width": 1920,
        "height": 1080,
        "unit": "px",
        "dpi": 96,
        "padding": [0, 0, 0, 0],
        "backgroundMode": "transparent",
        "safeAreas": {
          "actionSafe": [3.5, 3.5, 3.5, 3.5],
          "titleSafe": [5, 5, 5, 5]
        }
      },
      "elements": [
        {
          "id": "el-scoreboard-bg",
          "type": "rectangle",
          "name": "Scoreboard BG",
          "locked": false,
          "position": { "x": 48, "y": 48 },
          "width": 576,
          "height": 144,
          "rotation": 0,
          "content": "",
          "style": { "opacity": 0.85, "backgroundColor": "#1a1a2e", "borderRadius": 8, "clipChildren": true },
          "parentId": null,
          "groupId": null
        },
        {
          "id": "el-home-score",
          "type": "text",
          "name": "Home Score",
          "locked": false,
          "position": { "x": 16, "y": 24 },
          "width": 200,
          "height": 56,
          "rotation": 0,
          "content": "HOME 0",
          "style": {
            "opacity": 1,
            "fontFamily": "Roboto",
            "fontSize": 36,
            "fontColor": "#ffffff",
            "fontWeight": 700,
            "textAlignment": "center"
          },
          "parentId": "el-scoreboard-bg",
          "groupId": null,
          "dataField": { "fieldName": "homeScore", "overflow": "clip", "prefix": "HOME ", "formatPattern": "##" }
        },
        {
          "id": "el-logo",
          "type": "image",
          "name": "Network Logo",
          "locked": true,
          "position": { "x": 1720, "y": 30 },
          "width": 160,
          "height": 160,
          "rotation": 0,
          "content": "",
          "style": { "opacity": 1, "borderRadius": 16 },
          "parentId": null,
          "groupId": null,
          "assetId": "asset-logo",
          "visibleWhen": "showLogo == true"
        }
      ],
      "animations": [
        {
          "elementId": "el-scoreboard-bg",
          "config": {
            "timelines": [
              {
                "id": "tl-bg-in",
                "name": "Entrance",
                "keyframes": [
                  {
                    "name": "start",
                    "action": "none",
                    "offsetMs": 0,
                    "properties": {
                      "opacity": { "type": "number", "value": 0, "easing": "linear" },
                      "translateY": { "type": "string", "value": "-100%", "easing": "ease-out" }
                    }
                  },
                  {
                    "name": "end",
                    "action": "none",
                    "offsetMs": 350,
                    "properties": {
                      "opacity": { "type": "number", "value": 0.85, "easing": "ease-out" },
                      "translateY": { "type": "string", "value": "0%", "easing": "ease-out" }
                    }
                  }
                ]
              },
              {
                "id": "tl-bg-out",
                "name": "Exit",
                "keyframes": [
                  {
                    "name": "start",
                    "action": "none",
                    "offsetMs": 0,
                    "properties": {
                      "opacity": { "type": "number", "value": 0.85, "easing": "linear" }
                    }
                  },
                  {
                    "name": "end",
                    "action": "none",
                    "offsetMs": 350,
                    "properties": {
                      "opacity": { "type": "number", "value": 0, "easing": "ease-in" },
                      "translateY": { "type": "string", "value": "-100%", "easing": "ease-in" }
                    }
                  }
                ]
              }
            ],
            "stateTimelineBindings": [
              { "stateName": "IN", "timelineId": "tl-bg-in" },
              { "stateName": "OUT", "timelineId": "tl-bg-out" }
            ],
            "modifierTimelineBindings": []
          }
        }
      ],
      "pages": [
        {
          "id": "page-default",
          "name": "Default",
          "overrides": []
        },
        {
          "id": "page-halftime",
          "name": "Half-Time",
          "overrides": [{ "elementId": "el-home-score", "content": "HALF-TIME" }]
        }
      ],
      "dataSchema": {
        "description": "Live scoreboard data",
        "fields": [
          { "name": "homeScore", "type": "number", "label": "Home Score", "defaultValue": 0 },
          { "name": "awayScore", "type": "number", "label": "Away Score", "defaultValue": 0 },
          { "name": "showLogo", "type": "boolean", "label": "Show Logo", "defaultValue": true }
        ]
      },
      "output": {
        "frameRate": 50,
        "colorSpace": "rec709",
        "dynamicRange": "sdr"
      }
    }
  ]
}
```

---

## Quick Reference

### Checklist

1. **Set project metadata** — `schemaVersion: 1`, unique `id`, `name`, timestamps.
2. **Configure settings** — fonts, palette, default document mode.
3. **Add assets** — centralized media library (images, videos, fonts).
4. **Create documents** — at least one, each with `documentMode` and `canvas`.
5. **Set canvas** — dimensions, `unit` (`"px"` for screen, `"mm"`/`"in"` for print), `dpi`.
6. **Create elements** — unique `id`, correct `type`, position/size, `content`, `style` (at minimum `{ "opacity": 1 }`), `name`, and `locked`.
7. **Set hierarchy** — `parentId` for visual hierarchy, `groupId` for selection groups. `null` for root/ungrouped.
8. **Define data schema** — document-level `dataSchema` with field definitions.
9. **Bind data** — `dataField`, `visibleWhen`, `repeater` on elements as needed.
10. **Create pages** — at least one. Use `overrides` for per-page data/style changes.
11. **Add animations** (optional) — timelines with typed `KeyframeValue` entries, bound to states and modifiers.
12. **Set output spec** (optional) — frame rate, color space, dynamic range.
13. **Validate** — Zod schemas at load time; all IDs unique, all references valid, numeric constraints satisfied.

### Common Patterns

**Broadcast lower-third:**

- Canvas: 1920 × 1080 px, `unit: "px"`
- Rectangle background at bottom with text children
- IN/OUT state animations with `translateY` and `opacity`
- `dataSchema` fields for team names and scores
- `output: { frameRate: 50, colorSpace: "rec709" }`

**Print document:**

- Canvas: 210 × 297 mm, `unit: "mm"`, `dpi: 300`, `documentMode: "print"`
- No animations; use `padding` for print margins
- `backgroundMode: "solid"`

**Sports scorebug with live data:**

- Elements bound to `dataSchema` fields via `dataField`
- `visibleWhen` expressions for conditional elements
- Pages for different game states (default, half-time, full-time)
- `output: { frameRate: 50 }`
