import { type ProjectEditorStore, selectActiveDocumentV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { ToggleSwitch } from '@broadset/ui';
import { Input, ListBox, Select } from '@heroui/react';
import { useState } from 'react';

import { useEditorSelector } from './helpers';

interface V1DataSidebarProps {
  readonly editorStore: ProjectEditorStore;
}

function summarizeComplexValue(value: projectFormatV1.TypedValue): string {
  switch (value.type) {
    case 'null':
      return 'null';
    case 'asset':
      return value.assetId;
    case 'point2d':
    case 'point3d':
      return value.value.join(', ');
    case 'list':
      return `${String(value.items.length)} items`;
    case 'object':
      return `${String(Object.keys(value.fields).length)} fields`;
    case 'color':
      return value.value.kind === 'color' ? value.value.space : value.value.swatchId;
    case 'boolean':
    case 'integer':
    case 'number':
    case 'string':
    case 'date-time':
    case 'length':
    case 'angle':
      return String(value.value);
  }
}

function updateSampleValue(
  document: projectFormatV1.BroadsetDocumentV1,
  options: {
    readonly viewModelId: projectFormatV1.Id;
    readonly dataSetId: projectFormatV1.Id;
    readonly fieldId: projectFormatV1.Id;
    readonly value: projectFormatV1.TypedValue;
  },
): projectFormatV1.BroadsetDocumentV1 {
  return {
    ...document,
    viewModels: document.viewModels.map((viewModel) =>
      viewModel.id === options.viewModelId ?
        {
          ...viewModel,
          sampleDataSets: viewModel.sampleDataSets.map((dataSet) =>
            dataSet.id === options.dataSetId ?
              { ...dataSet, values: { ...dataSet.values, [options.fieldId]: options.value } }
            : dataSet,
          ),
        }
      : viewModel,
    ),
  };
}

export function V1DataSidebar({ editorStore }: V1DataSidebarProps): React.JSX.Element {
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);
  const [requestedViewModelId, setRequestedViewModelId] = useState<projectFormatV1.Id | undefined>();
  const [requestedDataSetId, setRequestedDataSetId] = useState<projectFormatV1.Id | undefined>();
  const viewModel = document?.viewModels.find(({ id }) => id === requestedViewModelId) ?? document?.viewModels[0];
  const dataSet = viewModel?.sampleDataSets.find(({ id }) => id === requestedDataSetId) ?? viewModel?.sampleDataSets[0];

  if (document === undefined || viewModel === undefined || dataSet === undefined) {
    return <div style={{ padding: 12 }}>This document has no sample data.</div>;
  }

  const updateField = (fieldId: projectFormatV1.Id, value: projectFormatV1.TypedValue): void => {
    state.updateActiveDocument((current) =>
      updateSampleValue(current, {
        viewModelId: viewModel.id,
        dataSetId: dataSet.id,
        fieldId,
        value,
      }),
    );
  };

  return (
    <aside aria-label="Data editor" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
      <Select
        aria-label="View model"
        value={viewModel.id}
        onChange={(key) => {
          if (key === null) return;

          const id = projectFormatV1.idSchema.safeParse(String(key));

          if (id.success) {
            setRequestedViewModelId(id.data);
            setRequestedDataSetId(undefined);
          }
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {document.viewModels.map((candidate) => (
              <ListBox.Item id={candidate.id} key={candidate.id} textValue={candidate.name}>
                {candidate.name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Select
        aria-label="Sample data set"
        value={dataSet.id}
        onChange={(key) => {
          if (key === null) return;

          const id = projectFormatV1.idSchema.safeParse(String(key));

          if (id.success) setRequestedDataSetId(id.data);
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {viewModel.sampleDataSets.map((candidate) => (
              <ListBox.Item id={candidate.id} key={candidate.id} textValue={candidate.name}>
                {candidate.name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {viewModel.fields.map((field) => {
        const value = dataSet.values[field.id] ?? field.defaultValue;
        const label = field.label ?? field.name;

        if (value === undefined) return <div key={field.id}>{`${label}: no sample value`}</div>;

        if (value.type === 'boolean') {
          return (
            <ToggleSwitch
              key={field.id}
              ariaLabel={label}
              isSelected={value.value}
              onChange={(next) => {
                updateField(field.id, { type: 'boolean', value: next });
              }}
            >
              {label}
            </ToggleSwitch>
          );
        }

        if (value.type === 'string' || value.type === 'date-time') {
          return (
            <Input
              key={field.id}
              aria-label={label}
              value={value.value}
              onChange={(event) => {
                updateField(field.id, { ...value, value: event.currentTarget.value });
              }}
            />
          );
        }

        if (value.type === 'integer' || value.type === 'number' || value.type === 'length' || value.type === 'angle') {
          return (
            <Input
              key={field.id}
              aria-label={label}
              step={value.type === 'integer' ? 1 : 'any'}
              type="number"
              value={String(value.value)}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);

                if (!Number.isFinite(next) || (value.type === 'integer' && !Number.isSafeInteger(next))) return;

                updateField(field.id, { ...value, value: next });
              }}
            />
          );
        }

        return <code key={field.id}>{`${label}: ${summarizeComplexValue(value)}`}</code>;
      })}
    </aside>
  );
}
