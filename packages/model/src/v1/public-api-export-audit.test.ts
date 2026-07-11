import { describe, expect, it } from 'vitest';

import {
  readV1CompilerExportInventory,
  V1_COMPLETE_EXPORT_NAMES,
  V1_RUNTIME_EXPORT_NAMES,
  V1_TYPE_EXPORT_NAMES,
} from './public-api-inventory.test-support';

describe('v1 compiler export inventory', () => {
  it('matches every value and type symbol against fixed public API oracles', () => {
    const actual = readV1CompilerExportInventory();

    expect(V1_COMPLETE_EXPORT_NAMES).toHaveLength(284);
    expect(V1_RUNTIME_EXPORT_NAMES).toHaveLength(120);
    expect(V1_TYPE_EXPORT_NAMES).toHaveLength(165);
    expect(actual.names).toHaveLength(V1_COMPLETE_EXPORT_NAMES.length);
    expect(actual.runtimeNames).toHaveLength(V1_RUNTIME_EXPORT_NAMES.length);
    expect(actual.typeNames).toHaveLength(V1_TYPE_EXPORT_NAMES.length);
    expect(new Set(actual.names)).toEqual(new Set(V1_COMPLETE_EXPORT_NAMES));
    expect(new Set(actual.runtimeNames)).toEqual(new Set(V1_RUNTIME_EXPORT_NAMES));
    expect(new Set(actual.typeNames)).toEqual(new Set(V1_TYPE_EXPORT_NAMES));
  });
});
