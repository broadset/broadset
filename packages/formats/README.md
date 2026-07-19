# @broadset/formats

Native Broadset project persistence.

## Responsibilities

- Load checksummed `.bsp` project packages without throwing across the public API.
- Save self-contained `.bsp` project packages with canonical v1 project JSON and content-addressed blobs.
- Enforce package size, path, integrity, schema, and semantic validation limits.

## Usage

```ts
import { exportBspPackageV1, loadBspPackageV1 } from '@broadset/formats';

const saved = await exportBspPackageV1({ project, blobs });
const loaded = saved.status === 'exported' ? await loadBspPackageV1(saved.bytes) : saved;
```

## Notes

- Package boundary: may import `@broadset/model` and `@broadset/playback`.
- External interchange formats are intentionally outside the production package API until their campaign resumes.
