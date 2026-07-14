# Broadset Strict Bug Hunt Report

Date: 2026-04-20
Reviewer: GitHub Copilot (GPT-5.3-Codex)

Status: historical bug-hunt report. This file is not the current defect or
release-readiness tracker. Some findings may have been fixed or superseded
after the report date. Current release blockers live in
[production-readiness-status.md](./production-readiness-status.md), and current
task tracking lives in [plan-progress.md](./plan-progress.md).

## Mission Scope

- Objective: strict bug hunt across package code files (non-test scope).
- Included roots: packages/model, packages/playback, packages/renderer, packages/editor, packages/formats, packages/ui, packages/demo.
- Excluded by rule: _.test._, _.spec._, /test, /tests, /**tests**, /ct, /playwright, /test-results, _.stories._

## Strict Coverage Evidence

- Manifest used: project/implementation/strict-pass-files.txt
- Manifest size: 265 files (code extensions: ts, tsx, js, jsx, mjs, cjs, mts, cts, json, html, css)
- Chunked strict pass files:
  - project/implementation/strict-pass-chunk-aa (35)
  - project/implementation/strict-pass-chunk-ab (35)
  - project/implementation/strict-pass-chunk-ac (35)
  - project/implementation/strict-pass-chunk-ad (35)
  - project/implementation/strict-pass-chunk-ae (35)
  - project/implementation/strict-pass-chunk-af (35)
  - project/implementation/strict-pass-chunk-ag (35)
  - project/implementation/strict-pass-chunk-ah (20)

Total strict-reviewed files: 265 / 265

## Confirmed Bugs

## 1) CRITICAL: XSS via unsanitized SVG content in renderer

- File: packages/renderer/src/screen-renderer/element-renderers.ts:353
- Evidence:
  - host.innerHTML = element.content;
- Why this is a bug:
  - SVG markup from element content is injected directly into DOM without sanitization.
  - Malicious SVG payloads can execute script-capable attributes/events in host contexts.
- Failure scenario:
  - Import/open a project with an svg element containing hostile markup.
  - Renderer mounts it and browser executes attacker-controlled payload.

## 2) HIGH: HTML export emits raw SVG markup without sanitization

- File: packages/formats/src/web-vector/html.ts:262
- Evidence:
  - case 'svg': return `<div ${dataAttr} style="${style}">${el.content}</div>`;
- Why this is a bug:
  - Exported HTML includes raw untrusted SVG content directly in document body.
- Failure scenario:
  - Project contains svg content with active payload attributes.
  - exportHtmlStandalone() emits payload unchanged.
  - Opening output HTML executes attacker markup.

## 3) HIGH: Attribute injection risk from unescaped color values in PPTX SVG fallback builder

- File: packages/formats/src/pptx/svg-fallback.ts:4
  - stop-color="${s.color}" is emitted without XML escaping.
- File: packages/formats/src/pptx/svg-fallback.ts:76
  - fill="${fill}" is emitted without XML escaping.
- Why this is a bug:
  - Crafted values containing quotes can break attribute boundaries and corrupt output XML.

## 4) HIGH: Attribute injection risk from unescaped fill/stroke in HTML path export

- File: packages/formats/src/web-vector/html.ts:152
- Evidence:
  - fill="${fill}" and stroke="${stroke}" are emitted without escaping.
- Why this is a bug:
  - Unescaped values can terminate attributes and inject additional markup/attributes.

## 5) HIGH: SVG transform composition is mathematically incorrect for nested transforms

- File: packages/formats/src/web-vector/import.ts:44
- Evidence:
  - combineTransform() adds translations/rotations directly:
    - x: base.x + next.x
    - y: base.y + next.y
- Why this is a bug:
  - Nested transforms require affine composition (matrix multiplication).
  - Parent rotation should rotate child translation; simple addition produces wrong positions.
- Failure scenario:
  - Import SVG with rotated parent group and translated child.
  - Imported child appears at incorrect coordinates.

## 6) HIGH: PPTX relationship parsing assumes fixed XML attribute order

- File: packages/formats/src/pptx/import-utils.ts:73
- Evidence:
  - Regex requires order: Id -> Type -> Target
  - /<Relationship\s+Id="([^"]+)"\s+Type="[^"]\*"\s+Target="([^"]+)"\/>/g
- Why this is a bug:
  - XML attribute order is not guaranteed.
  - Files with equivalent but reordered attributes will fail relationship extraction.
- Failure scenario:
  - Import PPTX where Relationship attributes are in a different order.
  - Media mapping becomes incomplete; image/svg relationships are missed.

## 7) HIGH: Combo fixtures append elements without updating page instances

- File: packages/demo/src/test-fixtures/fixture-combinations.ts:13
- File: packages/demo/src/test-fixtures/fixture-combinations.ts:24
- Evidence:
  - elements array is extended, but pages[].elements is not regenerated with createRootPageInstances().
- Why this is a bug:
  - Page instance list is the render source; appended root elements are not instantiated on page.
- Failure scenario:
  - Use combo fixture document.
  - Added combo elements exist in document.elements but do not render on page due to missing page instances.

## 8) MEDIUM: TextStrokeInput local state desynchronizes from prop updates

- File: packages/ui/src/inputs/effect-inputs.tsx:17
- File: packages/ui/src/inputs/effect-inputs.tsx:18
- Evidence:
  - local state is initialized from props via useState(width/color) and never resynced on prop change.
- Why this is a bug:
  - Parent updates (selection switch, undo/redo, remote state changes) can leave stale values in the input.

## Additional Functional Bugs (Second Pass)

## 9) HIGH: SVG import drops element-local geometry coordinates

- File: packages/formats/src/web-vector/import.ts:137
- File: packages/formats/src/web-vector/import.ts:163
- File: packages/formats/src/web-vector/import.ts:192
- File: packages/formats/src/web-vector/import.ts:205
- Evidence:
  - Imported element position is always set from transform state only: position: { x: transform.x, y: transform.y }
  - Geometry attributes like rect x/y, circle cx/cy, ellipse cx/cy, text x/y, image x/y are not read.
- Why this is a bug:
  - Most real-world SVG files place shapes via geometry attributes, not only transform attributes.
- Failure scenario:
  - Import an SVG with <rect x="400" y="200" width="100" height="50"/> and no transform.
  - Imported element appears at (0,0) instead of (400,200).

## 10) HIGH: SVG import only supports translate(x,y), fails on valid translate(x)

- File: packages/formats/src/web-vector/import.ts:31
- Evidence:
  - translate regex requires two numeric arguments.
- Why this is a bug:
  - SVG transform grammar allows translate(tx) with implicit ty = 0.
- Failure scenario:
  - Import SVG using transform="translate(120)".
  - Translation is ignored and object imports at wrong x-position.

## 11) HIGH: SVG import coerces almost all element types to svg

- File: packages/formats/src/import-document.ts:51
- Evidence:
  - createDefaultElement(element.type === 'path' ? 'path' : 'svg', ...)
- Why this is a bug:
  - Imported text/image/rectangle/ellipse elements lose their concrete type and behavior.
- Failure scenario:
  - Import SVG with <text> or <image> nodes.
  - Document receives broadset elements of type svg, breaking expected editing/property behavior.

## 12) HIGH: PPTX import builds empty page instance list

- File: packages/formats/src/pptx/import.ts:124
- Evidence:
  - Returned page is initialized with elements: [] regardless of imported document elements.
- Why this is a bug:
  - Broadset rendering and layer flows rely on page root instances to include elements.
- Failure scenario:
  - Import PPTX with valid shapes.
  - document.elements is populated, but active page has no instances, so render/layers are empty.

## 13) HIGH: PSD import also builds pages with empty page instances

- File: packages/formats/src/psd/import.ts:316
- File: packages/formats/src/psd/import.ts:342
- Evidence:
  - PsdPage type hard-codes elements as readonly [] and makePage returns elements: [].
- Why this is a bug:
  - Imported elements are never attached as page instances.
- Failure scenario:
  - Import PSD with layers.
  - document.elements exists, but pages have no root instances, causing empty page rendering/layer lists.

## 14) MEDIUM: SVG import ignores canvas units in width/height attributes

- File: packages/formats/src/web-vector/import.ts:283
- File: packages/formats/src/web-vector/import.ts:284
- Evidence:
  - canvasWidth/canvasHeight are parsed with parseFloat only, with no unit conversion.
- Why this is a bug:
  - Values like 10cm, 25mm, 4in are interpreted as plain px-equivalent numbers.
- Failure scenario:
  - Import SVG width="10cm" height="5cm".
  - Canvas becomes 10x5 instead of converted pixel-equivalent dimensions, distorting imported layout scale.

## 15) HIGH: Playback gradient interpolation cache uses stale baseline

- File: packages/playback/src/playback-dom/style-apply.ts:426
- Evidence:
  - After computing `updated`, code stores `baseline` back into cache:
    - baselineGradients.set(targets.contentTarget, baseline)
- Why this is a bug:
  - Sequential gradient keyframe updates are applied against stale gradient state instead of the newly interpolated state.
- Failure scenario:
  - Animate gradient stop color in multiple timeline segments.
  - First segment applies, second segment interpolates from original baseline again.
  - Visual result jumps/drifts instead of continuous interpolation.

## 16) HIGH: Editor setDocument can leave activePageIndex out of bounds

- File: packages/editor/src/store-actions/store.ts:163
- Evidence:
  - `setDocument` replaces document but does not clamp `activePageIndex` to new page count.
- Why this is a bug:
  - When current active page index exceeds pages in replacement document, page-scoped operations target a non-existent page index.
- Failure scenario:
  - Start on page index 2 in a 3-page doc.
  - Call `setDocument` with 1-page doc.
  - `activePageIndex` stays 2; page-instance updates/toggles no-op or apply inconsistently.

## 17) HIGH: PPTX canvas size parsing is brittle to XML attribute ordering

- File: packages/formats/src/pptx/import.ts:40
- Evidence:
  - Regex requires exact `<p:sldSz cx="..." cy="..."/>` order and compact formatting.
- Why this is a bug:
  - XML attribute ordering and spacing are not guaranteed; valid PPTX variants may not match.
- Failure scenario:
  - Import PPTX where `cy` appears before `cx`, or additional attributes/spacing exist.
  - Slide size parse fails, canvas width/height become 0 fallback path, producing malformed imported document dimensions.

## 18) HIGH: PPTX shape transform parsing is brittle to XML formatting/order variations

- File: packages/formats/src/pptx/import-utils.ts:40
- File: packages/formats/src/pptx/import-utils.ts:41
- Evidence:
  - `<a:off .../>` and `<a:ext .../>` regexes require fixed attribute order and exact tag structure.
- Why this is a bug:
  - Valid OpenXML can include reordered attributes or formatting differences that remain semantically equivalent.
- Failure scenario:
  - Import shape XML with reordered `x/y` or `cx/cy` attributes.
  - Transform extraction falls back to zeros, causing imported shapes to stack at origin or wrong size.

## 19) HIGH: Collaboration apply removes only root element, leaves descendant/page/animation residue

- File: packages/editor/src/collaboration/apply.ts:57
- File: packages/editor/src/collaboration/apply.ts:60
- Evidence:
  - `applyElementRemove` filters only direct element id from `doc.elements`.
  - It does not remove descendants, page element instances, or element-linked animations.
- Why this is a bug:
  - Remote deletion of a parent should preserve document invariants the same way local reducer removal does.
- Failure scenario:
  - Remote client deletes parent group.
  - Local document keeps child elements with dangling `parentId`, stale page instances, and stale animation records.

## 20) HIGH: Collaboration protocol includes page override updates, but editor diff/apply ignore them

- File: packages/model/src/changes.ts:11
- File: packages/model/src/changes.ts:79
- Evidence:
  - `DocumentChange` includes `page:override:update` type.
- File: packages/editor/src/collaboration/diff.ts:193
- Evidence:
  - `diffPages` emits only page add/remove changes; no page override diffs are emitted.
- File: packages/editor/src/collaboration/apply.ts:40
- File: packages/editor/src/collaboration/apply.ts:42
- Evidence:
  - apply switch handles page add/remove only; no `page:override:update` handler exists.
- Why this is a bug:
  - Page-level transform/visibility/instance overrides cannot synchronize over collaboration stream.
- Failure scenario:
  - User A moves/toggles an element through page instance overrides.
  - User B receives no applicable override change, so canvas/page state diverges between clients.

## 21) HIGH: Duplicate flow stores live element references and pastes shallow clones

- File: packages/demo/src/demo-app/command-handlers.ts:219
- Evidence:
  - `handleDuplicateSelection` sets clipboard directly to selected live elements:
    - `clipboardRef.current = selectedElements`
- File: packages/demo/src/demo-app/app.tsx:371
- Evidence:
  - `pasteClipboardElements` clones via object spread but does not deep-clone nested mutable objects (for example `style`).
- Why this is a bug:
  - Duplicate path bypasses safer copy path used by copy command and risks shared nested references between duplicated elements.
- Failure scenario:
  - Duplicate selected elements repeatedly.
  - Editing nested style/config fields on one duplicate can leak changes to siblings that share copied nested object references.

## 22) HIGH: Collaboration model defines asset/data/project changes but editor diff/apply never handles them

- File: packages/model/src/changes.ts:13
- File: packages/model/src/changes.ts:14
- File: packages/model/src/changes.ts:15
- File: packages/model/src/changes.ts:16
- File: packages/model/src/changes.ts:17
- Evidence:
  - `DocumentChange` union includes `dataSchema:update`, `asset:add`, `asset:remove`, `asset:update`, `project:settings:update`.
- File: packages/editor/src/collaboration/diff.ts:44
- File: packages/editor/src/collaboration/diff.ts:45
- File: packages/editor/src/collaboration/diff.ts:46
- File: packages/editor/src/collaboration/diff.ts:47
- Evidence:
  - Diff pipeline emits only elements/pages/settings/animations.
- File: packages/editor/src/collaboration/apply.ts:30
- File: packages/editor/src/collaboration/apply.ts:46
- Evidence:
  - Apply switch handles only element/page/settings/animation cases; unsupported change types fall through default no-op.
- Why this is a bug:
  - Collaboration can silently drop valid model-level changes, causing cross-client divergence.
- Failure scenario:
  - Client A updates data schema or assets.
  - Client B receives no equivalent applied change; document models diverge.

## 23) MEDIUM: Video exporters use inconsistent frame-count rounding, producing different durations

- File: packages/formats/src/raster/index.ts:291
- File: packages/formats/src/interchange/index.ts:178
- Evidence:
  - WebM raster exporter uses `Math.round((durationMs / 1000) * frameRate)`.
  - Unified video exporter uses `Math.ceil((durationMs / 1000) * frameRate)`.
- Why this is a bug:
  - Same duration/frameRate can produce different frame counts across exporter entry points.
- Failure scenario:
  - Export identical animation via both paths at non-integer frame count boundaries.
  - One output is one frame shorter/longer, causing drift at clip end.

## 24) MEDIUM: Renderer writes invalid opacity string when style.opacity is missing

- File: packages/renderer/src/screen-renderer/base-render.ts:403
- Evidence:
  - `opacityHost.style.opacity = String(style.opacity)`
- Why this is a bug:
  - If `style.opacity` is undefined, inline style receives `"undefined"` (invalid CSS value), so opacity application silently fails.
- Failure scenario:
  - Render element with style payload lacking opacity (for example plugin-provided element/style).
  - Opacity style does not apply predictably due to invalid value serialization.

## 25) HIGH: Editor placement/add paths append elements but never create page instances

- File: packages/editor/src/editing/commands.ts:68
- File: packages/editor/src/store-actions/store.ts:300
- Evidence:
  - `placeElement` and `addElement` append into `document.elements` only.
  - No corresponding insertion into active page `page.elements` instance list.
- Why this is a bug:
  - Active-page rendering pipeline consumes root page instances; root elements without instances are skipped.
- Failure scenario:
  - User places a new element from toolbar (uses `placeElement`).
  - Element exists in `document.elements` but has no page instance, so it can disappear from active-page render/layer flows.

## 26) HIGH: SVG import wrapper creates elements but leaves page instance list empty

- File: packages/formats/src/import-document.ts:49
- File: packages/formats/src/import-document.ts:50
- Evidence:
  - `importSvgDocument` fills `elements` from parsed SVG but does not populate page root instances.
  - The then-current empty-document helper produced a default page with `elements: []`.
- Why this is a bug:
  - Imported roots are not represented on active page instance layer.
- Failure scenario:
  - Import a valid SVG with visible shapes.
  - Returned document has root elements but empty `pages[0].elements`, so active-page render can show nothing.

## 27) HIGH: Collaboration element:add applies model element only, not page instance placement

- File: packages/editor/src/collaboration/apply.ts:51
- Evidence:
  - `applyElementAdd` returns doc with appended `elements` only.
  - No page-instance insertion for any page.
- Why this is a bug:
  - Remote element additions are incomplete in page-instance based rendering model.
- Failure scenario:
  - Client A adds a new root element.
  - Client B receives `element:add`, but new element lacks page instance and may not appear on active page.

## 28) HIGH: PPTX transform parser drops negative coordinates

- File: packages/formats/src/pptx/import-utils.ts:40
- Evidence:
  - `<a:off ...>` regex captures only `\d+` for x/y.
- Why this is a bug:
  - OpenXML coordinates may be negative (off-canvas or partially clipped placements).
  - Negative values fail match and silently fall back to zero.
- Failure scenario:
  - Import PPTX with shape offset x="-45720".
  - Parser fails to read offset; element imports at x=0 instead of negative coordinate.

## 29) HIGH: SVG rotate(angle cx cy) center is ignored during import

- File: packages/formats/src/web-vector/import.ts:37
- Evidence:
  - rotate parser reads only first numeric argument and drops optional center coordinates.
- Why this is a bug:
  - `rotate(a cx cy)` is semantically different from `rotate(a)`; dropping center changes final placement.
- Failure scenario:
  - Import SVG element with `transform="rotate(45 200 100)"`.
  - Imported element rotates around origin-equivalent behavior instead of specified center, producing wrong position.

## 30) HIGH: ShadowEditor keeps stale local layers/enabled state when prop value changes

- File: packages/ui/src/inputs/shadow-editor.tsx:138
- File: packages/ui/src/inputs/shadow-editor.tsx:139
- Evidence:
  - Local `layers` and `enabled` are initialized from `value` once via `useState`.
  - No resync effect updates local state when `value` prop changes.
- Why this is a bug:
  - Selection changes and undo/redo can update prop value externally, but editor UI continues editing stale internal shadow layers.
- Failure scenario:
  - Edit shadow on element A, then select element B with different shadow value.
  - Shadow editor still shows previous element A layer state until remount.

## 31) HIGH: ColorInput draft mode can leak stale draft across selection/value changes

- File: packages/ui/src/inputs/color-input.tsx:229
- File: packages/ui/src/inputs/color-input.tsx:230
- Evidence:
  - `draft`/`isDrafting` local state has no reset path when `value` prop changes.
  - `displayValue` prefers stale draft whenever `isDrafting` is true.
- Why this is a bug:
  - Mid-edit selection switch can keep an old incomplete draft active for a new target element.
- Failure scenario:
  - Start typing color on element A (draft active), switch to element B before blur/enter.
  - Input continues showing stale draft instead of element B color and may commit wrong color.

## 32) HIGH: Editor clipboard copy stores live element references instead of snapshot copy

- File: packages/editor/src/element-operations.ts:184
- Evidence:
  - `copyElements` returns `elements: selectedElements` (direct references from store).
  - `pasteElements` later clones shallowly from those references.
- Why this is a bug:
  - Clipboard content should represent a snapshot at copy time.
  - With live references, edits after copy mutate what will be pasted later.
- Failure scenario:
  - Copy selected element.
  - Change its style/content before pasting.
  - Paste inserts the changed version, not the originally copied state.

## 33) HIGH: Text animator word/line modes map onto character spans, producing incorrect target behavior

- File: packages/renderer/src/screen-renderer/element-renderers.ts:92
- File: packages/playback/src/playback-dom/bindings.ts:45
- File: packages/playback/src/playback-dom/bindings.ts:60
- Evidence:
  - Renderer creates only per-character spans (`data-char-index`) for text.
  - Playback text animator selects those char spans and applies segments by index from `computeTextSegments`.
  - `computeTextSegments` can return word/line segments, but indices are then applied to character nodes.
- Why this is a bug:
  - `rangeMode: 'words' | 'lines'` should animate words/lines, not the first N characters.
- Failure scenario:
  - Configure text animator `rangeMode='words'` on text `"Breaking News Update"`.
  - Expected: 3 word units stagger.
  - Actual: styles apply to only first 3 character spans (`B`, `r`, `e`) because target nodes are char-indexed.

## 34) MEDIUM: Collaboration settings diff does not emit removals of canvas fields

- File: packages/editor/src/collaboration/diff.ts:220
- Evidence:
  - `diffSettings` iterates keys of `next.canvas` only.
  - Keys present in `prev.canvas` but missing in `next.canvas` are never emitted as updates to `undefined`.
- Why this is a bug:
  - Clearing optional canvas fields (for example backgroundColor/safeAreas) can fail to propagate to peers.
- Failure scenario:
  - Client A removes an optional canvas field from document state.
  - Diff emits no `settings:update` for that removal.
  - Client B retains stale canvas setting.

## 35) HIGH: SVG importer does not parse transform lists/order, only one translate and one rotate match

- File: packages/formats/src/web-vector/import.ts:31
- File: packages/formats/src/web-vector/import.ts:37
- Evidence:
  - `parseTransform` runs one regex for translate and one for rotate over the full string.
  - It does not parse ordered transform lists (e.g. translate+scale+rotate+skew) as SVG defines.
- Why this is a bug:
  - SVG transform semantics are order-dependent and can include multiple operators.
  - Partial parsing produces wrong imported coordinates/orientations for many real SVG files.
- Failure scenario:
  - Import element with `transform="translate(100 0) rotate(45) translate(50 0)"`.
  - Expected final transform applies both translations and rotation order.
  - Actual importer keeps only first translate and first rotate approximation, losing remaining transform effects.

## 36) HIGH: Text animator random order reshuffles every frame (unstable playback)

- File: packages/playback/src/text-animator.ts:67
- File: packages/playback/src/playback-dom/bindings.ts:60
- Evidence:
  - `computeTextSegments` performs Fisher-Yates shuffle whenever `randomOrder` is true.
  - `applyTextAnimator` calls `computeTextSegments` on every frame.
- Why this is a bug:
  - Random order should be stable during a playback run; per-frame reshuffling changes each segment’s start slot continuously.
- Failure scenario:
  - Enable text animator with `randomOrder=true`.
  - During playback, characters/segments flicker/jump because assigned stagger positions change frame-to-frame.

## 37) HIGH: Video export frame sampling never reaches requested duration endpoint

- File: packages/formats/src/interchange/index.ts:185
- File: packages/formats/src/raster/index.ts:354
- Evidence:
  - Both exporters compute per-frame time with `timeMs = (i / frameRate) * 1000` for `i = 0..totalFrames-1`.
  - For common cases (e.g. 1000 ms at 30 fps), last sampled time is 966.67 ms, not 1000 ms.
- Why this is a bug:
  - Final timeline state at exact export duration can be skipped.
- Failure scenario:
  - Animate an element change that completes exactly at clip end.
  - Export video and inspect last frame.
  - Last state is not fully reached because endpoint time was never sampled.

## Packages With No Additional Confirmed Bugs In Strict Pass

- packages/model
- packages/playback
- packages/editor

## Confidence Notes

- Findings above are direct code-path findings with line-level evidence.
- Non-findings are not proof of absence; they indicate no confirmed bug found in this strict pass scope.
