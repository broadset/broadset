# Renderer Specification

## Purpose

Defines the read-only display layer for broadset. The renderer converts a `BroadsetDocument` into a visual representation, delegates per-type rendering to a component registry, builds a recursive scene tree from the flat element array, and keeps the display in sync on document changes. It does NOT manage editable state, handle pointer interaction, or own the animation engine. See [conventions](../../README.md).

---

## Scope: Generic Core vs. Broadset Adapter

The renderer package is split into two layered surfaces:

- **Generic core** — a reusable HTML motion-graphics renderer. Consumes a normalized scene graph plus runtime services (`time`, `data`, `state`, `fonts`, `assets`). Knows nothing about `BroadsetDocument`, Broadset-specific `data-*` structural attributes, the overlay root, the checkerboard preview background, or custom-element registration. Produces semantic DOM: structural containers and per-type semantic renderers (text, image, svg, path, rectangle, ellipse, qrcode, group, video, clock, ticker).
- **Broadset adapter** — maps `BroadsetDocument` and `CanvasSettings` into the normalized scene graph, attaches Broadset-owned `data-*` attributes via decorators, defines the `BroadsetScreenRendererElement` custom element wrapper, owns the preview checkerboard background policy, and exposes `getOverlayRoot()` for editor chrome portals. Wraps the generic core behind `createScreenRenderer`.

Each requirement below is labeled `[Generic]` or `[Adapter]` to clarify which surface owns the behavior. Where a requirement is a cross-package contract with `@broadset/playback` or `@broadset/editor`, the requirement is labeled `[Cross-package]` and the contract is enforced through the Broadset adapter.

Other packages MUST consume the renderer through its package root barrel; they MUST NOT reach into adapter internals or rely on undocumented internal file paths.

---

### Data-Attribute Contract Registry

The renderer owns the following data attributes. Generic attributes are emitted by the generic core. Adapter attributes are emitted by the Broadset adapter layer.

#### Generic attributes

| Attribute              | Placed On              | Consumer                     | Purpose                                                  |
| ---------------------- | ---------------------- | ---------------------------- | -------------------------------------------------------- |
| `data-element-id`      | Element container      | Editor, Playback             | Identifies the element by document ID                    |
| `data-element-content` | Inner content element  | Playback (style writer)      | Marks the animation style target                         |
| `data-opacity-target`  | Opacity wrapper        | Playback (style writer)      | Target for opacity animation                             |
| `data-visibility`      | Element container      | Playback (state transitions) | Current visibility state                                 |
| `data-char-index`      | Per-character `<span>` | Playback (animation targets) | Stable index for per-character text animation decorators |

#### Broadset-adapter attributes

| Attribute                        | Placed On               | Consumer                      | Purpose                                                                           |
| -------------------------------- | ----------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `data-gradient`                  | Element content wrapper | Playback (gradient animation) | JSON-encoded gradient spec for playback-driven gradient interpolation             |
| `data-broadset-canvas-transform` | Canvas transform layer  | Export rasterizer, tests      | Marks the perspective/scale transform shell                                       |
| `data-broadset-canvas-root`      | Canvas content root     | Export rasterizer, tests      | Marks the semantic canvas content node (no editor chrome)                         |
| `data-broadset-element-layer`    | Element container layer | Export rasterizer, tests      | Marks the element-only layer (for export snapshots that exclude editor chrome)    |
| `data-broadset-overlay-root`     | Overlay chrome root     | Editor chrome, tests          | Marks the portal container for editor chrome (selection widgets, snap indicators) |

Other packages MUST NOT invent new `data-*` attributes on rendered elements without updating this registry. Adapter attributes MUST NOT be assumed to exist when the generic core is used without the Broadset adapter.

---

## DOM Stability Expectations

The renderer MUST keep DOM node identity stable across document updates for any element whose rendered output did not change. This is a prerequisite for:

- the 60fps performance target (see Rendering Performance)
- editor-chrome portals that hold direct DOM references across updates
- playback animation targets resolved once and cached by identity
- automated DOM-stability tests that assert unchanged identity by `isSameNode` / `WeakRef` comparison

### Identity rules

- Each rendered element MUST have a single stable host node keyed by the element's `id` across updates.
- An element's host node identity MUST be preserved when only its content or style changes.
- An element's host node identity MUST be preserved when a sibling is added, removed, or reordered.
- An element's host node MUST be remounted (identity replaced) when its `type` changes, because the inner renderer implementation changes.
- Removing an element from the document MUST destroy its renderer and remove its host node.
- Reparenting an element MUST move the existing host node into the new parent without remounting the renderer.

### Incremental update rules

- A single element property change MUST only mutate that element's host subtree; no sibling host MUST be touched.
- A new element insertion MUST NOT remount existing siblings.
- A composite renderer (e.g. boolean-group) MUST recompute only when its own element or one of its declared child-data dependencies changed; it MUST NOT recompute on unrelated sibling changes.
- Whole-layer `replaceChildren()` of the element layer is only permitted on initial mount, on document replacement, or on page change.

---

## Requirements

### Requirement: Component Capability Resolution `[Generic]`

The system MUST return built-in capability flags for known element types. Unknown types MUST return all-false capabilities. Plugin capabilities MUST merge on top of the base (built-in or default), overriding only the specified flags.

#### Scenario: Known built-in type

- GIVEN a component registry with no plugins
- WHEN capabilities for `text` are requested
- THEN the built-in capability set for `text` is returned

#### Scenario: Unknown type returns all-false

- GIVEN a component registry with no plugins
- WHEN capabilities for `ticker` are requested
- THEN every capability flag is `false`

#### Scenario: Plugin merges over defaults

- GIVEN a plugin registering type `countdown` with `borderRadius: true`
- WHEN capabilities for `countdown` are requested
- THEN `borderRadius` is `true` and unspecified flags remain `false`

#### Scenario: Plugin overrides built-in type

- GIVEN a plugin overriding `ellipse` with `borderRadius: true`
- WHEN capabilities for `ellipse` are requested
- THEN `borderRadius` is `true` while other built-in caps are preserved

#### Scenario: Plugin without capabilities preserves built-in

- GIVEN a plugin for `rectangle` with no capabilities field
- WHEN capabilities for `rectangle` are requested
- THEN the original built-in capabilities are returned unchanged

#### Acceptance Criteria

- [ ] Given a component registry with no plugins, the built-in capability set for `text` is returned
- [ ] Given a component registry with no plugins, every capability flag is `false`
- [ ] Given a plugin registering type `countdown` with `borderRadius: true`, `borderRadius` is `true` and unspecified flags remain `false`
- [ ] Given a plugin overriding `ellipse` with `borderRadius: true`, `borderRadius` is `true` while other built-in caps are preserved
- [ ] Given a plugin for `rectangle` with no capabilities field, the original built-in capabilities are returned unchanged

---

### Requirement: Background Style Application `[Generic]`

The system MUST apply gradient backgrounds via the `background` shorthand and clear prior solid colors. Solid backgrounds MUST be applied via `backgroundColor` and clear prior gradients.

#### Scenario: Solid replaces gradient

- GIVEN a node with a prior gradient background
- WHEN a solid color is applied
- THEN `backgroundColor` is set and the gradient is cleared

#### Scenario: Gradient replaces solid

- GIVEN a node with a prior solid background
- WHEN a gradient is applied
- THEN `background` contains the gradient and the solid color is cleared

#### Acceptance Criteria

- [ ] Given a node with a prior gradient background, `backgroundColor` is set and the gradient is cleared
- [ ] Given a node with a prior solid background, `background` contains the gradient and the solid color is cleared

---

### Requirement: Scene Tree Construction `[Generic]`

The system MUST build a hierarchical scene tree from the flat document element list by resolving parent references, promoting unresolved parents to roots, and preserving sibling order from document order.

#### Scenario: Null and unresolved parents produce root nodes

- GIVEN elements with null parent references and references to non-existent parents
- WHEN scene tree construction runs
- THEN those elements appear as root-level nodes

#### Scenario: Sibling order is preserved

- GIVEN multiple children under the same parent in document order
- WHEN scene tree construction runs
- THEN sibling order in the scene tree matches the original document order

#### Acceptance Criteria

- [ ] Given elements with null parent references and references to non-existent parents, those elements appear as root-level nodes
- [ ] Given multiple children under the same parent in document order, sibling order in the scene tree matches the original document order

---

### Requirement: Renderer Resolution Priority `[Generic]`

The system MUST resolve renderers in priority order of plugin renderer, built-in renderer, then fallback renderer.

#### Scenario: Plugin renderer takes precedence over built-in

- GIVEN both plugin and built-in renderers for an element kind
- WHEN the element is rendered
- THEN the plugin renderer is selected

#### Scenario: Unknown type uses fallback renderer

- GIVEN no plugin or built-in renderer for an element kind
- WHEN the element is rendered
- THEN fallback rendering is used

#### Acceptance Criteria

- [ ] Given both plugin and built-in renderers for an element kind, the plugin renderer is selected
- [ ] Given no plugin or built-in renderer for an element kind, fallback rendering is used

---

### Requirement: Element Renderer Lifecycle `[Generic]`

The system MUST mount renderers for new elements, remount when element type changes, clear host output on destroy, and ignore updates after destroy.

#### Scenario: Type change remounts renderer

- GIVEN a mounted renderer for one element kind
- WHEN the element kind changes
- THEN the previous renderer is destroyed and a new renderer is mounted

#### Scenario: Destroy clears host and prevents later updates

- GIVEN a mounted renderer instance
- WHEN destroy is called and then update is requested
- THEN host output remains cleared and update has no effect

#### Acceptance Criteria

- [ ] Given a mounted renderer for one element kind, the previous renderer is destroyed and a new renderer is mounted
- [ ] Given a mounted renderer instance, host output remains cleared and update has no effect

---

### Requirement: Screen Renderer Custom Element Lifecycle `[Adapter]`

The system MUST initialize rendering resources on connection, tear down resources on disconnection, and perform full document-driven rerender when document input is replaced.

#### Scenario: Document replacement triggers full rerender

- GIVEN a connected screen renderer element
- WHEN a new document is assigned
- THEN existing renderers are replaced and output is rebuilt from the new document

#### Acceptance Criteria

- [ ] Given a connected screen renderer element, existing renderers are replaced and output is rebuilt from the new document

---

### Requirement: Canvas Scaling Behavior `[Generic]`

The system MUST compute base canvas size from document dimensions and update rendered scale responsively as container size changes.

#### Scenario: Scale tracks container width changes

- GIVEN a rendered screen in a resizable container
- WHEN container width changes
- THEN rendered scale updates proportionally

#### Acceptance Criteria

- [ ] Given a rendered screen in a resizable container, rendered scale updates proportionally

---

### Requirement: Dynamic Data Substitution `[Generic]`

The system MUST substitute dynamic content values before delegating content to element renderers when dynamic mapping keys match element content tokens.

#### Scenario: Dynamic content token is substituted

- GIVEN an element content token with a matching dynamic data value
- WHEN rendering occurs
- THEN the renderer receives substituted content

#### Acceptance Criteria

- [ ] Given an element content token with a matching dynamic data value, the renderer receives substituted content

---

### Requirement: Font Injection Idempotency `[Generic]`

The system MUST avoid duplicate font loading for repeated font definitions sharing family, weight, and style.

#### Scenario: Duplicate font definition is loaded once

- GIVEN repeated font definitions with identical family, weight, and style
- WHEN font injection runs
- THEN the duplicate definition is not loaded again

#### Acceptance Criteria

- [ ] Given repeated font definitions with identical family, weight, and style, the duplicate definition is not loaded again

---

### Requirement: QR Code SVG Generation `[Generic]`

The system MUST return null for empty QR payloads and responsive SVG output for non-empty payloads.

#### Scenario: Empty payload yields null

- GIVEN an empty QR payload
- WHEN QR SVG generation runs
- THEN the result is null

#### Scenario: Non-empty payload yields responsive SVG

- GIVEN a non-empty QR payload
- WHEN QR SVG generation runs
- THEN output is non-empty SVG with responsive scaling attributes

#### Acceptance Criteria

- [ ] Given an empty QR payload, the result is null
- [ ] Given a non-empty QR payload, output is non-empty SVG with responsive scaling attributes

---

### Requirement: Per-Type Renderer Output Contracts `[Generic]`

The system MUST render supported built-in element kinds and unknown kinds with stable observable output contracts.

#### Scenario: Supported built-in element kinds render expected output

- GIVEN document elements for text, image, svg, path, rectangle, ellipse, qrcode, group, video, clock, and ticker kinds
- WHEN rendering occurs
- THEN each kind produces its expected visible output contract

#### Scenario: Unknown kind renders via fallback contract

- GIVEN an element with an unknown kind
- WHEN rendering occurs
- THEN fallback output is rendered instead of failure

#### Acceptance Criteria

- [ ] Given document elements for text, image, svg, path, rectangle, ellipse, qrcode, group, video, clock, and ticker kinds, each kind produces its expected visible output contract
- [ ] Given an element with an unknown kind, fallback output is rendered instead of failure

---

### Requirement: Visibility Class Toggle `[Cross-package]`

Toggling element visibility between onscreen and offscreen MUST add or remove the appropriate CSS class on the rendered DOM node. The element MUST remain in the DOM regardless of visibility state.

#### Scenario: Toggle to offscreen

- GIVEN an element with visibility `'onscreen'`
- WHEN visibility is changed to `'offscreen'`
- THEN the offscreen CSS class is added and the element is visually hidden

#### Acceptance Criteria

- [ ] Given visibility toggle to offscreen, the offscreen CSS class is applied
- [ ] Given visibility toggle to onscreen, the offscreen CSS class is removed

---

### Requirement: State Class Management `[Cross-package]`

Activating a named state on an element MUST add a state-specific CSS class to the rendered DOM node. Deactivating MUST remove it. Only one state class MUST be active at a time.

#### Scenario: Activate state

- GIVEN an element with state bindings
- WHEN state `'hover'` is activated
- THEN a `hover` state CSS class is added to the element's DOM node

#### Acceptance Criteria

- [ ] Given state activation, the corresponding CSS class is added
- [ ] Given state deactivation, the corresponding CSS class is removed
- [ ] Given a new state activation, the previous state class is replaced

---

### Requirement: Custom Component Rendering `[Generic]`

Custom component plugin types MUST render via their provided rendererFactory. The factory receives element data and produces DOM output. If no factory is provided, fallback rendering is used.

#### Scenario: Plugin renderer produces output

- GIVEN a plugin with a rendererFactory for type `'countdown'`
- WHEN an element of type `'countdown'` is rendered
- THEN the rendererFactory produces the DOM output

#### Acceptance Criteria

- [ ] Given a plugin with a rendererFactory, the factory produces DOM output for that type
- [ ] Given a plugin without a rendererFactory, fallback rendering is used

---

### Requirement: 3D Transform Rendering `[Generic]`

Elements with rotateX, rotateY, rotateZ, or translateZ screen properties MUST render with CSS 3D transform. Perspective MUST be applied from `CanvasSettings.perspective`, accepted via the renderer's `RenderSettings` on create or via `updateSettings({ perspective })`. The renderer MUST apply this perspective on the canvas coordinate layer that contains both element content and editor chrome, so 3D projection is identical for elements and any overlay chrome (e.g. the selection transform widget).

The transform token sequence for each element MUST be stable: `rotate(Xdeg) rotateX(Xdeg) rotateY(Xdeg) rotateZ(Xdeg) translateZ(Xpx)`, with zero-valued tokens omitted. This stable string is the single source of truth — the editor's transform widget consumes the exact same token builder so the widget and the element never drift.

#### Scenario: 3D transform applied

- GIVEN an element with rotateX=45 and translateZ=50
- WHEN the element is rendered
- THEN a CSS 3D transform string including rotateX and translateZ is applied

#### Scenario: Perspective from settings

- GIVEN `CanvasSettings.perspective = 1000` passed to the renderer as `RenderSettings.perspective`
- WHEN elements with 3D transforms are rendered
- THEN the canvas coordinate layer applies CSS `perspective: 1000px`

#### Acceptance Criteria

- [ ] Given 3D screen properties, a CSS 3D transform is applied to the element
- [ ] Given `RenderSettings.perspective` (sourced from `CanvasSettings.perspective`), the perspective value is applied to the canvas coordinate layer
- [ ] Zero-valued 3D transform components (`rotateX=0`, `rotateY=0`, `rotateZ=0`, `translateZ=0`) are omitted from the transform string
- [ ] The renderer exposes `getOverlayRoot()` returning a DOM node in the same coordinate space as element hosts, so editor chrome (e.g. the selection widget) can portal in and inherit identical scale, pan, and perspective without duplicating transform math

---

### Requirement: Z-Order by Document Order `[Generic]`

Element z-order MUST be determined solely by position in the document's `elements` array. Elements later in the array render on top. No explicit z-index property exists. The renderer MUST append DOM nodes in array order so that natural DOM stacking produces correct layering.

#### Scenario: Later elements render on top

- GIVEN elements `[A, B, C]` in the document's elements array
- WHEN the scene is rendered
- THEN C renders on top of B, which renders on top of A

#### Acceptance Criteria

- [ ] Given elements in array order, later elements visually stack on top of earlier ones
- [ ] Given no z-index CSS property is applied to individual elements

---

### Requirement: Rendering Performance `[Generic]`

The renderer SHOULD sustain 60fps frame rate with up to 100 elements on reference hardware (modern desktop browser, discrete GPU). Implementations MUST NOT introduce O(n²) or worse rendering complexity. Performance testing SHOULD measure frame duration rather than absolute FPS to account for CI environment variability. Implementations SHOULD use surgical DOM updates (only mutating changed elements) rather than full re-renders to meet this target.

#### Scenario: 100-element drag on reference hardware

- GIVEN a canvas with 100 elements on reference hardware
- WHEN an element is dragged across the canvas
- THEN frame duration does not degrade proportionally with element count beyond O(n)

#### Scenario: Rendering complexity is linear

- GIVEN a canvas with N elements
- WHEN a single element property changes
- THEN only that element's DOM node is mutated, not the full scene

#### Acceptance Criteria

- [ ] Given a single element property change, rendering complexity is O(n) relative to element count (i.e., no full-tree rebuild occurs)
- [ ] Given animation playback with 100 elements, per-frame DOM mutation count does not grow beyond the number of animating elements

---

### Requirement: Animation Target Attribute Contract `[Cross-package]`

Each rendered element MUST place a `data-element-content` attribute on the inner content element that is the target for animation style application. This attribute establishes a cross-package contract with the playback engine, which queries `[data-element-content]` to locate the animation target. The attribute MUST be present on exactly one descendant of the element's container node.

#### Scenario: Text element exposes content target

- GIVEN a text element is rendered
- WHEN the DOM is inspected
- THEN the inner content element has a `data-element-content` attribute

#### Scenario: Group element is its own content target

- GIVEN a group element is rendered
- WHEN the DOM is inspected
- THEN the group container itself has a `data-element-content` attribute

#### Acceptance Criteria

- [ ] Given any rendered element, exactly one descendant has the `data-element-content` attribute
- [ ] Given a group element, the container element itself carries the `data-element-content` attribute

---

### Requirement: Incremental Scene Tree Updates `[Generic]`

The renderer MUST support incremental updates to the scene tree. When an element is added, removed, or modified, only the affected subtree MUST be re-rendered. Full scene tree rebuilds MUST only occur on initial mount or when the page changes. This is required to meet the 60fps performance target.

#### Scenario: Single element property change

- GIVEN a scene tree with 50 elements
- WHEN one element's position changes
- THEN only that element's DOM node is updated, not the full tree

#### Scenario: Element addition

- GIVEN a rendered scene tree
- WHEN a new element is added to the document
- THEN a new node is inserted without rebuilding existing nodes

#### Acceptance Criteria

- [ ] Given a single element property change, only the affected element is re-rendered
- [ ] Given an element addition, existing rendered elements are not re-mounted

---

### Requirement: Broken Image Fallback `[Generic]`

When an image element's content URL fails to load (404, network error, malformed URL), the renderer MUST display a visible placeholder indicating the broken state. The placeholder MUST include the element's dimensions and a broken-image icon or text indicator. The renderer MUST NOT throw an error or leave an invisible gap.

Image loads use a two-phase strategy to maximize export compatibility: the renderer first attempts to load the image with `crossOrigin="anonymous"` so the browser issues a CORS request — when the server replies with appropriate CORS headers the image is non-tainted and the same URL is reusable by raster/video exporters from the HTTP cache. If the CORS attempt errors, the renderer falls back to a plain `<img>` (no `crossOrigin`) so the image still displays in the editor even when the server does not support CORS; exports of such images will show a placeholder. Only when both attempts error does the broken-image placeholder replace the `<img>`.

#### Scenario: 404 image URL

- GIVEN an image element with a 404 URL
- WHEN the image fails to load
- THEN a visible broken-image placeholder is rendered at the element's position and dimensions

#### Scenario: Empty image content

- GIVEN an image element with an empty content string
- WHEN the element is rendered
- THEN a placeholder is displayed

#### Scenario: Non-CORS image server

- GIVEN an image element whose server does not send CORS headers
- WHEN the CORS-enabled first attempt errors
- THEN a plain-fetch fallback `<img>` loads the image for editor display
- AND exports of this image render the broken-image placeholder

#### Acceptance Criteria

- [ ] Given a broken image URL, a visible placeholder is rendered at the element's dimensions
- [ ] Given an empty image content, a placeholder is rendered
- [ ] Given a broken image, no JavaScript error is thrown
- [ ] Given a CORS-enabled image host, the rendered `<img>` has `crossOrigin="anonymous"` so the same URL can be re-fetched by exporters from the HTTP cache
- [ ] Given a non-CORS image host, a plain `<img>` fallback loads the image for display after the CORS attempt errors

---

### Requirement: Text Content Sanitization `[Generic]`

When rendering text elements, the renderer MUST sanitize HTML content to prevent XSS attacks. Only the following HTML tags are allowed: `<b>`, `<i>`, `<u>`, `<br>`, `<span>`, `<strong>`, `<em>`. All other tags MUST be stripped. Only the `style` attribute is allowed on permitted tags; all other attributes MUST be removed. This sanitization MUST occur at render time as a defense-in-depth measure (the model boundary also sanitizes).

#### Scenario: Script tag stripped

- GIVEN a text element with content `<b>Hello</b> <script>alert('xss')</script>World`
- WHEN rendered
- THEN the output contains `<b>Hello</b> World` with the script tag absent

#### Scenario: Event handler attribute stripped

- GIVEN a text element with content `<span onclick="evil()">text</span>`
- WHEN rendered
- THEN the `onclick` attribute is absent from the rendered output

#### Acceptance Criteria

- [ ] Given text content with script tags, the script tags are stripped in rendered output
- [ ] Given text content with event handler attributes, the attributes are stripped
- [ ] Given text content with allowed tags (`b`, `i`, `u`, `br`, `span`, `strong`, `em`), they are preserved in rendered output

---

### Requirement: Plain Group Element Rendering `[Generic]`

Group-type elements with `booleanOperation === null` MUST render as a container `<div>` element. The container MUST have `data-element-id` set to the group's ID and `data-element-content` on itself. Child elements (those with `parentId` referencing the group) MUST be rendered as descendants within the group container. The group container MUST apply the group's position, rotation, and opacity but MUST NOT clip children by default. A plain group is a structural container only; it MUST NOT compose child geometry into a single combined path.

#### Scenario: Group with children

- GIVEN a group element with two children and `booleanOperation: null`
- WHEN rendered
- THEN the group renders as a `<div>` containing both children

#### Scenario: Group rotation applied

- GIVEN a group element with rotation 45° and `booleanOperation: null`
- WHEN rendered
- THEN the rotation transform is applied to the group container

#### Acceptance Criteria

- [ ] Given a plain group element (`booleanOperation: null`), it renders as a div container
- [ ] Given a plain group with children, child elements render inside the group container
- [ ] Given a plain group with rotation, the rotation is applied to the container transform
- [ ] Given a plain group, no combined SVG path is emitted (plain grouping is structural-only)

---

### Requirement: Boolean Composite Group Rendering `[Generic]`

Group-type elements with a non-null `booleanOperation` (`union`, `subtract`, `intersect`, `exclude`) MUST render a single combined SVG `<path>` produced by applying the boolean operation to the path data of all direct path children, in document order. The combined path MUST inherit stroke/fill styling from the first path child. When fewer than two path children contribute usable path data, the renderer MUST produce no visible geometry (empty host content) and MUST NOT throw.

Boolean composite behavior belongs to `kind: 'vector'` with `geometryData.kind: 'boolean'`; it is not a group decorator. Operand vector paths remain independently addressable definitions, while the boolean vector resolves their combined geometry according to its typed operation.

#### Scenario: Union of two path children

- GIVEN a group element with `booleanOperation: 'union'` and two path children
- WHEN rendered
- THEN a single SVG `<path>` combining both child paths is mounted inside the group container

#### Scenario: Invalid boolean operation

- GIVEN a group element with a `booleanOperation` value outside the supported set
- WHEN rendered
- THEN no combined path is emitted and the group container is empty

#### Scenario: Insufficient path children

- GIVEN a group element with `booleanOperation: 'union'` and zero or one path child
- WHEN rendered
- THEN no combined path is emitted and the group container is empty

#### Acceptance Criteria

- [ ] Given a group with `booleanOperation != null` and two or more path children, a single combined `<path>` is emitted
- [ ] Given the combined path, its stroke, fill, and fill-rule are inherited from the first path child
- [ ] Given a group with an unsupported `booleanOperation`, no combined path is emitted
- [ ] Given a group with fewer than two usable path children, no combined path is emitted and the renderer does not throw
- [ ] Given a boolean vector, the resolver combines its stable vector operands according to the typed operation without changing operand identity

---

### Requirement: Dynamic Data Token Format `[Generic]`

Dynamic data tokens in element content MUST use the format `{{key}}` where `key` is a dot-notation path into the data store (e.g., `{{score.home}}`, `{{player.name}}`). The renderer MUST replace tokens with their resolved values from the data store. Unresolved tokens (keys not found in the data store) MUST be rendered as the literal token string `{{key}}`.

#### Scenario: Token with matching data

- GIVEN a text element with content `Score: {{score.home}} - {{score.away}}` and a data store with `score.home = 3` and `score.away = 1`
- WHEN rendered
- THEN the output is `Score: 3 - 1`

#### Scenario: Token without matching data

- GIVEN a text element with content `{{missing.key}}` and no matching data store entry
- WHEN rendered
- THEN the output is `{{missing.key}}`

#### Acceptance Criteria

- [ ] Given a token matching a data store key, the token is replaced with the resolved data value
- [ ] Given a token with no matching data store key, the literal token string is rendered
- [ ] Given nested dot-notation keys, the correct nested value is resolved

---

### Requirement: Video Element Rendering `[Generic]`

Video elements MUST render a `<video>` tag within the element wrapper. The `src` attribute MUST be set to the element's `content` (video URL). The video element MUST NOT show browser-native controls (`controls` attribute MUST be absent). The `typeConfig` properties MUST map to video attributes: `loop` → `loop` attribute, `muted` → `muted` attribute, `autoplay` → `autoplay` attribute. The `data-element-content` marker MUST be placed on the `<video>` tag. When `typeConfig.startTimeS` is set, the video's `currentTime` MUST be set to the start time on load. When `typeConfig.endTimeS` is set, the video MUST pause or loop when reaching the end time. Object-fit MUST be applied via CSS on the `<video>` element. The video element MUST respect standard element styling (border-radius, box effects, clip-path, opacity).

#### Scenario: Video element renders video tag

- GIVEN a video element with `content: 'https://example.com/video.mp4'` and `typeConfig: { muted: true, autoplay: true }`
- WHEN the element is rendered
- THEN a `<video>` tag is output with `src`, `muted`, and `autoplay` attributes; no `controls` attribute

#### Scenario: Video with start time

- GIVEN a video element with `typeConfig: { startTimeS: 5 }`
- WHEN the video loads
- THEN `currentTime` is set to 5

#### Scenario: Video with object-fit

- GIVEN a video element with style `objectFit: 'cover'`
- WHEN rendered
- THEN the `<video>` tag has CSS `object-fit: cover`

#### Acceptance Criteria

- [ ] Given a video element, a `<video>` tag is rendered with the content as `src`
- [ ] Given a video element, native controls are not shown
- [ ] Given `typeConfig.muted: true`, the `muted` attribute is present
- [ ] Given `typeConfig.startTimeS`, the video starts at the specified time
- [ ] Given standard element styling, video elements respect border-radius, opacity, and clip-path

---

### Requirement: Clock Element Rendering `[Generic]`

Clock elements MUST render a text display showing formatted time according to the element's `content` format pattern and `typeConfig.mode`. In `'realtime'` mode, the display MUST update every second (or fraction indicated by the format) showing the current local time. In `'countdown'` mode, the display MUST count down from `typeConfig.startValue` toward `typeConfig.targetValue`. In `'countup'` mode, the display counts up from `typeConfig.startValue`. In `'stopwatch'` mode, the display shows elapsed time from when the element's visibility became `'onscreen'` (derived from animation state). When `typeConfig.countdownTo` is set (ISO 8601 datetime), the clock MUST display remaining time until the target datetime, updating every second; when the target is in the past, the display MUST show `00:00:00` (formatted per the element's format pattern). The `countdownTo` field overrides `startValue`/`targetValue` when present. The format pattern uses `HH` (hours), `mm` (minutes), `ss` (seconds), `S` (tenths), `SS` (hundredths), `SSS` (milliseconds). The rendered output MUST use the same DOM structure as text elements (span with text content) and MUST respect typography capabilities (font, size, color, alignment). The `data-element-content` marker MUST be on the text span.

#### Scenario: Realtime clock

- GIVEN a clock element with `content: 'HH:mm:ss'` and `typeConfig: { mode: 'realtime' }`
- WHEN rendered at 14:30:05 local time
- THEN the display shows `14:30:05` and updates every second

#### Scenario: Countdown clock

- GIVEN a clock element with `typeConfig: { mode: 'countdown', startValue: '00:10:00', targetValue: '00:00:00' }`
- WHEN rendered
- THEN the display counts down from 10 minutes to zero

#### Scenario: Absolute datetime countdown

- GIVEN a clock element with `content: 'HH:mm:ss'` and `typeConfig: { mode: 'countdown', countdownTo: '2026-04-05T15:00:00Z' }`
- WHEN rendered at 2026-04-05T14:58:30Z
- THEN the display shows `00:01:30` and updates every second

#### Scenario: Absolute countdown past target

- GIVEN a clock element with `typeConfig: { mode: 'countdown', countdownTo: '2026-04-05T12:00:00Z' }`
- WHEN rendered at 2026-04-05T14:00:00Z (target is in the past)
- THEN the display shows `00:00:00`

#### Scenario: Stopwatch mode

- GIVEN a clock element with `typeConfig: { mode: 'stopwatch' }`
- WHEN the element transitions to visible
- THEN the stopwatch starts from 00:00:00 and counts up

#### Acceptance Criteria

- [ ] Given a realtime clock, the display updates with current local time at the appropriate interval
- [ ] Given a countdown clock, the display counts down from startValue to targetValue
- [ ] Given a countdown clock with `countdownTo` set, the display shows remaining time until the target datetime
- [ ] Given a `countdownTo` target in the past, the display shows zero
- [ ] Given a stopwatch clock, the timer starts when the element becomes visible
- [ ] Given a clock element, typography styling (font, size, color) is applied

---

### Requirement: Ticker Element Rendering `[Generic]`

Ticker elements MUST render a continuously scrolling container of text items. Each item in the `content` JSON array MUST be rendered as an individual text span. Items scroll in the direction specified by `typeConfig.direction` at the speed of `typeConfig.speed` pixels per second with `typeConfig.gap` pixels between consecutive items. When the leading item fully scrolls out of view, it MUST be recycled to the trailing end, creating an infinite scroll effect. When `typeConfig.paused` is `true`, scrolling MUST stop at the current position. The ticker container MUST clip overflow content. The ticker MUST respect typography capabilities (font, size, color). Scrolling MUST use CSS transforms (translateX/translateY) animated via `requestAnimationFrame` for smooth, GPU-accelerated motion.

#### Scenario: Left-scrolling ticker

- GIVEN a ticker element with `content: '["Breaking: Storm Warning", "Sports: Final Score 3-2"]'` and `typeConfig: { direction: 'left', speed: 60 }`
- WHEN rendered
- THEN items scroll leftward at 60px/s with gap between them

#### Scenario: Ticker paused

- GIVEN a ticker element with `typeConfig: { paused: true }`
- WHEN rendered
- THEN items are visible but stationary

#### Scenario: Item recycling

- GIVEN a ticker with 3 items scrolling left
- WHEN the first item fully exits the left edge
- THEN it is repositioned after the last item on the right

#### Scenario: Vertical ticker

- GIVEN a ticker element with `typeConfig: { direction: 'up', speed: 40 }`
- WHEN rendered
- THEN items scroll upward at 40px/s

#### Acceptance Criteria

- [ ] Given a ticker element, items scroll in the specified direction at the specified speed
- [ ] Given `typeConfig.paused: true`, scrolling stops
- [ ] Given items scrolling out of view, they are recycled to create infinite scroll
- [ ] Given a ticker, overflow content is clipped to the element bounds
- [ ] Given a ticker, typography styling is applied to individual items

---

### Requirement: Alpha Background Rendering Mode `[Adapter]`

The renderer MUST support a transparent background mode for alpha-channel export. When the canvas element has `background: 'transparent'` or when an export requests alpha output, the canvas background MUST render with no background color (CSS `background: transparent` or equivalent). All elements MUST render with their specified opacity and backgrounds preserved — only the canvas root background is made transparent. This enables compositing the rendered output over external video feeds or other graphics layers. The alpha background mode MUST NOT affect element rendering, z-order, or any other visual behavior.

#### Scenario: Transparent canvas background

- GIVEN a canvas with `background: 'transparent'`
- WHEN the scene is rendered
- THEN the root canvas element has no visible background

#### Scenario: Elements retain their backgrounds

- GIVEN a transparent canvas background and elements with solid background colors
- WHEN the scene is rendered
- THEN individual elements render their backgrounds normally against the transparent canvas

#### Scenario: Normal background unchanged

- GIVEN a canvas with `background: '#ffffff'`
- WHEN the scene is rendered
- THEN the canvas has a white background (existing behavior)

#### Acceptance Criteria

- [ ] Given `background: 'transparent'`, the canvas root has no visible background
- [ ] Given transparent canvas, elements retain their own background colors and opacity
- [ ] Given a normal (non-transparent) background value, existing behavior is unchanged

---

## Spec Gaps

- [x] **Animation Target Attribute Contract:** Automated renderer tests verify one animation target per element and group-specific targeting on the container contract (`packages/renderer/src/screen-renderer/core.test.ts`).
- [x] **Incremental Scene Tree Updates:** Automated renderer tests verify that single-element changes rerender only the affected element and that element additions do not remount existing nodes (`packages/renderer/src/screen-renderer/core.test.ts`).
- [x] **Broken Image Fallback:** Automated renderer tests verify both the empty-content path and the image error-event path swap to a visible placeholder without leaving a broken `<img>` node (`packages/renderer/src/screen-renderer/core.test.ts`).
- [x] **Text Content Sanitization:** Automated renderer tests verify text rendering strips script tags and inline event-handler markup before visible characters are emitted (`packages/renderer/src/screen-renderer/core.test.ts`).
- [ ] **Proposed inert-string/typed-run migration:** IO-D-01 and the roadmap propose eventually replacing persisted sanitized HTML authoring content with inert strings plus structured runs. The current sanitization requirement and its evidence remain authoritative until a maintainer-ratified migration updates the model, renderer, importers, clipboard/export boundaries, and security tests together.
- [x] **Group Element Rendering:** Automated renderer tests verify both boolean-operation group rendering and normal group container behavior with child nodes (`packages/renderer/src/screen-renderer/core.test.ts`).
- [x] **Dynamic Data Token Format:** Runtime `substituteDynamicTokens` + renderer-level tests verify direct-key resolution, nested dot-notation, and literal fallback for missing keys (`packages/renderer/src/core/runtime.test.ts`).
- [x] **Rendering Performance (complexity):** Instrumented `insertBefore` mutation-count tests verify that single-element updates leave root-level children untouched, single insertions trigger exactly one reparent, and sibling reorders stay within O(n) moves (`packages/renderer/src/dom/performance.test.ts`).

---

## Non-Goals

- Document model types and validation → see `project/spec/model/spec.md`
- Animation engine and timeline computation → see `project/spec/playback/spec.md`
- Editor state management and history → see `project/spec/editor/spec.md`
- Export format rendering → see `project/spec/formats/spec.md`
