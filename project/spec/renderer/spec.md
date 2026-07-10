# Renderer Specification

## Purpose

Defines the read-only display layer for broadset. The renderer consumes a validated `ResolvedSceneSnapshot`, delegates closed variants and authorized plugins to semantic renderers, builds a recursive scene tree from canonical preorder, and keeps display output synchronized. It does NOT validate or mutate project data, handle pointer interaction, or own playback. See [conventions](../../README.md).

---

## Scope: Generic Core vs. Broadset Adapter

The renderer package is split into two layered surfaces:

- **Generic core** — consumes a normalized resolved scene plus runtime resource services and produces semantic DOM for closed text, image, vector, group, component-instance, video, audio, clock, ticker, QR, foreign, and plugin outputs. It knows nothing about canonical serialization, Broadset-specific structural attributes, editor overlays, or custom-element registration.
- **Broadset adapter** — accepts a validated `ResolvedSceneSnapshot` plus runtime `RenderSettings`, attaches Broadset-owned decorators, owns preview chrome policy, and exposes `getOverlayRoot()` for editor portals. It never maps an unvalidated legacy document shape.

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
- An element's host node identity MUST be preserved when only its typed payload or resolved appearance changes.
- An element's host node identity MUST be preserved when a sibling is added, removed, or reordered.
- An element's host node MUST be remounted when its closed `kind` or vector subtype changes because the semantic renderer changes.
- Removing an element from the document MUST destroy its renderer and remove its host node.
- Reparenting an element MUST move the existing host node into the new parent without remounting the renderer.

### Incremental update rules

- A single element property change MUST only mutate that element's host subtree; no sibling host MUST be touched.
- A new element insertion MUST NOT remount existing siblings.
- A composite renderer (e.g. boolean-group) MUST recompute only when its own element or one of its declared child-data dependencies changed; it MUST NOT recompute on unrelated sibling changes.
- Whole-layer `replaceChildren()` of the element layer is only permitted on initial mount, resolved-snapshot replacement, or page-instance change.

---

## Requirements

### Requirement: Component Capability Resolution `[Generic]`

The system MUST resolve built-in capabilities from the closed canonical kind and vector subtype. Plugin capabilities apply only to `kind: 'plugin'` and merge over the all-false plugin baseline; a plugin MUST NOT override core-kind behavior. Foreign fallback capabilities derive from safe render mode.

#### Scenario: Known built-in type

- GIVEN a component registry with no plugins
- WHEN capabilities for `text` are requested
- THEN the built-in capability set for `text` is returned

#### Scenario: Unknown plugin type returns all-false

- GIVEN a canonical plugin envelope with no authorized registration
- WHEN its capabilities are requested
- THEN every capability flag is `false`

#### Scenario: Plugin merges over defaults

- GIVEN a plugin registering element type `countdown` with the `borderRadius` UI capability true
- WHEN capabilities for `countdown` are requested
- THEN `borderRadius` is `true` and unspecified flags remain `false`

#### Scenario: Plugin cannot override built-in subtype

- GIVEN a plugin registration whose element type string is `ellipse`
- WHEN capabilities for a core vector ellipse are requested
- THEN core vector-ellipse capabilities are unchanged

#### Scenario: Plugin without capabilities preserves built-in

- GIVEN a vector rectangle and an unrelated plugin element type string `rectangle`
- WHEN vector-rectangle capabilities are requested
- THEN the original built-in capabilities are returned unchanged

#### Acceptance Criteria

- [ ] Given a component registry with no plugins, the built-in capability set for `text` is returned
- [ ] Given a component registry with no plugins, every capability flag is `false`
- [ ] Given a plugin registering type `countdown` with `borderRadius: true`, `borderRadius` is `true` and unspecified flags remain `false`
- [ ] Given a plugin whose element type string matches a core subtype label, core capabilities remain unchanged
- [ ] Given a vector rectangle and an unrelated plugin registration, vector-rectangle capabilities remain unchanged

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

The system MUST build a hierarchical scene tree from the already validated canonical preorder by resolving `parentId` and preserving sibling order. Missing parents, cycles, or split subtrees are validation failures and produce no partial scene.

#### Scenario: Null parents produce root nodes

- GIVEN validated elements whose root nodes have `parentId: null`
- WHEN scene tree construction runs
- THEN those elements appear as root-level nodes

#### Scenario: Invalid parent produces no scene

- GIVEN project data with a non-resolving `parentId`
- WHEN validation and scene resolution run
- THEN validation fails and the renderer receives no partial snapshot

#### Scenario: Sibling order is preserved

- GIVEN multiple children under the same parent in document order
- WHEN scene tree construction runs
- THEN sibling order in the scene tree matches the original document order

#### Acceptance Criteria

- [ ] Given validated elements with `parentId: null`, those elements appear as root-level nodes
- [ ] Given a missing parent, validation fails before rendering and no partial scene is produced
- [ ] Given multiple children under the same parent in document order, sibling order in the scene tree matches the original document order

---

### Requirement: Renderer Resolution Priority `[Generic]`

The system MUST route closed core kinds to built-in renderers, canonical plugin elements to an authorized exact plugin registration, and foreign elements to their declared safe preview/sanitized-vector path. Missing plugin factories use explicit plugin fallback; plugins never override core renderers.

#### Scenario: Exact plugin renderer is selected

- GIVEN a canonical plugin element and an authorized factory matching plugin ID, element type, and schema version
- WHEN the element is rendered
- THEN the exact plugin renderer is selected

#### Scenario: Unknown plugin uses fallback renderer

- GIVEN a valid plugin envelope with no authorized matching factory
- WHEN the element is rendered
- THEN fallback rendering is used

#### Acceptance Criteria

- [ ] Given an authorized exact plugin factory, it renders the plugin element without replacing core behavior
- [ ] Given no authorized exact plugin factory, preview or unsupported-plugin fallback renders

---

### Requirement: Element Renderer Lifecycle `[Generic]`

The system MUST mount renderers for new elements, remount when a closed kind/subtype changes through a valid replacement, clear host output on destroy, and ignore updates after destroy.

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

### Requirement: Scene Renderer Custom Element Lifecycle `[Adapter]`

The system MUST initialize rendering resources on connection, tear them down on disconnection, and perform a full rerender when its validated resolved-snapshot input is replaced.

#### Scenario: Document replacement triggers full rerender

- GIVEN a connected scene renderer element
- WHEN a new resolved snapshot is assigned
- THEN existing renderers are replaced and output is rebuilt from that snapshot

#### Acceptance Criteria

- [ ] Given a connected scene renderer element, existing renderers are replaced and output is rebuilt from the new resolved snapshot

---

### Requirement: Canvas Scaling Behavior `[Generic]`

The system MUST compute base surface size from the resolved `surface.size` and update rendered scale responsively as container size changes.

#### Scenario: Scale tracks container width changes

- GIVEN a rendered screen in a resizable container
- WHEN container width changes
- THEN rendered scale updates proportionally

#### Acceptance Criteria

- [ ] Given a rendered screen in a resizable container, rendered scale updates proportionally

---

### Requirement: Dynamic Data Substitution `[Generic]`

The system MUST apply already validated document bindings before delegating resolved properties to element renderers. Binding evaluation uses stable field IDs, closed expressions, and stable property targets; renderers do not parse content tokens.

#### Scenario: Bound typed property is resolved

- GIVEN a type-correct binding with a matching runtime field value
- WHEN rendering occurs
- THEN the renderer receives the resolved typed property with provenance

#### Acceptance Criteria

- [ ] Given a type-correct binding and matching field value, the renderer receives the resolved typed property with provenance

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

The system MUST render every closed core kind, explicit plugin envelope, and foreign fallback with stable observable output contracts.

#### Scenario: Supported built-in element kinds render expected output

- GIVEN resolved text, image, vector rectangle/ellipse/path/boolean, group, component-instance, video, audio, clock, ticker, qrcode, foreign, and plugin elements
- WHEN rendering occurs
- THEN each kind produces its expected visible output contract

#### Scenario: Missing plugin renderer uses explicit fallback

- GIVEN a valid plugin element with no authorized renderer
- WHEN rendering occurs
- THEN fallback output is rendered instead of failure

#### Acceptance Criteria

- [ ] Given every closed core kind and vector subtype, each produces its expected visible output contract
- [ ] Given a plugin without an authorized renderer, its preview or unsupported-plugin fallback renders instead of executing payload

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

### Requirement: Derived State-Machine Class Signaling `[Cross-package]`

When resolved playback output reports a document state machine's active state for a targeted element, the renderer MUST expose a derived CSS class encoded from the stable state-machine ID and state ID on that element's DOM node. State display names MUST NOT be class identity. A transition MUST replace only the previous class for the same state machine; classes from independent state machines MAY coexist. These classes are renderer signals only and MUST NOT create element-local state bindings or canonical mutable state.

#### Scenario: Derived state changes

- GIVEN resolved output reports machine `interaction` in state `hovered` for an element
- WHEN the renderer applies that output
- THEN a class encoded from stable IDs `interaction` and `hovered` is added to the element's DOM node

#### Acceptance Criteria

- [ ] Given resolved active state output, the corresponding stable-ID-derived class is added
- [ ] Given state deactivation, that machine's derived class is removed
- [ ] Given a transition in one machine, its previous class is replaced without removing independent machine classes
- [ ] Derived state classes never serialize into the element or act as state-machine identity

---

### Requirement: Plugin Element Rendering `[Generic]`

Canonical `plugin` elements MUST render through the authorized factory registered for their `pluginId`, `elementType`, and plugin schema version. The factory receives inert payload and resolved scene data. If no authorized factory is available, the renderer uses the declared preview asset or an explicit unsupported-plugin placeholder without executing payload data.

#### Scenario: Plugin renderer produces output

- GIVEN a registered factory for `pluginId: 'com.example.clock'` and `elementType: 'countdown'`
- WHEN a matching canonical plugin element is rendered
- THEN the rendererFactory produces the DOM output

#### Acceptance Criteria

- [ ] Given an authorized matching factory, it produces DOM output for the plugin element
- [ ] Given no matching factory, the preview asset or unsupported-plugin placeholder renders and payload remains inert

---

### Requirement: 3D Transform Rendering `[Generic]`

Elements whose canonical geometry contains a sixteen-number `matrix3d` MUST render that exact matrix without deriving from duplicated component fields. Perspective remains runtime `RenderSettings` view configuration and applies to the coordinate layer containing scene content and editor overlays so projection stays identical. The renderer and transform widget MUST consume the same resolved world matrix.

#### Scenario: 3D transform applied

- GIVEN an element with a finite canonical `matrix3d`
- WHEN the element is rendered
- THEN the exact matrix is emitted as a CSS `matrix3d(...)` transform

#### Scenario: Perspective from settings

- GIVEN `CanvasSettings.perspective = 1000` passed to the renderer as `RenderSettings.perspective`
- WHEN elements with 3D transforms are rendered
- THEN the canvas coordinate layer applies CSS `perspective: 1000px`

#### Acceptance Criteria

- [ ] Given canonical matrix3d geometry, the exact CSS matrix3d transform is applied
- [ ] Given `RenderSettings.perspective` (sourced from `CanvasSettings.perspective`), the perspective value is applied to the canvas coordinate layer
- [ ] Given any finite matrix entries including zero, all sixteen canonical entries retain their exact positions
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

When an image element's referenced asset is missing, fails integrity, or cannot be fetched by an authorized asset resolver, the renderer MUST display a visible placeholder. The placeholder includes resolved bounds and a broken-image indicator. Rendering MUST NOT throw or leave an invisible gap.

For an explicitly external asset source, an authorized browser fetch adapter MAY use a two-phase display strategy: first CORS-enabled so verified bytes remain exportable, then a display-only plain image fallback when policy permits. The adapter enforces integrity, allowlists, credentials, redirects, MIME, size, and cancellation. Parsing the project never initiates either request. Package and cached sources resolve directly from verified blobs.

#### Scenario: 404 image URL

- GIVEN an image element whose referenced external asset returns 404
- WHEN the image fails to load
- THEN a visible broken-image placeholder is rendered at the element's position and dimensions

#### Scenario: Explicitly missing image asset

- GIVEN an image element referencing an asset whose source kind is `missing`
- WHEN the element is rendered
- THEN a placeholder is displayed

#### Scenario: Non-CORS image server

- GIVEN an image element whose authorized external asset host does not send CORS headers
- WHEN the CORS-enabled first attempt errors
- THEN a plain-fetch fallback `<img>` loads the image for editor display
- AND exports of this image render the broken-image placeholder

#### Acceptance Criteria

- [ ] Given an asset fetch failure, a visible placeholder is rendered at resolved bounds
- [ ] Given an explicitly missing asset source, a placeholder and resource diagnostic are rendered
- [ ] Given a broken image, no JavaScript error is thrown
- [ ] Given an authorized CORS-enabled external source, rendered image bytes remain usable by exporters
- [ ] Given a permitted non-CORS display fallback, editor display succeeds while export reports an unavailable verified source
- [ ] Given project parsing without an authorized fetch action, no network request occurs

---

### Requirement: Structured Inert Text Rendering `[Generic]`

Text elements MUST render ordered stable paragraphs and runs as inert text nodes with typed run/paragraph properties. Authored HTML is invalid canonical input. At external clipboard/import boundaries, sanitization extracts inert Unicode and supported typed formatting before model validation; renderer defense-in-depth always assigns text through safe text-node APIs rather than HTML injection.

#### Scenario: Script tag stripped

- GIVEN boundary input `<b>Hello</b> <script>alert('xss')</script>World`
- WHEN imported and rendered
- THEN canonical runs contain inert `Hello World`, typed bold formatting for `Hello`, and no script content

#### Scenario: Event handler attribute stripped

- GIVEN boundary input `<span onclick="evil()">text</span>`
- WHEN imported and rendered
- THEN a safe text node contains `text` and no event handler exists

#### Acceptance Criteria

- [ ] Given hostile boundary markup, only inert Unicode and supported typed formatting enter canonical runs
- [ ] Given structured runs, renderer output uses safe text nodes with no event attributes
- [ ] Given typed bold, italic, underline, color, and size properties, equivalent visual formatting is preserved

---

### Requirement: Plain Group Element Rendering `[Generic]`

Group elements MUST render as structural container `<div>` elements. The container has `data-element-id`; children whose `parentId` references the group render as descendants in canonical preorder. The group applies its resolved matrix and appearance. It clips children only when typed `appearance.clip` or `appearance.mask` requires it and never performs boolean geometry composition.

#### Scenario: Group with children

- GIVEN a group element with two children
- WHEN rendered
- THEN the group renders as a `<div>` containing both children

#### Scenario: Group rotation applied

- GIVEN a group element whose exact affine matrix represents 45° rotation
- WHEN rendered
- THEN the rotation transform is applied to the group container

#### Acceptance Criteria

- [ ] Given a group element, it renders as a structural div container
- [ ] Given a plain group with children, child elements render inside the group container
- [ ] Given a plain group with rotation, the rotation is applied to the container transform
- [ ] Given a plain group, no combined SVG path is emitted (plain grouping is structural-only)

---

### Requirement: Boolean Vector Rendering `[Generic]`

Vector elements with `geometryData.kind: 'boolean'` MUST render combined geometry from their ordered stable `operandIds` using typed `union`, `subtract`, `intersect`, or `exclude`. Operands resolve to compatible vector geometry. The boolean vector uses its own ordered fill/stroke appearance; operand appearance is not implicitly copied. Fewer than two usable operands is a semantic validation error and no canonical scene reaches rendering.

#### Scenario: Union of two path children

- GIVEN a boolean vector with `operation: 'union'` and two resolving vector operands
- WHEN rendered
- THEN one combined SVG path is mounted in the boolean vector host

#### Scenario: Invalid boolean operation

- GIVEN untrusted input with a boolean operation outside the closed union
- WHEN validation runs
- THEN structural validation rejects it before rendering

#### Scenario: Insufficient path children

- GIVEN a boolean vector with fewer than two resolving operands
- WHEN semantic validation runs
- THEN validation fails before scene resolution

#### Acceptance Criteria

- [ ] Given a valid boolean vector with two or more operands, a single combined path is emitted
- [ ] Given combined geometry, appearance comes from the boolean vector's own typed layers
- [ ] Given an unsupported operation, structural validation rejects the project
- [ ] Given fewer than two resolving operands, semantic validation rejects the project
- [ ] Given operand vectors used elsewhere, their independent resolved identity and visibility remain unchanged

---

### Requirement: Typed Binding Rendering `[Generic]`

Dynamic data MUST resolve through document bindings that address stable view-model field IDs, closed expression ASTs, deterministic formatter pipelines, and stable property targets. The renderer consumes already resolved values and provenance; it MUST NOT parse dot-string tokens from element content. Missing or stale values follow the field's explicit stale policy.

#### Scenario: Token with matching data

- GIVEN structured text runs, stable score fields, and bindings that target the corresponding run text properties
- WHEN rendered
- THEN the output is `Score: 3 - 1`

#### Scenario: Token without matching data

- GIVEN a missing bound field whose stale policy is `use-default`
- WHEN rendered
- THEN the field's typed default is rendered and provenance records fallback use

#### Acceptance Criteria

- [ ] Given valid field-ID bindings, resolved typed values render at their stable targets
- [ ] Given a missing field value, the declared stale policy determines keep, default, hide, or error behavior
- [ ] Given nested object data, closed AST `get` nodes use stable field IDs rather than dot strings

---

### Requirement: Video Element Rendering `[Generic]`

Video elements MUST render a `<video>` tag whose source resolves from typed `video.assetId`. The authorized asset resolver supplies a verified media URL or package blob; parsing alone never fetches it. Typed video payload fields control loop, muted, autoplay, exact in/out ticks, and fit. Browser-native controls remain absent. At the out tick the video pauses or follows typed loop behavior. Resolved appearance supplies opacity, effects, and typed clip/mask behavior.

#### Scenario: Video element renders video tag

- GIVEN a video element referencing a verified video asset with typed `muted: true` and `autoplay: true`
- WHEN the element is rendered
- THEN a `<video>` tag is output with `src`, `muted`, and `autoplay` attributes; no `controls` attribute

#### Scenario: Video with start time

- GIVEN a video element whose exact `inTick` corresponds to five seconds
- WHEN the video loads
- THEN `currentTime` is set to 5

#### Scenario: Video with object-fit

- GIVEN a video element with typed `fit: 'cover'`
- WHEN rendered
- THEN the `<video>` tag has CSS `object-fit: cover`

#### Acceptance Criteria

- [ ] Given a video element, a `<video>` tag resolves its source through the referenced video asset
- [ ] Given a video element, native controls are not shown
- [ ] Given typed `muted: true`, the muted attribute is present
- [ ] Given an exact in tick, video starts at the corresponding media time
- [ ] Given resolved appearance, video respects opacity, effects, and typed clip/mask

---

### Requirement: Clock Element Rendering `[Generic]`

Clock elements MUST render inert text from a typed clock payload containing mode, format pattern, and mode-specific values. Realtime shows the configured runtime clock. Countdown, countup, and stopwatch use exact document ticks for relative durations. An optional timezone-qualified countdown target overrides relative values; past targets display zero. Supported format tokens remain `HH`, `mm`, `ss`, `S`, `SS`, and `SSS`. Output uses the structured-text path and resolved typography.

#### Scenario: Realtime clock

- GIVEN a clock element with `clock: { format: 'HH:mm:ss', mode: 'realtime' }`
- WHEN rendered at 14:30:05 local time
- THEN the display shows `14:30:05` and updates every second

#### Scenario: Countdown clock

- GIVEN a countdown clock with a typed ten-minute start duration and zero-tick target
- WHEN rendered
- THEN the display counts down from 10 minutes to zero

#### Scenario: Absolute datetime countdown

- GIVEN a clock element with `clock: { format: 'HH:mm:ss', mode: 'countdown', countdownTo: '2026-04-05T15:00:00Z' }`
- WHEN rendered at 2026-04-05T14:58:30Z
- THEN the display shows `00:01:30` and updates every second

#### Scenario: Absolute countdown past target

- GIVEN a clock element with `clock: { mode: 'countdown', countdownTo: '2026-04-05T12:00:00Z' }`
- WHEN rendered at 2026-04-05T14:00:00Z (target is in the past)
- THEN the display shows `00:00:00`

#### Scenario: Stopwatch mode

- GIVEN a clock element with `clock.mode: 'stopwatch'`
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

Ticker elements MUST render a continuously scrolling container from typed ticker items or a resolving binding. Each item renders as inert structured text. Typed `direction`, finite non-negative `speed`, spatial `gap`, and `paused` fields control motion. When the leading item exits, stable item identity is recycled to the trailing end. The container clips overflow through its typed layout, respects resolved typography, and uses transform updates driven by the shared clock.

#### Scenario: Left-scrolling ticker

- GIVEN a ticker with two typed text items, `direction: 'left'`, and `speed: 60`
- WHEN rendered
- THEN items scroll leftward at 60px/s with gap between them

#### Scenario: Ticker paused

- GIVEN a ticker element with typed `paused: true`
- WHEN rendered
- THEN items are visible but stationary

#### Scenario: Item recycling

- GIVEN a ticker with 3 items scrolling left
- WHEN the first item fully exits the left edge
- THEN it is repositioned after the last item on the right

#### Scenario: Vertical ticker

- GIVEN a ticker element with typed `direction: 'up'` and `speed: 40`
- WHEN rendered
- THEN items scroll upward at 40px/s

#### Acceptance Criteria

- [ ] Given a ticker element, items scroll in the specified direction at the specified speed
- [ ] Given typed `paused: true`, scrolling stops
- [ ] Given items scrolling out of view, they are recycled to create infinite scroll
- [ ] Given a ticker, overflow content is clipped to the element bounds
- [ ] Given a ticker, typography styling is applied to individual items

---

### Requirement: Alpha Background Rendering Mode `[Adapter]`

The renderer MUST support transparent background for alpha-channel output. When `surface.background` is typed `Paint` with `kind: 'none'`, or an export explicitly requests alpha output, the surface root renders transparent. Element appearances remain unchanged; only the surface paint is omitted. Alpha mode MUST NOT affect scene resolution, stacking, or other visual behavior.

#### Scenario: Transparent canvas background

- GIVEN a surface with `background: { kind: 'none' }`
- WHEN the scene is rendered
- THEN the root canvas element has no visible background

#### Scenario: Elements retain their backgrounds

- GIVEN a transparent surface and elements with solid fill layers
- WHEN the scene is rendered
- THEN individual elements render their backgrounds normally against the transparent canvas

#### Scenario: Normal background unchanged

- GIVEN a surface with a typed solid white background paint
- WHEN the scene is rendered
- THEN the canvas has a white background (existing behavior)

#### Acceptance Criteria

- [ ] Given `surface.background.kind: 'none'`, the surface root has no visible background
- [ ] Given transparent surface output, elements retain their own fills and opacity
- [ ] Given a non-none typed background paint, existing rendering behavior is unchanged

---

## Spec Gaps

- [x] **Animation Target Attribute Contract:** Automated renderer tests verify one animation target per element and group-specific targeting on the container contract (`packages/renderer/src/screen-renderer/core.test.ts`).
- [x] **Incremental Scene Tree Updates:** Automated renderer tests verify that single-element changes rerender only the affected element and that element additions do not remount existing nodes (`packages/renderer/src/screen-renderer/core.test.ts`).
- [x] **Broken Image Fallback:** Automated renderer tests verify both the empty-content path and the image error-event path swap to a visible placeholder without leaving a broken `<img>` node (`packages/renderer/src/screen-renderer/core.test.ts`).
- [ ] **Structured inert text evidence:** Renderer tests must verify stable paragraph/run output uses safe text nodes and typed formatting while hostile boundary markup cannot execute.
- [ ] **Group and boolean vector evidence:** Renderer tests must verify structural groups and typed boolean vectors independently.
- [ ] **Typed binding evidence:** Renderer tests must verify resolved field-ID bindings and every stale policy without parsing dot-string tokens.
- [x] **Rendering Performance (complexity):** Instrumented `insertBefore` mutation-count tests verify that single-element updates leave root-level children untouched, single insertions trigger exactly one reparent, and sibling reorders stay within O(n) moves (`packages/renderer/src/dom/performance.test.ts`).

---

## Non-Goals

- Document model types and validation → see `project/spec/model/spec.md`
- Animation engine and timeline computation → see `project/spec/playback/spec.md`
- Editor state management and history → see `project/spec/editor/spec.md`
- Export format rendering → see `project/spec/formats/spec.md`
