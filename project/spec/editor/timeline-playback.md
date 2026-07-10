# Editor — Sequence Preview Playback Specification

## Purpose

Defines editor-side coordination between TimelineEditor runtime context and canonical sequence playback controls. The editor restores a captured resolved preview snapshot before seek/play and when editing closes, while delegating exact-tick sequence actions to the playback controller. It does NOT define interpolation or sequence evaluation math. See [conventions](../../README.md).

---

## Requirements

### Requirement: Playback Controller Registration

The system MUST retain the active playback controller reference when a controller is reported as ready.

#### Scenario: Ready callback stores controller reference

- GIVEN a sequence-preview hook instance
- WHEN a playback controller is reported as ready
- THEN subsequent preview actions use that controller reference

#### Acceptance Criteria

- [ ] Given a sequence-preview hook instance, subsequent playback actions use the registered controller reference

---

### Requirement: Stable Sequence Addressing

Every preview action MUST address the canonical owner and sequence by stable IDs from TimelineEditor context. Display names MAY appear in labels but MUST NOT serve as identity fallbacks. The optional active `trackId` scopes authoring selection only and does not create an element-local playback definition.

#### Scenario: Duplicate display names remain unambiguous

- GIVEN two sequences share a display name but have different stable IDs
- WHEN preview is requested for one sequence ID
- THEN only that exact sequence is evaluated

#### Acceptance Criteria

- [ ] Given a resolving owner address and sequence ID, preview delegates to exactly that sequence
- [ ] Given a stale owner, sequence, or track ID, preview fails without mutating project or renderer state
- [ ] Sequence names and selected element identity are never playback identity fallbacks

---

### Requirement: Resolved Preview Snapshot Before Play and Seek

The system MUST restore the captured resolved preview snapshot before play or seek and then delegate the requested sequence action to the playback controller. The snapshot is a runtime renderer baseline derived from validated project/page/data/state resolution; restoring it MUST NOT write derived values, event-log state, or playback controls into canonical elements.

#### Scenario: Play restores preview baseline

- GIVEN a resolved preview snapshot and a registered playback controller
- WHEN sequence play is requested by stable ID
- THEN the renderer baseline is restored and sequence play is delegated

#### Scenario: Seek restores preview baseline

- GIVEN a resolved preview snapshot and a registered playback controller
- WHEN sequence seek is requested at an exact tick
- THEN the renderer baseline is restored and `seekTick` is delegated

#### Acceptance Criteria

- [ ] Given a resolved snapshot and registered controller, play restores the renderer baseline before sequence evaluation
- [ ] Given a resolved snapshot and registered controller, seek restores the renderer baseline before exact-tick evaluation
- [ ] Snapshot restoration never mutates canonical project animation data

---

### Requirement: Sequence Stop Delegation

The system MUST delegate explicit stop requests to the playback controller for the stable owner/sequence address in TimelineEditor context.

#### Scenario: Stop request is delegated

- GIVEN a registered playback controller and resolving sequence address
- WHEN preview stop is requested
- THEN the matching sequence stop operation is delegated

#### Acceptance Criteria

- [ ] Given a registered controller, stop is delegated using the exact owner and sequence IDs

---

### Requirement: Editing-Close Restoration

When TimelineEditor closes, the system MUST stop the previously edited sequence by stable ID, restore the captured resolved preview snapshot, and clear the runtime owner/sequence/track selection.

#### Scenario: Closing editing restores snapshot and stops sequence

- GIVEN an active sequence target with a captured resolved snapshot
- WHEN editing context closes
- THEN the exact sequence is stopped, the renderer baseline is restored, and runtime editing IDs are cleared

#### Acceptance Criteria

- [ ] Given an active editing target and resolved snapshot, close stops the addressed sequence and restores the renderer baseline
- [ ] Close clears runtime editing IDs without changing canonical sequences, lifecycle, or state machines

---

### Requirement: Graceful No-Controller Behavior

The system MUST no-op playback actions when no playback controller is registered and MUST NOT mutate canonical project data or renderer preview state in that case.

#### Scenario: Play with no controller does nothing

- GIVEN no registered playback controller
- WHEN sequence play is requested
- THEN no controller action or preview-snapshot restoration is applied

#### Acceptance Criteria

- [ ] Given no registered playback controller, no controller, canonical-project, or renderer-preview mutation occurs

---

### Requirement: Transition Suppression Timing

The system MUST enable DOM transition suppression while resolved preview-baseline writes are applied for play/seek and disable suppression after those runtime write windows complete. Suppression is renderer-only and MUST NOT alter canonical interpolation or transition definitions.

#### Scenario: Suppression wraps play restore window

- GIVEN a registered controller and resolved preview snapshot
- WHEN sequence play is initiated
- THEN suppression is enabled during renderer-baseline restoration and disabled after play setup

#### Scenario: Suppression wraps seek restore window

- GIVEN a registered controller and resolved preview snapshot
- WHEN exact-tick seek is initiated
- THEN suppression is enabled during renderer-baseline restoration and seek application, then disabled

#### Acceptance Criteria

- [ ] Given play setup, DOM transition suppression wraps only the runtime renderer-write window
- [ ] Given seek setup, DOM transition suppression wraps only the runtime renderer-write window

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Sequence evaluation and easing math → see `project/spec/playback/spec.md`
- TimelineEditor panel behavior and UX controls → see `project/spec/ui/timeline.md`
- Sequence/lifecycle/state-machine mutation rules → see [animation-state.md](animation-state.md)
