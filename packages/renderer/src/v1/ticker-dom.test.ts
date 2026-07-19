import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import { renderResolvedElementV1 } from './element-dom';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);

describe('ticker shared-clock motion', () => {
  it.each([
    ['left', 'translateX(-10px)', 'row'],
    ['right', 'translateX(10px)', 'row-reverse'],
    ['up', 'translateY(-10px)', 'column'],
    ['down', 'translateY(10px)', 'column-reverse'],
  ] as const)('recycles measured stable items %s', (direction, transform, flexDirection) => {
    let now = new Date('2026-01-01T00:00:00.000Z');
    let tick: (() => void) | undefined;
    const ticker = projectFormatV1.createElementV1({
      id: id(`ticker-${direction}`),
      name: `Ticker ${direction}`,
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 100 }),
      kind: 'ticker',
      ticker: {
        items: [
          { id: id('item-a'), text: 'A' },
          { id: id('item-b'), text: 'B' },
          { id: id('item-c'), text: 'C' },
        ],
        direction,
        speed: 10,
        gap: 1,
        repeat: true,
      },
    });
    const node: projectFormatV1.ResolvedSceneNodeV1 = {
      address: { rootInstanceId: id('root'), componentInstancePath: [], elementId: ticker.id },
      parentAddress: null,
      sourceElement: ticker,
      element: ticker,
      localGeometry: ticker.geometry,
      worldGeometry: ticker.geometry,
      visible: true,
      depth: 0,
      properties: [],
      fallbacks: [],
    };
    const host = renderResolvedElementV1({
      node,
      context: {
        document,
        swatches: new Map(),
        fonts: new Map(),
        resolveAsset: () => ({ status: 'missing', diagnostic: 'Missing' }),
        clock: {
          now: () => now,
          subscribe: (listener) => {
            tick = listener;

            return vi.fn();
          },
        },
      },
      units: { unit: 'mm', dpi: 254 },
    });
    const track = host.querySelector<HTMLElement>('[data-ticker-direction]');
    const first = track?.querySelector<HTMLElement>('[data-ticker-item-id="item-a"]');

    track?.querySelectorAll<HTMLElement>('span').forEach((span) => {
      vi.spyOn(span, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, width: 30, height: 30, top: 0, right: 30, bottom: 30, left: 0, toJSON: () => ({}),
      });
    });
    now = new Date('2026-01-01T00:00:05.000Z');
    tick?.();

    expect(track?.style.flexDirection).toBe(flexDirection);
    expect(track?.style.transform).toBe(transform);
    expect(track?.lastElementChild).toBe(first);
    expect(track?.lastElementChild?.textContent).toBe('A');
  });

  it('fills a repeated one-item ticker beyond the viewport before moving it', () => {
    let tick: (() => void) | undefined;
    const ticker = projectFormatV1.createElementV1({
      id: id('single-ticker'), name: 'Single',
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 40 }), kind: 'ticker',
      ticker: { items: [{ id: id('single'), text: 'Only' }], direction: 'left', speed: 10, gap: 0, repeat: true },
    });
    const node: projectFormatV1.ResolvedSceneNodeV1 = {
      address: { rootInstanceId: id('root'), componentInstancePath: [], elementId: ticker.id },
      parentAddress: null, sourceElement: ticker, element: ticker, localGeometry: ticker.geometry,
      worldGeometry: ticker.geometry, visible: true, depth: 0, properties: [], fallbacks: [],
    };
    const host = renderResolvedElementV1({
      node,
      context: {
        document, swatches: new Map(), fonts: new Map(), resolveAsset: () => ({ status: 'missing', diagnostic: 'Missing' }),
        clock: { now: () => new Date('2026-01-01T00:00:00Z'), subscribe: (listener) => { tick = listener;

 return vi.fn(); } },
      },
      units: { unit: 'px', dpi: 96 },
    });
    const content = host.querySelector<HTMLElement>('[data-element-content]');
    const track = host.querySelector<HTMLElement>('[data-ticker-direction]');

    if (content === null || track === null) throw new Error('Expected ticker DOM');
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 100, height: 40, top: 0, right: 100, bottom: 40, left: 0, toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 30, height: 20, top: 0, right: 30, bottom: 20, left: 0, toJSON: () => ({}),
    });
    tick?.();

    expect(track.querySelectorAll('span').length).toBeGreaterThanOrEqual(4);

    vi.mocked(content.getBoundingClientRect).mockReturnValue({
      x: 0, y: 0, width: 10_000, height: 40, top: 0, right: 10_000, bottom: 40, left: 0, toJSON: () => ({}),
    });
    tick?.();

    expect(content.textContent).toContain('Ticker viewport exceeds output budget');
    expect(content.querySelectorAll('span')).toHaveLength(0);
  });
});
