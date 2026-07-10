# Model — Exact Timebase

## Purpose

Defines rational frame rates, integer tick time, timecode compatibility, media intervals, and exact deterministic sampling.

## Requirements

### Requirement: Timebase Shape

A timebase MUST contain reduced positive `frameRate` numerator and denominator, positive safe-integer `ticksPerSecond`, and `timecode` with positive safe-integer nominal frames per second and boolean drop-frame flag.

#### Acceptance Criteria

- [ ] Given a reduced positive rational and valid tick rate, structural validation succeeds
- [ ] Given zero, negative, non-reduced, non-integer, or unsafe-integer terms, validation fails
- [ ] Given a motion document without a timebase, document validation fails

### Requirement: Exact Frame Starts

`ticksPerSecond` MUST be chosen so every frame start at the document frame rate has an exact integer tick position. Consumers MUST use rational arithmetic rather than accumulating floating-point frame durations.

#### Acceptance Criteria

- [ ] Given 24000/1001, 30000/1001, or 60000/1001, long-duration frame starts have zero contractual tick drift
- [ ] Given a tick rate that produces fractional frame starts, validation fails
- [ ] Given the same frame index, every consumer computes the same integer tick

The exact v1 helpers use integer arithmetic only. `frameStartTicks(frame, timebase)` computes
`frame * ticksPerSecond * denominator / numerator`. `ticksToFrame(tick, timebase)` returns the
greatest frame index whose start is less than or equal to `tick`. `frameCountForDuration(0,
timebase)` returns zero; for a positive duration it returns the number of frame starts in
`[0, durationTicks)`, which is the exact ceiling of
`durationTicks * numerator / (ticksPerSecond * denominator)`. Implementations MUST reject unsafe
inputs, non-integral frame durations, and results outside the JSON-safe integer range.

#### Acceptance Criteria

- [ ] Given a tick between two frame starts, `ticksToFrame` returns the earlier frame
- [ ] Given a positive partial-frame duration, `frameCountForDuration` includes its frame start
- [ ] Given zero duration, frame count is zero
- [ ] Given an unsafe input, intermediate result, or output, the helper rejects it without precision loss

### Requirement: Tick Values

Canonical tick values MUST be non-negative JSON-safe integers. Durations, sequence positions, markers, cues, keyframes, and clip boundaries use document ticks. Spatial or wall-clock units MUST NOT be substituted for ticks.

#### Acceptance Criteria

- [ ] Given zero and positive safe-integer tick values within owning durations, validation succeeds
- [ ] Given a negative, fractional, or unsafe tick, validation fails
- [ ] Given serialization and parse, every tick retains its exact integer value

### Requirement: Interval Semantics

Timed media occupies `[0, durationTicks)`. Interactive seek accepts the closed interval through `durationTicks` so terminal declarative state can be inspected. An unlooped, unremapped request beyond `durationTicks` MUST return typed `time-out-of-range` without sampling or clamping. A declared loop/remap first maps the request to one exact in-range tick and samples that tick.

#### Acceptance Criteria

- [ ] Given playback at a tick below duration, media sampling is valid
- [ ] Given interactive seek exactly at duration, terminal state is returned without an out-of-range media sample
- [ ] Given an unlooped, unremapped request after duration, evaluation returns `time-out-of-range` without sampling or clamping
- [ ] Given a looped or remapped request after duration, evaluation samples the exact in-range tick produced by the declared mapping

### Requirement: Work Areas and Clip Ranges

Work areas and sequence-clip source/output ranges MUST be strictly non-empty ordered tick pairs (`startTick < endTick`) within their owning duration. Zero-length point semantics use marker, cue, keyframe, or event ticks rather than ranges. Time remapping MUST remain deterministic and rationally defined.

#### Acceptance Criteria

- [ ] Given an ordered in-bounds work area, validation succeeds
- [ ] Given reversed or out-of-bounds endpoints, validation fails
- [ ] Given equal range endpoints, validation fails with `empty-time-range`
- [ ] Given a zero-length event, it is represented by one marker, cue, keyframe, or event tick rather than an empty range
- [ ] Given deterministic time remap, direct and sequential evaluation agree at each sampled tick

### Requirement: Timecode

Timecode is a presentation and interchange mapping over exact ticks. Drop-frame MUST be enabled only for supported nominal/rational combinations and MUST skip labels without skipping timeline time. Timecode annotations do not replace canonical ticks.

The v1 non-drop nominal frame rate is the nearest integer to the rational frame rate. Drop-frame is
supported only for `30000/1001` with nominal 30 and `60000/1001` with nominal 60. In every case,
`(ticksPerSecond * frameRate.denominator) / frameRate.numerator` MUST be a positive safe integer.

#### Acceptance Criteria

- [ ] Given a supported drop-frame rate, frame and timecode conversion round-trips exactly
- [ ] Given an unsupported drop-frame combination, validation fails
- [ ] Given a timecode label, canonical storage still uses an integer tick

### Requirement: Deterministic Offline Sampling

Offline rendering, interactive playback, direct seek, and exporters MUST derive sample times from the same timebase. Direct evaluation at T MUST equal sequential evaluation to T for identical data, events, and deterministic seeds.

#### Acceptance Criteria

- [ ] Given identical inputs and tick, renderer and exporter sample the same state
- [ ] Given long-duration offline output, no cumulative floating-point drift occurs
- [ ] Given randomized animation, a stored seed makes repeated sampling identical

## Spec Gaps

- Media resampling policy is owned by the playback and formats programs.

## Non-Goals

- Wall-clock scheduling or transport latency
- Audio resampling implementation
- Persisting derived frame-number caches
