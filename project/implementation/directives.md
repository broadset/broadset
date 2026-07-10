# Directives — human steering channel

Append-only. The maintainer steers the autonomous loop by appending entries here; agents read this file **first** on
every iteration ([operating-loop.md](./operating-loop.md) step 2), act on unresolved entries before any other work,
and acknowledge by appending a `**Resolution (agent):**` line under the entry. Nobody edits or deletes existing
entries — corrections are new entries. Silence means continue.

Entry format (validated by `npm run roadmap:check`):

```md
## D-001 — 2026-07-10 — <scope: initiative ID, wave, file area, or "program">

**Directive:** <what to do differently, stop, or start>
**Stop:** <optional — halt matching in-flight work immediately>

**Resolution (agent):** <appended by the acting agent: what was done, links to PRs/commits>
```

Numbering is sequential (`D-001`, `D-002`, …) and shared by maintainer entries and agent `request:` entries —
agents may append requests for maintainer-owned actions, and the maintainer answers with a new entry or with a
resolution line appended under the request. A `Stop:` line halts all matching in-flight work before anything
else; reverting already-merged work in response is always in-policy (revert-first). Directives outrank this file's
own conventions only via a directive that changes the conventions.

---

_No directives yet. The loop runs on the roadmap defaults until the first entry appears._
