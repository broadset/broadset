import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import { SAMPLE_PROJECT_V1 } from './sample-project-v1';
import { loadStoredProjectV1, saveStoredProjectV1 } from './v1-project-persistence';

const project = SAMPLE_PROJECT_V1;

describe('v1 project persistence', () => {
  it('loads stored JSON through the bounded v1 loader', async () => {
    const storage = { getItem: vi.fn(() => JSON.stringify(project)), setItem: vi.fn() };

    const result = await loadStoredProjectV1({ storage, storageKey: 'project', fallbackProject: project });

    expect(result.project).toEqual(project);
    expect(result.quarantinedText).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });

  it('fails soft to the last valid project and retains quarantined text', async () => {
    const storage = { getItem: vi.fn(() => '{bad json'), setItem: vi.fn() };

    const result = await loadStoredProjectV1({ storage, storageKey: 'project', fallbackProject: project });

    expect(result.project).toBe(project);
    expect(result.quarantinedText).toBe('{bad json');
    expect(result.diagnostics.map(({ code }) => code)).toContain('invalid-json');
  });

  it('stores canonical v1 JSON', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };

    expect(saveStoredProjectV1({ storage, storageKey: 'project', project })).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith('project', projectFormatV1.canonicalizeProjectV1(project));
  });

  it('fails soft when storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('quota');
      }),
    };

    expect(saveStoredProjectV1({ storage, storageKey: 'project', project })).toBe(false);
  });
});
