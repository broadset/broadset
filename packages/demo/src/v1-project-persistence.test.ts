import { describe, expect, it, vi } from 'vitest';

import { SAMPLE_PROJECT_BLOBS_V1, SAMPLE_PROJECT_V1 } from './sample-project-v1';
import { loadStoredProjectV1, saveStoredProjectV1 } from './v1-project-persistence';

const project = SAMPLE_PROJECT_V1;

describe('v1 project persistence', () => {
  it('round-trips the complete native package including embedded blobs', async () => {
    let storedText: string | null = null;
    const storage = {
      getItem: vi.fn(() => storedText),
      setItem: vi.fn((_key: string, value: string) => {
        storedText = value;
      }),
    };

    await expect(
      saveStoredProjectV1({ storage, storageKey: 'project', project, blobs: SAMPLE_PROJECT_BLOBS_V1 }),
    ).resolves.toBe(true);

    const result = await loadStoredProjectV1({
      storage,
      storageKey: 'project',
      fallbackProject: project,
      fallbackBlobs: new Map(),
    });

    expect(result.project).toEqual(project);
    expect(result.blobs).toEqual(SAMPLE_PROJECT_BLOBS_V1);
    expect(result.quarantinedBytes).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
    expect(storedText).toMatch(/^bsp-v1-base64:/u);
  });

  it('fails soft to the last valid project and retains quarantined package bytes', async () => {
    const storage = { getItem: vi.fn(() => 'bsp-v1-base64:e2JhZCBqc29u'), setItem: vi.fn() };

    const result = await loadStoredProjectV1({
      storage,
      storageKey: 'project',
      fallbackProject: project,
      fallbackBlobs: SAMPLE_PROJECT_BLOBS_V1,
    });

    expect(result.project).toBe(project);
    expect(result.blobs).toBe(SAMPLE_PROJECT_BLOBS_V1);
    expect(Array.from(result.quarantinedBytes ?? [])).toEqual(Array.from(new TextEncoder().encode('{bad json')));
    expect(result.diagnostics.map(({ code }) => code)).toContain('bsp.zip.malformed-archive');
  });

  it('fails soft when package export rejects missing blobs', async () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };

    await expect(saveStoredProjectV1({ storage, storageKey: 'project', project, blobs: new Map() })).resolves.toBe(
      false,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('fails soft when storage is unavailable', async () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('quota');
      }),
    };

    await expect(
      saveStoredProjectV1({ storage, storageKey: 'project', project, blobs: SAMPLE_PROJECT_BLOBS_V1 }),
    ).resolves.toBe(false);
  });
});
