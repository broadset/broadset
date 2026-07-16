import { describe, expect, it } from 'vitest';

import { createQrCodeSvgV1 } from './qr-svg';

type ErrorCorrection = 'L' | 'M' | 'Q' | 'H';

async function matrixFingerprint(svg: SVGSVGElement): Promise<{ readonly size: number; readonly hash: string }> {
  const modules = svg.querySelector<SVGPathElement>('[data-qr-modules]');
  const size = Number(modules?.dataset['qrModules']);
  const rows = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const data = modules?.getAttribute('d') ?? '';

  for (const match of data.matchAll(/M(\d+) (\d+)h1v1h-1z/gu)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const row = rows[y];

    if (row !== undefined) row[x] = true;
  }

  const serialized = rows.map((row) => row.map((dark) => (dark ? '1' : '0')).join('')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');

  return { size, hash };
}

function render(value: string, errorCorrection: ErrorCorrection): SVGSVGElement | undefined {
  return createQrCodeSvgV1({ document, value, errorCorrection, quietZoneCssPixels: 12.5 });
}

describe('createQrCodeSvgV1', () => {
  const goldens: readonly (readonly [ErrorCorrection, string, number, string])[] = [
    ['L', 'HELLO', 21, 'e349ee3a1b2fc2632d4defa04a0168eadfa858328b58859f79b8c7f503b82c8e'],
    ['M', 'Broadset \u2705', 21, '73796d23f778e600843714a9eff800187ec8788d0440c1e4ad9c9f79bc8147b9'],
    ['Q', 'x'.repeat(100), 49, 'f935062f5348d078e6482df82368bd1ae3181748434434d88248092f73eeba16'],
    ['H', 'x'.repeat(1_200), 173, 'c7e62ba18030e3e0c9ff1b4243c0f504e3d4ab75b3983df9cffcc3186b9a2aba'],
    ['L', 'x'.repeat(2_953), 177, '26ab6b9a9dce6209c2e2f30e158bc9907bd2131177155e29fad20ec492012f79'],
  ];
  const capacities: readonly (readonly [ErrorCorrection, number])[] = [
    ['L', 2_953],
    ['M', 2_331],
    ['Q', 1_663],
    ['H', 1_273],
  ];

  it.each(goldens)(
    'matches the independent byte-mode/mask-0 golden for %s content',
    async (level, value, size, hash) => {
      const svg = render(value, level);

      expect(svg).toBeDefined();
      expect(svg === undefined ? undefined : await matrixFingerprint(svg)).toEqual({ size, hash });
      expect(svg?.style.padding).toBe('12.5px');
    },
  );

  it.each(capacities)('supports the full version-40 %s byte capacity and rejects one byte beyond it', (level, capacity) => {
    expect(render('x'.repeat(capacity), level)).toBeDefined();
    expect(render('x'.repeat(capacity + 1), level)).toBeUndefined();
  });

});
