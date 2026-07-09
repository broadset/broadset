# Model — Output Specification

## Purpose

Defines the `OutputSpec` contract — the optional broadcast output constraints attached to a document. When present, it declares the intended playout target's frame rate, color space, and dynamic range. This enables animation timing quantization, correct color rendering, and format-aware export. See [conventions](../../README.md).

---

## Requirements

### Requirement: OutputSpec Structure

A document MAY carry an optional `output` object with:

- `frameRate`: one of `23.976 | 24 | 25 | 29.97 | 30 | 50 | 59.94 | 60`
- `colorSpace`: `'rec709'` | `'rec2020'` | `'srgb'`
- `dynamicRange`: `'sdr'` | `'hlg'` | `'pq'`

When the `output` field is absent, the document is valid and the consumer picks its own output profile.

#### Scenario: European broadcast standard

- GIVEN a document with `output: { frameRate: 25, colorSpace: 'rec709', dynamicRange: 'sdr' }`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: North American broadcast

- GIVEN a document with `output: { frameRate: 29.97, colorSpace: 'rec709', dynamicRange: 'sdr' }`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: UHD HDR workflow

- GIVEN a document with `output: { frameRate: 50, colorSpace: 'rec2020', dynamicRange: 'hlg' }`
- WHEN the document is validated
- THEN validation succeeds

#### Scenario: Web-only document (no output spec)

- GIVEN a document with no `output` field
- WHEN the document is validated
- THEN validation succeeds — output is optional

#### Scenario: Unsupported frame rate rejected

- GIVEN a document with `output: { frameRate: 120, ... }`
- WHEN the document is validated
- THEN validation fails — 120 is not in the allowed frame rate set

#### Acceptance Criteria

- [ ] Given a valid output spec with supported values, validation succeeds
- [ ] Given an unsupported frame rate, validation fails
- [ ] Given an unsupported colorSpace value, validation fails
- [ ] Given no output field, the document is valid
- [ ] Given all valid frame rates (23.976, 24, 25, 29.97, 30, 50, 59.94, 60), validation succeeds for each

---

### Requirement: Frame Rate Quantization

When a document has an `output.frameRate`, animation keyframe `offsetMs` values SHOULD align to frame boundaries. The frame duration is `1000 / frameRate` milliseconds. Implementations MAY quantize keyframe offsets to the nearest frame boundary during export. The document model itself does NOT enforce quantization — it is a consumer-side recommendation.

#### Scenario: 25fps frame boundary

- GIVEN `output.frameRate: 25` (frame duration = 40ms)
- AND a keyframe at `offsetMs: 45`
- WHEN an export quantizes to frame boundaries
- THEN the keyframe is snapped to 40ms (nearest frame boundary)

#### Acceptance Criteria

- [ ] Given a frame rate of 25, frame duration is 40ms
- [ ] Given a frame rate of 29.97, frame duration is approximately 33.37ms
- [ ] Given keyframe quantization, offsets are snapped to nearest frame boundary

---

### Requirement: Timecode Support

When a document has an `output` spec, keyframes MAY carry `timecodeAnnotation` objects (defined in [animation.md](animation.md)) for display and synchronization purposes. Timecode format is SMPTE: `HH:MM:SS:FF` (hours, minutes, seconds, frames). The frame count field depends on the frame rate. Timecode is metadata — it does not override `offsetMs` for playback.

#### Acceptance Criteria

- [ ] Given a timecode annotation on a keyframe, it is preserved on round-trip
- [ ] Given a timecode with frame count exceeding the frame rate, validation warns or fails

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Alpha channel / keying model → deferred to future phase
- Playout control protocol (CasparCG AMCP, Vizrt MOS, etc.) → deferred to future phase
- Audio mixing and routing → out of scope for the model layer
