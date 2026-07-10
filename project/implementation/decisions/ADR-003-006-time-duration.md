# ADR-003/006: Timeline Duration and Exact Media Sampling

Status: proposed 2026-07-09 — does not override `project/spec/**` without explicit maintainer ratification.

## Context

Playback specified a 300 ms derived tail and zero-length empty timelines, while the UI specified a 1000 ms tail and 3000 ms minimum. Exporters also disagreed on frame-count rounding and whether the exact duration endpoint is encoded.

## Proposed decision

- `durationMs`, when present, is a positive finite duration and MUST be at least the maximum referenced keyframe/child end.
- Without explicit duration, resolve `max(3000, maximumKeyframeOrChildEnd + 1000)` milliseconds. With no keyframes/children, the result is 3000 ms.
- `resolveTimelineDurationMs` is the only duration resolver consumed by playback, UI, and default-duration export flows.
- Timed media occupies the half-open interval `[0, duration)`. A frame starts at exact rational tick `n * denominator / numerator` when that start is less than duration.
- Frame count is the count of such starts, equivalent to `ceil(durationSeconds * numerator / denominator)` using integer arithmetic. No duplicate frame is encoded at exactly `duration`.
- Interactive seek accepts `[0, duration]`; seeking to exactly `duration` evaluates the terminal state for editing/preview without changing encoded media interval semantics.
- Broadcast rates are represented internally as reduced rationals, including `24000/1001`, `30000/1001`, and `60000/1001`. Decimal display values are boundary syntax only.

## Consequences

Playback and UI duration behavior becomes identical. Exporters stop disagreeing on rounding. A final transition must reach its intended state before the exclusive endpoint or use an explicit hold; adding a duplicate endpoint frame is forbidden.

## Verification

Property tests cover empty/explicit/derived timelines, nested children, non-integral durations, all supported rates, long-duration drift, terminal seek, and identical frame timestamp sequences across exporters.
