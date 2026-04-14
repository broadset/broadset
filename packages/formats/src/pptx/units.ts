import type { Canvas } from '@broadset/model';

import { IN_TO_EMU, MM_TO_EMU } from './constants';

export function valueToEmu(canvas: Canvas, value: number): number {
  switch (canvas.unit) {
    case 'mm':
      return Math.round(value * MM_TO_EMU);
    case 'in':
      return Math.round(value * IN_TO_EMU);
    case 'px':
      return Math.round((value / canvas.dpi) * IN_TO_EMU);
  }
}

export function emuToValue(canvas: Canvas, emu: number): number {
  switch (canvas.unit) {
    case 'mm':
      return emu / MM_TO_EMU;
    case 'in':
      return emu / IN_TO_EMU;
    case 'px':
      return (emu / IN_TO_EMU) * canvas.dpi;
  }
}
