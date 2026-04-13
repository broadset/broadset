import type { ElementTypeConfig } from './style-types';

export function defaultTypeConfig(type: string): ElementTypeConfig | null {
  switch (type) {
    case 'video':
      return {
        loop: false,
        autoplay: true,
        muted: true,
        startTimeS: 0,
        endTimeS: null,
      };
    case 'clock':
      return {
        mode: 'realtime',
        startValue: null,
        targetValue: null,
        countdownTo: null,
      };
    case 'ticker':
      return {
        speed: 60,
        direction: 'left',
        gap: 40,
        paused: false,
      };
    default:
      return null;
  }
}

export function defaultContent(type: string): string {
  switch (type) {
    case 'qrcode':
      return 'https://example.com';
    case 'clock':
      return 'HH:mm:ss';
    case 'ticker':
      return '[]';
    default:
      return '';
  }
}
