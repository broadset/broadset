# Dev Audit Remediation — 2026-04-28

Snapshot and remediation plan for the dev-only `npm audit` advisories surfaced in the 2026-04-28 production-readiness inspection. Companion to `production-readiness-status.md` D.1.

Scope: this document covers `npm audit --json` (full audit) only. Production audit (`npm audit --omit=dev --json`) reports zero advisories at the date above.

## Snapshot — 2026-04-28

### Production audit

```text
$ npm audit --omit=dev --json
{
  "auditReportVersion": 2,
  "vulnerabilities": {},
  "metadata": { "vulnerabilities": { "total": 0, ... } }
}
```

Production-only audit is clean — no shipped runtime dependency carries an open advisory.

### Full audit (dev included)

| Advisory                                                                                                                         | Severity | Package   | Range             | Path                                                              | Fixed in          |
| -------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ----------------- | ----------------------------------------------------------------- | ----------------- |
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — PostCSS XSS via unescaped `</style>`                  | moderate | `postcss` | `<8.5.10`         | `node_modules/postcss` (deduped under multiple `vite` paths)      | `postcss@8.5.10+` |
| [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) — Vite path traversal in optimized-deps `.map` handling | moderate | `vite`    | `<=6.4.1`         | `node_modules/@playwright/experimental-ct-core/node_modules/vite` | `vite@6.4.2+`     |
| [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583) — Vite arbitrary file read via dev-server WebSocket     | high     | `vite`    | `>=6.0.0 <=6.4.1` | `node_modules/@playwright/experimental-ct-core/node_modules/vite` | `vite@6.4.2+`     |

### Dependency graph context

`npm ls postcss` (2026-04-28):

```text
broadset-workspace@0.1.0
├─┬ @broadset/demo@0.1.0
│ ├─┬ @playwright/experimental-ct-react@1.59.1
│ │ └─┬ @playwright/experimental-ct-core@1.59.1
│ │   └─┬ vite@6.4.1
│ │     └── postcss@8.5.8 deduped
│ └─┬ vite@8.0.3
│   └── postcss@8.5.8 deduped
└─┬ vite@8.0.8
  └── postcss@8.5.8
```

`npm ls vite` (relevant subset):

```text
├─┬ @playwright/experimental-ct-react@1.59.1
│ ├─┬ @playwright/experimental-ct-core@1.59.1
│ │ └── vite@6.4.1
```

`npm view @playwright/experimental-ct-core@1.59.1 dependencies.vite` returns `^6.4.1`, so a forced bump to `6.4.2` keeps the semver range satisfied.

## Per-advisory remediation

### Advisory 1 — `postcss <8.5.10` (GHSA-qx2v-qp2m-jg93)

**Preferred fix:** `npm overrides` entry forcing the workspace to dedupe `postcss` to `^8.5.12` (latest). The advisory is fully fixed in 8.5.10+; the 8.5.x line stays compatible with our consumers (Vite 6.x, Vite 8.x, Vitest 4.x, PostCSS 8.x lockfile).

**Fallback:** add a direct `postcss@^8.5.12` devDependency at the workspace root. Less surgical because it leaks postcss into the public devDependency surface.

### Advisory 2 + 3 — `vite <=6.4.1` (nested under Playwright CT)

**Preferred fix:** `npm overrides` entry forcing the nested `vite` under `@playwright/experimental-ct-core` to `^6.4.2`. Playwright CT's declared dep range (`^6.4.1`) accepts 6.4.2, so override is legal without forking Playwright.

**Fallback:** wait for `@playwright/experimental-ct-core@1.60.x` to ship with a non-vulnerable `vite` pin. As of 2026-04-28 the only published versions are `1.59.1` (current) and `1.60.0-alpha-*` pre-releases. Risk-acceptance the advisory until a stable 1.60.x lands.

**Risk acceptance fallback** (if both override and upstream fail): the dev server / CT runner attack surface only opens when the developer runs `npm run ct:all` locally; production runtime is not affected. Document owner + expiry, pin a re-check date, and revisit when a fixed Playwright minor lands.

## Applied fix — 2026-04-28

Applied the preferred fix for both classes via root `npm` `overrides` during production-readiness D.1. At that historical snapshot, the relevant `package.json` fragment was:

```json
{
  "overrides": {
    "postcss": "^8.5.12",
    "@playwright/experimental-ct-core": {
      "vite": "^6.4.2"
    }
  }
}
```

The current override set and versions live in the root `package.json` → `overrides` field (the generated baseline in [architecture.md](./architecture.md) renders dependency maps only, not overrides); they are not maintained in this historical record.

Re-running `npm install` after the override edit dedupes `postcss@8.5.12` and forces the nested `vite@6.4.2` so all three advisories disappear from `npm audit --json`. Verified by:

- `npm audit --json` exits 0 with `metadata.vulnerabilities.total === 0`.
- `npm ls postcss` shows `postcss@8.5.12` under every consumer.
- `npm ls vite` shows `@playwright/experimental-ct-core` resolving to `vite@6.4.2`.
- `npm run gate:full` passes end-to-end with the override active.

## Release-decision notes

- Production audit (`npm audit --omit=dev`) was already clean and stays clean.
- Full audit was clean as of the 2026-04-28 override above. The 2026-06-21 Playwright CT refresh introduced the separate dev-only `esbuild` advisory tracked below.
- Recheck cadence: re-evaluate the override on every Playwright CT minor bump. When `@playwright/experimental-ct-core` ships a stable release whose declared `vite` range is satisfied by `^6.4.2+`, drop the override.

## Residual advisory — 2026-06-21

After the dependency refresh to Playwright CT `1.61.0`, production audit remains clean:

```text
$ npm audit --omit=dev
found 0 vulnerabilities
```

Full dev audit now reports one low-severity advisory:

| Advisory                                                                                                                     | Severity | Package   | Range             | Path                                                                         | Fixed in         |
| ---------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ----------------- | ---------------------------------------------------------------------------- | ---------------- |
| [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) — esbuild dev server arbitrary file read on Windows | low      | `esbuild` | `0.27.3 - 0.28.0` | `node_modules/@playwright/experimental-ct-react/node_modules/esbuild@0.27.7` | `esbuild@0.28.1` |

Dependency graph:

```text
@playwright/experimental-ct-react@1.61.0
└─ @vitejs/plugin-react@4.7.0
   └─ vite@7.3.5
      └─ esbuild@0.27.7
```

Attempted remediation:

- Root override for direct `esbuild` is already set to `^0.28.1`, but the nested Vite 7 dependency keeps its own `esbuild@0.27.7`.
- A targeted override for `@playwright/experimental-ct-react` → `@vitejs/plugin-react@^6.0.2` did not change npm's resolved tree.
- `npm audit fix` exits with the same advisory and makes no lockfile change.

Risk acceptance:

- **Owner:** Broadset release owner.
- **Expiry:** Recheck before release cut or by 2026-07-21, whichever comes first.
- **Rationale:** This is a dev-only Playwright component-test dependency. The advisory requires running an esbuild/Vite development server on Windows; Broadset production runtime is unaffected, and `npm audit --omit=dev` is clean.
- **Required follow-up:** Re-evaluate on each `@playwright/experimental-ct-react` minor bump. If upstream keeps the Vite 7 plugin chain, consider replacing Playwright CT React's package usage or pinning a fork only after verifying CT compatibility.
