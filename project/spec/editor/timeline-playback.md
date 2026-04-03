# Editor — Timeline Playback Specification

## Purpose

Defines editor-side timeline playback coordination between editing context state and playback controls. The editor MUST restore captured screen state snapshots before seek/play and when editing closes, while delegating timeline playback actions to the playback controller. It does NOT define interpolation or timeline frame computation. See [conventions](../../README.md).

---

## Requirements

### Requirement: Playback Controller Registration

The system MUST retain the active playback controller reference when a controller is reported as ready.

#### Scenario: Ready callback stores controller reference

- GIVEN a playback hook instance
- WHEN a playback controller is reported as ready
- THEN subsequent playback actions use that controller reference

#### Acceptance Criteria

- [ ] Given a playback hook instance, subsequent playback actions use that controller reference

---

### Requirement: Snapshot Restore Before Play and Seek

The system MUST restore the captured screen snapshot before play or seek operations and then delegate the requested action to the playback controller.

#### Scenario: Play restores snapshot before timeline play

- GIVEN an editing snapshot and a registered playback controller
- WHEN timeline play is requested
- THEN the element screen state is restored from the snapshot and timeline play is delegated

#### Scenario: Seek restores snapshot before timeline seek

- GIVEN an editing snapshot and a registered playback controller
- WHEN timeline seek is requested
- THEN the element screen state is restored from the snapshot and timeline seek is delegated

#### Acceptance Criteria

- [ ] Given an editing snapshot and a registered playback controller, the element screen state is restored from the snapshot and timeline play is delegated
- [ ] Given an editing snapshot and a registered playback controller, the element screen state is restored from the snapshot and timeline seek is delegated

---

### Requirement: Timeline Stop Delegation

The system MUST delegate explicit stop requests to the playback controller for the targeted element timeline.

#### Scenario: Stop request is delegated

- GIVEN a registered playback controller
- WHEN timeline stop is requested
- THEN the matching timeline stop operation is delegated to the playback controller

#### Acceptance Criteria

- [ ] Given a registered playback controller, the matching timeline stop operation is delegated to the playback controller

---

### Requirement: Editing-Close Restoration

When timeline editing closes, the system MUST stop the previously edited timeline and restore the captured screen snapshot.

#### Scenario: Closing editing restores snapshot and stops timeline

- GIVEN an active editing target with a captured snapshot
- WHEN editing context closes
- THEN the previously edited timeline is stopped and the snapshot is restored

#### Acceptance Criteria

- [ ] Given an active editing target with a captured snapshot, the previously edited timeline is stopped and the snapshot is restored

---

### Requirement: Graceful No-Controller Behavior

The system MUST no-op playback actions when no playback controller is registered and MUST NOT mutate element screen state in that case.

#### Scenario: Play with no controller does nothing

- GIVEN no registered playback controller
- WHEN timeline play is requested
- THEN no controller action is executed and no snapshot restoration mutation is applied

#### Acceptance Criteria

- [ ] Given no registered playback controller, no controller action is executed and no snapshot restoration mutation is applied

---

### Requirement: Transition Suppression Timing

The system MUST enable transition suppression while snapshot-restore mutations are applied for play/seek operations and disable suppression after those mutation windows complete.

#### Scenario: Suppression wraps play restore window

- GIVEN a registered playback controller and an available snapshot
- WHEN timeline play is initiated
- THEN suppression is enabled during restore mutations and disabled after the play-setup window

#### Scenario: Suppression wraps seek restore window

- GIVEN a registered playback controller and an available snapshot
- WHEN timeline seek is initiated
- THEN suppression is enabled during restore and seek mutations and disabled after the seek-setup window

#### Acceptance Criteria

- [ ] Given a registered playback controller and an available snapshot, suppression is enabled during restore mutations and disabled after the play-setup window
- [ ] Given a registered playback controller and an available snapshot, suppression is enabled during restore and seek mutations and disabled after the seek-setup window

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Playback timeline semantics and easing math → see `project/spec/playback/spec.md`
- Timeline editing panel behavior and UX controls → see `project/spec/ui/timeline.md`
- Animation registry mutation rules → see [animation-state.md](animation-state.md)
