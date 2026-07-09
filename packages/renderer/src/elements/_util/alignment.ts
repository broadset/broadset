import type { BroadsetElementStyle } from '@broadset/model';

export function mapTextAlignment(value: BroadsetElementStyle['textAlignment']): string {
  switch (value) {
    case 'center':
      return 'center';
    case 'right':
      return 'flex-end';
    case 'justify':
      return 'space-between';
    case 'left':
    case undefined:
      return 'flex-start';
  }
}

export function mapVerticalAlignment(value: BroadsetElementStyle['verticalAlignment']): string {
  switch (value) {
    case 'middle':
      return 'center';
    case 'bottom':
      return 'flex-end';
    case 'top':
    case undefined:
      return 'flex-start';
  }
}
