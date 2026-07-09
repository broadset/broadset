# @broadset/model

Core document model types, schemas, and utilities for Broadset projects.

## Responsibilities

- Define the Broadset project/document/element data contracts.
- Provide runtime-safe schema parsing and validation.
- Provide model utilities used by higher-level packages.

## Usage

```ts
import { broadsetDocumentSchema, createEmptyBroadsetDocument } from '@broadset/model';

const doc = createEmptyBroadsetDocument();
const parsed = broadsetDocumentSchema.parse(doc);
```

## Notes

- `@broadset/model` is dependency-root and must not import other workspace packages.
