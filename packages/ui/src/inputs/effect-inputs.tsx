import { NumberField } from '@heroui/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';

import { ColorInput } from './color-input';

export { FilterEditor, type FilterEditorProps } from './filter-editor';
export { ShadowEditor, type ShadowEditorProps } from './shadow-editor';

export interface TextStrokeInputProps {
  readonly width: number;
  readonly color: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

export function TextStrokeInput({ width, color, onChange, label }: TextStrokeInputProps): JSX.Element {
  const [localWidth, setLocalWidth] = useState(width);
  const [localColor, setLocalColor] = useState(color);

  const emit = useCallback(
    (w: number, c: string) => {
      onChange(`${String(w)}px ${c}`);
    },
    [onChange],
  );

  const handleWidthChange = useCallback((newWidth: number) => {
    setLocalWidth(newWidth);
  }, []);

  const handleWidthBlur = useCallback(() => {
    emit(localWidth, localColor);
  }, [localWidth, localColor, emit]);

  const handleColorChange = useCallback(
    (newColor: string) => {
      setLocalColor(newColor);
      emit(localWidth, newColor);
    },
    [localWidth, emit],
  );

  return (
    <fieldset aria-label={label} style={{ border: 'none', padding: 0, margin: 0 }}>
      <NumberField
        aria-label="Stroke width"
        value={localWidth}
        onChange={handleWidthChange}
        onBlur={handleWidthBlur}
        minValue={0}
        step={1}
      >
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <ColorInput value={localColor} onChange={handleColorChange} label="Stroke color" />
    </fieldset>
  );
}
