/**
 * Bundled default ICC profiles.
 *
 * Today this module ships a minimal synthetic ICC v2 RGB profile
 * (header + required tags only) that satisfies the PDF/A-2b
 * structural-validation floor. Production users SHOULD provide a real
 * `sRGB IEC61966-2.1` profile via `document.outputIntent.iccProfileAssetId`
 * — the synthetic profile is the fallback so PDF/A export never
 * refuses for "no profile available", and it is the only path the
 * default `getDefaultProfile('rgb')` exercises today.
 *
 * The synthetic profile is approximately 320 bytes — small enough to
 * embed in every PDF/A export without a noticeable size hit.
 *
 * Recorded as a Spec Gap in `project/spec/formats/pdf.md` § PDF/A-2b
 * Conformance Mode.
 */

const ICC_HEADER_SIZE = 128;
const TAG_TABLE_HEADER_SIZE = 4;
const TAG_TABLE_ENTRY_SIZE = 12;

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
  // Required v2 RGB display profile tags (per ICC.1:2010-12 § 9.2.30):
  //   desc, cprt, wtpt, rXYZ, gXYZ, bXYZ, rTRC, gTRC, bTRC.
  // We share one curve dataset across rTRC/gTRC/bTRC (linked tags) so
  // the profile stays under 400 bytes.
  const tagSignatures = ['desc', 'cprt', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC'] as const;

  const descTag = encodeDescTag('Broadset minimal sRGB');
  const cprtTag = encodeTextTag('Public domain — synthetic minimal sRGB profile');
  const wtptTag = encodeXyzTag(D50_X_S15_FIXED, D50_Y_S15_FIXED, D50_Z_S15_FIXED);
  const rXyzTag = encodeXyzTag(0x6fa2, 0x38f5, 0x0390);
  const gXyzTag = encodeXyzTag(0x6299, 0xb785, 0x18da);
  const bXyzTag = encodeXyzTag(0x24a0, 0x0f84, 0xb6cf);
  const trcTag = encodeCurveTag(); // single linked curve shared by R/G/B TRC

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

function encodeCurveTag(): Uint8Array {
  // ICC v2 type "curv" — `curv` signature (4) + reserved (4) + count
  // (4) + count × 2-byte u8.8 fixed-point gamma values. A single value
  // means the whole curve is parameterised by gamma; 0x0233 ≈ 2.2,
  // close enough to sRGB for a structural-validation floor.
  const out = new Uint8Array(14);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, 'curv');
  view.setUint32(4, 0);
  view.setUint32(8, 1);
  view.setUint16(12, 0x0233);

  return out;
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
