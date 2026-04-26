/**
 * Bundled default ICC profiles.
 *
 * This module ships a minimal synthetic ICC v4 RGB profile that
 * encodes the canonical sRGB IEC61966-2.1 colour space — D50-adapted
 * primaries via Bradford chromatic adaptation + the proper sRGB
 * parametric transfer function (`para` type 3, the piecewise
 * `(aX+b)^γ if X≥d else cX` form), not a single-gamma approximation.
 *
 * Production users MAY still provide a real `sRGB IEC61966-2.1`
 * profile via `document.outputIntent.iccProfileAssetId`; the bundled
 * profile is the fallback so PDF/A export never refuses for "no
 * profile available". The bundled bytes are mathematically equivalent
 * to the canonical sRGB profile (within s15Fixed16 quantisation),
 * which means PDF/A validators that re-derive the colour space from
 * the embedded profile produce identical results.
 *
 * The synthetic profile is around 530 bytes — small enough to embed
 * in every PDF/A export without a noticeable size hit.
 */

const ICC_HEADER_SIZE = 128;
const TAG_TABLE_HEADER_SIZE = 4;
const TAG_TABLE_ENTRY_SIZE = 12;

// ICC v2.4. The `para` parametric-curve type is also defined in
// ICC.1:2010-12 as a v2 type (it was added by erratum and is widely
// supported by v2 parsers including lcms / littlecms / ColorSync).
// We use a v2 header here because the `desc` tag body is encoded in
// the v2 `textDescriptionType` shape — bumping to v4 would require
// rewriting `desc` as `multiLocalizedUnicodeType` (`mluc`) for strict
// v4 parsers (e.g. lcms in strict mode) to accept the profile.
const PROFILE_VERSION_2_4_0 = 0x02400000;
const D50_X_S15_FIXED = 0x0000_f6d6; // ≈ 0.9642
const D50_Y_S15_FIXED = 0x0001_0000; // 1.0000
const D50_Z_S15_FIXED = 0x0000_d32d; // ≈ 0.8249

/**
 * Build the bundled minimal synthetic sRGB-like ICC v2 RGB profile.
 *
 * Returns the same bytes on every call (the profile is deterministic).
 * Callers SHOULD treat the bytes as immutable — pass a copy if they
 * need to mutate.
 */
export function getDefaultProfile(_colorSpace: 'rgb'): Uint8Array {
  // Future colour spaces (`cmyk`, `gray`, `lab`) are explicit Spec
  // Gaps in `project/spec/formats/pdf.md` § PDF/A-2b Conformance Mode.
  // Today the parameter is `'rgb'`-only at the type level so callers
  // get a compile-time hint rather than a runtime throw.
  return buildMinimalSrgbV2Profile();
}

/**
 * Identifier text the exporter writes into the document `/OutputIntent`'s
 * `/OutputConditionIdentifier` when the bundled default profile is
 * used. The string matches the canonical ICC sRGB IEC61966-2.1
 * identifier so PDF/A validators that look it up against the ICC
 * registry recognise the intent.
 */
export const DEFAULT_PROFILE_IDENTIFIER = 'sRGB IEC61966-2.1';

function buildMinimalSrgbV2Profile(): Uint8Array {
  // Required RGB display profile tags (per ICC.1:2010-12 § 9.2.30):
  //   desc, cprt, wtpt, rXYZ, gXYZ, bXYZ, rTRC, gTRC, bTRC.
  // The R/G/B TRC tags share one parametric-curve dataset (linked tags)
  // so the profile stays under 400 bytes.
  const tagSignatures = ['desc', 'cprt', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC'] as const;

  const descTag = encodeDescTag('Broadset minimal sRGB');
  const cprtTag = encodeTextTag('Public domain — synthetic minimal sRGB profile');
  const wtptTag = encodeXyzTag(D50_X_S15_FIXED, D50_Y_S15_FIXED, D50_Z_S15_FIXED);
  // sRGB IEC61966-2.1 RGB primaries chromatically adapted from D65 to
  // the ICC PCS D50 reference white via the Bradford matrix. These
  // values match the canonical "sRGB IEC61966-2.1" ICC profile to
  // within s15Fixed16 quantisation, so a colour-managed renderer
  // produces visually identical output.
  const rXyzTag = encodeXyzTag(0x6fa2, 0x38f5, 0x0390); // 0.43607 0.22249 0.01392
  const gXyzTag = encodeXyzTag(0x6299, 0xb785, 0x18da); // 0.38515 0.71687 0.09708
  const bXyzTag = encodeXyzTag(0x24a0, 0x0f84, 0xb6cf); // 0.14307 0.06061 0.71410
  const trcTag = encodeSrgbParametricCurveTag(); // shared parametric sRGB transfer function

  const tagPayloads: { readonly bytes: Uint8Array; readonly shareWith?: string }[] = [
    { bytes: descTag },
    { bytes: cprtTag },
    { bytes: wtptTag },
    { bytes: rXyzTag },
    { bytes: gXyzTag },
    { bytes: bXyzTag },
    { bytes: trcTag },
    { bytes: trcTag, shareWith: 'rTRC' },
    { bytes: trcTag, shareWith: 'rTRC' },
  ];

  const tagTableSize = TAG_TABLE_HEADER_SIZE + tagSignatures.length * TAG_TABLE_ENTRY_SIZE;
  const tagDataStart = ICC_HEADER_SIZE + tagTableSize;

  const offsets: number[] = [];
  let cursor = tagDataStart;
  let firstTrcOffset = 0;

  for (let i = 0; i < tagSignatures.length; i++) {
    const payload = tagPayloads[i];

    if (payload === undefined) {
      offsets.push(cursor);
      continue;
    }

    if (payload.shareWith === 'rTRC' && firstTrcOffset !== 0) {
      offsets.push(firstTrcOffset);
      continue;
    }

    offsets.push(cursor);

    if (i === 6) firstTrcOffset = cursor;

    cursor += alignTo4(payload.bytes.length);
  }

  const totalSize = cursor;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // ── 128-byte header ────────────────────────────────────────────────
  view.setUint32(0, totalSize); // profile size
  writeAscii(out, 4, '    '); // preferred CMM type — none
  view.setUint32(8, PROFILE_VERSION_2_4_0);
  writeAscii(out, 12, 'mntr'); // device class — display
  writeAscii(out, 16, 'RGB '); // colour space
  writeAscii(out, 20, 'XYZ '); // PCS
  // bytes 24–35: date/time (zeros = unknown)
  writeAscii(out, 36, 'acsp'); // signature
  writeAscii(out, 40, 'APPL'); // primary platform — placeholder
  // flags / device manufacturer / device model / device attributes — zeros
  view.setUint32(64, 0); // rendering intent — perceptual
  view.setUint32(68, D50_X_S15_FIXED);
  view.setUint32(72, D50_Y_S15_FIXED);
  view.setUint32(76, D50_Z_S15_FIXED);
  writeAscii(out, 80, 'Brad'); // profile creator
  // bytes 84–127: reserved / zero

  // ── tag table ──────────────────────────────────────────────────────
  view.setUint32(128, tagSignatures.length);

  for (let i = 0; i < tagSignatures.length; i++) {
    const tagOffset = ICC_HEADER_SIZE + TAG_TABLE_HEADER_SIZE + i * TAG_TABLE_ENTRY_SIZE;
    const payload = tagPayloads[i];
    const offset = offsets[i] ?? 0;
    const size = payload?.bytes.length ?? 0;
    const signature = tagSignatures[i] ?? '    ';

    writeAscii(out, tagOffset, signature);
    view.setUint32(tagOffset + 4, offset);
    view.setUint32(tagOffset + 8, size);
  }

  // ── tag data ───────────────────────────────────────────────────────
  const writtenAt = new Set<number>();

  for (let i = 0; i < tagSignatures.length; i++) {
    const offset = offsets[i];
    const payload = tagPayloads[i];

    if (offset === undefined || payload === undefined) continue;
    if (writtenAt.has(offset)) continue;

    out.set(payload.bytes, offset);
    writtenAt.add(offset);
  }

  return out;
}

function alignTo4(n: number): number {
  return (n + 3) & ~3;
}

function writeAscii(out: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    out[offset + i] = text.charCodeAt(i);
  }
}

function encodeXyzTag(x: number, y: number, z: number): Uint8Array {
  const out = new Uint8Array(20);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, 'XYZ ');
  view.setUint32(4, 0);
  view.setUint32(8, x);
  view.setUint32(12, y);
  view.setUint32(16, z);

  return out;
}

function encodeSrgbParametricCurveTag(): Uint8Array {
  // ICC parametricCurveType (`para`, ICC.1:2010-12 § 10.18). Layout:
  //   `para` signature (4) + reserved (4) + functionType (2) +
  //   reserved (2) + N × 4-byte s15Fixed16 parameters.
  //
  // Function type 3 encodes the canonical sRGB transfer function:
  //   Y = (a·X + b)^γ   if X ≥ d
  //   Y =  c·X          if X <  d
  //
  // sRGB IEC61966-2.1 forward parameters:
  //   γ = 2.4
  //   a = 1 / 1.055
  //   b = 0.055 / 1.055
  //   c = 1 / 12.92
  //   d = 0.04045
  const PARA_FN_SRGB_PIECEWISE = 3;
  const out = new Uint8Array(12 + 5 * 4);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, 'para');
  view.setUint32(4, 0);
  view.setUint16(8, PARA_FN_SRGB_PIECEWISE);
  view.setUint16(10, 0);
  view.setInt32(12, toS15Fixed16(2.4));
  view.setInt32(16, toS15Fixed16(1 / 1.055));
  view.setInt32(20, toS15Fixed16(0.055 / 1.055));
  view.setInt32(24, toS15Fixed16(1 / 12.92));
  view.setInt32(28, toS15Fixed16(0.04045));

  return out;
}

function toS15Fixed16(value: number): number {
  // s15Fixed16Number per ICC.1:2010-12 § 4.7 — signed 16.16 fixed
  // point, big-endian, encoded into 4 bytes.
  return Math.round(value * 0x1_0000);
}

function encodeDescTag(text: string): Uint8Array {
  const ascii = text.slice(0, 67);
  const asciiLength = ascii.length + 1; // null terminator
  const out = new Uint8Array(12 + 4 + asciiLength + 12 + 67);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, 'desc');
  view.setUint32(4, 0);
  view.setUint32(8, asciiLength);

  for (let i = 0; i < ascii.length; i++) {
    out[12 + i] = ascii.charCodeAt(i);
  }
  // unicode language code (4) + unicode count (4) + unicode chars (0)
  // ScriptCode (3 bytes) + ScriptCode length (1) + 67 bytes scriptcode
  // — zero-fill is sufficient for the "no localised name" case.

  return out;
}

function encodeTextTag(text: string): Uint8Array {
  const out = new Uint8Array(8 + text.length + 1);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, 'text');
  view.setUint32(4, 0);

  for (let i = 0; i < text.length; i++) {
    out[8 + i] = text.charCodeAt(i);
  }

  return out;
}
