# ADR-008: Canonical BSP Package and JSON Interchange

Status: proposed 2026-07-09 — does not override `project/spec/**` without explicit maintainer ratification.

## Context

One model spec required every `.bsp` to be ZIP, while other authoritative references allowed plain JSON under the same extension and MIME. The demo currently treats JSON with a `.bsp` name as a project file, which is ambiguous and unsuitable for reliable embedded assets.

## Proposed decision

- `.bsp` is the canonical portable project package and is always a ZIP container.
- The package contains `manifest.json`, `project.json`, `assets/`, and optional `thumbnails/`.
- `manifest.json` records format version, project JSON digest, every packaged entry's byte length and SHA-256 digest, and package creation metadata that is excluded from semantic project hashing.
- ZIP entry names are normalized forward-slash relative paths. Absolute paths, backslashes, duplicate normalized paths, traversal, symlinks, excessive entries, excessive expansion ratios, and unlisted payloads are rejected.
- `project.json` contains the canonical `BroadsetProject`; file asset sources reference manifest-listed package paths.
- Raw project JSON remains a supported API/debug/interchange representation with `.broadset.json` or `.json`, MIME `application/vnd.broadset.project+json`. It is not named `.bsp`.
- `.bsp` uses neutral vendor MIME `application/vnd.broadset.project` because its representation is a package, not JSON.
- Loading validates container budgets and checksums before model hydration. Invalid packages are quarantined with typed diagnostics and raw recovery access.
- Persistence adapters and `EditorConfig.onSave` remain separate concerns: hosts may save to local journals, cloud storage, or `.bsp`, but must preserve the same project semantics.

## Consequences

The greenfield file contract becomes unambiguous and asset-safe. Existing plain-JSON `.bsp` fixtures must be renamed or replaced when W1-PERSIST-01 implements the package codec.

## Verification

Round-trip, corruption-at-every-entry, checksum, traversal, duplicate-path, ZIP-bomb, unknown-entry, MIME, and atomic-save/recovery tests are required.
