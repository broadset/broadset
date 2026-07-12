import type { projectFormatV1 as ProjectFormatV1 } from '@broadset/model';
import { projectFormatV1 } from '@broadset/model';

import type { ResourceCollectionV1 } from './resource-collector';

export interface ProjectImportResultV1 {
  readonly project: ProjectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<ProjectFormatV1.Sha256Digest, Uint8Array>;
}

export function assembleImportedProjectV1(input: {
  readonly document: ProjectFormatV1.BroadsetDocumentV1;
  readonly resources: ResourceCollectionV1;
  readonly interop: ProjectFormatV1.InteropRegistry;
  readonly name?: string;
  readonly id?: ProjectFormatV1.Id;
}): ProjectImportResultV1 {
  const project = projectFormatV1.createProjectV1({
    documents: [input.document],
    resources: input.resources.resources,
    ...(input.id === undefined ? {} : { id: input.id }),
    ...(input.name === undefined ? {} : { name: input.name }),
  });

  return {
    project: { ...project, interop: input.interop },
    blobs: input.resources.blobs,
  };
}
