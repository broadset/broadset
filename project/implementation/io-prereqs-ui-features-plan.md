# IO Prereqs — User-Facing Features Plan

Status: historical companion plan for UX scope and acceptance detail. **Execution status** (including which features are landed vs open) lives in [plan-progress.md](./plan-progress.md) UI.1–UI.15. Cross-region CT accounting lives in [cross-region-ct-inventory.md](./cross-region-ct-inventory.md).

io-prereqs is a platform refactor. Most of what it adds to the model also surfaces as a first-class user feature in the editor. This plan specifies the UX for each such feature at a level of detail that another engineer or designer can build from without guessing. It is **not** a rationale document; for the why, read the io-prereqs plan. This is the how-it-looks-and-feels spec.

## Guiding principles

Every feature in this plan obeys the same short list. Deviations are called out explicitly.

1. **One obvious entry point.** Every feature is reachable from a single, predictable location — usually the properties panel when an element is selected, or the canvas-settings panel when nothing is selected. No deep submenus.
2. **Direct manipulation on canvas** where geometry is involved. Inputs reflect what the user just dragged; dragging reflects what the input just changed. No one-way bindings.
3. **Live preview.** Every change to a slider / picker / input previews on canvas in real time (ephemeral update), committing on pointer-up (history entry per commit).
4. **Undo/redo compatible.** Every state change flows through the existing `zundo` plumbing in [packages/editor/](../../packages/editor/). The user can Cmd-Z anything without special cases.
5. **Keyboard-first where it matters.** Every input is Tab-reachable; every modal is Esc-dismissable. Discoverable shortcuts are surfaced as hint text next to the control (e.g. "⌘B" beside a Bold toggle).
6. **Progressive disclosure.** Defaults are one-click. Power features (per-stop color-space, per-element ICC override, structured filter primitives) live one click deeper.
7. **HeroUI primitives only.** Per [heroui.instructions.md](../../agents/instructions/heroui.instructions.md). No hand-rolled dropdowns, tabs, or toggles.
8. **Zero layout shift.** Panels pre-allocate space for dynamic controls so toggling a feature on doesn't push other controls around.
9. **Every feature has a cross-region CT** per [testing.instructions.md](../../agents/instructions/testing.instructions.md). Action in one region + outcome in another = one Playwright test.

## Features

Each feature section is structured identically:

- **What** — one sentence describing the user-visible capability.
- **Access path** — where the user finds it; keyboard shortcuts where applicable.
- **Canonical interaction** — step-by-step for the primary flow.
- **State binding** — model path + store action + HeroUI components involved.
- **Edge + error states** — empty, overflow, invalid input, conflict.
- **Polish** — small details that separate "it works" from "it feels right."
- **Acceptance** — the observable outcomes a CT and manual smoke cover.

---

### 1. Design-token / theme system

**What.** Every document has one theme (accent1–6, lt1/lt2, dk1/dk2, hyperlink, followed-hyperlink). Users customize the theme slots; every color control accepts either a raw color or a theme slot with optional modifiers (lumMod / lumOff / tint / shade / alpha). Changing a slot recolors every element bound to that slot, across every page, in one move.

No theme-swap gallery, no preset themes — one theme per document, always editable.

**Access path.**

- **Primary:** swatches panel in the left rail, opened by a toolbar button (icon: color grid) or `T` shortcut when nothing is selected.
- **Secondary:** every color picker across the editor has a "Theme" tab alongside "Custom" — one click to bind a color to a slot instead of a literal hex.

**Canonical interaction.**

1. User opens the swatches panel. Two sections: **Theme slots** (12 fixed rows, each showing the current color + the slot name) and **Custom swatches** (user-defined named colors).
2. User clicks a theme slot row. A color picker pops over; picking updates every element bound to that slot across every page, live.
3. From any color input on an element: user clicks the color chip → picker opens with two tabs, "Custom" (default) and "Theme". Theme tab shows the 12 slots as clickable swatches. Clicking binds the color field to that slot. A small indicator on the color chip (🎨) marks slot-bound colors.
4. From the picker's Theme tab, user can expand "Modifiers" to apply `lumMod` / `lumOff` / `tint` / `shade` / `alpha` via sliders. Preview is live.

**State binding.**

- Model: `settings.theme: { [slot: ThemeSlot]: BroadsetColor }`; every color field is `BroadsetColor` which is `{ kind: 'rgb', … }` or `{ kind: 'theme', slot, mods? }`.
- Store actions: `setThemeSlot(slot, color)`, `bindColorToSlot(fieldPath, slot, mods?)`, `unbindColor(fieldPath)`.
- HeroUI: `Tabs` for Custom/Theme in the picker; `Popover` for the picker; `Listbox` for the swatches list; `Slider` for each modifier.

**Edge + error states.**

- **New document:** ships with one sensible default theme (accent1–6 + neutral lights/darks + sensible link colors). Never empty. The theme is a fixed starting point the user edits in place.
- **Out-of-gamut theme color in CMYK mode:** swatch row shows a ⚠ badge with a hover tooltip naming the target space. Preflight (feature 13) lists it.
- **Mod combination that clips:** `lumMod` + `shade` can produce identical results to multiple inputs. We display the computed RGB under the sliders so users see the end state.

**Polish.**

- Dragging a swatch from the panel onto an element fills that element with the slot (not the resolved RGB).
- Right-click a theme slot → "Apply to selection" instantly binds selected elements' fill to that slot.
- A small ↩ button on a slot-bound color chip "unbinds" back to the resolved RGB without changing appearance.
- Mods collapsed by default; chevron expands. Zero layout shift when expanding — panel reserves the space.

**Acceptance.** Cross-region CT: user changes the accent1 slot color → every element on canvas bound to `accent1` repaints AND the layers panel color dots update AND preflight panel re-evaluates.

---

### 2. Rich text editor (runs + paragraphs + bullets + hyperlinks)

**What.** Users select a character range inside a text element and apply style overrides (family, size, weight, italic, underline, strike, color, tracking, lang, hyperlink) to that range. Paragraph-level properties (align, indent, spacing, bullet, level) per paragraph. Scope is bounded: range styling + paragraph controls via the properties panel. On-canvas inline editing of text content is a later pass (IO-D-12).

**Access path.**

- **Primary:** double-click a text element → enters **run-edit mode**. Cursor appears; arrow keys / mouse select ranges. Properties panel swaps to a run-edit layout.
- **Secondary:** select text element normally → "Edit text" button in properties panel header → same run-edit mode.
- **Exit:** Esc, or click outside the element.

**Canonical interaction.**

1. User double-clicks "Hello **world**" text → cursor lands at click point.
2. User drags to select "world".
3. Properties panel replaces element-level controls with **run-level** controls (family, size, weight, italic, underline, strike, color, tracking, lang, hyperlink). Every control reads the selected range's values (or shows "Mixed" when the range spans differing values).
4. User clicks the **B** (bold) toggle → the selected range updates; canvas reflects immediately. Not a keyboard shortcut yet per IO-D-12.
5. Pressing Enter creates a new paragraph. Paragraph props (align, indent, spacing, bullet, level) live in a **Paragraph** accordion in the properties panel, reading from the paragraph containing the cursor.
6. User clicks "Link" (🔗) button → popover with URL + optional tooltip + target dropdown. Setting the URL wraps the selected range with `hyperlink` props.
7. User clicks "Bullet" dropdown in the Paragraph accordion → picks "Disc" / "Dash" / "Numbered (1.)" / "Numbered (a.)" / etc. Indent arrows nest level 0 → 8.
8. User exits run-edit by pressing Esc or clicking outside. Element returns to normal selection.

**State binding.**

- Model: `content: string | TextBody` where `TextBody = { paragraphs: Paragraph[] }`; `Paragraph = { runs: Run[]; props?: ParagraphProps }`; `Run = { text, props?: RunProps }`.
- Store actions: `enterRunEditMode(elementId)`, `setRunSelection(elementId, { start, end })`, `applyRunStyle(elementId, range, overrides)`, `applyParagraphProps(elementId, paragraphIndex, props)`, `exitRunEditMode()`.
- Run-level operation merges adjacent identical runs, splits overlapping runs, rejects negative offsets and out-of-bounds ranges at the action layer.
- HeroUI: `ButtonGroup` for B / I / U / S toggles; `Input` for size / tracking; `Select` for family / lang / bullet kind; `Popover` for link editor; `Accordion` for paragraph props.

**Edge + error states.**

- **Empty text element:** run-edit mode shows a blinking cursor at origin; typing produces a single run with the element's base style.
- **Selection spans differing runs:** every run-level control shows "Mixed"; changing a value applies uniformly to the range and clears "Mixed".
- **Invalid hyperlink URL:** the popover's URL input uses HeroUI validation; Save disabled until URL parses.
- **Bullet on paragraph with no text:** allowed; bullet + indent render when the user types.
- **Deeply nested level (> 8):** the level input caps at 8.

**Polish.**

- Cursor blink rate honors OS prefers-reduced-motion.
- "Mixed" state uses italic label text, HeroUI-native.
- Selecting a range that happens to match an existing run highlights that run's boundary in the panel as a visual aid.
- Pasting rich text (copy from another Broadset text element) preserves runs. Pasting plain text applies the current run's style.
- Hyperlink-bound runs underline by default; unbinding preserves the underlined run's explicit `underline` if the user set it manually (differentiate via the `hyperlink` prop, not the decoration).

**Acceptance.** Cross-region CT: user selects a range on canvas → properties panel reads range values → user clicks B → canvas range re-renders with bold AND layers panel preview thumbnail updates AND the element's dirty flag for every present format namespace flips to `true`.

---

### 3. Filter stack editor

**What.** Stack of filter primitives (`drop-shadow`, `blur`, `color-matrix`, `brightness`, `contrast`, `saturate`, `hue-rotate`, `grayscale`, `sepia`, `invert`, `opacity`, `custom-svg`) applied in order to an element. Users add, remove, reorder, and parameterize primitives. Live preview.

**Access path.**

- **Primary:** **Filters** accordion in the properties panel (element selected). Collapsed when no filters; shows count badge ("Filters · 2") when populated.

**Canonical interaction.**

1. User opens the Filters accordion. Empty state shows a single "+ Add filter" button with an icon grid.
2. Click "+ Add filter" → dropdown of primitives grouped by kind: **Shadow & depth** (drop-shadow, blur), **Color** (brightness, contrast, saturate, hue-rotate, grayscale, sepia, invert), **Alpha** (opacity), **Advanced** (color-matrix, custom-svg).
3. Picking a primitive adds it to the stack with sensible defaults (drop-shadow: offset 4 / blur 8 / 50% black; blur: stdDeviation 4; etc.). Preview is immediate.
4. Each primitive in the stack is a row: drag handle (left), primitive name + preview chip, parameter controls inline (sliders + color swatch), ✕ button (right).
5. User drags a row by the handle to reorder. Stack order = render order; canvas updates live while dragging.
6. User clicks ✕ on a row → primitive removed with a brief fade.
7. `color-matrix` expands into a 4×5 grid of number inputs with a "Preset" dropdown (luminance, sepia, invert, grayscale, identity) that populates the matrix.
8. `custom-svg` is an escape hatch — a `Textarea` accepts a raw `<filter>` SVG fragment; sanitized via `_shared/sanitize/` before preview.

**State binding.**

- Model: `style.filter: FilterStack = readonly FilterPrimitive[]`; replaces the CSS `filter` string. Renderer derives CSS string view.
- Store actions: `addFilterPrimitive(elementId, primitive)`, `updateFilterPrimitive(elementId, index, overrides)`, `removeFilterPrimitive(elementId, index)`, `reorderFilterPrimitive(elementId, from, to)`.
- HeroUI: `Accordion` for the section, drag via `@hello-pangea/dnd` or a minimal in-house drag with HeroUI `Card` rows; `Slider` + `Input` per parameter; `Select` for preset matrices; `Textarea` for custom-svg; `Popover` for the Add-filter menu.

**Edge + error states.**

- **Empty stack:** only "+ Add filter" visible.
- **Clashing parameter values:** sliders clamp at their valid ranges (e.g. `opacity` 0–1, `hue-rotate` 0–360°); no error modal.
- **`custom-svg` that fails sanitization:** inline `SvgSanitizationReport` banner under the textarea; preview disabled; row highlighted with warning color.
- **Performance cliff:** >10 filters per element warn in the accordion header; not blocked.

**Polish.**

- Preview chip on each row shows a 40×30 preview of the filter applied to a canonical swatch, so users can identify the filter without reading parameters.
- Keyboard reorder: focus a row, press `⌘↑` / `⌘↓` to move it. Mirrors the drag behavior for a11y.
- Grayscale/sepia/invert are linked to a single "Amount" slider (0–1), not a matrix.
- Custom-svg textarea has a monospace font and line numbers.

**Acceptance.** Cross-region CT: user adds drop-shadow → element on canvas renders with shadow AND layers-panel preview thumbnail reflects the filter AND reordering the stack re-renders in the new order.

---

### 4. Picture fill & pattern fill

**What.** Any rectangle / ellipse / path can be filled with an image (picture fill) or a repeating pattern (pattern fill) instead of a solid color or gradient.

**Access path.**

- **Primary:** in the **Fill** section of the properties panel, the fill-kind selector lists **None / Solid / Gradient / Pattern / Picture**.

**Canonical interaction — Picture fill.**

1. User selects a rectangle. Fill section shows current fill kind (e.g. Solid). Clicks the kind dropdown → selects **Picture**.
2. Fill section collapses the color picker and reveals an image-asset picker: a grid of thumbnails from the document's image assets + a "+ Upload" button.
3. User clicks an asset → the rectangle fills with the image, stretched to fit (default).
4. Below the asset picker: a **Mode** toggle (Stretch / Tile). Stretch = fills bounds, aspect may distort or preserve (via `preserveAspectRatio`). Tile = repeats at natural size (reveals tile-size controls).
5. **Stretch mode:** `preserveAspectRatio` dropdown (none / meet / slice).
6. **Tile mode:** scale slider + offset X/Y inputs + transform (rotation) slider.

No cropping UI. If the user wants a cropped image, they pre-crop in an image editor (or we add a dedicated image-edit tool later — not in scope for io-prereqs). Importers that arrive with crop information bake the crop into the source image during import so the stored asset is already the final crop — the model never carries crop metadata.

**Canonical interaction — Pattern fill.**

1. User selects "Pattern" fill kind.
2. Pattern picker shows grid of: (a) built-in patterns (dots, stripes, crosshatch, etc. as SVG patterns shipped by default), (b) user pattern assets.
3. User picks a pattern → element fills. Panel shows Repeat (repeat / repeat-x / repeat-y / no-repeat), Scale, Offset, Rotation.
4. Patterns can be colorized: "Recolor" toggle reveals two color pickers (foreground / background) for monochrome built-in patterns. User-uploaded patterns ignore recolor.

**State binding.**

- Model: `fill: BroadsetFill` where picture is `{ kind: 'picture', assetId, mode: 'stretch' | 'tile', preserveAspectRatio?, tile? }` and pattern is `{ kind: 'pattern', assetId, repeat?, transform? }`.
- Store actions: `setFill(elementId, fill)`, `updatePictureFillTile(elementId, tile)`, `updatePatternFillTransform(elementId, transform)`.
- HeroUI: `Select` for kind; custom grid picker for asset selection; `ButtonGroup` for Mode (Stretch / Tile); `Slider` + `Input` for scale / offset / rotation.

**Edge + error states.**

- **No image assets yet:** picker shows empty state with prominent "Upload image" button.
- **Referenced asset missing:** fill renders as a hatched placeholder ⚠; properties panel shows "Asset missing" with a "Replace" action.
- **Picture fill on text element:** not supported; kind dropdown excludes Picture/Pattern for text kinds (they stay text-fill-only).
- **Pattern transform rotation of 45°:** supported; renderer emits the `transform` attribute on the SVG pattern def.

**Polish.**

- Drag-drop an image file directly onto a selected element: if no fill, becomes picture fill; if already picture fill, replaces asset.
- Asset picker thumbnails are square crops with object-fit cover; tooltip on hover shows filename + dimensions.
- Pattern scale slider shows a live pattern-tile swatch above the slider so users see scale change without looking at the canvas.

**Acceptance.** Cross-region CT: user changes fill kind to Picture → asset picker appears AND canvas re-renders with hatched placeholder AND picking an asset fills the element AND layers panel thumbnail updates.

---

### 5. Arrow endings on strokes

**What.** Stroke head and tail ends rendered as arrows / diamonds / ovals / triangles with size variants. Turns Broadset into a diagramming tool.

**Access path.**

- **Primary:** **Stroke** section of the properties panel. Below the existing stroke controls, two new dropdowns: **Head** and **Tail**.

**Canonical interaction.**

1. User selects a line or path. Opens Stroke section.
2. Below stroke-width / dasharray / linecap / linejoin / miterlimit: two new rows — "Head" (with an icon showing the end of the line) and "Tail" (icon showing the start).
3. Each dropdown is a visual list: **None**, **Triangle**, **Stealth**, **Diamond**, **Oval** with a small SVG preview of each.
4. Picking a shape reveals a secondary row: **Width** (sm / md / lg) and **Length** (sm / md / lg).
5. Canvas updates live.

**State binding.**

- Model: `style.strokeHeadEnd?: ArrowEnd`, `style.strokeTailEnd?: ArrowEnd` where `ArrowEnd = { shape: 'triangle' | 'stealth' | 'diamond' | 'oval' | 'none'; width?: 'sm' | 'md' | 'lg'; length?: 'sm' | 'md' | 'lg' }`.
- Store actions: `setStrokeHeadEnd(elementId, arrow)`, `setStrokeTailEnd(elementId, arrow)`.
- HeroUI: `Select` (or `Listbox` with custom rendering for the shape previews); `ButtonGroup` for size.

**Edge + error states.**

- **Non-line non-path element:** rows show as disabled with tooltip "Strokes on closed shapes don't have ends."
- **Stroke width 0:** arrow endings still render; they scale with width, so 0 hides them.

**Polish.**

- Head/Tail row icons flip horizontally so users can see which end they're editing.
- Keyboard: `Shift+→` and `Shift+←` on a selected line element cycle through arrow shapes on head and tail respectively. (This is an exception to IO-D-12 deferring shortcuts; arrow endings are diagram-centric and shortcuts are discoverable in the tooltip.)

**Acceptance.** Cross-region CT: user sets Head to Triangle → line on canvas renders arrow AND layers panel reflects AND exporting to SVG preserves the `marker-end` attribute.

---

### 6. Per-corner border radius

**What.** Four independent corner-radius inputs (top-left, top-right, bottom-right, bottom-left) with a chain toggle to link them.

**Access path.**

- **Primary:** **Shape** section of the properties panel for rectangle / path elements.

**Canonical interaction.**

1. Section header: "Corner radius" with a chain icon (🔗 locked / 🔓 unlocked).
2. When locked (default), a single input drives all four corners.
3. User clicks the chain icon → unlocks; four inputs appear in a 2×2 grid mirroring canvas corners (TL TR above, BL BR below).
4. Each input accepts a unit-aware value (feature 12): "8", "0.25in", "2mm". Preview is live.
5. Re-clicking the chain icon re-locks to the current max value across corners (with a subtle animation showing the equalization).

**State binding.**

- Model: `style.borderRadius: { tl: number; tr: number; br: number; bl: number } | number` (number for the locked case to keep fixtures compact).
- Store actions: `setBorderRadius(elementId, radius)`.
- HeroUI: `NumberInput` for each corner; a small custom `IconButton` for the chain.

**Edge + error states.**

- **Negative radius:** clamped to 0.
- **Radius > min(width, height) / 2:** visually clamps at rendering (as CSS does); input retains the typed value.
- **Path element with non-rectilinear geometry:** section hidden (per-corner radius doesn't apply to arbitrary paths).

**Polish.**

- The four inputs visually orient relative to the element on canvas (TL is top-left on screen even if the element is rotated).
- Numeric step on wheel/arrow keys matches the element's declared unit (1 for px, 0.01 for in/mm).

**Acceptance.** Cross-region CT: user unlocks corners + sets TL=0 TR=16 BR=0 BL=16 → canvas renders a capsule shape AND layers panel thumbnail updates AND the transform widget continues to track bounds correctly.

---

### 7. Custom font upload

**What.** Users drop `.woff2` / `.ttf` / `.otf` files into the editor; fonts become document assets; font PostScript name + family + embed-permission status are visible; the font becomes available in every font picker.

**Access path.**

- **Primary:** **Assets** panel → "Fonts" section with a "+ Upload font" button.
- **Secondary:** drag a `.woff2` / `.ttf` / `.otf` onto the editor window from the OS file picker (toast: "Imported 1 font: Inter Variable").

**Canonical interaction.**

1. User clicks "+ Upload font" → native file dialog accepts `.woff2`, `.ttf`, `.otf`, `.ttc`.
2. On upload, the font is parsed via `_shared/fonts/resolveFont()`; metadata (PostScript name, family, weight, style, `fsType` embed-permission) is extracted and surfaced in the panel.
3. Font appears as a row in the Fonts section: name + weight/style badge + embed-permission icon (✓ installable / ⚠ preview-print-only / ⛔ restricted).
4. Clicking the row opens a side panel with: file name, PostScript name, family, upright/italic flag, weight (100–900), embed-permission full text, sample rendering at 24pt ("The quick brown fox…").
5. Every font picker across the editor (text panel, properties panel) now lists uploaded fonts in a "Project fonts" group above system fonts.

**State binding.**

- Model: `assets[assetId] = { type: 'font', bytes, format, postScriptName, familyName, subsetRanges? }`.
- Store actions: `uploadFontAsset(file)`, `removeFontAsset(assetId)`.
- HeroUI: `Input type="file"` (hidden, triggered by Button); `Card` rows in the Fonts section; `Modal` for the font details panel (triggered by row click).

**Edge + error states.**

- **File too large (> 5 MB):** reject with a HeroUI `Alert` in the panel: "Font file exceeds 5 MB. Consider subsetting before upload."
- **Unsupported format:** "Unsupported format. Upload .woff2, .ttf, or .otf."
- **Font with `fsType = restricted`:** upload succeeds but row shows ⛔; tooltip: "This font's license forbids embedding. It will not be included in PDF / SVG / PPTX exports." Row still selectable in pickers; renderer uses it at edit time; exports fall back to substitution.
- **Duplicate font (same content hash):** dedup per IO-prereqs Phase 4; toast: "Font already in project." No duplicate entry.

**Polish.**

- Row preview renders the font's name in the font itself (like macOS Font Book).
- Drag-reorder in the Fonts list for project organization.
- Right-click a row → "Find uses" (layers panel filters to elements using this font).

**Acceptance.** Cross-region CT: user uploads a font → Assets panel Fonts section shows row AND font appears in the text panel's family picker AND selecting it on a text element renders with the uploaded font AND exporting to SVG embeds the font.

---

### 8. Print / prepress mode

**What.** Canvas bleed / trim / safe-area guides + per-document color mode (RGB / CMYK / spot) + ICC profile picker. Activates a workflow suited for print output.

**Access path.**

- **Primary:** **Canvas settings** panel (visible when nothing is selected or via a toolbar button).
- **Secondary:** a one-click "Enable print mode" button in a welcome overlay for documents created with a print-oriented template.

**Canonical interaction.**

1. User opens Canvas settings. Existing unit + DPI inputs at top.
2. New **Prepress guides** accordion contains: Bleed, Trim, Safe area — each a single dimension input (unit-aware per feature 12). Values default to 0; setting a non-zero value draws a colored guide on canvas (bleed: red outside the canvas; trim: dashed gray at the canvas edge; safe area: dashed green inside).
3. New **Color mode** row: radio group RGB / CMYK / Spot. Picking CMYK enables the ICC profile row below.
4. **ICC profile** row: "Upload" button + "Use default" dropdown (sRGB2014 / USWebCoatedSWOP / GrayGamma22). Current profile shown as a labeled chip.
5. Once CMYK is selected: every color picker across the editor grows a gamut indicator dot (🟢 in gamut / 🟡 close / 🔴 out of gamut). The preflight panel (feature 13) surfaces out-of-gamut elements.

**State binding.**

- Model: `canvas.bleed?: number`, `canvas.trim?: number`, `canvas.safeArea?: number` (in canvas unit); `settings.colorMode: 'rgb' | 'cmyk' | 'spot'` (per IO-D-13); `document.outputIntent?: { iccProfileAssetId, colorSpace, identifier? }`.
- Store actions: `setCanvasBleed(n)`, `setCanvasTrim(n)`, `setCanvasSafeArea(n)`, `setColorMode(mode)`, `setOutputIntent(intent)`, `uploadIccProfile(file)`.
- HeroUI: `Accordion`, `Input` with unit parsing, `RadioGroup`, `Select` for default profiles, `Input type="file"` for upload.

**Edge + error states.**

- **Bleed > 10% of canvas size:** no block, but preflight warns "unusually large bleed."
- **CMYK selected without a profile:** chip shows ⚠ "No ICC profile — using default SWOP." One-click "Select default" resolves.
- **Switching from CMYK → RGB:** elements with `originalColor` preserved still show correctly; no data loss warning needed.

**Polish.**

- Guides render outside the element selection layer so they're always visible even when elements overlap the canvas edge.
- Guide colors honor a light-theme / dark-theme swap automatically.
- Toggling a guide off hides the value without clearing it — so users can A/B compare.
- The gamut indicator on color chips is a small dot in the top-right of the chip, not intrusive.

**Acceptance.** Cross-region CT: user sets bleed = 3mm → red guide visible on canvas 3mm outside trim AND preflight panel shows "Bleed region defined" AND exporting to PDF emits `/BleedBox` at the correct offset.

---

### 9. Speaker notes per page

**What.** Per-page free-form notes textbox. Deliberately hidden — lives behind a menu entry, not surfaced on the page sorter or toolbar. Users who need it know it's there; users who don't never see it. Round-trips to PPTX `notesSlideN.xml` and PDF speaker-notes annotations; ignored by PSD / SVG.

**Access path.**

- **Primary:** **Document menu → "Speaker notes…"** (or whichever top-level menu hosts per-page concerns). Opens a compact floating panel (HeroUI `Popover`) anchored to the menu. No toolbar button, no bottom-tab surface.
- **Secondary:** `⌘⇧N` toggles the panel — discoverable via the menu shortcut hint, not advertised elsewhere.

**Canonical interaction.**

1. User picks Document → Speaker notes… The notes panel opens as a narrow floating panel over the right rail (or wherever fits without obscuring canvas).
2. Panel header: "Speaker notes — Page 2 of 5" (auto-syncs to the currently-active page). Left/right arrow icons step between pages while the panel is open.
3. Panel body: a single `Textarea`, autosize up to 400 px with internal scroll past that. Plain text for now; structured `TextBody` support arrives with feature 2's rich-text model but the notes textbox stays plain to keep it hidden-and-simple.
4. Changes autosave on blur (per-keystroke ephemeral update + single history entry on blur).
5. Panel closes on Esc, or by clicking elsewhere, or via the menu item again.

**State binding.**

- Model: `Page.notes?: string | TextBody` (only `string` surfaces in the UI for now).
- Store actions: `setPageNotes(pageId, notes)`.
- HeroUI: `Popover` anchored to the menu item; `Textarea` autosize; small `IconButton` arrows for prev/next page.

**Edge + error states.**

- **Empty notes:** panel opens with an empty textarea; nothing distinguishes empty vs. populated in the rest of the UI (by design — this is a hidden feature).
- **Very long notes:** textarea caps at 400 px with internal scroll; no truncation.
- **Panel open + user deletes active page:** panel re-anchors to the new active page; notes textarea shows that page's notes.

**Polish.**

- The menu item label is "Speaker notes…" (trailing ellipsis indicates it opens UI). Keyboard-shortcut hint `⌘⇧N` shown in the menu.
- When the user switches pages via the toolbar-nav while the notes panel is open, the panel content follows seamlessly.
- No visible indicator anywhere outside the panel that a page has notes (per the "deliberately hidden" design). Preflight (feature 13) optionally lists pages with notes when targeting a format that carries them (PPTX / PDF).

**Acceptance.** Cross-region CT: user opens Document menu → Speaker notes…, types notes for page 2, closes panel → exporting to PPTX includes `notesSlide2.xml` with the text AND re-importing preserves the notes AND the notes panel on re-open shows them for page 2.

---

### 10. Conic gradient editor

**What.** Real conic gradients with panel-only controls: a center point input (fractional x/y 0–1), a start-angle input, and per-stop color pickers. **No on-canvas overlay handles** — io-prereqs does not introduce canvas-overlay handle infrastructure. If a future dedicated "gradient element" type is added, its handles can live on the element itself; until then, everything is in the properties panel. Falls back to a many-stop linear approximation visually on export to SVG (which has no native conic) but metadata preserves the conic spec for round-trip.

**Access path.**

- **Primary:** **Fill** section → fill kind "Gradient" → gradient-type toggle **Linear / Radial / Conic**.

**Canonical interaction.**

1. User picks Gradient fill → kind toggle defaults to Linear; user clicks **Conic**.
2. Gradient editor expands in place: a horizontal strip with stops as draggable dots + a per-stop color chip.
3. Below the strip: two rows. **Center** — paired `NumberInput` x / y (both 0–1 fractional, step 0.01, with a small "preview dot" widget showing the position within a thumbnail of the element). **Start angle** — single numeric input + a slim 360° slider, step 1° (Shift-drag snaps to 15°). No canvas overlay.
4. Double-click on the strip adds a stop; drag a stop off the strip removes it. Per-stop color chip opens the shared color picker (feature 1 applies).
5. Per-stop "Color space" dropdown (available via a chevron on the chip) lets the user pick sRGB / OKLCH / display-p3. The renderer uses the chosen space when computing stop interpolation (culori).

**State binding.**

- Model: `BroadsetGradient = { type: 'conic'; stops: GradientStop[]; center: { x, y }; startAngle?: number }`; `GradientStop = { offset: 0..1; color: BroadsetColor; mods?: ColorMods }`.
- Store actions: `setGradientType(elementId, type)`, `addGradientStop(elementId, stop)`, `updateGradientStop(elementId, index, overrides)`, `removeGradientStop(elementId, index)`, `setConicCenter(elementId, { x, y })`, `setConicStartAngle(elementId, degrees)`.
- HeroUI: custom stop-strip component; `Popover` for color pickers; `Select` for color-space; `NumberInput` + `Slider` for center and start-angle.

**Edge + error states.**

- **Single stop:** invalid; editor prevents removing down to 1 stop.
- **Overlapping stops:** supported (two stops at the same offset create a hard transition); renderer handles naturally.
- **Center outside [0, 1]:** inputs reject out-of-range values (clamp at edit time).
- **Start angle outside [0, 360):** modulo on input; `-30` becomes `330`.

**Polish.**

- Center preview-dot widget in the panel is a 60×60 thumbnail of the element's bounds with a draggable dot. Dragging the dot updates x/y; the dot position reflects the current x/y. This is the only "direct manipulation" affordance — and it lives inside the panel, not on the canvas.
- Start-angle slider shows a degree tick every 45°.
- Hovering a stop on the strip briefly darkens the corresponding wedge in the center-dot thumbnail — visual correlation without canvas overlay.

**Acceptance.** Cross-region CT: user picks Conic → center + angle inputs appear in the panel AND changing the center x fraction moves the gradient origin on canvas live AND exporting to SVG emits a many-stop linear approximation with metadata preserving the conic spec.

---

### 11. Page sorter UX upgrade

**What.** Existing multi-page document support (pages are already in the model and toolbar) gains a proper sorter UI: drag to reorder, duplicate, delete, per-page visibility toggle. Speaker notes are NOT surfaced here — they live behind the Document menu (feature 9). This is an upgrade to existing UX, not a new feature class.

**Access path.**

- **Primary:** toolbar "Pages" button opens / closes the sorter as a horizontal filmstrip below the canvas.
- **Secondary:** `⌘\` toggles the sorter.

**Canonical interaction.**

1. User opens sorter. Horizontal strip shows each page as a ~120×80 thumbnail rendered by the screen renderer at reduced resolution.
2. Drag a thumbnail left/right to reorder. Live thumbnails reflow; canvas page index updates when drop completes.
3. Right-click a thumbnail → context menu: **Duplicate**, **Delete**, **Toggle visibility**, **Rename**.
4. Visibility toggle (👁 / 👁‍🗨 icon overlay on thumbnail): hidden pages render with 50% opacity in the sorter and skip during export.
5. Double-click a thumbnail → canvas jumps to that page.

**State binding.**

- Model: `document.pages[]`; `Page.visible`, `Page.name`. (`Page.notes` is bound by feature 9, not here.)
- Store actions: `reorderPage(fromIndex, toIndex)`, `duplicatePage(pageId)`, `deletePage(pageId)`, `togglePageVisibility(pageId)`, `renamePage(pageId, name)`.
- HeroUI: `Button` for toolbar; custom filmstrip (drag-and-drop); `Menu` for context actions.

**Edge + error states.**

- **Last page:** delete disabled; tooltip "A document must have at least one page."
- **Many pages (> 30):** filmstrip scrolls horizontally with momentum; a "Jump to page" input in the sorter header.
- **Hidden pages during export:** preflight lists how many are hidden; user can override per-export.

**Polish.**

- Thumbnail renders update live as the user edits the active page — debounced at 250ms to avoid thrash.
- Drop indicators are a 2px accent-colored line between thumbnails; never ambiguous.
- Keyboard navigation: ← / → move between pages when sorter is focused; `⌘D` duplicates; `Delete` removes (with confirmation if page has content).

**Acceptance.** Cross-region CT: user drags page 3 to position 1 → canvas reflects page 3 content as the new first page AND toolbar page indicator updates AND element references bound to `pageId` remain correct (no renumber bug).

---

### 12. Unit-aware dimension inputs

**What.** Any dimension input (position, size, font size, stroke width, corner radius, bleed, etc.) accepts values in any supported unit: "24px", "2cm", "0.25in", "12pt", "1.5em". Parser converts to the canvas declared unit automatically.

**Access path.**

- **Universal.** Every numeric dimension input across the editor.

**Canonical interaction.**

1. Dimension input shows the current value in the canvas unit (e.g. "96 px" when canvas is px, "25.4 mm" when canvas is mm).
2. User types "1in" and tabs out → input converts to "96 px" (or "25.4 mm" if canvas unit is mm) and commits.
3. Typing a unit suffix overrides the canvas unit for that entry; no unit keeps the current unit.
4. Invalid input (e.g. "foo") reverts to prior value and shows an inline hint: "Enter a number or a value like '2cm' / '24pt' / '1.5em'."

**State binding.**

- Model: dimension values remain in canvas unit; `parseLength()` (io-prereqs Phase 1) converts on input, renderer never sees mixed units.
- Store actions: whatever the input is bound to — `setElementWidth`, `setFontSize`, etc. — no change to store shape.
- HeroUI: `Input` with an `onBlur` conversion handler.

**Edge + error states.**

- **em without a font-size context:** when the input is font-size itself, em resolves against the element's inherited font-size. For other inputs, em resolves against the element's own font-size; if unavailable, falls back to 16px.
- **Very large value (> 10000 in canvas units):** accepted; the renderer clamps / reports via preflight.

**Polish.**

- Small unit-suffix dropdown on the right of the input shows the parsed unit; clicking changes how the value displays (converts, doesn't change the stored number).
- Arrow keys step by canvas-unit-appropriate amounts (1 for px, 0.01 for in/mm).
- Paste of "24 pt" (with space) parses identically to "24pt".

**Acceptance.** Unit test per parser case + one CT: user types "1in" in the width input → element width on canvas reflects 96 px (for px canvas) or 25.4 mm (for mm canvas) AND position anchors update correctly.

---

### 13. Export preflight panel

**What.** Pre-export diagnostics panel listing every issue across: missing fonts, out-of-gamut colors (per current color mode), overflow-bleed, image resolution below threshold, embed-permission issues, broken asset references. Warn-and-proceed per IO-D-14.

**Access path.**

- **Primary:** **Export** menu → "Preflight" item, or the preflight button in the export options modal.
- **Secondary:** a subtle status chip in the bottom toolbar: "Preflight: 3 warnings" — click to open.

**Canonical interaction.**

1. User opens preflight. Panel lists issues grouped by category. Each issue is a row with: severity icon (⚠ / ℹ), a one-line description, an element link (clickable — selects the element on canvas and scrolls it into view), and a "Fix" action where resolvable.
2. Categories: **Fonts** (missing, restricted-embed), **Colors** (out-of-gamut, not-in-profile), **Images** (low resolution, missing), **Layout** (bleed overflow, off-canvas elements), **Compliance** (for PDF/A: features the current mode forbids — only visible when the export target is PDF/A).
3. Clicking an issue selects the element; the properties panel jumps to the relevant field.
4. "Fix" actions where possible: missing font → substitute dropdown; low-res image → replace action.
5. A single "Export anyway" button at the bottom proceeds per IO-D-14.

**State binding.**

- No model change; preflight reads current document + export target and runs a pure function per category. Panel subscribes to store changes and re-runs live (debounced).
- HeroUI: `Accordion` per category; `Card` rows; `Alert` for high-severity items.

**Edge + error states.**

- **No issues:** empty state with a green ✓ and "Ready to export."
- **Many issues (> 50):** categories show counts; rows are virtualized.

**Polish.**

- Re-running preflight after a fix feels instant — list updates optimistically.
- Keyboard: j / k to navigate rows, Enter to select on canvas (mirrors mail-client conventions).

**Acceptance.** Cross-region CT: user changes color mode to CMYK → preflight panel lists out-of-gamut elements AND clicking one selects it on canvas AND the "Fix" action (convert to nearest in-gamut) updates the element live.

---

### 14. Document info panel (Dublin Core)

**What.** Title, author, subject, keywords, rights, producer — the Dublin Core document-metadata set. Consumed by PDF XMP, PSD XMP, SVG `<metadata>`, PPTX `docProps/core.xml`.

**Access path.**

- **Primary:** **Canvas settings** panel (when nothing selected) → **Document info** accordion.
- **Secondary:** File menu → "Document info…" (opens a focused modal).

**Canonical interaction.**

1. User opens Document info. Fields: Title, Author, Subject, Keywords (tag input), Rights, Producer. Each a simple `Input` or `Textarea`.
2. Keywords: HeroUI `Input` with tag chips — type a word, Enter to add; click × on a chip to remove.
3. All fields optional; empty = no metadata emitted.

**State binding.**

- Model: `document.metadata: { title?, author?, subject?, keywords?, rights?, producer? }`.
- Store actions: `setDocumentMetadata(fields)`.
- HeroUI: `Accordion`, `Input`, `Textarea`, tag-input (custom built on `Chip` + `Input`).

**Edge + error states.**

- **Very long title (> 200 chars):** allowed; renderer truncates in the document title bar with ellipsis.
- **No rights field + CC-licensed asset in document:** preflight suggests rights = "CC BY 4.0" as a nudge.

**Polish.**

- Title updates the editor window title bar live ("Untitled" → the typed value).
- Keywords supports comma-paste: pasting "one, two, three" creates three chips.

**Acceptance.** Cross-region CT: user types title "My Deck" → window title bar updates AND exporting to PDF embeds the title in XMP `dc:title`.

---

### 15. Import warnings + reconciliation UI

**What.** Two separate surfaces: (a) **import-warnings modal** appears after any import with a non-empty report (dropped features, sanitization results, mixed-run text notices); (b) **reconciliation UI** appears after re-importing a previously-exported file that has been edited externally — a diff view of per-element changes with accept / reject / deletion-confirm flows.

**Access path.**

- **Primary (import warnings):** modal appears automatically after import if warnings ≥ 1. Also accessible from the "Last import" entry in the File menu.
- **Primary (reconciliation):** modal appears automatically after re-import when the system detects tagged metadata + external edits. Also accessible from the layers-panel conflict indicators.

**Canonical interaction — import warnings.**

1. User imports `deck.pptx`. Importer runs; report has 5 warnings.
2. Modal opens centered: header "Import complete — 5 notices". Each warning is a row: severity + one-line message + "View element" link.
3. User can dismiss individually or close the modal. Dismissed warnings still accessible from the "Last import" menu.
4. Cross-navigation: clicking a row selects the element on canvas.

**Canonical interaction — reconciliation.**

1. User re-imports `deck.pptx` that they previously exported and edited in PowerPoint.
2. Reconciler runs via `_shared/reconcile/`. Result: 3 elements modified externally, 1 added externally, 2 present in preserved metadata but missing from the slide (possible deletions).
3. Modal opens with three tabs: **Modified** (3), **Added** (1), **Deleted** (2).
4. Each row in Modified shows a per-field diff (e.g. position: before/after). User clicks accept / reject per field or per element. Default: accept-all.
5. Added tab lists new elements with previews; default: import all onto "Imported from PPTX" page (the staging page from io-prereqs Phase 5).
6. Deleted tab lists potentially-deleted elements with previews; user must explicitly accept (deletion confirmation modal — IO-D-18 anti-silent-drop).
7. "Apply" commits the reconciliation; "Cancel" discards the re-import (returns to the prior state).
8. Layers panel gains a ⚠ marker next to elements that had external edits; clicking the marker re-opens reconciliation for that element only.

**State binding.**

- Import warnings: read from the format-specific `ImportReport`.
- Reconciliation: `ReconcileResult` shape from `_shared/reconcile/`: `{ modifications, additions, deletions, recoveredByHash }`.
- Store actions: `applyReconciliation(result, decisions)`, `cancelReconciliation()`.
- HeroUI: `Modal` + `Tabs` + `Card` rows + `Badge` for counts.

**Edge + error states.**

- **No warnings on import:** no modal.
- **No external edits detected on re-import:** no reconciliation modal; toast "Re-imported cleanly."
- **Reconciliation canceled:** document state is fully restored (reconciliation is a pending state until Apply).

**Polish.**

- Diff rows use side-by-side swatches for color changes, before/after position strings for geometry, a text diff for content.
- Clicking a row pulses the corresponding element on canvas.
- Accept-all / Reject-all quick actions in each tab header.
- The staging page ("Imported from PPTX") is clearly labeled with an icon + non-removable tooltip: "This page collects content from an external import. Move elements to other pages to keep them."

**Acceptance.** Cross-region CT: user imports a PPTX → import-warnings modal opens AND clicking a warning selects the element on canvas AND closing the modal restores normal UI; separately, user re-imports an externally-edited PPTX → reconciliation modal opens with tabs AND accepting a field change updates the element live AND canceling restores the pre-import state.

---

## Cross-feature UX considerations

These apply across every feature in this plan.

### Panel layout

- The properties panel lives on the right rail and is accordion-based. Every new section added by this plan slots into the existing accordion order: **Geometry → Shape → Fill → Stroke → Text → Filters → Effects → Animations → Data**. Arrow endings (feature 5) go inside Stroke. Per-corner radius (feature 6) goes inside Shape. Filter stack (feature 3) is a new top-level section between Stroke and Effects.
- Collapsed sections pre-allocate their header space; toggling open animates the body with a fixed height animation (no jumping).
- Each section shows a count / status badge in its header when non-default (e.g. "Filters · 2", "Fill: Picture", "Corners: TL 0 / TR 16 / BR 0 / BL 16").

### Color picker

The shared color picker (used by fill, stroke, fontColor, textStroke.color, gradient stops, bullet color, filter primitive colors, theme slots) is a single component with two tabs (Custom / Theme) and a modifiers expander. It lives in `packages/ui/src/inputs/color-picker.tsx` and is consumed everywhere. No format-specific variants.

### Canvas chrome

- Guides (bleed / trim / safe area) render on the canvas-chrome layer above the content layer but below the transform-widget layer. They never receive pointer events.
- **No new canvas-overlay handle infrastructure.** Picture-fill cropping is out of scope (feature 4); conic-gradient center / angle are panel-only inputs (feature 10). The Transform widget stays as-is. If a future element type (e.g. a first-class "gradient" element) needs its own handles, they live on that element, not as a generic overlay layer. This keeps the canvas-interaction surface simple and avoids infrastructure work that wouldn't be shared across formats.

### Import warnings surfacing

- Every import (any format) always returns a report; the modal only opens when `report.warnings.length > 0`. Empty reports surface as a success toast: "Imported 3 pages, 142 elements."
- The modal is non-blocking; users can close it and keep working, but the "Last import" File-menu item surfaces it again.

### Accessibility

- Every color chip has an `aria-label` that reads the resolved RGB + the slot name if bound. Example: "Fill color: #336699, theme accent3 with 15% lumMod."
- Every drag handle is keyboard-operable (focus + arrow keys + Enter to pick up / drop).
- Modals trap focus; Esc dismisses; return focus to the invoking control.
- Preflight row links announce "Select element on canvas" on focus.

### Telemetry / learning

- First-time use of each feature (theme slot binding, picture fill, filter stack, font upload, print mode) surfaces a one-line inline tip next to the control. Tip dismissible; dismissed state persists per feature in local storage (not in the model).

## Acceptance roll-up

Every feature above is covered by at least:

- One unit test exercising the store action.
- One cross-region CT per IO-prereqs Phase 6 standards.
- One entry in the demo `sampleDocument.json` that exercises the feature end-to-end.
- One accessibility pass (Tab order, aria labels, color contrast — via automated axe-core in the CT suite).

## Sequencing

Features map to io-prereqs Phase 5 (editor UI surface). The recommended landing order within Phase 5:

1. **Shared color picker** (foundation for features 1, 4, 10) — prerequisite.
2. **Feature 12: Unit-aware inputs** — touches every dimension input; landing first avoids a double-migration.
3. **Feature 1: Theme system** — unlocks color-binding UX for downstream features.
4. **Feature 2: Rich text editor** — large surface; land in its own commit series (run-edit mode, then bullets + links + lang).
5. **Feature 3: Filter stack** — independent; can land in parallel with 2.
6. **Feature 4: Picture fill / pattern fill** — depends on shared color picker + asset panel updates.
7. **Feature 6: Per-corner radius** — small; land anytime.
8. **Feature 5: Arrow endings** — small; land anytime.
9. **Feature 7: Custom font upload** — depends on io-prereqs Phase 4 font asset type.
10. **Feature 10: Conic gradient editor** — depends on shared color picker. Panel-only controls; no canvas-overlay handles.
11. **Feature 11: Page sorter upgrade** — independent.
12. **Feature 8: Print mode** — depends on features 12 (units) + Canvas settings panel.
13. **Feature 14: Document info panel** — tiny; land alongside feature 8.
14. **Feature 9: Speaker notes** — tiny; land alongside feature 11.
15. **Feature 13: Preflight panel** — best landed near the end once most feature data is present.
16. **Feature 15: Import warnings + reconciliation UI** — lands when the first format's Phase 4 needs it.

Each feature is a small-to-medium commit series. Every feature ends on a green `npm run gate:full` and `npm run ct`.

## Decisions taken from prior open questions

- **Speaker notes surface** — menu-only (Document → Speaker notes…). Deliberately hidden from the sorter, toolbar, and bottom bar. No presentation mode today; the menu entry is the one surface.
- **Canvas-overlay handles** — not introduced by io-prereqs. Cropping (picture fill) removed entirely; conic gradient center / angle are panel-only. If a future dedicated element type needs handles, they live on that element.
- **Theme** — one theme per document, customizable in place. No preset gallery, no theme swap. The default document ships with one sensible starter theme.
- **Color mode** — per-document per IO-D-13. No per-element override. Users who need a mixed-mode document create a separate document for the exception.

## Open questions

(None currently — will accumulate as Phase 5 work surfaces them.)
