import { idSchema, utcTimestampSchema } from '../identity';
import type { BroadsetProjectV1 } from '../project';

export function createMinimalProjectV1(): BroadsetProjectV1 {
  const timestamp = utcTimestampSchema.parse('2025-01-01T00:00:00Z');
  const projectId = idSchema.parse('project');
  const documentId = idSchema.parse('document');
  const pageId = idSchema.parse('page');

  return {
    $schema: 'https://schema.broadset.dev/v1/project.schema.json',
    format: 'broadset-project',
    schemaVersion: 1,
    id: projectId,
    metadata: { name: 'Minimal project', createdAt: timestamp, updatedAt: timestamp },
    resources: { assets: [], fonts: [], swatches: [], variables: [], styles: [], outputProfiles: [] },
    documents: [
      {
        id: documentId,
        name: 'Minimal document',
        kind: 'static',
        surface: {
          size: [1920, 1080],
          unit: 'px',
          dpi: 96,
          coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down' },
          background: { kind: 'none' },
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          guides: [],
          broadcastSafeAreas: [],
        },
        color: { workingSpace: { kind: 'named', space: 'srgb' }, compositing: 'linear-premultiplied' },
        elements: [],
        components: [],
        pages: [
          {
            id: pageId,
            name: 'Page 1',
            rootInstances: [],
            descendantOverrides: [],
            selectedVariableModes: {},
            selectedSampleDataSets: {},
            extensions: [],
          },
        ],
        sequences: [],
        stateMachines: [],
        viewModels: [],
        bindings: [],
        selectedVariableModes: {},
        outputProfileIds: [],
        extensions: [],
      },
    ],
    templateGroups: [],
    interop: { sources: [], records: [] },
    extensions: [],
  };
}
