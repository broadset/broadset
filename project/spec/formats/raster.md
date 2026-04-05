# Formats — Raster Specification

## Purpose

Defines raster-oriented export behavior for canvas snapshots as PNG, JPEG, and embedded SVG payloads, plus canvas element discovery used by raster export workflows. This domain covers externally observable export outputs and capability semantics, not editor UI orchestration or vector format conversion contracts. See [conventions](../../README.md).

---

## Requirements

### Requirement: PNG Raster Export

The system MUST export a target canvas element as a PNG image blob with expected MIME type and dimensions derived from canvas size and requested pixel ratio.

#### Scenario: PNG export at 1x preserves element dimensions

- GIVEN a raster target with known width and height
- WHEN PNG export blob is requested at pixel ratio 1
- THEN the output MIME type is PNG and dimensions match the target size

#### Scenario: PNG export scales by pixel ratio

- GIVEN a raster target with known width and height
- WHEN PNG export blob is requested with pixel ratio 2
- THEN output pixel dimensions are doubled

#### Acceptance Criteria

- [ ] Given a raster target with known width and height, the output MIME type is PNG and dimensions match the target size
- [ ] Given a raster target with known width and height, output pixel dimensions are doubled

---

### Requirement: JPEG Raster Export

The system MUST export a target canvas element as a JPEG image blob with expected MIME type and dimensions derived from canvas size and requested pixel ratio.

#### Scenario: JPEG export at 1x preserves element dimensions

- GIVEN a raster target with known width and height
- WHEN JPEG export blob is requested at pixel ratio 1
- THEN the output MIME type is JPEG and dimensions match the target size

#### Scenario: JPEG export scales by pixel ratio

- GIVEN a raster target with known width and height
- WHEN JPEG export blob is requested with pixel ratio 2
- THEN output pixel dimensions are doubled

#### Acceptance Criteria

- [ ] Given a raster target with known width and height, the output MIME type is JPEG and dimensions match the target size
- [ ] Given a raster target with known width and height, output pixel dimensions are doubled

---

### Requirement: Canvas Element Discovery

The system MUST discover the active raster canvas element using the canvas data marker and return null when no matching element exists.

#### Scenario: Discovery resolves mounted raster target

- GIVEN a mounted raster target marked as the canvas element
- WHEN canvas discovery is requested
- THEN the returned element matches the raster target

#### Acceptance Criteria

- [ ] Given a mounted raster target marked as the canvas element, the returned element matches the raster target

---

### Requirement: Embedded SVG Raster Export

The system MUST export embedded SVG raster blobs with deterministic MIME/content characteristics for equivalent visual inputs.

#### Scenario: Embedded SVG blob output is valid and deterministic

- GIVEN equivalent non-empty raster targets
- WHEN embedded SVG raster blob export is requested
- THEN output MIME/content characteristics are valid and deterministic

#### Acceptance Criteria

- [ ] Given equivalent non-empty raster targets, output MIME/content characteristics are valid and deterministic

---

### Requirement: Raster Download Wrapper Behavior

The system MUST trigger browser download flows for PNG, JPEG, and embedded-SVG wrappers while preserving requested filename semantics.

#### Scenario: Download wrappers propagate requested filename

- GIVEN export wrapper requests with explicit filenames
- WHEN PNG, JPEG, and embedded-SVG download wrappers are invoked
- THEN each wrapper triggers download behavior with the requested filename

#### Acceptance Criteria

- [ ] Given export wrapper requests with explicit filenames, each wrapper triggers download behavior with the requested filename

---

### Requirement: Canvas Discovery Null Case

The system MUST return null when no raster canvas marker is present in the active document context.

#### Scenario: Missing marker returns null

- GIVEN a document context with no marked raster canvas element
- WHEN canvas discovery is requested
- THEN the result is null

#### Acceptance Criteria

- [ ] Given a document context with no marked raster canvas element, the result is null

---

### Requirement: JPEG Quality Parameter

Raster export to JPEG format MUST accept an optional quality parameter in the range [0, 1] where 0 is lowest quality and 1 is highest quality. The default quality MUST be 0.92 (matching the HTML Canvas `toDataURL` default). The quality parameter MUST be ignored for PNG format (PNG is always lossless).

#### Scenario: JPEG export with explicit quality

- GIVEN a JPEG export with quality 0.5
- WHEN the export runs
- THEN the output uses the specified quality level

#### Scenario: JPEG export with default quality

- GIVEN a JPEG export with no quality specified
- WHEN the export runs
- THEN the default quality 0.92 is used

#### Scenario: PNG export ignores quality parameter

- GIVEN a PNG export with quality 0.5 specified
- WHEN the export runs
- THEN the quality parameter is ignored

#### Acceptance Criteria

- [ ] Given a JPEG export with explicit quality, the output uses the specified quality
- [ ] Given a JPEG export without quality, the default 0.92 quality is used
- [ ] Given a PNG export with quality parameter, the parameter is ignored

---

### Requirement: WebM Alpha Video Export

The system MUST support exporting an animated canvas sequence as a WebM video file with VP9 codec and alpha channel transparency. The export MUST accept an `alpha: boolean` option (default `false`). When `alpha` is `true`, the renderer MUST use transparent background mode (no canvas background fill), and the video encoder MUST preserve the alpha channel in the VP9 bitstream within a WebM container. When `alpha` is `false`, the video MUST be encoded with the canvas background composited (standard opaque output). The export MUST also accept `frameRate` (from canvas settings, default 50fps), `durationMs` (total export duration), and `quality` (0–1, default 0.8). Frames MUST be captured at the specified frame rate using the canvas rendering pipeline and composed into the video sequentially. The resulting WebM file MUST be downloadable via the same download wrapper pattern as raster exports.

#### Scenario: WebM export with alpha channel

- GIVEN a canvas with transparent background and `alpha: true`
- WHEN WebM export runs
- THEN the output WebM file preserves alpha transparency in the VP9 stream

#### Scenario: WebM export without alpha

- GIVEN a canvas with white background and `alpha: false`
- WHEN WebM export runs
- THEN the output WebM file has an opaque white background

#### Scenario: Frame rate from canvas settings

- GIVEN canvas settings with `frameRate: 25`
- WHEN WebM export runs with default settings
- THEN the output video has 25 frames per second

#### Scenario: Export duration

- GIVEN `durationMs: 5000` and `frameRate: 50`
- WHEN WebM export runs
- THEN the output video has 250 frames (5 seconds × 50fps)

#### Acceptance Criteria

- [ ] Given `alpha: true`, the WebM output preserves alpha channel transparency
- [ ] Given `alpha: false`, the WebM output has an opaque background
- [ ] Given a frame rate, the output video uses that frame rate
- [ ] Given a duration, the correct number of frames are captured
- [ ] Given the export completes, the file is downloadable via the download wrapper

---

## Spec Gaps

- [ ] **JPEG Quality Parameter:** No automated tests verify that the explicit quality parameter is applied to JPEG output, that the default is 0.92, or that PNG export ignores the quality parameter.
- [ ] **WebM Alpha Video Export:** No automated tests verify VP9 alpha encoding, frame capture at specified rates, or duration-based frame count — integration tests with video encoding are needed.

---

## Non-Goals

- Vector SVG document export/import contracts → see [web-vector.md](web-vector.md)
- PDF/PPTX/PSD conversion behavior → see [pdf.md](pdf.md), [pptx.md](pptx.md), [psd.md](psd.md)
- Export modal and UI flow orchestration → see `project/spec/ui/modals.md`
