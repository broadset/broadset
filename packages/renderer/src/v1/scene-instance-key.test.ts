import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { sceneInstanceKeyV1 } from './scene-instance-key';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);

describe('sceneInstanceKeyV1', () => {
  it('separates repeated component element ids by root and component path', () => {
    const pageId = id('page');
    const first = sceneInstanceKeyV1({
      pageId,
      address: { rootInstanceId: id('root-a'), componentInstancePath: [id('instance-a')], elementId: id('leaf') },
    });
    const second = sceneInstanceKeyV1({
      pageId,
      address: { rootInstanceId: id('root-b'), componentInstancePath: [id('instance-b')], elementId: id('leaf') },
    });

    expect(first).not.toBe(second);
  });

  it('includes the page identity and cannot collide through separator-like ids', () => {
    const address: projectFormatV1.ResolvedSceneAddressV1 = {
      rootInstanceId: id('root'),
      componentInstancePath: [id('component/path')],
      elementId: id('leaf:part'),
    };

    expect(sceneInstanceKeyV1({ pageId: id('page-a'), address })).not.toBe(
      sceneInstanceKeyV1({ pageId: id('page-b'), address }),
    );
  });
});
