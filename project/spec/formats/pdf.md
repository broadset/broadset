# Formats — PDF Specification

## Purpose

Defines PDF generation from a `BroadsetDocument`, including page sizing, element rendering, color parsing, font embedding with deduplication, text wrapping, and QR code drawing.

---

## Requirements

### Requirement: PDF Page Dimensions

The system MUST convert canvas dimensions from millimeters to PDF points (1mm = 72/25.4pt). The generated PDF page dimensions MUST match the document canvas.

#### Scenario: Canvas mm to PDF points

- GIVEN a canvas of 210×118 mm
- WHEN a PDF is generated
- THEN the page width is approximately `(210 × 72) / 25.4` points

#### Acceptance Criteria

- [ ] Given a canvas of 210×118 mm, the page width is approximately `(210 × 72) / 25.4` points

---

### Requirement: Multi-Type Element Rendering

The system MUST generate non-empty PDF output for documents containing text, image, path, and qrcode elements.

#### Scenario: Mixed element types

- GIVEN a document with text, image, path, and qrcode elements
- WHEN a PDF is generated
- THEN the output is a non-empty `Uint8Array` of reasonable size

#### Acceptance Criteria

- [ ] Given a document with text, image, path, and qrcode elements, the output is a non-empty `Uint8Array` of reasonable size

---

### Requirement: Data URI Decoding

The system MUST decode UTF-8 SVG data URIs with non-base64 parameters (e.g. `data:image/svg+xml;utf8,...`).

#### Scenario: UTF-8 SVG data URI

- GIVEN a `data:image/svg+xml;utf8,...` encoded SVG
- WHEN decoded
- THEN the MIME type is `image/svg+xml` and bytes contain `<svg`

#### Acceptance Criteria

- [ ] Given a `data:image/svg+xml;utf8,...` encoded SVG, the MIME type is `image/svg+xml` and bytes contain `<svg`

---

### Requirement: Masked SVG Fallback

The system MUST build a masked SVG fallback source for clipped image/svg elements, wrapping content in a `<clipPath>` definition with `preserveAspectRatio`.

#### Scenario: Clip-path mask generation

- GIVEN an SVG element with a custom clip-path
- WHEN the masked source is built
- THEN it contains `<clipPath>`, `clip-path="url(#clip0)"`, and `preserveAspectRatio`

#### Acceptance Criteria

- [ ] Given an SVG element with a custom clip-path, it contains `<clipPath>`, `clip-path="url(#clip0)"`, and `preserveAspectRatio`

---

### Requirement: CSS Color Parsing

The system MUST parse hex colors (3, 4, 6, 8 digit) and `rgb()`/`rgba()` strings into normalized RGBA objects. Channel values MUST be clamped to `[0, 1]`. Unsupported formats (HSL, named colors) MUST return undefined.

#### Scenario: Hex with alpha

- GIVEN `#11223380`
- WHEN parsed
- THEN channels are normalized and alpha is `128/255`

#### Scenario: Unsupported format

- GIVEN `hsl(0, 100%, 50%)`
- WHEN parsed
- THEN the result is undefined

#### Acceptance Criteria

- [ ] Given `#11223380`, channels are normalized and alpha is `128/255`
- [ ] Given `hsl(0, 100%, 50%)`, the result is undefined

> **Note:** As of the color normalization requirement (model/config.md), all color values in the document are guaranteed to be hex format. The undefined return for unsupported formats is a defense-in-depth fallback that should not be reached in normal operation.

---

### Requirement: Font Embedding

The system MUST normalize font family names for deduplication (strip quotes, hyphens, lowercased). Font resolution MUST return an exact match, fall back to the first embedded font, or return null. Embedding MUST deduplicate by family name and support Google Fonts URL resolution when no direct URL is provided.

#### Scenario: Deduplication

- GIVEN two fonts with family `Inter`
- WHEN embedded
- THEN only one fetch and one embed call occur

#### Scenario: Google Fonts fallback

- GIVEN a font with empty URL
- WHEN embedded
- THEN a Google Fonts CSS is fetched to resolve the font URL

#### Acceptance Criteria

- [ ] Given two fonts with family `Inter`, only one fetch and one embed call occur
- [ ] Given a font with empty URL, a Google Fonts CSS is fetched to resolve the font URL

---

### Requirement: Text Wrapping

The system MUST wrap text at word boundaries respecting maximum width. Explicit newlines MUST be preserved, including empty lines. When full-string measurement throws, the system MUST fall back to per-character measurement.

#### Scenario: Word boundary wrapping

- GIVEN text wider than the container
- WHEN wrapped
- THEN output has multiple lines with non-empty content

#### Scenario: Explicit newlines preserved

- GIVEN `"line one\n\nline three"`
- WHEN wrapped
- THEN output has 3 lines with an empty second line

#### Acceptance Criteria

- [ ] Given text wider than the container, output has multiple lines with non-empty content
- [ ] Given `"line one\n\nline three"`, output has 3 lines with an empty second line

---

### Requirement: PDF QR Code Drawing

The system MUST draw QR code modules as rectangles on a PDF page. Empty content MUST draw only the white background rectangle.

#### Scenario: Empty content draws background only

- GIVEN empty QR content
- WHEN drawn
- THEN exactly 1 rectangle is drawn (background)

#### Scenario: Non-empty content draws modules

- GIVEN QR content `https://example.com`
- WHEN drawn
- THEN multiple rectangles are drawn (background + modules)

#### Acceptance Criteria

- [ ] Given empty QR content, exactly 1 rectangle is drawn (background)
- [ ] Given QR content `https://example.com`, multiple rectangles are drawn (background + modules)

---

### Requirement: Animated Element Static Export

When exporting to PDF, animated elements MUST be exported at their default/rest state (t=0, no active states, no modifiers applied). The exporter MUST NOT attempt to capture mid-animation state. Animation data (timelines, keyframes, states) is discarded in PDF output.

#### Scenario: Animated element rendered at rest state

- GIVEN an element with an active animation at t=0.5
- WHEN PDF export runs
- THEN the element is rendered at its default state (t=0)

#### Scenario: Active state modifiers not applied

- GIVEN an element with an active state modifier
- WHEN PDF export runs
- THEN the modifier is not applied in the export

#### Acceptance Criteria

- [ ] Given an animated element, PDF export renders it at default/rest state (t=0)
- [ ] Given an element with active state modifiers, modifiers are not applied in PDF export

---

## Spec Gaps

- [x] **Animated Element Static Export:** Automated tests verify export at t=0 rest state and confirm active state modifiers are not applied (`packages/formats/src/pdf.test.ts`).

---

## Non-Goals

- PPTX format → see [pptx.md](pptx.md)
- PSD format → see [psd.md](psd.md)
- SVG/HTML export → see [web-vector.md](web-vector.md)
