# SVG track — known gaps

This document tracks the **honest** outstanding gaps in the SVG
import/export track. The native v1 path is covered by real producer
fixtures, schema and semantic validity oracles, round-trip tests, and
the retained security-hardened parser modules; the items below are
issues we know about and have explicitly chosen not to close yet.

Update this file when a gap closes (delete the entry) or when a
new one surfaces (add an entry with severity, location, attack /
fidelity description, and the deferred fix).

---

## Code health

### Large files still over the 500-line soft limit

**Severity:** Low (hygiene only — single-concern, low risk)
**Locations:**

- [`import-defs.ts`](./import-defs.ts) — 841 lines (gradient/filter/mask/pattern/clipPath builders)
- [`import-css.ts`](./import-css.ts) — 779 lines (CSS rule + selector resolver)

**Why deferred:** each is internally cohesive (single concern per
module). Further splitting would mostly move types around without
reducing real complexity. The retired import/export orchestrators have
been retired; these parser modules remain behind the native v1 importer.

**Trigger to close:** when adding a substantial new feature to one
of these files that would push it over 1000 lines, split at the
natural seam.

---

## Coverage

### No real Illustrator `<switch>` / `<foreignObject>` export fixture

**Severity:** Low (coverage gap — synthetic substitute exists)
**Location:** [`__fixtures__/illustrator-switch-wrapper.svg`](./__fixtures__/illustrator-switch-wrapper.svg)

**Why:** Adobe Illustrator emits a `<switch>` envelope around
exports for the "Preserve Illustrator Editing Capabilities" path,
with `<foreignObject requiredExtensions="ns_ai">` followed by a
sibling `<g i:extraneous="self">` carrying the geometry. We
searched the GitHub corpus + Wikimedia for a small (<10 KB)
MIT/Apache/CC0 export carrying this exact wrapper and didn't find
one. Real examples (rstudio/hex-stickers `distill.svg`, mediawiki
test fixtures) exceed the 10 KB MANIFEST limit or have incompatible
licenses. The complementary `illustrator-cordova-bug.svg` covers
the modern AI export shape (`<style>` CSS-class system).

**Trigger to close:** if a small license-clean real wrapper export
surfaces, replace the synthetic. Otherwise the synthetic stays —
the importer code path it exercises (`<switch>` SVG 1.1 §5.8
unwrap + `requiredExtensions` skip) is correct regardless of
fixture origin.

---

## Out of scope (intentional non-features)

These are not "gaps" — they're documented design choices. Listed
here so they don't get re-litigated:

- **SMIL animation fidelity** (IO-D-16): animations stripped on
  import. The `w3c-smil-animate.svg` fixture validates safe
  stripping only, not preservation.
- **Native `.sketch` / `.afdesign` / `.fig` import**: out of scope.
  We import the SVG bytes those tools produce, not the binary
  authoring formats.
- **Hostile / XSS real-world samples**: the security suite uses
  synthetic attacker payloads (legible threat model). Real-world
  hostile SVG would be redundant and license-tainted.

---

## How to use this file

- **Adding a finding:** add a section under the appropriate severity
  heading. Include severity, file location with line link if
  possible, attack/fidelity description, and the deferred fix. Cite
  the audit / review that surfaced the finding.
- **Closing a finding:** delete the entry and reference the closing
  commit in the commit message. Don't mark sections as "DONE" —
  the entry's absence is the documentation.
- **Severity scale:**
  - **Critical**: known exploitable vulnerability or data-loss bug
    that ships today. Should never appear in this file (fix first).
  - **High**: defence-in-depth gap, narrow practical impact today
    but a meaningful risk under different deployment assumptions.
  - **Medium**: missing surface that a determined attacker / unusual
    input could exploit; mitigated by other defences in practice.
  - **Low**: hygiene, coverage, or process gap with no security
    impact.
