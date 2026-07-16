import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as model } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { resolveRuntimeDataV1 } from './runtime-data';

const id = (value: string): projectFormatV1.Id => model.idSchema.parse(value);
const VIEW_ID = id('view');
const FIELD_ID = id('field');

function fixture(options: { readonly selected: boolean; readonly stalePolicy?: projectFormatV1.ViewModelField['stalePolicy'] }) {
  const page: projectFormatV1.PageDefinition = {
    ...model.createPageV1({ id: id('page') }),
    selectedSampleDataSets: options.selected ? { [VIEW_ID]: id('sample') } : {},
  };
  const document: projectFormatV1.BroadsetDocumentV1 = {
    ...model.createDocumentV1({ id: id('document'), pages: [page] }),
    viewModels: [{
      id: VIEW_ID,
      name: 'View',
      fields: [{ id: FIELD_ID, name: 'Field', schema: { kind: 'number' }, defaultValue: { type: 'number', value: 1 }, ...(options.stalePolicy === undefined ? {} : { stalePolicy: options.stalePolicy }) }],
      sampleDataSets: [{ id: id('sample'), name: 'Sample', values: { [FIELD_ID]: { type: 'number', value: 2 } } }],
    }],
  };

  return { document, page, project: model.createProjectV1({ documents: [document] }) };
}

describe('resolveRuntimeDataV1', () => {
  it('resolves live over sample over default and records stale default use', () => {
    const selected = fixture({ selected: true });

    expect(resolveRuntimeDataV1({ ...selected, fieldValues: [] })).toMatchObject({ value: { values: [{ value: { value: 2 } }], fallbacks: [] } });
    expect(resolveRuntimeDataV1({ ...selected, fieldValues: [{ viewModelId: VIEW_ID, fieldId: FIELD_ID, value: { type: 'number', value: 3 } }] })).toMatchObject({ value: { values: [{ value: { value: 3 } }] } });

    const defaulted = fixture({ selected: false });

    expect(resolveRuntimeDataV1({ ...defaulted, fieldValues: [] })).toMatchObject({ value: { values: [{ value: { value: 1 } }], fallbacks: [{ kind: 'stale-data', policy: 'use-default' }] } });
  });

  it('uses the declared default and records keep-last staleness during cold evaluation', () => {
    const cold = fixture({ selected: false, stalePolicy: 'keep-last' });

    expect(resolveRuntimeDataV1({ ...cold, fieldValues: [] })).toMatchObject({
      status: 'resolved',
      value: { values: [{ value: { type: 'number', value: 1 } }], fallbacks: [{ kind: 'stale-data', policy: 'keep-last' }] },
    });
  });

  it('returns diagnostics for error stale policy, unknown fields, duplicates, and schema mismatches', () => {
    const error = fixture({ selected: false, stalePolicy: 'error' });

    expect(resolveRuntimeDataV1({ ...error, fieldValues: [] })).toMatchObject({ status: 'invalid' });

    const selected = fixture({ selected: true });

    expect(resolveRuntimeDataV1({ ...selected, fieldValues: [{ viewModelId: VIEW_ID, fieldId: id('unknown'), value: { type: 'number', value: 1 } }] })).toMatchObject({ status: 'invalid' });

    const duplicate = { viewModelId: VIEW_ID, fieldId: FIELD_ID, value: { type: 'number', value: 1 } } as const;

    expect(resolveRuntimeDataV1({ ...selected, fieldValues: [duplicate, duplicate] })).toMatchObject({ status: 'invalid' });
    expect(resolveRuntimeDataV1({ ...selected, fieldValues: [{ viewModelId: VIEW_ID, fieldId: FIELD_ID, value: { type: 'string', value: 'bad' } }] })).toMatchObject({ status: 'invalid' });
  });
});
