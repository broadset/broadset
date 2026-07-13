import { describe, expect, it } from 'vitest';

import { getElementCapabilityProfile } from './element-capabilities';

describe('v1 panel element capabilities', () => {
  it('keeps the active property groups for each v1 element kind', () => {
    expect(getElementCapabilityProfile('text')).toMatchObject({ appearance: true, typography: true });
    expect(getElementCapabilityProfile('image')).toMatchObject({ clipPath: true, objectFit: true });
    expect(getElementCapabilityProfile('path')).toMatchObject({ pathEditing: true, svgStrokeFill: true });
  });

  it('fails closed for unsupported element kinds', () => {
    expect(Object.values(getElementCapabilityProfile('plugin'))).not.toContain(true);
  });
});
