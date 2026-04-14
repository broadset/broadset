import { ColorInput, CssLengthInput, FilterEditor, NumField, ShadowEditor } from '@broadset/ui';
import { type JSX, useState } from 'react';

export function ColorInputHarness({ initialValue }: { readonly initialValue: string }): JSX.Element {
  const [value, setValue] = useState(initialValue);

  return (
    <div>
      <ColorInput label="Fill" value={value} onChange={setValue} />
      <output data-testid="color-value">{value}</output>
    </div>
  );
}

export function NumFieldHarness(): JSX.Element {
  const [value, setValue] = useState(10);

  return (
    <div>
      <NumField label="X" value={value} onChange={setValue} step={1} min={0} max={100} />
      <output data-testid="num-value">{String(value)}</output>
    </div>
  );
}

export function CssLengthHarness(): JSX.Element {
  const [value, setValue] = useState('96px');

  return (
    <div>
      <CssLengthInput label="Padding" value={value} onChange={setValue} />
      <output data-testid="length-value">{value}</output>
    </div>
  );
}

export function FilterHarness(): JSX.Element {
  const [value, setValue] = useState('');

  return (
    <div>
      <FilterEditor label="Filter" value={value} onChange={setValue} />
      <output data-testid="filter-value">{value}</output>
    </div>
  );
}

export function ShadowHarness(): JSX.Element {
  const [value, setValue] = useState('0px 0px 4px 0px #000000');

  return (
    <div>
      <ShadowEditor label="Box shadow" mode="box" value={value} onChange={setValue} />
      <output data-testid="shadow-value">{value}</output>
    </div>
  );
}
