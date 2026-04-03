# BroadsetDocument — JSON Format Reference

## Purpose

Defines the complete `BroadsetDocument` JSON structure that every implementation MUST produce and accept. This is the authoritative field-level reference — all implementations MUST conform to these shapes and constraints. For behavioral invariants and validation rules see [spec.md](spec.md).

All dimensions are in **millimetres** unless stated otherwise. Documents are validated with Zod at load time — invalid data is rejected.

---

## Table of Contents

1. [Root Structure](#1-root-structure)
2. [Canvas](#2-canvas)
3. [Pages](#3-pages)
4. [Elements](#4-elements)
5. [Element Types](#5-element-types)
6. [Element Style](#6-element-style)
7. [Screen Properties](#7-screen-properties)
8. [Grouping & Parenting](#8-grouping--parenting)
9. [Animation Registry](#9-animation-registry)
10. [Timelines & Keyframes](#10-timelines--keyframes)
11. [States](#11-states)
12. [Modifiers](#12-modifiers)
13. [Orchestration Timelines](#13-orchestration-timelines)
14. [Metadata](#14-metadata)
15. [Validation Constraints](#15-validation-constraints)
16. [Unit Conversions](#16-unit-conversions)
17. [Complete Minimal Example](#17-complete-minimal-example)
18. [Full Example with Animations](#18-full-example-with-animations)

---

## 1. Root Structure

```jsonc
{
  "id": "<unique-string>",            // Required, non-empty
  "documentMode": "screen" | "print", // Required
  "canvas": { ... },                  // Required
  "pages": [ ... ],                   // Required, at least 1 page
  "animationRegistry": [ ... ],       // Required (can be empty array [])
  "metadata": { ... }                 // Optional
}
```

| Field               | Type                       | Required | Description                                                                     |
| ------------------- | -------------------------- | -------- | ------------------------------------------------------------------------------- |
| `id`                | `string`                   | Yes      | Unique document identifier. Non-empty.                                          |
| `documentMode`      | `"screen"` or `"print"`    | Yes      | `"screen"` for broadcast/digital overlays; `"print"` for print-ready documents. |
| `canvas`            | `BroadsetCanvas`           | Yes      | Canvas dimensions and padding.                                                  |
| `pages`             | `BroadsetPage[]`           | Yes      | At least one page.                                                              |
| `animationRegistry` | `AnimationRegistry`        | Yes      | Animation configs per element. Use `{}` for no animations.                      |
| `metadata`          | `BroadsetDocumentMetadata` | No       | Name and timestamps.                                                            |

---

## 2. Canvas

All values are in **millimetres**.

```jsonc
{
  "width": 508, // Positive number (mm)
  "height": 285.75, // Positive number (mm)
  "padding": [0, 0, 0, 0], // [top, right, bottom, left] (mm)
}
```

| Field           | Type                               | Required | Constraints                                    |
| --------------- | ---------------------------------- | -------- | ---------------------------------------------- |
| `width`         | `number`                           | Yes      | Must be positive (> 0).                        |
| `height`        | `number`                           | Yes      | Must be positive (> 0).                        |
| `padding`       | `[number, number, number, number]` | Yes      | 4-element tuple: `[top, right, bottom, left]`. |
| `backgroundPdf` | `string`                           | No       | Base64 PDF or URL for print backgrounds.       |

**Common canvas sizes (in mm):**

| Use Case            | Width (mm) | Height (mm) | Equivalent Pixels |
| ------------------- | ---------- | ----------- | ----------------- |
| Full HD (1920×1080) | 508.00     | 285.75      | 1920 × 1080 px    |
| 4K UHD (3840×2160)  | 1016.00    | 571.50      | 3840 × 2160 px    |
| A4 Portrait         | 210        | 297         | 794 × 1123 px     |
| A4 Landscape        | 297        | 210         | 1123 × 794 px     |
| 720p (1280×720)     | 338.67     | 190.50      | 1280 × 720 px     |
| Instagram Post      | 287.87     | 287.87      | 1080 × 1080 px    |

---

## 3. Pages

```jsonc
{
  "id": "page-1",       // Required, non-empty unique identifier
  "elements": [ ... ]   // Array of BroadsetElement objects (can be empty)
}
```

A document must have at least one page. Each page has a unique `id` and contains a flat array of elements. Parent-child relationships are defined via `parentId`, not nesting.

---

## 4. Elements

Every element on a page has this shape:

```jsonc
{
  "id": "unique-element-id",         // Required, non-empty, unique within the document
  "type": "text",                    // Required, non-empty (see Element Types)
  "position": { "x": 10, "y": 20 }, // Required (mm)
  "width": 100,                      // Required, positive (mm)
  "height": 50,                      // Required, positive (mm)
  "rotation": 0,                     // Required (degrees, clockwise)
  "content": "Hello World",          // Required (meaning depends on type)
  "style": { "opacity": 1 },        // Required (see Element Style)
  "screen": { ... },                 // Required (see Screen Properties)
  "parentId": null,                  // Required (string ID or null)
  "groupId": null                    // Required (string ID or null)
}
```

| Field      | Type                   | Required | Constraints                                       |
| ---------- | ---------------------- | -------- | ------------------------------------------------- |
| `id`       | `string`               | Yes      | Non-empty, unique across all pages.               |
| `type`     | `string`               | Yes      | Non-empty. See [Element Types](#5-element-types). |
| `position` | `{x, y}`               | Yes      | Both numbers (mm). Can be negative.               |
| `width`    | `number`               | Yes      | Must be positive (> 0).                           |
| `height`   | `number`               | Yes      | Must be positive (> 0).                           |
| `rotation` | `number`               | Yes      | Degrees, clockwise. 0 = no rotation.              |
| `content`  | `string`               | Yes      | Interpretation depends on `type`.                 |
| `style`    | `BroadsetElementStyle` | Yes      | At minimum `{ "opacity": 1 }`.                    |
| `screen`   | `BroadsetScreenProps`  | Yes      | Broadcast/layout properties.                      |
| `parentId` | `string \| null`       | Yes      | Parent element's `id`, or `null` for root.        |
| `groupId`  | `string \| null`       | Yes      | Selection group's `id`, or `null` for ungrouped.  |

**Position coordinates:** `position.x` and `position.y` are relative to the parent element if `parentId` is set, otherwise relative to the canvas origin (top-left corner).

---

## 5. Element Types

### Built-in Types

| Type          | `content` Contains                                | Description                                                            |
| ------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `"text"`      | Plain text string                                 | Rendered as HTML text. Supports full typography styling.               |
| `"image"`     | URL (HTTP/HTTPS) or data URI                      | Rendered as `<img>`. Supports object-fit.                              |
| `"svg"`       | Inline SVG markup (starting with `<svg`) OR a URL | If starts with `<svg`, injected as raw SVG; otherwise loaded as image. |
| `"path"`      | SVG path `d` attribute string                     | Rendered as `<path>` inside an SVG. Supports stroke/fill styling.      |
| `"rectangle"` | _(empty string)_                                  | A styled `<div>`. Supports background, border, border-radius.          |
| `"ellipse"`   | _(empty string)_                                  | A styled `<div>` with `border-radius: 50%`.                            |
| `"qrcode"`    | Text or URL to encode in the QR code              | Generated as QR code SVG. Requires 1:1 aspect ratio.                   |
| `"group"`     | _(empty string)_                                  | Invisible container. Children reference it via `parentId`.             |

### Element Capabilities by Type

| Capability                 | text | rectangle | ellipse | image | svg | path | qrcode | group |
| -------------------------- | :--: | :-------: | :-----: | :---: | :-: | :--: | :----: | :---: |
| borderRadius               |  ✓   |     ✓     |         |   ✓   |  ✓  |      |        |       |
| typography                 |  ✓   |           |         |       |     |      |        |       |
| appearance (bg/border)     |  ✓   |     ✓     |    ✓    |   ✓   |  ✓  |      |        |       |
| boxEffects (shadow/filter) |  ✓   |     ✓     |    ✓    |   ✓   |  ✓  |      |        |       |
| clipPath                   |      |     ✓     |    ✓    |   ✓   |  ✓  |      |        |   ✓   |
| objectFit                  |      |           |         |   ✓   |  ✓  |      |        |       |
| svgStrokeFill              |      |           |         |       |     |  ✓   |        |       |
| pathEditing                |      |           |         |       |     |  ✓   |        |       |
| squareConstrained          |      |           |         |       |     |      |   ✓    |       |

---

## 6. Element Style

The `style` object controls visual appearance. Only `opacity` is required; all other properties are optional.

```jsonc
{
  // ── Required ──────────────────────────────────────
  "opacity": 1, // 0.0 – 1.0

  // ── Typography (text elements) ────────────────────
  "fontFamily": "Roboto", // CSS font-family name
  "fontSize": 16, // Positive number (points)
  "fontColor": "#ffffff", // CSS color string
  "fontWeight": "bold", // CSS font-weight ("normal", "bold", "100"–"900")
  "fontStyle": "italic", // "normal" | "italic"
  "textAlignment": "center", // "left" | "center" | "right" | "justify"
  "textDecoration": "underline",
  "textTransform": "uppercase", // "none" | "uppercase" | "lowercase" | "capitalize"
  "letterSpacing": "2px", // CSS letter-spacing value
  "lineHeight": "1.5", // CSS line-height value
  "textStroke": "1px black", // CSS text-stroke shorthand
  "textShadow": "2px 2px 4px rgba(0,0,0,0.5)",
  "wordSpacing": "4px", // CSS word-spacing value

  // ── Background & Border ───────────────────────────
  "backgroundColor": "#1a1a2e", // CSS color
  "backgroundGradient": "linear-gradient(90deg, #ff0000, #0000ff)",
  "borderWidth": 2, // Non-negative number (px)
  "borderColor": "#000000", // CSS color
  "borderRadius": 8, // Uniform: single number (px)
  // OR per-corner: [topLeft, topRight, bottomRight, bottomLeft]
  // "borderRadius": [8, 8, 0, 0],
  "borderStyle": "solid", // CSS border-style
  "padding": "8px 16px", // CSS padding shorthand

  // ── Box Effects ───────────────────────────────────
  "boxShadow": "0 4px 6px rgba(0,0,0,0.3)",
  "filter": "blur(2px)", // CSS filter
  "backdropFilter": "blur(10px)", // CSS backdrop-filter
  "mixBlendMode": "multiply", // CSS mix-blend-mode
  "isolation": "isolate", // CSS isolation

  // ── Media Layout ──────────────────────────────────
  "objectFit": "cover", // "contain" | "cover" | "fill" | "none" | "scale-down"

  // ── SVG Stroke & Fill (path elements) ─────────────
  "stroke": "#ffcc00", // SVG stroke color
  "strokeWidth": 2, // Non-negative (px)
  "strokeDasharray": "5,3", // SVG dash pattern
  "strokeDashoffset": 0, // Dash offset (animatable)
  "strokeLinecap": "round", // "butt" | "round" | "square"
  "strokeLinejoin": "round", // "miter" | "round" | "bevel"
  "strokeOpacity": 1, // 0.0 – 1.0
  "fill": "none", // SVG fill color or "none"
  "fillOpacity": 1, // 0.0 – 1.0
  "fillRule": "nonzero", // "nonzero" | "evenodd"
}
```

### Validation Constraints

| Property        | Constraint                                             |
| --------------- | ------------------------------------------------------ |
| `opacity`       | Number, 0 ≤ value ≤ 1                                  |
| `fontSize`      | Positive number                                        |
| `borderWidth`   | Non-negative number                                    |
| `borderRadius`  | Non-negative number OR 4-tuple of non-negative numbers |
| `strokeWidth`   | Non-negative number                                    |
| `strokeOpacity` | 0 ≤ value ≤ 1                                          |
| `fillOpacity`   | 0 ≤ value ≤ 1                                          |

---

## 7. Screen Properties

The `screen` object controls broadcast behavior, visibility, anchoring, 3D transforms, and masking.

```jsonc
{
  "name": "Score Display", // Human-readable label (can be empty "")
  "anchorX": "left", // "left" | "right"
  "anchorY": "top", // "top" | "bottom"
  "visibility": "onscreen", // "onscreen" | "offscreen"
  "activeState": null, // State name (string) or null
  "modifiers": [], // Array of active modifier names
  "locked": false, // Prevents editing in UI
  "maskType": "none", // "none"|"circle"|"squircle"|"triangle"|"star"|"custom"
  "rotateX": 0, // 3D rotation (degrees)
  "rotateY": 0, // 3D rotation (degrees)
  "rotateZ": 0, // 3D rotation (degrees)
  "translateZ": 0, // 3D depth (px)
  "clipChildren": false, // Overflow hidden on children
  "customClipPath": "", // CSS clip-path value when maskType is "custom"
}
```

| Field            | Type                        | Required | Default      | Description                                                                                       |
| ---------------- | --------------------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `name`           | `string`                    | Yes      | `""`         | Display name in the editor layer panel.                                                           |
| `anchorX`        | `"left" \| "right"`         | Yes      | `"left"`     | Horizontal anchor edge for responsive positioning.                                                |
| `anchorY`        | `"top" \| "bottom"`         | Yes      | `"top"`      | Vertical anchor edge for responsive positioning.                                                  |
| `visibility`     | `"onscreen" \| "offscreen"` | Yes      | `"onscreen"` | Whether element is visible on the canvas.                                                         |
| `activeState`    | `string \| null`            | Yes      | `null`       | Currently active animation state (e.g., `"IN"`, `"OUT"`, or custom).                              |
| `modifiers`      | `string[]`                  | Yes      | `[]`         | Currently active modifier names.                                                                  |
| `locked`         | `boolean`                   | Yes      | `false`      | Prevents user interaction in the editor.                                                          |
| `maskType`       | `string` (enum)             | Yes      | `"none"`     | Shape mask: `"none"`, `"circle"`, `"squircle"`, `"triangle"`, `"star"`, `"custom"`.               |
| `rotateX`        | `number`                    | Yes      | `0`          | 3D X-axis rotation in degrees.                                                                    |
| `rotateY`        | `number`                    | Yes      | `0`          | 3D Y-axis rotation in degrees.                                                                    |
| `rotateZ`        | `number`                    | Yes      | `0`          | 3D Z-axis rotation in degrees.                                                                    |
| `translateZ`     | `number`                    | Yes      | `0`          | 3D depth translation.                                                                             |
| `clipChildren`   | `boolean`                   | Yes      | `false`      | If true, clips child content to this element's bounds.                                            |
| `customClipPath` | `string`                    | Yes      | `""`         | CSS `clip-path` value (e.g., `path("M0,0 L100,0 ...")`). Only used when `maskType` is `"custom"`. |

### Anchoring

`anchorX` and `anchorY` define which edge of the canvas the element is pinned to for responsive scaling. If the element's center is in the left half of the canvas, use `"left"`; right half → `"right"`. Same vertically for `"top"` / `"bottom"`.

---

## 8. Grouping & Parenting

Elements are stored in a **flat array** within each page. Hierarchy is expressed through two fields:

| Field      | Purpose                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `parentId` | Points to the `id` of the parent element. Child positions are **relative to the parent**. Set to `null` for root-level elements. |
| `groupId`  | Links elements into a selection group. Elements in the same group are selected together. Set to `null` for ungrouped.            |

### Rules

- A `"group"` type element acts as a visual container. Its children set `parentId` to the group's `id`.
- `parentId` chains can be nested (grandchild → child → group → root).
- All referenced `parentId` and `groupId` values MUST match existing element `id` values in the same page.
- The parent element MUST appear **before** its children in the `elements` array (rendering order).

### Example Hierarchy

```
scoreboard-group  (type: group,     parentId: null)
├── scoreboard-bg (type: rectangle, parentId: "scoreboard-group")
│   ├── home-score (type: text,     parentId: "scoreboard-bg")
│   └── away-score (type: text,     parentId: "scoreboard-bg")
```

---

## 9. Animation Registry

The `animationRegistry` is a flat array of entries, each binding an element ID to its animation configuration:

```jsonc
{
  "animationRegistry": [
    {
      "elementId": "<element-id>",
      "config": {
        "timelines": [ ... ],                // Array of ElementTimeline
        "stateTimelineBindings": [ ... ],    // Array of StateTimelineBinding
        "modifierTimelineBindings": [ ... ]  // Array of ModifierTimelineBinding
      }
    }
  ]
}
```

Only elements that have animations need entries. Elements without animations are simply absent from the registry. Element IDs within the registry must be unique.

---

## 10. Timelines & Keyframes

### ElementTimeline

```jsonc
{
  "id": "tl-unique-id", // Optional but recommended — used for bindings
  "name": "State IN", // Human-readable name
  "entries": [
    {
      "name": "fade-in", // Human-readable keyframe name
      "action": "none", // "none" | "setState" | "addModifier" | "removeModifier"
      "payload": "IN", // Action argument (state/modifier name). Optional.
      "offsetMs": 350, // Time offset in milliseconds (>= 0)
      "properties": {
        "opacity": { "value": "1", "interpolation": "ease-out" },
        "translateY": { "value": "0%", "interpolation": "ease-out" },
      },
      "target": "child-element-id", // Optional: target a different element
    },
  ],
  "childTimelines": {
    "child-id": {
      /* ElementTimeline */
    },
  },
}
```

### Keyframe Properties

Property values are CSS property targets expressed as **strings**:

| Property Key       | Example Values                     | Description            |
| ------------------ | ---------------------------------- | ---------------------- |
| `opacity`          | `"0"`, `"1"`, `"0.5"`              | CSS opacity            |
| `translateX`       | `"0%"`, `"100%"`, `"-50px"`        | Horizontal translation |
| `translateY`       | `"0%"`, `"-100%"`, `"20px"`        | Vertical translation   |
| `scale`            | `"1"`, `"0.5"`, `"1.2"`            | Uniform scale          |
| `scaleX`           | `"1"`, `"0"`                       | X-axis scale           |
| `scaleY`           | `"1"`, `"0"`                       | Y-axis scale           |
| `rotate`           | `"0deg"`, `"360deg"`               | 2D rotation            |
| `backgroundColor`  | `"#ff0000"`, `"rgba(0,0,0,0.5)"`   | Background color       |
| `color`            | `"#ffffff"`                        | Text color             |
| `fontSize`         | `"24px"`                           | Font size              |
| `borderRadius`     | `"8px"`, `"50%"`                   | Border radius          |
| `boxShadow`        | `"0 4px 6px rgba(0,0,0,0.3)"`      | Box shadow             |
| `filter`           | `"blur(2px)"`, `"brightness(1.5)"` | CSS filter             |
| `clipPath`         | `"inset(0%)"`, `"circle(50%)"`     | Clip path              |
| `width`            | `"100px"`, `"50%"`                 | Element width          |
| `height`           | `"100px"`                          | Element height         |
| `strokeDashoffset` | `"0"`, `"100"`                     | SVG dash offset        |

### Easing Values

| Value                         | Description                |
| ----------------------------- | -------------------------- |
| `"linear"`                    | Constant speed             |
| `"ease-in"`                   | Accelerating from rest     |
| `"ease-out"`                  | Decelerating to rest       |
| `"ease-in-out"`               | Accelerate then decelerate |
| `"cubic-bezier(x1,y1,x2,y2)"` | Custom cubic Bezier curve  |

### How Timelines Play

A timeline has **no hardcoded "from" values**. The animation engine reads the element's current live DOM property as the starting value and tweens to the keyframe's target over `offsetMs`. The first keyframe defines the **target** and the **duration to reach it**.

---

## 11. States

States are **exclusive** — exactly one state is active per element at any time.

### Reserved State Names

| State   | Meaning                        |
| ------- | ------------------------------ |
| `"IN"`  | Element is visible (entrance). |
| `"OUT"` | Element is hidden (exit).      |

Custom state names (e.g., `"warning"`, `"highlighted"`) can be added.

### stateTimelineBindings

An array of bindings, each mapping a state name to its timeline:

```jsonc
{
  "stateTimelineBindings": [
    { "stateName": "IN", "timelineId": "tl-element-in" },
    { "stateName": "OUT", "timelineId": "tl-element-out" },
    { "stateName": "warning", "timelineId": "tl-warning-enter" },
  ],
}
```

### Behavior

- Switching from state X → state Y plays state Y's bound timeline.
- If no `IN` timeline is defined: element becomes visible instantly.
- If no `OUT` timeline is defined but `IN` exists: `IN` plays in reverse.
- If neither is defined: CSS visibility toggles instantly.

---

## 12. Modifiers

Modifiers are **additive** — zero or many can be active simultaneously.

An array of bindings, each mapping a modifier name to its in/out timelines:

```jsonc
{
  "modifierTimelineBindings": [
    {
      "modifierName": "pulse",
      "inTimelineId": "tl-pulse-in",
      "outTimelineId": "tl-pulse-out",
    },
    {
      "modifierName": "glow",
      "inTimelineId": "tl-glow-in",
      // No outTimelineId → in timeline plays in reverse on removal
    },
  ],
}
```

### Behavior

- **Adding** a modifier plays its `inTimeline`.
- **Removing** a modifier plays its `outTimeline`. If absent, `inTimeline` plays in reverse.

---

## 13. Orchestration Timelines

Timelines with `action` keyframes sequence state and modifier changes at specific offsets:

```jsonc
{
  "id": "tl-orchestration",
  "name": "Show Sequence",
  "entries": [
    { "name": "start-hidden", "action": "setState", "payload": "OUT", "offsetMs": 0, "properties": {} },
    { "name": "reveal", "action": "setState", "payload": "IN", "offsetMs": 600, "properties": {} },
    { "name": "add-pulse", "action": "addModifier", "payload": "pulse", "offsetMs": 1000, "properties": {} },
    { "name": "hide", "action": "setState", "payload": "OUT", "offsetMs": 3000, "properties": {} },
  ],
}
```

### Keyframe Actions

| Action             | Payload           | Effect                                                             |
| ------------------ | ----------------- | ------------------------------------------------------------------ |
| `"none"`           | _(ignored)_       | Pure property animation, no state change.                          |
| `"setState"`       | State name string | Transitions to the named state (e.g., `"IN"`, `"OUT"`, or custom). |
| `"addModifier"`    | Modifier name     | Activates the named modifier.                                      |
| `"removeModifier"` | Modifier name     | Deactivates the named modifier.                                    |

---

## 14. Metadata

```jsonc
{
  "metadata": {
    "name": "My Template",
    "createdAtIso": "2026-01-15T10:30:00Z",
    "updatedAtIso": "2026-03-17T14:00:00Z",
  },
}
```

---

## 15. Validation Constraints

Enforced by Zod at load time. Documents that violate these rules are **rejected**.

### Document

- `id`: non-empty string
- `documentMode`: exactly `"screen"` or `"print"`
- `pages`: array with at least 1 page

### Canvas

- `width`: positive number
- `height`: positive number
- `padding`: exactly 4-element number tuple

### Elements

- `id`: non-empty string, unique within page
- `type`: non-empty string
- `width` / `height`: positive number (> 0)
- `rotation`: any finite number
- `parentId`: string or `null`
- `groupId`: string or `null`

### Style

- `opacity`: 0 ≤ value ≤ 1
- `fontSize`: positive number (if present)
- `borderWidth`: non-negative number (if present)
- `borderRadius`: non-negative number OR 4-tuple of non-negative numbers (if present)
- `strokeWidth`: non-negative number (if present)
- `strokeOpacity`: 0 ≤ value ≤ 1 (if present)
- `fillOpacity`: 0 ≤ value ≤ 1 (if present)

### Screen

- `anchorX`: exactly `"left"` or `"right"`
- `anchorY`: exactly `"top"` or `"bottom"`
- `visibility`: exactly `"onscreen"` or `"offscreen"`
- `maskType`: one of `"none"`, `"circle"`, `"squircle"`, `"triangle"`, `"star"`, `"custom"`

### Animation

- `offsetMs`: non-negative number (≥ 0)
- `action`: one of `"none"`, `"setState"`, `"addModifier"`, `"removeModifier"`
- `stateName` / `modifierName`: non-empty string (in bindings)
- `timelineId` / `inTimelineId`: non-empty string referencing a timeline `id`
- `outTimelineId`: optional non-empty string referencing a timeline `id`
- Timeline `entries`: array (can be empty)

---

## 16. Unit Conversions

All spatial dimensions are in **millimetres**. To convert:

| Conversion | Formula          |
| ---------- | ---------------- |
| px → mm    | `px × 25.4 / 96` |
| mm → px    | `mm × 96 / 25.4` |

**Examples:**

- 1920 px = 508.0 mm
- 1080 px = 285.75 mm
- 100 px ≈ 26.46 mm

---

## 17. Complete Minimal Example

```json
{
  "id": "minimal-template",
  "documentMode": "screen",
  "canvas": {
    "width": 508,
    "height": 285.75,
    "padding": [0, 0, 0, 0]
  },
  "pages": [
    {
      "id": "page-1",
      "elements": [
        {
          "id": "title",
          "type": "text",
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
            "textAlignment": "center"
          },
          "screen": {
            "name": "Title",
            "anchorX": "left",
            "anchorY": "top",
            "visibility": "onscreen",
            "activeState": null,
            "modifiers": [],
            "locked": false,
            "maskType": "none",
            "rotateX": 0,
            "rotateY": 0,
            "rotateZ": 0,
            "translateZ": 0,
            "clipChildren": false,
            "customClipPath": ""
          },
          "parentId": null,
          "groupId": null
        }
      ]
    }
  ],
  "animationRegistry": []
}
```

---

## 18. Full Example with Animations

A broadcast overlay with animated scoreboard using state transitions:

```json
{
  "id": "sports-overlay",
  "documentMode": "screen",
  "canvas": { "width": 508, "height": 285.75, "padding": [0, 0, 0, 0] },
  "pages": [
    {
      "id": "page-1",
      "elements": [
        {
          "id": "scoreboard-bg",
          "type": "rectangle",
          "position": { "x": 12.7, "y": 12.7 },
          "width": 152.4,
          "height": 38.1,
          "rotation": 0,
          "content": "",
          "style": { "opacity": 0.85, "backgroundColor": "#1a1a2e", "borderRadius": 4 },
          "screen": {
            "name": "Scoreboard BG",
            "anchorX": "left",
            "anchorY": "top",
            "visibility": "onscreen",
            "activeState": null,
            "modifiers": [],
            "locked": false,
            "maskType": "none",
            "rotateX": 0,
            "rotateY": 0,
            "rotateZ": 0,
            "translateZ": 0,
            "clipChildren": false,
            "customClipPath": ""
          },
          "parentId": null,
          "groupId": null
        },
        {
          "id": "home-score",
          "type": "text",
          "position": { "x": 2.3, "y": 3.3 },
          "width": 50,
          "height": 14,
          "rotation": 0,
          "content": "HOME 2",
          "style": {
            "opacity": 1,
            "fontFamily": "Roboto",
            "fontSize": 18,
            "fontColor": "#ffffff",
            "textAlignment": "center"
          },
          "screen": {
            "name": "Home Score",
            "anchorX": "left",
            "anchorY": "top",
            "visibility": "onscreen",
            "activeState": null,
            "modifiers": [],
            "locked": false,
            "maskType": "none",
            "rotateX": 0,
            "rotateY": 0,
            "rotateZ": 0,
            "translateZ": 0,
            "clipChildren": false,
            "customClipPath": ""
          },
          "parentId": "scoreboard-bg",
          "groupId": null
        }
      ]
    }
  ],
  "animationRegistry": [
    {
      "elementId": "scoreboard-bg",
      "config": {
        "timelines": [
          {
            "id": "tl-bg-in",
            "name": "State IN",
            "entries": [
              {
                "name": "fade-slide-in",
                "action": "none",
                "offsetMs": 350,
                "properties": {
                  "opacity": { "value": "0.85", "interpolation": "ease-out" },
                  "translateY": { "value": "0%", "interpolation": "ease-out" }
                }
              }
            ]
          },
          {
            "id": "tl-bg-out",
            "name": "State OUT",
            "entries": [
              {
                "name": "fade-slide-out",
                "action": "none",
                "offsetMs": 350,
                "properties": {
                  "opacity": { "value": "0", "interpolation": "ease-in" },
                  "translateY": { "value": "-100%", "interpolation": "ease-in" }
                }
              }
            ]
          },
          {
            "id": "tl-bg-sequence",
            "name": "Show Sequence",
            "entries": [
              { "name": "start-hidden", "action": "setState", "payload": "OUT", "offsetMs": 0, "properties": {} },
              { "name": "reveal", "action": "setState", "payload": "IN", "offsetMs": 600, "properties": {} },
              { "name": "hide-again", "action": "setState", "payload": "OUT", "offsetMs": 2000, "properties": {} }
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
  ]
}
```

---

## Quick Reference

### Checklist

1. **Set document ID** — any unique non-empty string.
2. **Choose `documentMode`** — `"screen"` for broadcast/digital, `"print"` for print-ready.
3. **Set canvas size** in mm (use [conversion formulas](#16-unit-conversions) from pixels).
4. **Create pages** — at least one page with an `elements` array.
5. **Create elements** — each with a unique `id`, correct `type`, position/size in mm, `content`, `style` (at minimum `{ "opacity": 1 }`), and full `screen` properties.
6. **Set parent/group relationships** — `parentId` for visual hierarchy, `groupId` for selection groups. Use `null` for root/ungrouped.
7. **Add animations** (optional) — create timelines in `animationRegistry`, bind them to states and/or modifiers.
8. **Validate** — all required fields present, all referenced IDs exist, numeric constraints satisfied.

### Common Patterns

**Broadcast lower-third:**

- Canvas: 508 × 285.75 mm (1920×1080)
- Rectangle background at bottom with text children
- IN/OUT state animations with `translateY` and `opacity`

**Print document:**

- Canvas: 210 × 297 mm (A4), `documentMode: "print"`
- No animations; use `padding` for print margins

**Animated overlay:**

- Multiple groups with staggered orchestration timelines
- Elements start in `"OUT"` state; orchestration triggers `"IN"` at different offsets
- Modifiers for recurring effects (pulse, glow, bounce)
