/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';

import { createScreenRenderer, DATA_ATTRIBUTES, type RuntimeServices } from '../index';
import { createDocument, createElement } from '../screen-renderer/test-helpers';
import {
  createIdempotentFontLoader,
  type DataService,
  type FontService,
  substituteDynamicTokens,
} from './runtime';

function mapDataService(data: Readonly<Record<string, unknown>>): DataService {
  return {
    get(key) {
      return data[key];
    },
    subscribe() {
      return () => undefined;
    },
  };
}

describe('substituteDynamicTokens', () => {
  /**
   * @description Direct-key tokens (`{{score}}`) resolve against the data
   *   service by literal key. The renderer spec's dynamic token format
   *   requires `{{key}}` to be replaced with the resolved value.
   */
  it('replaces direct-key tokens with resolved values', () => {
    const data = mapDataService({ score: 3 });

    expect(substituteDynamicTokens('Score: {{score}}', data)).toBe('Score: 3');
  });

  /**
   * @description Dot-notation tokens resolve nested values from the data
   *   service, matching the renderer spec's `{{score.home}}` example.
   */
  it('resolves nested dot-notation paths', () => {
    const data = mapDataService({ score: { home: 3, away: 1 } });

    expect(substituteDynamicTokens('Score: {{score.home}} - {{score.away}}', data)).toBe('Score: 3 - 1');
  });

  /**
   * @description Unresolved tokens render literally so templates surface
   *   missing-data conditions during development; the spec requires the
   *   literal fallback.
   */
  it('leaves unresolved tokens as literal strings', () => {
    const data = mapDataService({});

    expect(substituteDynamicTokens('{{missing.key}}', data)).toBe('{{missing.key}}');
  });

  /**
   * @description Text without tokens is passed through verbatim and no
   *   data service lookups happen, so normal text content is unaffected.
   */
  it('returns content unchanged when there are no tokens', () => {
    const data = mapDataService({ a: 1 });

    expect(substituteDynamicTokens('Hello world', data)).toBe('Hello world');
  });
});

describe('createIdempotentFontLoader', () => {
  /**
   * @description Repeated requests for the same family+weight+style pair
   *   resolve to a single underlying `ensureLoaded` call. The renderer
   *   spec requires idempotent font injection so duplicate definitions
   *   are not loaded twice.
   */
  it('dedupes repeated ensureLoaded calls for the same font key', async () => {
    const underlying: FontService = {
      ensureLoaded: vi.fn(() => Promise.resolve()),
    };
    const loader = createIdempotentFontLoader(underlying);

    await loader.ensureLoaded('Inter', 600, 'normal');
    await loader.ensureLoaded('Inter', 600, 'normal');
    await loader.ensureLoaded('Inter', 600, 'normal');

    expect(underlying.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  /**
   * @description Different weight or style values produce distinct keys
   *   so the same family at multiple weights is loaded once per weight.
   */
  it('separates font keys by weight and style', async () => {
    const underlying: FontService = {
      ensureLoaded: vi.fn(() => Promise.resolve()),
    };
    const loader = createIdempotentFontLoader(underlying);

    await loader.ensureLoaded('Inter', 400, 'normal');
    await loader.ensureLoaded('Inter', 700, 'normal');
    await loader.ensureLoaded('Inter', 400, 'italic');

    expect(underlying.ensureLoaded).toHaveBeenCalledTimes(3);
  });
});

describe('renderer runtime plumbing', () => {
  /**
   * @description When a DataService is provided through
   *   `ScreenRendererOptions.runtime`, text elements render with
   *   substituted `{{key}}` tokens without mutating the document.
   */
  it('substitutes dynamic tokens in text elements using the runtime data service', () => {
    const host = document.createElement('div');

    host.style.width = '400px';
    host.style.height = '100px';

    const runtime: RuntimeServices = {
      data: mapDataService({ player: { name: 'Ada' } }),
    };
    const textElement = createElement({
      id: 'txt',
      type: 'text',
      content: 'Hello, {{player.name}}!',
    });
    const controller = createScreenRenderer({
      host,
      document: createDocument([textElement]),
      runtime,
    });

    const node = host.querySelector(`[${DATA_ATTRIBUTES.elementId}="txt"] [${DATA_ATTRIBUTES.elementContent}]`);

    expect(node?.textContent).toBe('Hello, Ada!');

    controller.destroy();
  });

  /**
   * @description When a FontService is provided and the element declares
   *   a fontFamily, the renderer calls `ensureLoaded` — repeat calls for
   *   the same family key are deduped by the caller-provided service, so
   *   the renderer does not add its own dedup burden.
   */
  it('calls FontService.ensureLoaded for every element with a fontFamily', () => {
    const host = document.createElement('div');
    const fonts: FontService = {
      ensureLoaded: vi.fn(() => Promise.resolve()),
    };
    const runtime: RuntimeServices = { fonts };
    const textElement = createElement({
      id: 'txt',
      type: 'text',
      content: 'Hello',
      style: { fill: { kind: 'none' }, fontFamily: 'Inter', fontWeight: 600 },
    });
    const controller = createScreenRenderer({
      host,
      document: createDocument([textElement]),
      runtime,
    });

    expect(fonts.ensureLoaded).toHaveBeenCalledWith('Inter', 600, undefined);

    controller.destroy();
  });
});
