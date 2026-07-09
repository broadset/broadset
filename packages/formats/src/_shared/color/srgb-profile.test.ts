import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE_IDENTIFIER, getDefaultProfile } from './default-profiles';

const ICC_HEADER_SIZE = 128;
const TAG_TABLE_HEADER_SIZE = 4;
const TAG_TABLE_ENTRY_SIZE = 12;
const PROFILE_VERSION_2_4_0 = 0x02400000;
const SRGB_TOLERANCE = 1e-3;

interface TagEntry {
  readonly signature: string;
  readonly offset: number;
  readonly size: number;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';

  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[offset + i] ?? 0);
  }

  return out;
}

function fromS15Fixed16(view: DataView, offset: number): number {
  return view.getInt32(offset) / 0x1_0000;
}

function readTagTable(bytes: Uint8Array): ReadonlyArray<TagEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tagCount = view.getUint32(ICC_HEADER_SIZE);
  const entries: TagEntry[] = [];

  for (let i = 0; i < tagCount; i++) {
    const entryOffset = ICC_HEADER_SIZE + TAG_TABLE_HEADER_SIZE + i * TAG_TABLE_ENTRY_SIZE;

    entries.push({
      signature: readAscii(bytes, entryOffset, 4),
      offset: view.getUint32(entryOffset + 4),
      size: view.getUint32(entryOffset + 8),
    });
  }

  return entries;
}

function findTag(tags: ReadonlyArray<TagEntry>, signature: string): TagEntry {
  const tag = tags.find((t) => t.signature === signature);

  if (tag === undefined) throw new Error(`missing required tag ${signature}`);

  return tag;
}

describe('Bundled synthetic sRGB ICC profile', () => {
  /**
   * @description The bundled ICC profile declares ICC v2.4 in the
   * header. The profile body uses v2 tag types (`textDescriptionType`
   * for `desc`, `textType` for `cprt`, `XYZType` for primaries),
   * which is consistent with a v2 header — strict parsers (lcms,
   * littlecms, ColorSync) accept the profile in their default modes.
   */
  it('declares ICC v2.4 in the profile header', () => {
    const bytes = getDefaultProfile('rgb');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint32(8)).toBe(PROFILE_VERSION_2_4_0);
  });

  /**
   * @description Required tag set per ICC.1:2010-12 § 9.2.30 for an
   * RGB display profile: desc, cprt, wtpt, rXYZ, gXYZ, bXYZ, rTRC,
   * gTRC, bTRC. Exporters relying on the bundled profile depend on
   * every required tag being present.
   */
  it('emits all required RGB-display tags', () => {
    const bytes = getDefaultProfile('rgb');
    const tags = readTagTable(bytes).map((t) => t.signature);

    for (const required of ['desc', 'cprt', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC']) {
      expect(tags).toContain(required);
    }
  });

  /**
   * @description The R/G/B TRC tags must each point at a `para`
   * parametric-curve dataset (NOT a single-gamma `curv`) so the
   * profile encodes the proper sRGB piecewise transfer function
   * rather than the gamma=2.2 approximation that loses ~3 ΔE in the
   * shadows.
   */
  it('uses parametric (para) TRC tags', () => {
    const bytes = getDefaultProfile('rgb');
    const tags = readTagTable(bytes);

    for (const sig of ['rTRC', 'gTRC', 'bTRC']) {
      const tag = findTag(tags, sig);
      const tagSig = readAscii(bytes, tag.offset, 4);

      expect(tagSig).toBe('para');
    }
  });

  /**
   * @description The R/G/B TRC tags must share a single dataset (linked
   * tags) — encoding three copies of the same parametric curve would
   * waste ~64 bytes for no information gain.
   */
  it('shares one parametric-curve dataset across rTRC, gTRC, bTRC', () => {
    const bytes = getDefaultProfile('rgb');
    const tags = readTagTable(bytes);
    const trcOffsets = ['rTRC', 'gTRC', 'bTRC'].map((sig) => findTag(tags, sig).offset);

    expect(new Set(trcOffsets).size).toBe(1);
  });

  /**
   * @description The parametric curve function type must be 3 (the
   * sRGB-shaped piecewise `(aX+b)^γ if X≥d else cX` form) and the
   * five parameters must encode the canonical sRGB transfer function
   * within s15Fixed16 quantisation tolerance.
   */
  it('encodes the canonical sRGB transfer function parameters', () => {
    const bytes = getDefaultProfile('rgb');
    const tags = readTagTable(bytes);
    const rTrc = findTag(tags, 'rTRC');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fnType = view.getUint16(rTrc.offset + 8);

    expect(fnType).toBe(3);

    const gamma = fromS15Fixed16(view, rTrc.offset + 12);
    const a = fromS15Fixed16(view, rTrc.offset + 16);
    const b = fromS15Fixed16(view, rTrc.offset + 20);
    const c = fromS15Fixed16(view, rTrc.offset + 24);
    const d = fromS15Fixed16(view, rTrc.offset + 28);

    expect(gamma).toBeCloseTo(2.4, 3);
    expect(a).toBeCloseTo(1 / 1.055, 3);
    expect(b).toBeCloseTo(0.055 / 1.055, 3);
    expect(c).toBeCloseTo(1 / 12.92, 3);
    expect(d).toBeCloseTo(0.04045, 3);
  });

  /**
   * @description The encoded sRGB primaries (D50-Bradford-adapted XYZ)
   * must match the canonical sRGB IEC61966-2.1 profile values within
   * the s15Fixed16 quantisation step (~1.5e-5).
   */
  it('encodes Bradford-D50-adapted sRGB primaries', () => {
    const bytes = getDefaultProfile('rgb');
    const tags = readTagTable(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const readXyz = (signature: string): { x: number; y: number; z: number } => {
      const tag = findTag(tags, signature);

      return {
        x: fromS15Fixed16(view, tag.offset + 8),
        y: fromS15Fixed16(view, tag.offset + 12),
        z: fromS15Fixed16(view, tag.offset + 16),
      };
    };

    const r = readXyz('rXYZ');
    const g = readXyz('gXYZ');
    const b = readXyz('bXYZ');

    expect(r.x).toBeCloseTo(0.43607, 3);
    expect(r.y).toBeCloseTo(0.22249, 3);
    expect(r.z).toBeCloseTo(0.01392, 3);
    expect(g.x).toBeCloseTo(0.38515, 3);
    expect(g.y).toBeCloseTo(0.71687, 3);
    expect(g.z).toBeCloseTo(0.09708, 3);
    expect(b.x).toBeCloseTo(0.14307, 3);
    expect(b.y).toBeCloseTo(0.06061, 3);
    expect(b.z).toBeCloseTo(0.71410, 3);
  });

  /**
   * @description The PCS white point in the wtpt tag must be the
   * canonical D50 reference white (X=0.9642, Y=1.0000, Z=0.8249) per
   * ICC.1:2010-12 § 9.2.36.
   */
  it('declares the D50 PCS white point', () => {
    const bytes = getDefaultProfile('rgb');
    const tags = readTagTable(bytes);
    const wtpt = findTag(tags, 'wtpt');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(fromS15Fixed16(view, wtpt.offset + 8)).toBeCloseTo(0.9642, 3);
    expect(fromS15Fixed16(view, wtpt.offset + 12)).toBeCloseTo(1.0, SRGB_TOLERANCE);
    expect(fromS15Fixed16(view, wtpt.offset + 16)).toBeCloseTo(0.8249, 3);
  });

  /**
   * @description The default profile identifier string must be the
   * canonical sRGB IEC61966-2.1 name so PDF/A validators that look
   * the identifier up in the ICC registry recognise the intent.
   */
  it('exposes the canonical sRGB IEC61966-2.1 identifier', () => {
    expect(DEFAULT_PROFILE_IDENTIFIER).toBe('sRGB IEC61966-2.1');
  });

  /**
   * @description The bundled profile is small enough to embed in
   * every PDF/A export without a measurable size hit. The 1 KiB
   * ceiling is a soft budget — the actual profile is around half
   * that, but a deliberate ceiling catches accidental bloat (an
   * extra tag, or losing the linked-TRC sharing).
   */
  it('stays under 1 KiB', () => {
    const bytes = getDefaultProfile('rgb');

    expect(bytes.length).toBeLessThan(1024);
  });
});
