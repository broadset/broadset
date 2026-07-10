# Lossy Round-Trip Identity and Fidelity Design

Status: proposed design note. This document does not override `project/spec/**`. It records a
non-authoritative technical design for the reconciliation and visual-fidelity work already tracked by
the roadmap; current spec behavior remains authoritative until a maintainer ratifies any behavioral
change and owns the corresponding spec edit.

## Initiatives informed

| Initiative    | Role of this design                                                                  |
| ------------- | ------------------------------------------------------------------------------------ |
| W3-RECON-01   | Reconciliation matching algorithm, per-element confidence, and abstention semantics  |
| W3-QE-01      | Two-tier visual-fidelity oracle (renderer + canonical-tool export rasters)           |
| W2-QE-01      | Visual CT metric and worst-window pooling used by generated visual assertions        |
| W1-SCENE-01   | Content-hash canonicalization contract shared with the resolved-scene `sceneKey`     |

See [plan.md](../plan.md) for the initiative definitions and [plan-progress.md](../plan-progress.md)
for lifecycle status.

## Problem

A user exports a Broadset document to PSD/PDF/PPTX/SVG, edits it in Photoshop/Acrobat/PowerPoint/
Illustrator, and re-imports it. The external tool degrades the identity signal adversarially: it strips
Broadset's embedded tags, reorders and renumbers layers, rasterizes vectors, re-encodes fonts, and
rewrites the file structure. Two properties must hold:

1. **Correspondence reconstruction.** For every incoming object, decide which original Broadset element
   it is — classified as `unchanged`, `edited`, `moved`, `new`, `deleted`, `flattened(k:1)`, or
   `ambiguous` — while minimizing false identity matches. A false match silently corrupts the document.
2. **Fidelity regression detection with no human eye.** There is no visual-fidelity CI today; all format
   gates are structural. A regression that shifts how a gradient fills would ship. "Does it still look the
   same?" must become a deterministic, headless, computable predicate across four formats.

The current implementation leans on a placeholder content hash (`packages/model/src/content-hash.ts`) and
a hand-written diff (`packages/formats/src/_shared/reconcile/reconcile.ts`).

## Governing insight

No single hash can be both robust to producer noise and sensitive to edits — the requirements contradict.
The architecture is a **stratified identity system**: hashes only ever assert exact facts (the fast path),
and all fuzzy judgment lives in a continuous similarity metric solved as a constrained optimal assignment
with calibrated abstention (the degraded path). Every false-match failure mode in the current design comes
from asking a hash to do a metric's job.

## Design

### 1. Canonicalization contract (`bsh1`)

Two hashes, no quantization anywhere. Quantized-geometry hashing has an unfixable boundary problem
(`10.499` and `10.501` fall in different buckets); it must not exist in the contract. The version prefix
`bsh1:` is baked into every hash so a contract change is detectable, never silent.

- **Tier-0 exact hash** (`bsh1:e:<xxhash64>`): full canonical serialization; asserts byte-identical
  semantics.
- **Tier-1 content-structural hash** (`bsh1:s:<xxhash64>`): `type` + normalized content + surviving-style
  set + ordered child Tier-1 hashes. **Geometry is excluded** — a moved element must still match on
  Tier-1, so geometry belongs solely to the continuous metric.

Canonical serialization rules — this is the breaking-change surface:

| Rule       | Specification                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Fields in  | `type`; plain-string content; style keys restricted to the target format's parity table             |
| Fields out | ids, `name`, `locked`, `extensions.*` blobs, dirty flags, animation state, per-page overrides        |
| Strings    | Unicode NFC, whitespace collapsed to single spaces, trimmed                                          |
| Numbers    | ECMA-262 shortest round-trip decimal; `-0` normalized to `0`; non-finite forbidden by schema         |
| Objects    | Keys sorted by UTF-16 code unit; no insignificant whitespace                                         |
| Colors     | Lowercase 8-digit hex sRGB before serialization                                                     |
| Children   | Ordered list of child Tier-1 hashes (order equals z-order equals array order)                        |

Restricting the hashed style set to the target format's parity table matters: hashing a property the format
cannot express (for example a PSD that cannot carry a given effect) guarantees a spurious mismatch.

**Tier-2 feature vector** (not a hash; input to matching): normalized text; canvas-fraction geometry
`(cx/W, cy/H, log w, log h)`; dominant colors in OKLab (the same space `packages/playback` interpolation
already uses); z-rank; parent path; and a 64-bit DCT perceptual hash (pHash) for image/rasterized content.

### 2. Matching algorithm

Formally: originals `O`, incoming `I`, output a partial matching plus classification. This is the
Fellegi–Sunter record-linkage problem fused with optimal assignment.

**Stage 0 — ground-truth anchors.** Surviving format-native tags (`BsPs` / `p:ext` / `/BSET` /
`data-bs-*`) fix identity outright. A surviving tag with changed content is an edit, never a mismatch —
tags outrank all similarity.

**Stage 1 — exact tiers.** Match equal Tier-0 (`unchanged`), then equal Tier-1 (`moved` / `restyled`).
Tier-1 collisions across candidates are content-identical by construction, so resolve by minimal total
displacement; any choice is semantically safe.

**Stage 2 — constrained optimal assignment with abstention.** For the remainder, score each pair:

```text
s(o,i) = Σ wk · sk(o,i)   over channels:
  type-gate      hard 0 unless compatible (raster-bridge exception below)
  text           1 − normalized Damerau-Levenshtein
  geometry       exp(−‖Δcenter‖² / 2σ²) · exp(−(Δlog w)² − (Δlog h)²)
  style          per property: OKLab ΔE for colors, relative diff for numerics, δ for enums
  structure      recursive children similarity (bottom-up, so groups match by tree)
  z-order        rank-difference penalty
  raster-bridge  pHash(render(o)) vs pHash(i) — the one exception to the type gate, so
                 text/vector → image (rasterization) remains matchable
```

Solve maximum-weight bipartite matching (Jonker–Volgenant) within blocks (partition by type and spatial
grid; sparsify pairs below a similarity floor). Documents are hundreds of elements, so this is
milliseconds.

**Zero-false-match rule.** Accept `(o,i)` only if both hold:

```text
s(o,i) ≥ τ_accept
s(o,i) − s(o, runner-up) ≥ τ_margin      (in both directions)
```

The margin condition kills the swap failure mode (two similar elements exchanged — the classic silent
corruption). Anything failing either test is `ambiguous` and surfaced to the user through the existing
reconciliation UI (`packages/ui/src/modals/format-reconciliation.tsx` and
`packages/formats/src/apply-reconciliation-choices.ts`). Calibrate `(τ_accept, τ_margin)` Neyman–Pearson
style on the labeled producer corpus: fix false-match rate at zero, maximize coverage. Thresholds carry
provenance (which fixtures set them).

**Structural transforms are first class.** Before declaring `k` deletions plus one addition, test the
flatten hypothesis: if `bbox(⋃ unmatched originals) ≈ bbox(unmatched incoming raster)` and the pHash of the
composited originals matches, emit `flattened(k:1)` (Photoshop merge-layers, PDF flatten). Detect splits
symmetrically.

### 3. Headless fidelity oracle

Dual oracle — structural plus perceptual — with metamorphic laws that need no goldens.

Reference rasterizers are pinned, containerized, and pointed at a repo-pinned font directory
(`FONTCONFIG_FILE`) because system fonts are the primary CI nondeterminism source:

| Format | Oracle                                                    | Tier                          |
| ------ | --------------------------------------------------------- | ----------------------------- |
| PDF    | pdfium / MuPDF raster                                      | direct                        |
| SVG    | resvg (deterministic reference)                           | direct                        |
| PPTX   | LibreOffice headless → PDF → pdfium                        | proxy (real PowerPoint stays manual) |
| PSD    | Broadset composite plus psd-tools composite (N-version)   | self-consistency + independent |

The metric is never a mean pixel diff. Use NVIDIA ꟻLIP (or SSIM-on-luma plus OKLab ΔE on blurred chroma),
pooled by worst-window (p99 of 32×32 window scores) rather than image mean, with edge-map IoU as the
geometry-shift detector that SSIM tolerates.

Metamorphic laws provide free regression detection with zero golden maintenance:

- **Round-trip convergence.** `export(import(f))` applied twice is a fixed point (byte-equal modulo
  timestamps). Divergence means a lossy stage is not idempotent — a bug, no golden needed.
- **Scale coherence.** Render at 2× DPI, downsample, compare to 1× — catches resolution-dependent math.
- **Reorder commutation.** Page permutation commutes with export.

Goldens change only via explicit re-baseline commits. Every fixture row in
[real-producer-compatibility.md](../real-producer-compatibility.md) gets `(fixture, oracle-tier,
thresholds + provenance)`. The existing `corpus:fetch` infrastructure (veraPDF / Apache POI / psd-tools /
WPT corpora) is the right substrate.

## Acceptance criteria

- [ ] (W3-RECON-01) On a labeled Broadset → external-tool → Broadset corpus, the matcher produces zero
      false identity matches, detects every genuine edit, and routes every low-margin pair to `ambiguous`
      with an undoable user decision.
- [ ] (W3-RECON-01) The swap adversarial case (two near-identical elements exchanged) never auto-matches;
      it is always surfaced.
- [ ] (W1-SCENE-01) The `bsh1` canonicalization contract is documented field-by-field and proven stable
      under the catalogued producer transforms while remaining sensitive to real edits.
- [ ] (W3-QE-01) The oracle flags an injected gradient / blend / font-substitution regression and passes
      benign re-rasterization noise, using worst-window pooling.
- [ ] (W3-QE-01) Metamorphic round-trip / scale / reorder laws run in CI with no committed golden images.

## Verification

- Property tests over synthetic producer transforms (tag stripping, renumbering, rasterization, reorder)
  assert the classification and the zero-false-match invariant.
- Oracle unit tests inject known regressions and known-benign noise and assert detection versus tolerance.
- Threshold calibration is a committed, reproducible artifact keyed to corpus fixtures.

## References

- [pdf.md](../../spec/formats/pdf.md), [psd.md](../../spec/formats/psd.md),
  [formats/spec.md](../../spec/formats/spec.md) — format fidelity contracts.
- [real-producer-compatibility.md](../real-producer-compatibility.md) — producer matrix.
- `packages/model/src/content-hash.ts`, `packages/formats/src/_shared/reconcile/reconcile.ts` — current
  implementation surfaces this design replaces.
