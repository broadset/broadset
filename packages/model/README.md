# @broadset/model

DOM-free project contracts, runtime schemas, semantic validation, and model utilities for Broadset.

## Responsibilities

- Define the strict Broadset Project Format v1 contract.
- Separate structural parsing from whole-project semantic validation.
- Provide bounded JSON loading, canonical JSON, and semantic hashing.
- Provide legacy model utilities while the application cutover is still in progress.

## Project Format v1 foundation

The v1 model foundation is the ratified cutover target. It is available from the package root, but it
is not yet the active editor, renderer, playback, persistence, or format-adapter model. Those consumers
move to v1 in the remaining cutover programs; the final application program deletes the unversioned
legacy model rather than retaining migrations, aliases, or runtime defaults.

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
text and preserves invalid text in a quarantined result. Neither API migrates legacy Broadset data,
repairs invalid records, or creates a default project. Canonicalization preserves the full project;
semantic hashing excludes only the non-semantic metadata fields defined by the format reference.

During staging, v1 names that collide with still-active unversioned names are available through the
`projectFormatV1` namespace. This is a temporary source-level disambiguation, not a persisted-format
compatibility layer. Unique v1 names and the complete foundation entry points are direct package-root
exports.

## Legacy application usage

```ts
import { broadsetDocumentSchema, createEmptyBroadsetDocument } from '@broadset/model';

const doc = createEmptyBroadsetDocument();
const parsed = broadsetDocumentSchema.parse(doc);
```

This example describes the current application runtime only. New project-format work targets v1 and
must not introduce another legacy parser, alias, or migration.

## Notes

- `@broadset/model` is dependency-root and must not import other workspace packages.
- Consumers import public APIs from `@broadset/model`, never `src/v1` or another internal path.
