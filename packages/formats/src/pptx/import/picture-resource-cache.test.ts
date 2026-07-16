import { describe, expect, it } from 'vitest';

import { parseOoxml, rootElement } from '../ooxml/ast';
import { createPptxSourceElement } from '../project-model';
import { buildPictureElement } from './picture';

describe('PPTX picture resource caching', () => {
  it('base64-encodes a shared media path only once across picture uses', () => {
    const shape = rootElement(
      parseOoxml('<p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>'),
    );

    expect(shape).not.toBeNull();

    if (shape === null) return;

    const dataUriByMediaPath = new Map<string, string>();
    const mediaBytes = new Uint8Array([1, 2, 3]);
    const options = {
      shape,
      name: 'Shared picture',
      id: 'picture-1',
      mediaByRelId: new Map([
        ['rId1', { path: 'ppt/media/image1.png', mime: 'image/png', bytes: mediaBytes }],
      ]),
      dataUriByMediaPath,
      createFallback: () => createPptxSourceElement('rectangle'),
      createImageBase: () => createPptxSourceElement('image'),
      pushWarning: () => undefined,
    };

    const first = buildPictureElement(options);

    mediaBytes.set([4, 5, 6]);

    const second = buildPictureElement({ ...options, id: 'picture-2' });

    expect(first.content).toBe('data:image/png;base64,AQID');
    expect(first.content).toBe(second.content);
    expect(dataUriByMediaPath.size).toBe(1);
  });
});
