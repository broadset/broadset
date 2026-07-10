# Provable Frame-and-Pixel Exactness Design

Status: proposed design note. This document does not override `project/spec/**`. It records a
non-authoritative technical design for the deterministic-playback and transform-math work already tracked
by the roadmap; current spec behavior remains authoritative until a maintainer ratifies any behavioral
change and owns the corresponding spec edit.

## Initiatives informed

| Initiative     | Role of this design                                                                 |
| -------------- | ----------------------------------------------------------------------------------- |
| W0-TIME-01     | Rational timebase and endpoint/sampling semantics that remove float boundary bugs   |
| W1-TIME-01     | Frame/tick/timecode conversions and exact export sampling                           |
| W1-TIME-02     | Stable keyframe addressing where "seek equals sequential evaluation"                 |
| W1-PLAYBACK-01 | Incremental appliers proven equivalent to full replay; deterministic offline hashes |
| W1-RENDER-01   | Incremental dirty-ID updates that preserve the equivalence invariants               |
| W2-CANVAS-01   | Exact perspective-correct transform handles; widget/DOM parity                      |

See [plan.md](../plan.md) and [plan-progress.md](../plan-progress.md).

## Part A — Incremental playback equals pure replay

### Requirement recap

At any time `T`, the complete state of every element must be a deterministic pure function of the animation
data alone — no playback history, no seek direction, no previously fired events
([playback.md](../../spec/playback/playback.md)). The optimized forward path applies only new markers to the
DOM but must remain equivalent to full replay from `t=0`. Proving a stateful optimization equals a pure
function is the deepest correctness burden in the stack.

### Formalization

Markers `M = ⟨(t1,a1), …, (tk,ak)⟩` in canonical order; each action is a pure function `ai : Σ → Σ` on
abstract DOM state. Keyframe tracks are pure writes `K(T) : Σ → Σ`.

```text
Replay:      S(T)     = K(T) ∘ a_j ∘ … ∘ a_1 (Σ0)               j = max{ i : t_i ≤ T }
Incremental: S_inc(T) = K(T) ∘ a_j ∘ … ∘ a_{j'+1} (S̃(T'))       from prior sample (T', cursor j')
```

### Theorem

`S_inc(T) = S(T)` for every seek sequence if and only if the five invariants below hold. The proof is then
a left-fold associativity argument — `fold(a_1 … a_k) = fold(a_{j'+1} … a_k) ∘ fold(a_1 … a_{j'})` — plus
induction with re-derivation points as base cases. The engineering value is the invariant list; each item
is independently checkable.

- **I1 — Canonical total order.** Ties at equal timestamps break deterministically (element index → track
  index → marker index), and the incremental path applies cross-track markers in that same order. Never
  prove commutativity of same-instant actions; always sort.
- **I2 — Cursor by index, not by time.** Incremental state carries the last-applied marker index `j'` and
  applies `a_{j'+1} … a_j`. This eliminates every float-boundary double-apply / skip categorically: there
  is no time comparison to get wrong.
- **I3 — Keyframe / marker non-interference.** Either statically validate `writes(K) ∩ writes(M) = ∅` per
  element, or pin "keyframes win, applied last at every sample" in both paths (the formalization encodes
  this: `K(T)` is outermost).
- **I4 — Monotonicity guard in reflected time.** Let `τ(T)` be the loop/ping-pong-reflected timeline
  position. Use the incremental path if and only if `τ` has been non-decreasing since the last sample;
  otherwise re-derive from scratch. This single predicate handles backward seek, loop wrap (a backward
  jump in `τ`), and ping-pong apex (a reversal in `τ`).
- **I5 — Action closure.** Actions are pure in `(Σ, args)` — no clock, no randomness, no DOM reads outside
  `Σ`. Auditable statically because the marker vocabulary is closed and declarative.

### Rational timebase

Never accumulate `t += dt` in float. Sample times are integers `t_n = n · ticksPerFrame` in microsecond
(or rational) ticks; marker comparisons become integer comparisons and the boundary epsilon ceases to
exist. This is the ratification content for W0-TIME-01 / W1-TIME-01.

### Decision procedure (exhaustive per document, not sampling)

For a fixed document, `S_inc` after any seek sequence is fully determined by `(last re-derivation point,
cursor index)`. Cursor states are finite (`k+1`); state changes only at marker boundaries; keyframe
evaluation is pure. Therefore checking the implementation at the finite set

```text
for each split j' in [0..k]:
  for each target T in { every distinct marker time, midpoints between consecutive times, 0, D }:
    assert step_incremental(replay(t_j'), j', T) == replay(T)
```

is a complete equivalence check for all seek sequences over that document — `O(k²)` exact assertions, no
probability. Layer a timeline fuzzer over it (random tracks, deliberately equal timestamps, staggered
children, cross-element `target` routing, loops, ping-pong) for document-space coverage. The result is
exhaustive proof per instance plus generative coverage of instances, and it drops into `packages/playback`
as a test harness.

## Part B — Exact perspective-correct pointer inversion

### Problem

The current pointer→delta conversion in `packages/editor/src/transforms.ts` linearizes screen deltas, which
is why it is documented as approximate once `rotateX/Y ≥ ~30°`. Under perspective the map is projective, not
linear. The correct fix inverts the actual projection — a homography inversion, closed form.

### Derivation

**Step 1 — exact forward map.** Compose the full 4×4 exactly as the renderer's single-source token builder
does (canvas pan/zoom/letterbox · `perspective(d)` with `m43 = −1/d` · element chain) into `M`. A point on
the element plane is `p = (x, y, 0, 1)ᵀ`, so column 3 of `M` is inert and the plane→screen map is the 3×3
homography

```text
H = | m11 m12 m14 |          screen(x,y) = dehom( H · (x,y,1)ᵀ )
    | m21 m22 m24 |
    | m41 m42 m44 |
```

**Step 2 — exact inverse.** `(x,y,1) ∝ H⁻¹ · (sx,sy,1)ᵀ` via the closed-form 3×3 adjugate. Map pointer-down
`s0` and current pointer `s1` through `H⁻¹` to exact local-plane points `p0, p1`. The local delta
`δ = p1 − p0` is exact at any rotation; perspective foreshortening is inverted, not approximated. Rotation
handles use `atan2` on the same back-projected local vectors.

**Step 3 — exact anchor-fixing.** Requirement: the opposite corner stays fixed on screen after resize. Let
`q, q'` be old/new local anchor corners, `R` the element's 3D rotation, `c` its 2D position, `t_z` its
translateZ. The pre-divide camera coordinates are `x_cam = [Rq]_x + c_x` and `z_cam = [Rq]_z + t_z`, and the
perspective weight `w' = 1 − z_cam/d` depends on `q` but not on `c`. The screen-fix constraint

```text
([Rq']_x + c'_x) / w'_new = ([Rq]_x + c_x) / w'_old      (and the same for y)
```

solves in closed form:

```text
c'_x = (w'_new / w'_old) · ([Rq]_x + c_x) − [Rq']_x
c'_y = (w'_new / w'_old) · ([Rq]_y + c_y) − [Rq']_y
```

which degenerates to the current 2D formula `c' = c + R(q − q')` exactly when `w'_new = w'_old` (no X/Y
rotation) — confirming it is the strict generalization. When transformed 3D ancestors make `w'` depend on
`c`, the constraint is projective-linear in `c`, so cross-multiplying yields a 2×2 linear system — still
closed form.

**Step 4 — the two required guards.**

- **Edge-on degeneracy.** `H` is singular as the plane projects to a line (`θ → 90°`). Guard on the
  normalized condition number; below `ε`, freeze the interaction with the last well-conditioned `H`. This
  converts silent inaccuracy into a defined boundary.
- **Behind-camera.** Dehomogenization with `w ≤ 0` means the pointer ray hits the plane beyond its horizon;
  clamp to the horizon line.

### Correctness argument

`H` is built from the same matrix the browser composites (CSS Transforms Level 2 defines it exactly), and
ray–plane intersection is the mathematical inverse of projection restricted to the plane, so widget/DOM
agreement is exact by construction rather than "±1 px by testing." Verify in CT against the browser's own
numbers: `new DOMMatrix(getComputedStyle(el).transform)` plus `DOMPoint.matrixTransform` must reproduce `H`
to double-precision epsilon.

## Acceptance criteria

- [ ] (W1-PLAYBACK-01) The decision procedure finds no divergence between incremental and full replay
      across the generated seek space for every fuzzed document, or reports a concrete counterexample.
- [ ] (W0-TIME-01 / W1-TIME-01) Sample times and marker comparisons are integer/rational; an hour-long
      29.97/59.94 timeline has zero drift by contract.
- [ ] (W1-TIME-02) Seek equals sequential evaluation for eased tuple and identity tracks.
- [ ] (W2-CANVAS-01) Resize under `rotateY(45°) perspective(800px)` keeps the opposite corner fixed to
      sub-pixel, and the transform widget coincides with the rendered node to double-precision epsilon.
- [ ] (W2-CANVAS-01) The condition-number and behind-camera guards produce defined behavior at the
      edge-on boundary instead of silent error.

## Verification

- `packages/playback`: the exhaustive `O(k²)` equivalence harness plus the timeline fuzzer.
- `packages/editor`: property tests for the homography inverse and anchor-fix formula, cross-checked
  against `DOMMatrix` / `DOMPoint`.
- CT: a rotated-perspective resize scenario asserting widget/DOM coincidence and store commit.

## References

- [playback.md](../../spec/playback/playback.md) — determinism contract.
- `packages/editor/src/transforms.ts`, `packages/playback/src` — implementation surfaces.
