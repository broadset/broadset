# IO Prereqs Plan

Status: draft — pre-Phase 0. Shared prerequisite to [psd-support-plan.md](./psd-support-plan.md), [pdf-support-plan.md](./pdf-support-plan.md), [pptx-support-plan.md](./pptx-support-plan.md), and [svg-support-plan.md](./svg-support-plan.md). Every item here is cross-format by design; no format owns any of it.

Broadset cannot round-trip PSD, PDF, PPTX, or SVG with minimal loss until the app itself has a set of cross-cutting foundations in place. Those foundations do not belong to any single format — they are shared infrastructure (data model, renderer, asset pipeline, shared modules, editor UI, testing) that every format importer/exporter plugs into. This plan separates that shared work out so it can land once and stay stable, rather than being re-solved inside each format plan.

## Why a single plan

Four forces justify a single cross-format prereqs document:

1. **Model changes can't be per-format.** Rich text, theme colors, per-element fills, structured filter primitives, content-hash identity, per-element preservation dirty flags, and the `extensions.<format>` contract are properties of every element in the store — not something a single format importer can sneak in under its own namespace.
2. **Shared libraries are expensive if forked.** Text shaping, color management, font subsetting, XMP parsing, content hashing, DOMPurify sanitization, and reconciliation all need to be installed, lazy-loaded, and tested _once_. If each format plan owns its own instance, we pay the bundle cost multiple times and diverge on behavior.
3. **Cross-format reconciliation has one answer.** "Import file → user edits in external tool → re-import and reconcile edits vs. preserved metadata" is the same algorithm whether the file is PSD, PDF, PPTX, or SVG. One module used four ways — not four near-duplicates.
4. **Editor UI cannot be format-specific.** A run-edit UI, a gradient editor, a swatches panel, a preflight panel, a reconciliation diff view: each belongs to the editor, not to the PSD or PDF importer. Exposed once, consumed by every format.

Scope guard: every item in this plan is structured to serve at least two formats. Format-specific prereqs live in the format-support plans themselves.

## User-facing outputs

io-prereqs is motivated by format round-trip, but most of what it lands also shows up as a first-class product feature in the editor. Detailed UX specs for each feature live in [io-prereqs-ui-features-plan.md](./io-prereqs-ui-features-plan.md); the list here is the headline map from plumbing to user value:

- **Design-token / theme system** — the `BroadsetColor.theme` variant (IO-D-05) + swatches panel lets users define accent1–6, lights, darks, and recolor the whole document by swapping the theme.
- **Rich text editor** — runs + paragraphs + bullets + hyperlinks + per-run `lang` + per-run styling. Range-select inside a text element and style just that range.
- **Filter stack editor** — drag-reorder stack of drop-shadow / blur / color-matrix / brightness / contrast / saturate / hue-rotate / grayscale / sepia / invert / opacity primitives. Multiple filters per element with live preview.
- **Picture fill & pattern fill** — any rectangle / ellipse / path fillable with an image asset or repeating pattern. Stretch or tile; no cropping (importers bake crops into the source image so the stored asset is already the final crop).
- **Arrow endings on strokes** — `strokeHeadEnd` / `strokeTailEnd` turns lines into arrows / flowchart connectors.
- **Per-corner border radius** — four independent corner inputs with a chain toggle.
- **Custom font upload** — users drop `.woff2` / `.ttf` / `.otf`, fonts become project assets, embed-permission is visible.
- **Print / prepress mode** — canvas bleed / trim / safe-area guides + per-document color mode (RGB / CMYK / spot) + ICC profile picker + preflight panel.
- **Conic gradient editor** — real conic gradients with panel-editable center point (fractional 0–1 x/y) + start-angle input + per-stop colors. No on-canvas overlay handles.
- **Unit-aware dimension inputs** — type "2cm" or "24pt" in any dimension field; auto-converts to canvas unit.
- **Page sorter upgrade** — reorder / duplicate / delete via drag + per-page visibility toggle. (Multi-page already exists; this is a UX upgrade.)
- **Per-page speaker notes** — free-form text box per page, accessed from a menu entry (intentionally hidden, not on the sorter). Round-trips to PPTX `notesSlide*.xml` and PDF speaker-notes annotations; ignored by PSD / SVG.
- **Export preflight panel** — pre-export diagnostics: missing fonts, out-of-gamut colors, overflow-bleed, embed-permission issues.
- **Document info panel** — title, author, subject, keywords, rights, producer (Dublin Core).
- **Import warnings + reconciliation UI** — diff view with accept/reject per element, deletion-confirmation modal, conflict indicators in the layers panel for elements that diverged in an external edit.

Pure plumbing (no UI surface): content-hash identity, extensions typing + dirty-flag middleware, importer contract + security contract, `_shared/*` modules, bundle-size assertion, chain-CT harness, preserved-blob stress test, renderer safe-DOM builder.

## What already exists — do not redo

Quick inventory confirmed against the current code before writing this plan:

- **Per-element `extensions` pass-through** — [packages/model/src/element.ts:99](../../packages/model/src/element.ts#L99) and [packages/model/src/document.ts:149](../../packages/model/src/document.ts#L149). Typed as `Record<string, unknown>`; format importers store namespaced preserved blobs here.
- **Per-element `opacity`, stroke (width, dasharray, cap, join), fill opacity, fill rule, stroke opacity** — [packages/model/src/style.ts](../../packages/model/src/style.ts).
- **Gradient type:** `BroadsetGradient` with `type: 'linear' | 'radial' | 'conic'`, ascending `stops[]`, optional `angle` — already a structured discriminated type.
- **Mask hook:** `maskType: 'none' | 'alpha' | 'luminance' | 'custom'`.
- **Typography fields:** `fontFamily`, `fontSize`, `fontColor`, `fontWeight` (100–900), `fontStyle`, `textStroke`, `fontVariationSettings`, `letterSpacing`, `textDecoration`, `textAlignment`.
- **Text autofit modes** (`fixed` / `auto-height` / `shrink-to-fit`) — [packages/model/src/element.ts:96](../../packages/model/src/element.ts#L96).
- **Element UUID stability** — [packages/model/src/element.ts:190](../../packages/model/src/element.ts#L190). Foundation for tag-based round-trip identity.
- **Group element type + validated `parentId` tree with cycle and orphan checks** — [packages/model/src/document.ts:220](../../packages/model/src/document.ts#L220). No work needed in the model for groups.
- **Data binding primitives:** `dataField`, `visibleWhen`, `repeater` on elements; `dataSchema` on document.
- **Animations:** `animations` array on the document with `KeyframeValue` discriminated union.
- **Pages as override layers:** `content`, `style`, `visible`, `assetId` overrides per page.
- **Canvas declares `unit` and `dpi`** — per [AGENTS.md](../../AGENTS.md). Needs UI exposure, but the model is correct.

The model is in strong shape. The gaps are in (1) text model, (2) color model, (3) fill and stroke extensions, (4) filter primitives, (5) extensions typing + dirty flag, (6) content-hash identity, (7) renderer's `innerHTML` path, (8) font/image asset typing, (9) shared cross-format modules, (10) editor UI surface, (11) testing infrastructure.

## Cross-format design decisions

Ratify in [decisions.md](./decisions.md) during Phase 0 before any code lands.

| #       | Decision                                                                                                                         | Recommended resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IO-D-01 | **Runs, not HTML, for text storage.**                                                                                            | Structured runs + paragraphs are the canonical representation. PSD, PPTX, Word, Figma, Sketch, every typography engine uses runs. HTML↔runs translation is lossy both ways, and HTML from an attacker-supplied importer is the unsafe-DOM surface flagged in [typescript.instructions.md](../../agents/instructions/typescript.instructions.md). If HTML is needed at an export boundary (PDF text, clipboard, SVG `<foreignObject>`), serialize runs→HTML at that boundary — never let HTML into the store.                                                                                                                                                                 |
| IO-D-02 | **Bake-to-path for non-trivial affine transforms.**                                                                              | Do not add `scale` or `skew` to elements. When an importer hits a transform that can't be expressed by `position` + `rotation`, convert the shape to a path and bake the transform into `d`. Matches user intuition; keeps the model small.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| IO-D-03 | **Structured filter primitives replace the CSS filter string.**                                                                  | The `filter`/`backdropFilter` strings on style today become a discriminated union of filter primitives (`drop-shadow`, `blur`, `color-matrix`, …). Renderer derives the CSS string view. Canonical form is typed primitives, not strings.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| IO-D-04 | **`fill` becomes a discriminated union.**                                                                                        | `{ kind: 'none' } \| { kind: 'solid'; color } \| { kind: 'gradient'; gradient } \| { kind: 'pattern'; … } \| { kind: 'picture'; assetId; mode: 'stretch' \| 'tile'; preserveAspectRatio?; tile? }`. Cleaner than bolting fill types onto flat color fields. No cropping in the model — importers bake crops into the source image on import.                                                                                                                                                                                                                                                                                                                                 |
| IO-D-05 | **Color becomes a discriminated union; never silently downgrade color space.**                                                   | `{ kind: 'rgb'; hex } \| { kind: 'theme'; slot; mods? }`. Unlocks PPTX theme-color round-trip, and color-space-preserving stops for SVG/PDF when `kind: 'rgb'` is extended with optional `space` and `originalColor` preservation strings. Export rule: when the target format cannot represent the source color space (e.g. OKLCH → PPTX sRGB), preserve `originalColor` on re-import and surface a preflight warning. No silent flattening to sRGB hex.                                                                                                                                                                                                                    |
| IO-D-06 | **`TextRun[]` as type now, editor support staged.**                                                                              | Land the paragraphs/runs types with Phase 1 so every importer has somewhere to put mixed-run text. Full run-edit UI lands in Phase 5. Imported multi-run text editable only at whole-element level until the UI lands — surfaced via a "this text has multiple runs" modal.                                                                                                                                                                                                                                                                                                                                                                                                  |
| IO-D-07 | **Cross-format logic lives under `packages/formats/src/_shared/`; format-specific libraries may be imported directly.**          | `_shared/*` is for logic or library wrappers that serve ≥2 formats (color math, font subsetting, XMP parsing, reconcile, fingerprint, sanitize, shape-classifier, text-layout). Not a separate package — keeps the change surface small. Format-only libraries (`pdf-lib`, `pdfjs-dist`, `ag-psd`, `svgpath`, `css-tree`, `transformation-matrix`, `fflate`, `svgo`, …) are imported directly by the format package that needs them — no pointless wrapper. If a format's "private" library later turns out to be shared, factor into `_shared/` when the second consumer lands, not before.                                                                                 |
| IO-D-08 | **`broadset:` XMP namespace shared across carriers.**                                                                            | Same XMP namespace in PDF XMP, PSD XMP, SVG `<metadata>`, TIFF XMP. Downstream tooling sees one Broadset footprint regardless of container.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| IO-D-09 | **`@font-face` embedding is the default for Broadset-owned exports.**                                                            | SVG export, PDF export, and PPTX export embed subsetted fonts by default. `reference` / `flatten` are opt-ins per-format.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| IO-D-10 | **Properties-panel exposure gates every new round-trippable field.**                                                             | No shipping a model field without a user-editable UI on it, except fields explicitly documented as "imported-only, no UI surface" (e.g. low-level filter primitives a user would never hand-author). Principle: if the user can import it but can't edit it, round-trip through editing is broken.                                                                                                                                                                                                                                                                                                                                                                           |
| IO-D-16 | **Animation export policy: emit the fully-entered "IN" state; discard animations that don't map to the target format natively.** | Exporters render each element in its fully-entered state — the visual state where all entry keyframes have completed and no exit keyframe has started, i.e. the resting composition a viewer would see mid-presentation. Animation data itself is **not** serialized into the target file unless the format supports animations natively and the Broadset animation maps cleanly onto the format's own model (e.g. PPTX `<p:timing>` for mappable entries). Unmappable animations are discarded silently on export; the `.bsp` remains the source of truth. No XMP / custom-XML / `<metadata>` round-trip for animation data. Documented as known-lossy in each format spec. |
| IO-D-17 | **No sidecars. Standards-only round-trip carriers.**                                                                             | Every format's round-trip metadata lives inside the format file using mechanisms the format's native specification already documents: PDF XMP + marked content, PSD XMP + `additionalInfo`, PPTX `<p:extLst>` + custom XML parts + shape names, SVG `<metadata>` RDF + `data-bs-*` + namespaced attributes. No out-of-package sidecar JSON, no embedded-file attachments used as sidecars, no app-private streams outside the format's own documented extension mechanism. This makes Broadset exports survive any chain where the intermediate tool respects the format's own spec.                                                                                         |
| IO-D-18 | **No silent drops. Unknown content preserved as `extensions.<format>.raw` or opaque fragment.**                                  | Every importer either maps a source construct to a native Broadset element, or preserves the raw source fragment for lossless re-emission when the element's `extensions.<format>.dirty === false`. SVG uses opaque `svg`-type elements; PDF/PSD/PPTX use `extensions.<format>.raw` under the typed-namespace contract. Every preservation path emits a warning in the import report. Enforced by tests in each format plan's Phase 5.                                                                                                                                                                                                                                       |

## Phase plan

Each phase is a coherent landing unit. Unless noted, each phase ends on a green `npm run gate:full`. Phase 5 (editor UI) ends on a green `npm run ct`.

### Phase 0 — Decisions + spec-first updates (no code)

- Ratify IO-D-01 through IO-D-10 in [decisions.md](./decisions.md).
- Pre-update the model specs under [project/spec/model/](../spec/model/) with the shapes the subsequent phases land. Per [CONTRIBUTING.md](../../CONTRIBUTING.md) §Backpropagate Into Specs: spec lands alongside (or before) code.
- No migrations planned — Broadset is greenfield per [AGENTS.md](../../AGENTS.md) §Greenfield. Fixtures and tests are updated in the same commits as the model changes.

### Phase 1 — Core model additions

Every bullet updates [project/spec/model/](../spec/model/) in the same commit as the code. All fields are added with Zod validation, `.superRefine` checks where needed, unit tests for the validator, and fixture updates.

**Text model — structured runs and paragraphs**

- Replace `content: string` on text elements with `content: string | TextBody` (keep the flat-string form so non-rich text isn't inflated):

  ```ts
  type TextBody = { paragraphs: readonly Paragraph[] };
  type Paragraph = {
    readonly runs: readonly Run[];
    readonly props?: ParagraphProps;
  };
  type ParagraphProps = {
    readonly align?: 'start' | 'end' | 'center' | 'justify';
    readonly indent?: number;
    readonly lineSpacing?: number;
    readonly spaceBefore?: number;
    readonly spaceAfter?: number;
    readonly bullet?: Bullet;
    readonly level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  };
  type Run = { readonly text: string; readonly props?: RunProps };
  type RunProps = Partial<TextStyle> & {
    readonly lang?: string; // BCP 47
    readonly hyperlink?: { url: string; tooltip?: string; target?: '_blank' | '_self' };
  };
  type Bullet =
    | { kind: 'none' }
    | { kind: 'char'; char: string; font?: string; color?: BroadsetColor }
    | {
        kind: 'auto';
        format: 'arabicPeriod' | 'arabicParenR' | 'romanUcPeriod' | 'alphaLcPeriod' | string;
        startAt?: number;
      };
  ```

- Validator: reject overlapping runs, negative offsets, and empty paragraphs. Spec gap: paragraph count upper bound (TBD after fixture analysis).
- **Text-on-path reference.** Promote `textPathElementId` to a first-class field on text elements. Validate it points to an existing `path` element in the same document. Cycle check.
- **Text fidelity fields on style:** `textAnchor: 'start' | 'middle' | 'end'`, `textLength?`, `lengthAdjust?`, `wordSpacing?`, `textTransform?`, `lineHeight?`. SVG-specific but usable from PDF and PPTX.
- **Model-level script rejection.** The element Zod schema `refine()`s that any imported `content` string does not include raw `<script>` or `on*=` — last line of defense after DOMPurify.

**Color model — discriminated union**

```ts
type BroadsetColor =
  | { kind: 'rgb'; hex: `#${string}`; space?: 'srgb' | 'display-p3' | 'oklch' | 'oklab'; originalColor?: string }
  | { kind: 'theme'; slot: ThemeSlot; mods?: ColorMods };
type ThemeSlot =
  | 'accent1'
  | 'accent2'
  | 'accent3'
  | 'accent4'
  | 'accent5'
  | 'accent6'
  | 'lt1'
  | 'lt2'
  | 'dk1'
  | 'dk2'
  | 'hlink'
  | 'folHlink';
type ColorMods = { lumMod?: number; lumOff?: number; tint?: number; shade?: number; alpha?: number };
```

- Every existing color-valued field (`fill`, `stroke`, `fontColor`, `textStroke.color`, gradient stop colors) migrates to `BroadsetColor`. `originalColor` preserves an untouched CSS string for color-space round-trip when the renderer would otherwise flatten to sRGB.
- Document-level `settings.palette` gains typed swatch entries (name + color + optional spot metadata).

**Fill model — discriminated union**

```ts
type BroadsetFill =
  | { kind: 'none' }
  | { kind: 'solid'; color: BroadsetColor }
  | { kind: 'gradient'; gradient: BroadsetGradient }
  | {
      kind: 'pattern';
      assetId: string;
      repeat?: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
      transform?: AffineMatrix;
    }
  | {
      kind: 'picture';
      assetId: string;
      mode: 'stretch' | 'tile';
      preserveAspectRatio?: 'none' | 'meet' | 'slice';
      tile?: TileInfo;
    };
```

- Picture fill: rectangles/ellipses/paths can reference an image asset as their fill (PPTX `<a:blipFill>`, SVG `<image>`-in-pattern, PDF tiling patterns). Stretch or tile modes only; no cropping. Importers that arrive with crop information bake the crop into the source image on import so the stored asset is already cropped — no downstream complexity.
- Pattern fill: SVG `<pattern>` round-trip, PPTX pattern fills, PDF tiling patterns.

**Gradient enhancements**

- `BroadsetGradient` with `type: 'conic'` gains `center: { x: number; y: number }` (0–1 fractional) and `startAngle?: number` (degrees).
- `BroadsetGradientStop.color` becomes `BroadsetColor`. `mods?: ColorMods` on each stop for theme-driven gradients.
- Validator: stops remain ascending.

**Stroke enhancements**

- `strokeMiterlimit?: number` on style.
- `strokeHeadEnd?: ArrowEnd`, `strokeTailEnd?: ArrowEnd` on style. `ArrowEnd = { shape: 'triangle' | 'stealth' | 'diamond' | 'oval' | 'none'; width?: 'sm' | 'md' | 'lg'; length?: 'sm' | 'md' | 'lg' }`.

**Filter primitives — structured**

Replace `filter: string` and `backdropFilter: string` with:

```ts
type FilterPrimitive =
  | { kind: 'drop-shadow'; offsetX: number; offsetY: number; blur: number; color: BroadsetColor }
  | { kind: 'blur'; stdDeviation: number }
  | { kind: 'color-matrix'; matrix: readonly number[] } // 4x5 or 5x5
  | {
      kind: 'brightness' | 'contrast' | 'saturate' | 'hue-rotate' | 'grayscale' | 'sepia' | 'invert' | 'opacity';
      amount: number;
    }
  | { kind: 'custom-svg'; svg: string }; // escape hatch
type FilterStack = readonly FilterPrimitive[];
```

Renderer derives the CSS-string view. Canonical representation is primitives. PSD's 10 layer effects (drop shadow, inner shadow, outer/inner glow, bevel/emboss, satin, stroke, color/gradient/pattern overlay) map into this union — it's the single biggest import consumer. SVG `<filter>` primitives and PDF ExtGState blend chains map in and out symmetrically.

**Content-hash identity**

- `element.contentHash: string` — derived field, recomputed lazily from `kind + geometry + styleKeysSorted + textContent`. Never stored in `.bsp` (it's a view over other fields). Used by reconciliation when external tools strip `data-bs-*` tags / XMP entries / shape-name markers.

**Extensions typing and dirty flag**

- Add `packages/model/src/extensions-types.ts` documenting namespaces: `extensions.psd`, `extensions.pdf`, `extensions.pptx`, `extensions.svg`. Pure TS — the outer field stays `Record<string, unknown>`; typed interfaces narrow it at the import/export boundary. Each format exports its interface from `packages/formats/src/<format>/types.ts`.
- Per-element, per-format dirty flag: `extensions.<format>.dirty: boolean`. `false` when hydrated from import, flipped to `true` by any editor action mutating the element. Format exporters consult only their own flag: dirty → re-emit from current Broadset state; clean → re-emit preserved original blob byte-for-byte.
- Dirty-flag plumbing lives in store middleware in [packages/editor/](../../packages/editor/): every action touching an element sets every present `extensions.<format>.dirty`. Unit test simulates every store action and asserts the flag was flipped.
- Open question (ratify in Phase 0): validate `extensions.<format>` with a format-provided Zod schema on load (each format registers into a central registry), or defer narrowing to the import/export site. Leaning toward load-time validation.

**Page + canvas additions**

- `Page.notes?: string | TextBody` — PPTX speaker notes, PDF speaker-notes annotations. Universal model shape; PSD and SVG exporters ignore (no speaker-notes concept in those formats).
- `Canvas.bleed?`, `Canvas.trim?`, `Canvas.safeArea?` — maps to PDF `BleedBox`/`TrimBox`/`MediaBox`/`CropBox` and print prepress. Numeric values in the canvas-declared unit. Universal model shape; PPTX / PSD / SVG exporters ignore since those formats have no prepress box concept. Editor surfaces the fields regardless (users may target multiple formats from one document).
- `Canvas` exposes `unit` and `dpi` in the settings panel (model is already correct — UI was missing).
- `document.metadata?: { title?, author?, subject?, keywords?, rights?, producer? }` — Dublin Core fields. Consumed by PDF XMP, PSD XMP, SVG `<metadata>`, and PPTX `docProps/core.xml`. Universal.
- `document.outputIntent?: { iccProfileAssetId: string; colorSpace: 'rgb' | 'cmyk' | 'gray' | 'lab'; identifier?: string }` — document-level ICC profile + target color space. Consumed by PDF (`/OutputIntent` dictionary, mandatory for PDF/A-2b per [pdf-pdfa-compliance-plan.md](./pdf-pdfa-compliance-plan.md)), PSD (embedded ICC profile on CMYK/Lab documents), and anywhere else a format needs a canonical document color space. SVG and PPTX exporters ignore. The `iccProfileAssetId` references an asset of type `icc-profile` in the shared asset registry (io-prereqs Phase 4). If absent, the format-specific fallback applies (PDF default sRGB from `_shared/color/defaultProfiles/sRGB2014.icc`; PSD's U.S. Web Coated SWOP for CMYK, ISO Coated v2 grayscale — per the PSD plan's risk register).

**Importer contract spec**

- Update [project/spec/formats/spec.md](../spec/formats/spec.md) to state that every format importer MUST build a `parentId` tree — flattening groups is a bug, not an option. The current [packages/formats/src/psd/import.ts](../../packages/formats/src/psd/import.ts) violates this; fixed under the PSD plan.
- State that every importer sets `extensions.<format>.dirty = false` on every hydrated element, and populates `content` via `TextBody` when mixed-run text is present.
- State IO-D-18: every importer either maps to a native Broadset element or preserves the raw source fragment for byte-identical re-emission.

**Importer security contract (applies to every format importer)**

Every importer operates on attacker-influenceable input. The following floor applies to all of them; each format plan MAY add format-specific mitigations in its risk register but does not need to restate the shared contract:

- **Entity expansion hardening.** Every XML-based importer (XMP, SVG metadata, PPTX OOXML) disables DTD processing and entity expansion on its parser (`fast-xml-parser` options, `DOMParser` + DOMPurify's SVG profile). Covers billion-laughs and XXE.
- **Size caps.** Cap total input size, per-part size (ZIP entries for PPTX, OOXML parts, PSD layer channels), and decoded-output size before allocation. No unbounded `Buffer.alloc` from a size declared in the file.
- **Depth caps.** Cap parser recursion depth and element-tree depth. Reject inputs with layer / shape / path nesting beyond a generous but finite bound (100 default).
- **Entry-count caps.** ZIP-based formats (PPTX) cap the number of entries per archive to prevent entry-count DoS.
- **Reference-cycle caps.** SVG `<use>` / `<symbol>` de-referencing, PSD clipping-mask chains, PPTX placeholder inheritance — all cap follow depth and detect cycles.
- **Worker sandboxing where available.** `pdfjs-dist` runs in its own worker; SVG/PPTX parsing runs on the main thread but never executes imported content.
- **No execution surface reaches the renderer.** `<script>`, `on*=` attributes, `javascript:` URLs, active `<foreignObject>` content, VBA / macros in PPTX, PDF JavaScript — all stripped at import by the shared `_shared/sanitize/` (where applicable) or rejected outright.
- **Resource-limit failures emit an import warning**, not an exception. Partial imports are preferable to crashes; the user sees what was dropped.
- **Every importer change goes through `security-reviewer`** before merge. Close every format-plan phase that touches the importer by invoking the agent on the diff.

Format-specific security concerns (e.g. PSD's `BoundedLayerStream` recursion, PPTX `vbaProject.bin` rejection, SVG `<foreignObject>` policy) stay in the format plan's risk register; they augment but do not replace this shared floor.

**Unit conversion utilities**

- Extend [packages/model/src/units.ts](../../packages/model/src/units.ts) with `pxToMm`, `mmToPx`, `pxToPt`, `ptToPx`, `inToMm`, `mmToIn`, `emToPx(fontSize)`.
- Unit-aware length parser: `parseLength("24px" | "2mm" | "0.5in" | "12pt" | "1.5em") → { value, unit }`. Exhaustive unit tests.

### Phase 2 — Library stack + shared modules

All cross-format dependencies added in a single commit so the lazy-load graph is reviewable in isolation. Libraries listed here are the ones that serve ≥2 formats and therefore belong under `_shared/*`. Format-specific libraries (`pdf-lib`, `pdfjs-dist`, `ag-psd`, `svgpath`, `css-tree`, `transformation-matrix`, `fflate`, `svgo`, …) are added by the format plan that owns them and imported directly per IO-D-07.

**Library additions**

| Library           | Wrapping module       | Lazy?                                                  |
| ----------------- | --------------------- | ------------------------------------------------------ |
| `culori`          | `_shared/color`       | Eager (small, always used)                             |
| `lcms-wasm`       | `_shared/color`       | Lazy — first CMYK/Lab call                             |
| `fontkit`         | `_shared/fonts`       | Eager (every text path)                                |
| `linebreak`       | `_shared/text-layout` | Eager (every wrap)                                     |
| `bidi-js`         | `_shared/text-layout` | Eager (every text path)                                |
| `harfbuzzjs`      | `_shared/text-layout` | Lazy — first non-Latin shape                           |
| `fast-xml-parser` | `_shared/xmp`         | Eager (import only; export writes RDF/XML as a string) |
| `xxhash-wasm`     | `_shared/fingerprint` | Eager (small)                                          |
| `microdiff`       | `_shared/reconcile`   | Eager (~1 KB)                                          |
| `dompurify`       | `_shared/sanitize`    | Eager (every SVG/`svg`-type path)                      |

Bundle-size assertion test in Phase 2 ensures Latin-only sRGB users never download `lcms-wasm` or `harfbuzzjs`.

**Shared modules**

All under `packages/formats/src/_shared/<name>/`, exported via `_shared/index.ts`. Format code imports only from the barrel. Each module ships with Vitest unit tests covering its public API; no format-specific fixtures in the shared tests.

- **`color/`** — `parseColor(css) → BroadsetColor`, `toRGB(color, profile?)`, `toCMYK(color, profile)`, `gamutMap(color, targetSpace)`, `applyMods(color, mods)`. Wraps `culori` + `lcms-wasm`. Used by every format for color parsing, gamut mapping, and theme-color resolution. Ships a `defaultProfiles/` asset bundle (`sRGB2014.icc`, `USWebCoatedSWOP.icc`, `GrayGamma22.icc` — all license-compatible sources) exposed via `getDefaultProfile(colorSpace)` so formats with profile-less input or PDF/A mandatory-embedding requirements have a canonical fallback.
- **`fonts/`** — `resolveFont({ family, weight, style, postscriptName? }) → FontRef`, `getMetrics(fontRef)`, `listAvailable()`, `subsetFont(asset, glyphsUsed) → bytes`, `readEmbedPermission(fontRef) → 'installable' | 'editable' | 'preview-print' | 'restricted'`, `getGlyphToUnicodeMap(fontRef) → Map<glyphId, readonly codepoint[]>` (exposes `fontkit`'s glyph→codepoint table; used by PDF ToUnicode CMaps, PDF/A-2b total-coverage enforcement, and any future text-search / accessibility work). Wraps `fontkit`. Handles Google Fonts fetch, user-uploaded bytes, system-font best-effort matching. Produces a stable `fallbackWarnings[]` array importers surface.
- **`text-layout/`** — `wrapRuns(runs, boxWidth, fontResolver) → LaidOutRuns`, `shapeRuns(runs)`. Wraps `linebreak` (UAX #14), `bidi-js` (UAX #9), `harfbuzzjs` (lazy). Produces the same layout every importer/exporter can match against.
- **`xmp/`** — `readBroadsetXmp(bytes | string) → BroadsetXmpPacket | null`, `writeBroadsetXmp(packet) → string`. Wraps `fast-xml-parser` for read; explicit RDF/XML string composition for write. Zod-validated. `broadset:` namespace per IO-D-08.
- **`fingerprint/`** — `fingerprintElement(el) → string`. Wraps `xxhash-wasm`. Stable across irrelevant formatting of the source file.
- **`reconcile/`** — `reconcile({ preservedMetadata, currentVisual, fingerprintsByElementId }) → ReconcileResult`. Wraps `microdiff`. `ReconcileResult` carries `modifications[]`, `additions[]`, `deletions[]`, `recoveredByHash[]`. Each format's import result is constructed from this one shape.
- **`shape-classifier/`** — `classifyPath(d, styleHints) → { kind: 'rectangle' | 'ellipse' | 'path'; params? }`. Heuristics shared by SVG, PDF, and PPTX importers (four right-angled lines → rectangle; four cubic Béziers in canonical ellipse shape → ellipse; otherwise generic path). PSD importer also consumes it for vector-mask and shape-layer path classification.
- **`sanitize/`** — `sanitizeSvg(string) → { ast: SvgFragmentAst; report: SvgSanitizationReport }`. Wraps `dompurify` with Broadset-specific policy (forbidden tags, attrs, hooks). Consumed by SVG import, `svg`-type re-export, and anywhere foreign markup enters the store.

Public APIs are intentionally narrow (four-to-six functions per module). Internal helpers stay unexported. Expansion happens only when a second format surfaces a concrete need.

### Phase 3 — Renderer refactor

Detailed execution plan: [renderer-refactor-plan.md](./renderer-refactor-plan.md). This section remains the cross-format dependency summary.

The renderer must stop round-tripping foreign markup through `innerHTML`, stop rendering filters/gradients/patterns as CSS strings when the model now carries structured primitives, and start consuming font-asset bytes.

- **Safe DOM-builder for `svg`-type elements.** [screen-renderer/element-renderers.ts:352-364](../../packages/renderer/src/screen-renderer/element-renderers.ts) currently does `host.innerHTML = element.content`. Replace with a parsed-AST path: the importer hands a structured `SvgFragmentAst` (from `_shared/sanitize`); the renderer constructs DOM nodes from the AST, never from a string. Eliminates the last XSS vector.
- **Native renderer paths for structured features.** Once the Phase 1 additions land, the renderer consumes filter primitives, conic-gradient center/angle, pattern fills, and picture fills directly — not via CSS strings. `<defs>` nodes are constructed from the typed model.
- **Font-asset-aware rendering.** When fonts are embedded assets (see Phase 4), the renderer injects a matching `@font-face` into the editor document once per font-asset at mount time. Identical rendering between editor and Broadset-exported files.
- **Per-corner border radius.** Renderer support for per-corner radii (top-left, top-right, bottom-right, bottom-left). Needed by PDF parity and SVG round-trip.
- **Nested group transform composition.** Audit A1: CT test that creates a group of 3 elements, rotates the group 37°, asserts each child's visual bounds match `parent rotation ∘ child transform` on display and after commit. If the current transform widget flattens rotation into children at commit time, fix it — the "groups stay groups" stance depends on correct composition.

Land as isolated commits with their own CT coverage before any format Phase 2 work touches the renderer.

### Phase 4 — Asset pipeline

- **Font asset type.** Add `{ type: 'font', bytes, format: 'woff2' | 'ttf' | 'otf', postScriptName, familyName, subsetRanges? }` to the asset registry. `.bsp` fixtures updated.
- **Custom font upload UI** (moved to Phase 5 — listed here because the asset type blocks it).
- **Image asset bytes, not URLs.** Normalize to `{ assetId, bytes, mime, width, height, iccProfile? }`. Byte blobs are keyed by `assetId`; elements reference by ID. Enables base64 embedding in SVG export and PDF image XObjects.
- **ICC profile preservation on image assets.** JPEG/PNG pass-through exports need it. PDF prepress workflow depends on it.
- **ICC profile asset type.** Add `{ type: 'icc-profile', bytes, colorSpace: 'rgb' | 'cmyk' | 'gray' | 'lab', description?, identifier? }` to the asset registry. Referenced by `document.outputIntent.iccProfileAssetId` and by any image asset's `iccProfile` field when the per-image profile is a document-level one. Consumed by PDF `/OutputIntent`, PDF/A-2b mandatory embedding, and PSD's embedded ICC profile on CMYK/Lab documents.
- **Subsetting pipeline.** `_shared/fonts/subset.ts` exposes `subsetFont(asset, glyphsUsed) → bytes`. SVG `@font-face` embedding, PDF font subsetting, and PPTX font embedding all call it.
- **Font embed-permission surface.** `fontkit` reads `OS/2` `fsType`. Exposed in the asset panel and preflight. Refuse to embed licensed-restricted fonts; warn on preview-print-only fonts.
- **Asset deduplication on import.** `registerAssetByContentHash(bytes, mime)` collapses duplicates across importers. Importing a PDF with 100 copies of the same logo creates one asset, not 100.

Spec update: [project/spec/model/assets.md](../spec/model/assets.md) documents the font asset type, byte-addressable structure, ICC preservation, and content-hash dedup.

### Phase 5 — Editor UI surface

Every new round-trippable model field gets a user-editable control per IO-D-10. Uses `@heroui/react` per [heroui.instructions.md](../../agents/instructions/heroui.instructions.md). Every cross-region scenario gets a CT per [testing.instructions.md](../../agents/instructions/testing.instructions.md) §CT Derivation Rule.

This phase splits into **new product features** (standalone user value — specified in detail in [io-prereqs-ui-features-plan.md](./io-prereqs-ui-features-plan.md)) and **format-round-trip UI** (export options, import warnings, reconciliation — only exists to serve the format pipelines).

#### New product features

**Text**

- **Run-edit mode.** Click text element → enter run-edit mode → select a character range → properties panel surfaces the run-applicable subset of text-style controls (family, size, weight, italic, color, tracking, underline, strike, lang, hyperlink). Minimum scope: per-run styling via properties panel. On-canvas inline editing deferred to a later polish pass. Scope guard: no nested paragraph features beyond bullets + lists.
- **`applyRunStyle(elementId, range, overrides)` store action.** Immutably rewrites runs, merges adjacent identical runs, splits overlapping runs. Sets every present `extensions.<format>.dirty = true`. Undo/redo via existing `zundo` plumbing.
- **Bullets + numbered lists editor.** Per-paragraph `Bullet` picker and `level` selector.
- **Text fidelity subpanel.** `textAnchor`, `textLength`, `lengthAdjust`, `wordSpacing`, `textTransform`, `lineHeight`. Imported-only multi-run-level `tspan` editing deferred; multi-run text shows a "this text has multiple runs" banner.
- **Text-on-path picker.** Dropdown of candidate path elements in the same document; validates target exists.
- **RTL caret/selection awareness.** Editor respects `bidi-js` run directions in a mixed-language paragraph.

**Color + fill**

- **Swatches panel.** Named colors, including spot colors. HeroUI `Listbox` + custom swatch renderer.
- **Color mode selector** per document (RGB / CMYK / spot) per IO-D-13. Drives gamut warnings. Format-specific consumption: PDF honors every mode (full CMYK/spot pipeline); PSD honors RGB/CMYK/Lab/Grayscale via its own selector; SVG and PPTX exporters are sRGB-only and silently flatten non-RGB on export with a preflight warning. Each format plan documents its fallback behavior.
- **CSS Color Level 4 color picker.** `oklch`, `color(display-p3 …)` inputs with live gamut indicator.
- **ICC profile attached to document** (binds `document.outputIntent`). Picker supports: (a) upload a user-provided `.icc` / `.icm` file → becomes an `icc-profile` asset; (b) select one of the bundled `_shared/color/defaultProfiles/` (sRGB2014, USWebCoatedSWOP, GrayGamma22). Target color space (`rgb` / `cmyk` / `gray` / `lab`) picked alongside. Feeds PDF `/OutputIntent`, PDF/A-2b mandatory embedding, and PSD's CMYK/Lab ICC profile slot.
- **Gradient editor upgrade.** Conic center + startAngle controls, per-stop `BroadsetColor` picker (including theme slots + mods), per-stop color-space preservation.
- **Pattern fill picker.** Selects a pattern asset; tile / repeat / transform controls.
- **Picture fill picker.** Selects an image asset; stretch or tile (no cropping — importers bake crops at import time).

**Stroke + shape**

- **Stroke subpanel.** `strokeMiterlimit`, `strokeHeadEnd`, `strokeTailEnd`, plus the existing stroke controls.
- **Per-corner border radius UI.** Four inputs linked by a chain toggle.
- **Clip-path editor.** Circle / polygon / inset / custom SVG path.
- **SVG path boolean operations.** Union / subtract / intersect. `path-bool` already in the renderer; expose in the editor.

**Filters**

- **Filter editor.** Stack of `FilterPrimitive` entries with per-primitive controls (drop-shadow offsets/blur/color, blur radius, color-matrix grid, brightness/contrast sliders). Reorder via drag.

**Canvas + document**

- **Canvas settings panel.** Unit + DPI exposure, bleed / trim / safe-area inputs, guide management.
- **Document metadata editor.** Title, author, subject, keywords, rights, producer.
- **Multi-page sorter.** Reorder, duplicate, delete pages via drag. Per-page visibility toggle.

**Fonts + assets**

- **Custom font upload.** Writes a font asset; surfaces embed-permission warnings.
- **Font-asset picker** in the typography section. Shows both system candidates (best-effort match) and embedded assets.

- **Preflight panel.** Missing fonts, out-of-gamut colors, overflow-bleed, image resolution, embed-permission issues. Warn-and-proceed per IO-D-14.
- **Document info panel** — Dublin Core fields bound to `document.metadata`.
- **Page sorter UX upgrade** — reorder / duplicate / delete via drag, per-page visibility toggle. Multi-page support itself already exists in the model + toolbar.
- **Speaker notes per page** — free-form textarea bound to `Page.notes`, reached from a menu entry (hidden by default; no sorter surface).

#### Format-round-trip UI

- **Import dispatcher accepts `.pdf` / `.pptx` / `.psd` / `.svg`** with progress indicator.
- **Export options modal.** Per-format options (color space, OCG on/off, subsetting, fidelity tier). HeroUI `Modal` + `Tabs`.
- **Import warnings modal.** Surfaces `SvgSanitizationReport`, opaque-fragment warnings, mixed-run text notices, dropped-feature warnings per format.
- **"Imported from external file" staging page.** Home for operator-extracted elements that didn't match anything in preserved metadata. Shared across every operator-level import: PDF Phase 3b, PSD Phase 3b, SVG Phase 3b, PPTX Phase 3b. The page title adapts to the source format ("Imported from PDF", "Imported from SVG", …).
- **Inline preview (thumbnail) after export.** PDF via `pdfjs-dist` (added in the PDF plan's libs); PPTX/PSD later.
- **Diff view with accept/reject per element** for external-edit reconciliation.
- **Deletion confirmation modal.** When preserved metadata knows about elements missing from the stream, confirm before dropping.
- **Element-level conflict indicator** in the layers panel and on canvas. "This element diverged in external edit."

### Phase 6 — Testing infrastructure

One-time scaffolding every format plan's fixture corpus relies on.

- **External-tool fixture convention.** `packages/formats/src/<format>/__fixtures__/` with a `MANIFEST.md` listing provenance (source tool + version + what it exercises) per file. Fixtures are <1 MB, committed to git, covered by smoke tests that import the file, count elements, and snapshot the structure.
- **Structural integrity helper.** Shared Vitest helper `assertReImportableBy(reader, bytes)` — every format's exporter test pipes its output through the format's own reader with strict mode on. Fails if the writer produces something the reader rejects.
- **Chain CT harness.** Shared Playwright helper for "import file → edit in one region → export → re-import → assert survival in all affected regions". Formats parametrize the file and the edit; the harness handles mount, dispatch, assertions, cleanup. Lives in `packages/ui/ct/_shared/chain-round-trip.helper.ts`.
- **Audit A2 — preserved-blob stress test.** Parametrized test that stashes a 200 KB blob under each format's unknown-content key (`extensions.pptx.chart`, `extensions.pptx.raw`, `extensions.pdf.raw`, `extensions.psd.raw`, SVG opaque-fragment `svg`-type element content), round-trips through `.bsp` save + load, and asserts no truncation, escaping loss, or dirty-flag flip. Covers every format's preserve-through pathway.

## Per-format gating matrix

Which prereqs phase unblocks which format-plan phase. Read each format plan together with its row here — no bullet in any format plan should land before its prereq has shipped.

| Format plan phase                                                                                        | Needs from this plan                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PSD Phase 0 (spec)**                                                                                   | Phase 0 decisions.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **PSD Phase 1 (types + deps spike)**                                                                     | Phase 1 text model + `BroadsetColor` + `BroadsetFill` + structured filter primitives + extensions typing + dirty flag + content hash + importer contract; Phase 2 `color` + `fonts` + `text-layout` + `xmp` + `fingerprint` + `reconcile` + `shape-classifier` shared modules. (No `sanitize` — PSD stores text as runs, not HTML; nothing foreign enters via PSD.)                                                                                     |
| **PSD Phase 2a (parity rebuild)**                                                                        | Phase 3 renderer refactor (native filter primitives; nested group composition).                                                                                                                                                                                                                                                                                                                                                                         |
| **PSD Phase 2b (surpass prior art)**                                                                     | Phase 4 asset pipeline (font asset type, image bytes, subsetting, embed-permission, ICC preservation, content-hash dedup); Phase 5 run-edit UI (PSD text-run round-trip is meaningless without run editing), swatches + ICC picker, export options modal.                                                                                                                                                                                               |
| **PSD Phase 3a (XMP + additionalInfo fast-path)**                                                        | Phase 1 content hash; Phase 2 `xmp` + `fingerprint` + `reconcile`.                                                                                                                                                                                                                                                                                                                                                                                      |
| **PSD Phase 3b (layer-level extraction)**                                                                | Phase 2 `shape-classifier`; Phase 5 "Imported from PSD" staging page.                                                                                                                                                                                                                                                                                                                                                                                   |
| **PSD Phase 4 (reconciliation)**                                                                         | Phase 2 `reconcile` + `fingerprint`; Phase 5 diff view + deletion-confirmation modal + conflict indicators.                                                                                                                                                                                                                                                                                                                                             |
| **PSD Phase 5 (tests)**                                                                                  | Phase 6 external-tool fixture convention + `assertReImportableBy` + chain CT harness + preserved-blob stress test.                                                                                                                                                                                                                                                                                                                                      |
| **PSD Phase 6 (UI wiring)**                                                                              | Phase 5 import dispatcher + export options modal + import-warnings modal + reconciliation UI.                                                                                                                                                                                                                                                                                                                                                           |
| **PDF Phase 1 (types + pdf-lib swap)**                                                                   | Phase 0 decisions; Phase 1 text model + `BroadsetColor` + `BroadsetFill` + structured filter primitives + canvas bleed/trim/safe-area + document metadata + extensions typing + dirty flag + content hash + unit utilities; Phase 2 `color` + `fonts` + `text-layout` + `xmp` + `fingerprint` + `reconcile` + `shape-classifier` shared modules.                                                                                                        |
| **PDF Phase 2a (export parity)**                                                                         | Phase 1 font asset type, structured filters, picture fill, per-corner radii, unit utilities; Phase 3 renderer refactor (per-corner radii, safe DOM-builder, nested group composition); Phase 4 custom font upload, subsetting, embed-permission surface; Phase 5 clip-path editor, per-corner radii UI.                                                                                                                                                 |
| **PDF Phase 2b (surpass prior art)**                                                                     | Phase 1 color union, ICC preservation, canvas bleed/trim/safe-area, document metadata; Phase 2 `color` module with `lcms-wasm`; Phase 4 image bytes + ICC preservation; Phase 5 color-mode selector, swatches, gradient editor, gamut warnings, preflight, export options modal, multi-page sorter, bleed guides, document metadata editor.                                                                                                             |
| **PDF Phase 3a (XMP fast-path)**                                                                         | Phase 1 content hash; Phase 2 `xmp` + `fingerprint` + `reconcile`.                                                                                                                                                                                                                                                                                                                                                                                      |
| **PDF Phase 3b (operator-level)**                                                                        | Phase 2 `shape-classifier`; Phase 5 "Imported from PDF" staging page.                                                                                                                                                                                                                                                                                                                                                                                   |
| **PDF Phase 4 (reconciliation)**                                                                         | Phase 2 `reconcile`; Phase 5 diff view + deletion-confirmation modal + conflict indicators.                                                                                                                                                                                                                                                                                                                                                             |
| **PDF Phase 5 (tests)**                                                                                  | Phase 6 external-tool fixture convention + `assertReImportableBy` + chain CT harness + preserved-blob stress test.                                                                                                                                                                                                                                                                                                                                      |
| **PDF Phase 6 (UI wiring)**                                                                              | Phase 5 import dispatcher + export options modal + preflight + inline preview.                                                                                                                                                                                                                                                                                                                                                                          |
| **PDF/A-2b compliance pass** (see [pdf-pdfa-compliance-plan.md](./pdf-pdfa-compliance-plan.md))          | Phase 1 `document.outputIntent`; Phase 2 `_shared/color/defaultProfiles/` (bundled sRGB/SWOP/Gray); Phase 2 `_shared/fonts/getGlyphToUnicodeMap()`; Phase 4 `icc-profile` asset type; Phase 5 output-intent picker in canvas settings. PDF/A-specific work (veraPDF in CI, LZW/JS/encryption strip, transparency group declarations, standard-14 font refusal, `pdfaid:` XMP, `/ID` trailer, annotation appearance streams) stays in the followup plan. |
| **PPTX Phase 1 (types + deps swap)**                                                                     | Phase 0 decisions; Phase 1 text model (runs + hyperlinks + lang + bullets), `BroadsetColor` (theme slots + mods), `BroadsetFill` (picture variant), `BroadsetGradientStop.mods`, stroke arrow ends, `Page.notes`, extensions typing + dirty flag, content hash; Phase 2 `color` + `fonts` + `xmp` + `fingerprint` + `reconcile` + `shape-classifier` shared modules.                                                                                    |
| **PPTX Phase 2a (export parity)**                                                                        | Phase 1 text runs + hyperlinks + lang + bullets; Phase 3 renderer (nested group transform composition — "groups stay groups"); Phase 4 font subsetting + embed-permission; Phase 5 run-edit UI + bullets editor.                                                                                                                                                                                                                                        |
| **PPTX Phase 2b (generated theme)**                                                                      | Phase 1 color union (theme slots + mods), `Page.notes`, document metadata; Phase 4 image bytes; Phase 5 swatches + theme-aware color picker + document metadata editor + export options modal.                                                                                                                                                                                                                                                          |
| **PPTX Phase 3a (fast-path)**                                                                            | Phase 1 content hash; Phase 2 `xmp` + `fingerprint` + `reconcile`.                                                                                                                                                                                                                                                                                                                                                                                      |
| **PPTX Phase 3b (operator-level)**                                                                       | Phase 1 text runs + theme colors + picture fill + gradient mods; Phase 2 `shape-classifier`; Phase 5 picture-fill picker + "Imported from PPTX" staging page.                                                                                                                                                                                                                                                                                           |
| **PPTX Phase 4 (reconciliation)**                                                                        | Phase 2 `reconcile`; Phase 5 diff view + deletion-confirmation modal + conflict indicators.                                                                                                                                                                                                                                                                                                                                                             |
| **PPTX Phase 5 (tests)**                                                                                 | Phase 6 external-tool fixture convention + `assertReImportableBy` + chain CT harness + preserved-blob stress test.                                                                                                                                                                                                                                                                                                                                      |
| **PPTX Phase 6 (UI wiring)**                                                                             | Phase 5 import dispatcher + export options modal + import-warnings modal.                                                                                                                                                                                                                                                                                                                                                                               |
| **PPTX degradation items (tables, charts, connectors, transitions, comments, pattern fill, arrowheads)** | Phase 1 extensions typing + dirty flag — preserved blobs ride under typed namespaces. `Page.notes` lands in Phase 1. Arrowheads land in Phase 1 stroke additions.                                                                                                                                                                                                                                                                                       |
| **SVG Phase 0 (spec)**                                                                                   | Phase 0 decisions.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **SVG Phase 1 (types + arch)**                                                                           | Phase 0 decisions + Phase 1 model additions (text runs, `BroadsetColor`, `BroadsetFill`, strokeMiterlimit, structured filter primitives, content hash, unit utilities) + Phase 2 `_shared/*` modules (SVG types reference both).                                                                                                                                                                                                                        |
| **SVG Phase 2a (parity + critical-bug fix)**                                                             | Phase 1 strokeMiterlimit, content hash, script rejection, unit utilities; Phase 2 `sanitize`; Phase 3 safe DOM-builder.                                                                                                                                                                                                                                                                                                                                 |
| **SVG Phase 2b (surpass prior art)**                                                                     | Phase 1 conic center/angle, color union with space preservation, structured filter primitives, pattern fill, text fidelity fields; Phase 2 `color` + `fonts` + `text-layout` + `xmp`; Phase 3 renderer native paths + font-asset awareness; Phase 4 font asset + subsetting + image bytes + dedup.                                                                                                                                                      |
| **SVG Phase 3a (metadata fast-path)**                                                                    | Phase 1 content hash; Phase 2 `xmp` + `fingerprint` + `sanitize` + `reconcile`.                                                                                                                                                                                                                                                                                                                                                                         |
| **SVG Phase 3b (arbitrary SVG)**                                                                         | Phase 2 `shape-classifier` + `sanitize`; Phase 5 "Imported from SVG" staging page.                                                                                                                                                                                                                                                                                                                                                                      |
| **SVG Phase 4 (reconciliation)**                                                                         | Phase 2 `reconcile` + `fingerprint`; Phase 5 diff view + deletion-confirmation modal + conflict indicators.                                                                                                                                                                                                                                                                                                                                             |
| **SVG Phase 5 (tests)**                                                                                  | Phase 6 external-tool fixture convention + `assertReImportableBy` + chain CT harness + preserved-blob stress test.                                                                                                                                                                                                                                                                                                                                      |
| **SVG Phase 6 (UI wiring)**                                                                              | Phase 5 stroke subpanel, gradient editor, filter editor, pattern picker, text fidelity subpanel, font-asset picker, import-warnings modal, import dispatcher + export options modal.                                                                                                                                                                                                                                                                    |

## Degradation items — preserved through `extensions`

For features that are too large to build natively in this plan's scope but still need to round-trip when unedited, the pattern is: import preserves the raw format blob under `extensions.<format>.*`, dirty flag starts `false`, re-export re-emits the blob verbatim when the flag is still `false`. Once a feature graduates to a first-class model type, it stops using the preservation path.

| Feature                                  | Preservation key                       | Graduation path                                                                                        |
| ---------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Tables (PPTX `<a:tbl>`)                  | `extensions.pptx.table`                | First-class `table` element — major model change, tracked separately.                                  |
| Charts (PPTX `<c:chart>`)                | `extensions.pptx.chart`                | First-class `chart` element — major model change. Until then, render embedded fallback PNG.            |
| Connectors (PPTX `<p:cxnSp>`)            | `extensions.pptx.connector`            | First-class connector with endpoint references + reflow. Defer until editor supports drag-endpoint UX. |
| Page transitions (PPTX)                  | `extensions.pptx.transition` on `Page` | Low priority; PPTX-specific.                                                                           |
| Comments / annotations                   | `extensions.<format>.comments`         | Cross-cutting collaboration feature — tracked separately.                                              |
| Unknown OOXML shapes                     | `extensions.pptx.raw`                  | Preserved indefinitely; never graduates (unknown-by-definition).                                       |
| Unknown PDF operator sequences           | `extensions.pdf.raw`                   | Preserved indefinitely for text/image extraction fallback.                                             |
| Unknown PSD layer effects                | `extensions.psd.raw`                   | Some effects may graduate as the filter primitives list grows.                                         |
| Speaker notes (until `Page.notes` lands) | `extensions.pptx.notes` on `Page`      | Graduates to `Page.notes` in Phase 1.                                                                  |

## Sequencing

```
Phase 0 (decisions + specs, ~2 commits)
  → Phase 1 (model, ~10 commits one per coherent change)
    → Phase 2 (libs + shared modules, ~8 commits)
      → Phase 3 (renderer refactor, ~4 commits)
        → Phase 4 (asset pipeline, ~5 commits)
          → Phase 5 (editor UI, ~15 commits — interleaved with format plans from here on)
            → Phase 6 (testing infra, ~3 commits)
```

Phases 0 → 4 are strictly sequential; Phase 5 work can interleave with the format-support plans once its prerequisites are in place. Phase 6 can start as soon as a format plan needs the first chain CT — whoever needs it first introduces the harness.

## Phase 1 internal landing order

Phase 1 has ~15 model additions with real dependencies between them. Landing order (one coherent commit or small series per bullet; `npm run gate:full` green at every stop):

1. **Unit utilities + `parseLength`** — no deps. Extend [packages/model/src/units.ts](../../packages/model/src/units.ts) with `pxToMm`, `mmToPx`, `pxToPt`, `ptToPx`, `inToMm`, `mmToIn`, `emToPx(fontSize)`, `parseLength(str)`. Pure additive — no consumers yet.
2. **Importer security contract spec** — no deps. Append to [project/spec/formats/spec.md](../spec/formats/spec.md). Spec-only commit.
3. **`BroadsetColor` discriminated union** — foundation. Largest cascade in Phase 1: migrates every existing color field (`fill`, `stroke`, `fontColor`, `textStroke.color`, gradient stop colors). Plan 3–4 commits:
   - (a) Type + Zod validator + unit tests in `@broadset/model`.
   - (b) Migrator function `migrateLegacyColor(hex | rgb() | undefined) → BroadsetColor` in a `migrations/` submodule.
   - (c) Per-package consumer migration: renderer → editor → formats → ui → demo. Fixtures migrated in the same commit that breaks them.
4. **Content-hash identity** — small. `element.contentHash` derived field; format-agnostic `fingerprintElement()` lives in `_shared/fingerprint/` in Phase 2, but the field declaration is Phase 1.
5. **Stroke enhancements** — `strokeMiterlimit`, `strokeHeadEnd`, `strokeTailEnd`. Pure additive on style.
6. **Filter primitives (`FilterStack`)** — discriminated union replaces `filter: string` and `backdropFilter: string`. Renderer derives the CSS-string view. Touches renderer text-filter path, animation `KeyframeValue` (if filters are animatable — verify first).
7. **Gradient enhancements** — conic `center` + `startAngle`; `BroadsetGradientStop.color` → `BroadsetColor`; `mods?: ColorMods` on each stop. Depends on (3).
8. **`BroadsetFill` discriminated union** — `{ kind: 'none' | 'solid' | 'gradient' | 'pattern' | 'picture' }`. Replaces flat `fill`/`backgroundColor`/`backgroundGradient`. Depends on (3), (7). Cascade comparable to (3) in scope.
9. **Text model** — `content: string | TextBody`. Introduces `Paragraph`, `Run`, `RunProps`, `ParagraphProps`, `Bullet`. Depends on (3) (run color, bullet color). Plan 2–3 commits:
   - (a) Type + validator.
   - (b) Renderer/editor dual-path support (still handles flat string).
   - (c) Fixture migration for multi-run cases.
10. **Text-on-path reference** — first-class `textPathElementId` with existence + cycle validation. Depends on (9).
11. **Text fidelity fields** — `textAnchor`, `textLength`, `lengthAdjust`, `wordSpacing`, `textTransform`, `lineHeight`. Additive to `TextStyle`. Depends on (9).
12. **Model-level script rejection** — Zod `refine()` blocks raw `<script>` / `on*=` in any imported `content` string. One commit, small.
13. **Extensions typing** — `packages/model/src/extensions-types.ts` documenting `extensions.{psd,pdf,pptx,svg}` namespaces + central Zod registry for load-time validation per IO-D-11. No runtime behavior change yet; formats register their schemas later.
14. **Dirty flag + store middleware** — `extensions.<format>.dirty: boolean` convention + middleware in [packages/editor/](../../packages/editor/) that flips every present dirty flag on any element-mutating action. Depends on (13). Ships with a unit test simulating every store action.
15. **Page + canvas + document additions** — `Page.notes`, `Canvas.bleed`, `Canvas.trim`, `Canvas.safeArea`, `document.metadata`, `document.outputIntent`. Can land as one commit series. `document.outputIntent.iccProfileAssetId` references an `icc-profile` asset type that lands in Phase 4; the field declaration accepts any string for now and the validator tightens when Phase 4 lands.
16. **Importer contract spec update** — append the `parentId`-tree requirement, `dirty = false` on hydrate, `TextBody` for mixed-run text, and IO-D-18 preservation rule to [project/spec/formats/spec.md](../spec/formats/spec.md). Closes Phase 1.

Steps (1), (2), (4), (5), (10), (11), (12), (13), (14), (15), (16) are small-to-medium. Steps (3), (8), (9) are the three big cascades — size them accordingly.

## Phase 1 migration surface

Inventory taken against the current `main`-equivalent tree. Numbers will drift as commits land; they inform sizing, not acceptance.

| Area                                                                 | Files                                                              | Occurrences | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Color / fill literals (`backgroundColor`, `fontColor`, `fill: '#…'`) | 69                                                                 | 233         | Heaviest: [sampleDocument.json](../../packages/demo/src/sampleDocument.json) (46), UI panels (`property-panels/*`, `inputs/color-input.tsx`, `panel-types.tsx`, `timeline/*`), renderer (`background.ts`, `screen-renderer/*`), format IO (`psd/import.ts`, `psd/export-layer.ts`, `pptx/slide-shapes.ts`, `pptx/svg-fallback.ts`, `pptx/import-utils.ts`, `web-vector/html.ts`, `web-vector/svg.ts`, `pdf/core.ts`), fixtures.                                                                                                                      |
| Text `content: '…'` literals                                         | 38                                                                 | 213         | Heaviest: UI (`properties-sidebar.tsx`, `panels-test-helpers.tsx`), editor (`element-defaults.ts`, `editing.path-modes.test.ts`, `inline-text.test.ts`), renderer tests, format tests, demo fixtures. Two-shape transition (`string                                                                                                                                                                                                                                                                                                                  | TextBody`) softens the cascade — plain-string elements don't need to change. |
| Canonical test fixtures (TS)                                         | 4                                                                  | ~269 lines  | [base-document.ts](../../packages/demo/src/test-fixtures/base-document.ts), [fixture-chrome.ts](../../packages/demo/src/test-fixtures/fixture-chrome.ts), [fixture-combinations.ts](../../packages/demo/src/test-fixtures/fixture-combinations.ts), [fixture-parenting.ts](../../packages/demo/src/test-fixtures/fixture-parenting.ts), [fixture-playback.ts](../../packages/demo/src/test-fixtures/fixture-playback.ts), [panel-elements.ts](../../packages/demo/src/test-fixtures/panel-elements.ts). Migrate alongside each breaking type change. |
| Canonical demo document                                              | [sampleDocument.json](../../packages/demo/src/sampleDocument.json) | 5,491 lines | Regenerated in one pass once `BroadsetColor` + `BroadsetFill` + optional `TextBody` land. Keep color literals as `{ kind: 'solid', color: { kind: 'rgb', hex: '#…' } }`.                                                                                                                                                                                                                                                                                                                                                                             |

**Migration strategy.** Every breaking commit in Phase 1 updates its own fixtures and tests in the same commit. Greenfield per [AGENTS.md](../../AGENTS.md) §Greenfield — no compatibility shims, no migration code in the hot path. Where a one-shot migrator function helps the cascade (e.g. `migrateLegacyColor`, `migrateLegacyFill`), it lives in a `migrations/` submodule under `@broadset/model` and is called at a single site (the document loader's initial validation pass), not sprinkled across consumers.

## Phase 0 outputs

Before Phase 1 begins, Phase 0 must produce:

- [decisions.md](./decisions.md) entries confirming IO-D-01 through IO-D-18 ratified (already added).
- Updated model specs under [project/spec/model/](../spec/model/) for every Phase 1 field shape (text runs + paragraphs, `BroadsetColor`, `BroadsetFill`, `FilterStack`, stroke arrow ends, `strokeMiterlimit`, extensions namespacing, dirty flag, content hash, page + canvas additions, `document.metadata`, `document.outputIntent`).
- Updated [project/spec/formats/spec.md](../spec/formats/spec.md) with the importer contract + importer security contract + IO-D-17 (no sidecars) + IO-D-18 (no silent drops).
- No code. Phase 0 is pure spec + decision work.

## Risk register

- **Text-model migration is the largest single lift.** `content: string` → `TextBody` cascades into renderer, editor, every text-rendering path, every text-related test. Mitigation: keep the flat `content: string` form as the default; `TextBody` is opt-in per element; renderer handles both. Migrate fixtures in the same commits (greenfield — no external data to preserve).
- **Run-edit UX is non-trivial.** Range selection + inline style application is where rich-text editors historically leak complexity. Mitigation: Phase 5 scope is capped at what PSD/PPTX/PDF need. If we hit unexpected complexity, freeze at "per-run style panel in properties" and defer inline on-canvas editing to a later iteration.
- **Bundle size from WASM modules.** `lcms-wasm` and `harfbuzzjs` are hundreds of KB each. All lazy-loaded; Latin-only sRGB users never download them. Enforced by import-time bundle assertion test in Phase 2.
- **`extensions.<format>.dirty` flag drift.** If an editor action forgets to flip the flag, re-export silently overwrites user edits with preserved originals. Mitigation: centralize in store middleware intercepting every action touching an element. Unit test simulates every store action and asserts the flag was flipped.
- **Shared-module API lock-in.** Once two formats depend on `_shared/*`, changing the public API gets expensive. Mitigation: narrow public APIs (four-to-six functions per module). Expansion only when a second format surfaces a concrete need.
- **Cross-format reconciliation correctness.** One module, four callers is a test surface multiplier. Mitigation: shared unit tests cover every branch of `ReconcileResult` construction; each format's own tests verify wiring, not reconciliation math.
- **Renderer refactor (Phase 3) scope creep.** Replacing `innerHTML` with a DOM-builder touches the renderer's hottest path. Mitigation: land B1 as a standalone commit with its own CT coverage before any format Phase 2 work touches the renderer.
- **Model churn cascades into fixtures.** Every new field touches fixtures, tests, the properties panel, and sometimes the animation runtime's `KeyframeValue` union (if animatable). Mitigation: greenfield per [AGENTS.md](../../AGENTS.md) §Greenfield; break freely, update fixtures in the same commit, no migration code.
- **Theme colors without a design-token system.** `settings.palette` is a flat array. PPTX generated-theme export maps the first 6 entries to `accent1..6`. Not ideal, but usable until a proper token system lands — out of scope for this plan.

## Spec updates

Baked into each phase per [CONTRIBUTING.md](../../CONTRIBUTING.md) §Backpropagate Into Specs. Summary of which spec files change:

- [project/spec/model/style.md](../spec/model/style.md) — Phase 1 color union, fill union, filter primitives, strokeMiterlimit, arrow ends.
- [project/spec/model/element.md](../spec/model/element.md) — Phase 1 text runs/paragraphs, text fidelity fields, text-on-path, content hash, extensions typing + dirty flag.
- [project/spec/model/assets.md](../spec/model/assets.md) — Phase 4 font asset type, image byte shape, ICC preservation, content-hash dedup.
- [project/spec/model/format-reference.md](../spec/model/format-reference.md) — cross-reference all additions; update element/style/canvas invariants.
- [project/spec/model/spec.md](../spec/model/spec.md) — canvas bleed/trim/safe-area, document metadata, page notes.
- [project/spec/formats/spec.md](../spec/formats/spec.md) — importer `parentId` tree contract, dirty flag initialization, `_shared/*` utilities.

## Decisions locked in

Ratified in Phase 0. Repeated here for quick reference.

- **Runs, not HTML.** Text stored as structured `TextBody`; HTML only at export boundaries.
- **Bake-to-path for non-trivial affine transforms.** No `scale` / `skew` on elements.
- **Structured filter primitives replace the CSS filter string.** CSS string is a derived view.
- **`fill` becomes a discriminated union.** Solid / gradient / pattern / picture / none.
- **Color becomes a discriminated union.** RGB (with optional space + original preservation) / theme (with mods).
- **`TextRun[]` type lands before editor UX.** Importers have somewhere to put data; editor catches up in Phase 5.
- **Shared modules live under `packages/formats/src/_shared/`.** Not a separate package.
- **`broadset:` XMP namespace shared across carriers.** One Broadset footprint regardless of container.
- **`@font-face` embedding is the default for Broadset-owned exports.** Reference / flatten are opt-ins.
- **Properties-panel exposure gates every round-trippable field.** No imported-only fields without an explicit "no UI surface" annotation.
- **Dirty flag is per-element, per-format.** Flags are independent; exporters consult only their own.
- **Prereqs go to [packages/model/src](../../packages/model/src/) first; format code consumes them.** Reverse order guarantees thrash.
- **IO-D-11 `extensions.<format>` validated at load time.** Each format package registers a Zod schema for its `extensions.<format>` namespace into a central registry; `.bsp` load validates every present namespace. Fail loudly on stale or corrupt files rather than at re-export.
- **IO-D-12 Run-editor keyboard shortcuts deferred.** Range selection + properties-panel controls are the Phase 5 scope. Ctrl-B / Ctrl-I / Ctrl-U on a selected range land in a later polish pass.
- **IO-D-13 Color mode is per-document.** `settings.colorMode: 'rgb' | 'cmyk' | 'spot'` on the document. No per-element override in the initial cut; spot overlays are expressed via the swatches panel, not a per-element mode flag.
- **IO-D-14 Preflight warns and proceeds.** Preflight surfaces missing fonts, out-of-gamut colors, overflow-bleed, image resolution, and embed-permission issues as warnings. Export is never blocked — users always have the escape hatch.
- **IO-D-15 Gradient editor UI ships in the same phase as the gradient model additions.** Per IO-D-10 — shipping model without UI is shipping a round-trippable field with no editor surface, which is forbidden.
- **IO-D-16 Export renders the fully-entered "IN" state; animations are discarded unless the target format supports them natively.** PDF/PSD/SVG exports are static (no animation carrier in the file). PPTX exports native `<p:timing>` for mappable animations and discards unmappable ones. The `.bsp` is the source of truth for animation data; no metadata round-trip for animations.
- **IO-D-17 No sidecars.** Every format's round-trip metadata lives inside the format file using the format's own documented extension mechanism. No out-of-package JSON, no embedded-file sidecars, no app-private streams.
- **IO-D-18 No silent drops.** Every importer maps to a native Broadset element or preserves the raw source fragment under `extensions.<format>.raw` (or an opaque `svg`-type element for SVG). Every preservation path emits a warning.
- **Importer security contract** applied by every format importer (entity hardening, size/depth/entry caps, no executable surface reaches the renderer, `security-reviewer` on every importer diff). See the dedicated section under Phase 1.

---

## Progress tracker

Ralph-loop convention per [plan.md](./plan.md): every unit carries `[ ] tests: red` and `[ ] impl: green`. A unit is **done** only when both boxes are checked and the package's `npm run quality` gate is green. Completed units reference the landing commit SHA in parentheses.

### Phase 0 — Decisions + spec-first updates

- [x] IO-D-01 through IO-D-18 ratified in [decisions.md](./decisions.md)
- [ ] Pre-emptive model spec updates for every Phase 1 field shape (partially landed alongside individual Phase 1 commits per `CONTRIBUTING.md` §Backpropagate Into Specs)

### Phase 1 — Core model additions

Landing order from §"Phase 1 internal landing order" above.

- [x] **1. Unit utilities + `parseLength`** — `pxToPt`, `ptToPx`, `inToMm`, `mmToIn`, `emToPx`, `parseLength` on `@broadset/model`
  - [x] tests: red
  - [x] impl: green (`7807cd7`)
- [x] **2. Importer security contract spec** — `project/spec/formats/spec.md` floor (entity hardening, size/depth/entry caps, cycle caps, no execution surface, warnings-not-exceptions, worker sandboxing, `security-reviewer` before merge)
  - [x] tests: red — spec-only, no tests
  - [x] impl: green (`9b0376c`)
- [x] **3. `BroadsetColor` discriminated union** — `{ kind: 'rgb'; hex; space?; originalColor? } | { kind: 'theme'; slot; mods? }`. Cascade: types (3a) + migrator (3b) + consumer cascade (3c).
  - [x] tests: red
  - [x] impl: green (`c79baa1`, `20c2c6e`, `c4b942e`)
- [x] **4. Content-hash identity** — `element.contentHash` derived field (body in `_shared/fingerprint/` lands Phase 2)
  - [x] tests: red
  - [x] impl: green (`72d23a6`)
- [x] **5. Stroke enhancements** — `strokeMiterlimit`, `strokeHeadEnd`, `strokeTailEnd` with `ArrowEnd` shape/size vocabulary
  - [x] tests: red
  - [x] impl: green (`2f13198`)
- [ ] **6. Filter primitives (`FilterStack`)** — discriminated union replaces `filter`/`backdropFilter` strings; renderer derives CSS view
  - [ ] tests: red
  - [ ] impl: green
- [ ] **7. Gradient enhancements** — conic `center` + `startAngle`; stop colors become `BroadsetColor`; `mods?` per stop (depends on #3)
  - [ ] tests: red
  - [ ] impl: green
- [ ] **8. `BroadsetFill` discriminated union** — `none | solid | gradient | pattern | picture`; replaces flat `fill`/`backgroundColor`/`backgroundGradient` (depends on #3, #7). Cascade comparable to #3.
  - [ ] tests: red
  - [ ] impl: green
- [ ] **9. Text model — `TextBody` / `Paragraph` / `Run`** — `content: string | TextBody`; model-only, editor catches up Phase 5. Plan: 2–3 commits. Depends on #3.
  - [ ] tests: red
  - [ ] impl: green
- [x] **10. Text-on-path reference** — `textPathElementId` as first-class field with existence + cycle validation (depends on #9)
  - [x] tests: red
  - [x] impl: green (`9262266`)
- [x] **11. Text fidelity fields** — `textAnchor`, `textLength`, `lengthAdjust`, `wordSpacing`, `textTransform`, `lineHeight` additions to `TextStyle` (depends on #9)
  - [x] tests: red
  - [x] impl: green (`ae562be`)
- [x] **12. Model-level script rejection** — Zod guard rejects `<script>` and event-handler attrs in `text`/`svg` content
  - [x] tests: red
  - [x] impl: green (`a3e256a`)
- [x] **13. Extensions typing** — `packages/model/src/extensions-types.ts` + central Zod registry per IO-D-11
  - [x] tests: red
  - [x] impl: green
- [x] **14. Dirty flag + store middleware** — `extensions.<format>.dirty` + `packages/editor` middleware flipping every present flag on element-mutating actions (depends on #13)
  - [x] tests: red
  - [x] impl: green (`6f17a26`)
- [x] **15. Page + canvas + document additions** — `Page.notes`, `Canvas.bleed`/`trim`/`safeArea`, `document.metadata`, `document.outputIntent`
  - [x] tests: red
  - [x] impl: green (`77d3284`)
- [x] **16. Importer contract spec update** — `parentId`-tree requirement, `dirty = false` on hydrate, `TextBody` for mixed-run text, IO-D-18 preservation rule appended to `project/spec/formats/spec.md` (landed together with #2)
  - [x] tests: red — spec-only, no tests
  - [x] impl: green (`9b0376c`)

### Phase 2 — Library stack + shared modules

All shared modules under `packages/formats/src/_shared/<name>/` with Vitest unit tests. Library table in §Phase 2 above.

- [ ] **`_shared/color/`** — `culori` eager + `lcms-wasm` lazy; `parseColor`, `toRGB`, `toCMYK`, `gamutMap`, `applyMods`; bundled `defaultProfiles/` (sRGB2014, SWOP, Gray22)
- [ ] **`_shared/fonts/`** — `fontkit` wrapper; `resolveFont`, `getMetrics`, `listAvailable`, `subsetFont`, `readEmbedPermission`, `getGlyphToUnicodeMap`
- [ ] **`_shared/text-layout/`** — `linebreak` + `bidi-js` eager, `harfbuzzjs` lazy; `wrapRuns`, `shapeRuns`
- [ ] **`_shared/xmp/`** — `fast-xml-parser` read + explicit RDF/XML write; `readBroadsetXmp`, `writeBroadsetXmp`
- [ ] **`_shared/fingerprint/`** — `xxhash-wasm`; `fingerprintElement`
- [ ] **`_shared/reconcile/`** — `microdiff`; `reconcile({ preservedMetadata, currentVisual, fingerprintsByElementId })`
- [ ] **`_shared/shape-classifier/`** — `classifyPath(d, styleHints)` with rectangle/ellipse/path heuristics
- [ ] **`_shared/sanitize/`** — `dompurify` with Broadset policy; `sanitizeSvg`
- [ ] **Bundle-size assertion test** — ensure Latin-only sRGB users never download `lcms-wasm` or `harfbuzzjs`

### Phase 3 — Renderer refactor

- [ ] Safe DOM-builder for `svg`-type elements (replaces `host.innerHTML = element.content`) consuming `SvgFragmentAst` from `_shared/sanitize`
- [ ] Native renderer paths for structured filter primitives, conic `center`/`startAngle`, pattern fill, picture fill
- [ ] Font-asset-aware rendering — inject `@font-face` per font-asset at mount time
- [ ] Per-corner border radius rendering
- [ ] Nested group transform composition audit + CT coverage (A1)

### Phase 4 — Asset pipeline

- [ ] Font asset type (`woff2`/`ttf`/`otf` bytes + `postScriptName` + `familyName` + `subsetRanges?`)
- [ ] Custom font upload UI (listed in Phase 5; asset type blocks it)
- [ ] Image assets become `{ assetId, bytes, mime, width, height, iccProfile? }` — bytes, not URLs
- [ ] ICC profile preservation on image assets
- [ ] `icc-profile` asset type (referenced by `document.outputIntent`, image-asset `iccProfile`)
- [ ] Subsetting pipeline (`_shared/fonts/subset.ts` — `subsetFont(asset, glyphsUsed)`)
- [ ] Font embed-permission surface (`fontkit` `OS/2.fsType` → asset panel + preflight)
- [ ] Asset deduplication on import via `registerAssetByContentHash`

### Phase 5 — Editor UI surface

Each new round-trippable model field gets a user-editable control per IO-D-10, using `@heroui/react`. Every cross-region scenario gets a CT per testing-instructions §CT Derivation Rule. Detail lives in [io-prereqs-ui-features-plan.md](./io-prereqs-ui-features-plan.md); the list here is the headline map.

**New product features**

- [ ] Run-edit mode + `applyRunStyle(elementId, range, overrides)` store action
- [ ] Bullets + numbered lists editor
- [ ] Text fidelity subpanel
- [ ] Text-on-path picker
- [ ] RTL caret/selection awareness
- [ ] Swatches panel
- [ ] Color mode selector (per-document RGB/CMYK/spot)
- [ ] CSS Color Level 4 color picker (`oklch`, `color(display-p3 …)`)
- [ ] ICC profile picker on canvas settings (uploads + bundled defaults)
- [ ] Gradient editor upgrade — conic center + startAngle + per-stop color + color-space preservation
- [ ] Pattern fill picker
- [ ] Picture fill picker (stretch/tile, no crop)
- [ ] Stroke subpanel (miter limit + arrow endings + existing controls)
- [ ] Per-corner border radius UI
- [ ] Clip-path editor (circle/polygon/inset/custom path)
- [ ] SVG path boolean operations (union/subtract/intersect)
- [ ] Filter editor (drag-reorder primitive stack)
- [ ] Canvas settings panel (unit + DPI + bleed/trim/safe-area + guides)
- [ ] Document metadata editor (Dublin Core)
- [ ] Multi-page sorter upgrade (reorder/duplicate/delete + visibility toggle)
- [ ] Custom font upload
- [ ] Font-asset picker
- [ ] Preflight panel (missing fonts, gamut, bleed, resolution, embed permission)
- [ ] Document info panel
- [ ] Speaker notes per page

**Format round-trip UI**

- [ ] Import dispatcher accepting `.pdf` / `.pptx` / `.psd` / `.svg`
- [ ] Export options modal (per-format)
- [ ] Import warnings modal
- [ ] "Imported from external file" staging page (shared across PDF/PSD/SVG/PPTX operator-level imports)
- [ ] Inline export preview (PDF via `pdfjs-dist`; PPTX/PSD later)
- [ ] Reconciliation diff view (accept/reject per element)
- [ ] Deletion confirmation modal
- [ ] Element-level conflict indicator (layers panel + canvas)

### Phase 6 — Testing infrastructure

- [ ] External-tool fixture convention (`packages/formats/src/<format>/__fixtures__/` + `MANIFEST.md` + <1 MB + smoke tests)
- [ ] Structural integrity helper `assertReImportableBy(reader, bytes)`
- [ ] Chain CT harness `packages/ui/ct/_shared/chain-round-trip.helper.ts`
- [ ] Preserved-blob stress test (Audit A2)

### Session log

Recorded as units land.

- **2026-04-22** — Units 1, 2, 5, 12, 16 of Phase 1 landed (`7807cd7`, `9b0376c`, `2f13198`, `a3e256a`). Model test count grew from 271 → 308 (+37 tests). Full quality gate green after every commit.
