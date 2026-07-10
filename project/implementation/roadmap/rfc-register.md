# RFC register — W0 maintainer decisions

(moved from plan.md §6 on 2026-07-10 — behavior-neutral relocation)

All RFCs are decided before W1 starts. Rejection means the documented default is the binding implementation path.

| RFC    | Decision                                                                                                      | Contract affected                                                                           | Default while undecided                                                                      | Status |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| RFC-01 | Whether editor Group creates a real `group` container with `parentId`                                         | `parentId` and `groupId` remain independent                                                 | Keep selection-only `groupId`; import/export must support both                               | open   |
| RFC-02 | Segment easing/keyframe tangent model                                                                         | `KeyframeValue.easing`                                                                      | One easing curve per property segment; no split tangents                                     | open   |
| RFC-03 | Stable keyframe IDs and required/explicit duration policy                                                     | Keyframe shape; optional `durationMs`; current derived pad is **+1000 ms, minimum 3000 ms** | Stable IDs remain absent; single-select timeline only; current duration rule remains         | open   |
| RFC-04 | Sequence/master timeline and reusable timeline references                                                     | Inline `childTimelines`                                                                     | No document sequencer; inline child timelines remain                                         | open   |
| RFC-05 | Typed expression AST and expression-driven properties                                                         | Existing `visibleWhen` string expression                                                    | Data binding ships without general property expressions                                      | open   |
| RFC-06 | Rational timebase, integer frames/ticks, drop-frame timecode, duration interval                               | Decimal `output.frameRate` and millisecond offsets                                          | Do not claim broadcast frame accuracy; map existing rates to exact rationals internally only | open   |
| RFC-07 | Reconcile component contract and implementation                                                               | `componentRef`, page overrides, component master storage                                    | Components remain experimental and cannot claim propagation                                  | open   |
| RFC-08 | Persistence/host contract and replacement of demo localStorage behavior                                       | Demo save requirement and host adapters                                                     | Keep `EditorConfig.onSave`; no silent replacement of the specified host behavior             | open   |
| RFC-09 | Typed wide-gamut/HDR color and working-space model                                                            | Current sRGB-centered edited color representation                                           | Advertise sRGB/SDR authoring only; preserve external wide-gamut metadata when safe           | open   |
| RFC-10 | `ResolvedSceneSnapshot` and shared kernel package topology                                                    | Architecture dependency graph and renderer/export sharing                                   | Keep current packages; duplicate behavior cannot be called parity without differential tests | open   |
| RFC-11 | Collaboration substrate: mature CRDT adapter versus custom operation model                                    | Change identity, ordering, history, storage, remote undo                                    | No network maturity claim; complete local/project change semantics first                     | open   |
| RFC-12 | OGraf/player lifecycle as the canonical delivery runtime                                                      | Player API, IN/HOLD/UPDATE/OUT mapping, exposed controls                                    | Export-only experiments; no OGraf conformance claim                                          | open   |
| RFC-13 | Pre-release migration helpers and schema-version policy                                                       | Specs that explicitly require legacy color/fill/filter migrators                            | Keep spec-mandated helpers until an approved behavioral RFC removes them                     | open   |
| RFC-14 | Audio media/time contract: tracks, cues, waveform, scrub, offline mux, sample clock, and initial mixing scope | Existing audio cues and output non-goals                                                    | Keep cue-only behavior; no waveform, audio-track, or A/V-sync claim                          | open   |

Proposal artifacts from the documentation-reconciliation audit (none overrides current `project/spec/**` until explicitly ratified by a maintainer):

- RFC-03/RFC-06 duration and sampling: [ADR-003/006](../decisions/ADR-003-006-time-duration.md); RFC-03 stable keyframe identity remains open
- RFC-07 components: [ADR-007](../decisions/ADR-007-components.md)
- RFC-08 BSP/persistence boundary: [ADR-008](../decisions/ADR-008-bsp-persistence.md)
- RFC-10 page/resolved-scene semantics: [ADR-010](../decisions/ADR-010-resolved-scene-pages.md); concrete shared-kernel package topology remains under W0-PLAT-01
- RFC-11 local collaboration semantics: [ADR-011](../decisions/ADR-011-collaboration-changes.md); network substrate selection remains open for W5
- IO-D-14/15/16 preflight, authoring exposure, and intentional loss: [ADR-IO-014/016](../decisions/ADR-IO-014-016-preflight-loss.md)

All proposal artifacts above remain undecided alongside RFC-01/02, RFC-03 stable keyframe identity, RFC-04/05/09/12/13/14, RFC-10 package topology, and RFC-11's network-substrate choice. W0-RFC-01 cannot move to `shipped` until every row has an explicitly maintainer-ratified artifact and every required behavioral spec change is applied by an authorized maintainer.

Each RFC document includes examples, rejected alternatives, data shapes, migration impact, package boundaries, security/privacy implications, performance implications, accessibility implications, and a decision test.

Ratification flips a row's Status to "ratified (ADR-…)" naming the ratified artifact. The roadmap frontier treats any RFC dependency as blocking while its row is "open"; a dependent initiative cannot become ready until the row it depends on is ratified. W0-RFC-01 owns driving every row to a maintainer decision.
