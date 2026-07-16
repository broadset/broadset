# @broadset/model

DOM-free project contracts, runtime schemas, semantic validation, and model utilities for Broadset.

## Responsibilities

- Define the strict Broadset Project Format v1 contract.
- Separate structural parsing from whole-project semantic validation.
- Provide bounded JSON loading, canonical JSON, and semantic hashing.
- Provide construction and evaluation contracts used by every application package.

## Project Format v1

Project Format v1 is the active editor, renderer, playback, persistence, and format-adapter model.
The package root exports the complete v1 API directly and through the `projectFormatV1` namespace.

Production consumers import v1 APIs from the package root:

```ts
import {
  type BroadsetProjectV1,
  broadsetProjectV1Schema,
  canonicalizeProjectV1,
  computeProjectSemanticHashV1,
  loadProjectV1Json,
  parseProjectV1Unknown,
  validateBroadsetProjectV1Semantics,
} from '@broadset/model';

const parsed = parseProjectV1Unknown(input);

if (parsed.status === 'loaded') {
  const project: BroadsetProjectV1 = broadsetProjectV1Schema.parse(parsed.project);
  const diagnostics = validateBroadsetProjectV1Semantics(project);
  const canonicalJson = canonicalizeProjectV1(project);
  const semanticHash = await computeProjectSemanticHashV1(project);
  const reloaded = await loadProjectV1Json(canonicalJson);

  void diagnostics;
  void semanticHash;
  void reloaded;
}
```

`parseProjectV1Unknown` accepts an already decoded unknown value. `loadProjectV1Json` accepts source
text and preserves invalid text in a quarantined result. Neither API migrates pre-v1 Broadset data,
repairs invalid records, or creates a default project. Canonicalization preserves the full project;
semantic hashing excludes only the non-semantic metadata fields defined by the format reference.

The `projectFormatV1` namespace remains a convenient explicit boundary for code that groups model APIs.
It resolves to the same v1 symbols as direct package-root imports; there is no unversioned project model.

## Notes

- `@broadset/model` is dependency-root and must not import other workspace packages.
- Consumers import public APIs from `@broadset/model`, never `src/v1` or another internal path.
- Broadset-owned pre-v1 project records are quarantined rather than migrated or aliased.
