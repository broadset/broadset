import { findChild, findChildren, findDescendant, getAttr, parseOoxml, rootElement } from '../ooxml/ast';
import { OOXML_REL_TYPES } from '../ooxml/namespaces';
import { parseRelationshipsXml } from '../ooxml/relationships';
import { type OoxmlPackage, readTextPart } from '../ooxml/zip';
import { createPptxEmbeddedFontAsset, type PptxEmbeddedFontAsset } from '../project-model';
import { resolveRelTarget } from './package';

/**
 * Recover embedded fonts from a `.pptx` package back into Broadset
 * `PptxEmbeddedFontAsset` entries. Walks `ppt/_rels/presentation.xml.rels` for
 * `font`-typed relationships, cross-references the `<p:embeddedFontLst>`
 * inside `ppt/presentation.xml` to map relationship IDs to family
 * names, reads the `ppt/fonts/font{N}.fntdata` bytes, and emits one
 * PptxEmbeddedFontAsset per embedded font with the bytes inlined as a
 * `data:font/ttf;base64,…` `embedded` source so the host project can
 * carry it forward.
 *
 * Closes the spec gap "importer-side recovery of embedded fonts back
 * into PptxEmbeddedFontAssets" — pairs with the export-side `embeddedFontLst`
 * emission so a Broadset-exported `.pptx` round-trips its fonts on
 * re-import.
 */

interface EmbeddedFontRef {
  readonly relId: string;
  readonly familyName: string;
}

const TTF_MIME = 'font/ttf';
const OTF_MIME = 'font/otf';

export function extractEmbeddedFonts(pkg: OoxmlPackage): readonly PptxEmbeddedFontAsset[] {
  const presRelsXml = readTextPart(pkg, 'ppt/_rels/presentation.xml.rels');
  const presXml = readTextPart(pkg, 'ppt/presentation.xml');

  if (presRelsXml === null || presXml === null) return [];

  const relTargetById = new Map<string, string>();

  for (const rel of parseRelationshipsXml(presRelsXml)) {
    if (rel.type !== OOXML_REL_TYPES.font) continue;

    relTargetById.set(rel.id, rel.target);
  }

  if (relTargetById.size === 0) return [];

  const familyByRelId = readEmbeddedFontList(presXml);

  if (familyByRelId.length === 0) return [];

  const assets: PptxEmbeddedFontAsset[] = [];
  let counter = 0;

  for (const ref of familyByRelId) {
    const target = relTargetById.get(ref.relId);

    if (target === undefined) continue;

    const partPath = resolveRelTarget('ppt', target);
    const bytes = pkg.get(partPath);

    if (bytes === undefined || bytes.byteLength === 0) continue;

    counter += 1;

    const format = detectFontFormat(bytes);
    const mimeType = format === 'otf' ? OTF_MIME : TTF_MIME;
    const dataUri = `data:${mimeType};base64,${bytesToBase64(bytes)}`;

    assets.push(
      createPptxEmbeddedFontAsset({
        id: `pptx-font-${String(counter)}`,
        name: ref.familyName,
        mimeType,
        source: { type: 'embedded', dataUri },
        format,
        // PostScript name isn't carried by the embeddedFontLst entry;
        // PowerPoint stores it in the font's own name table. Rather
        // than parse the name table here, fall back to the family
        // name — exporters that need the canonical PostScript name
        // can re-derive it from the bytes via fontkit.
        postScriptName: ref.familyName,
        familyName: ref.familyName,
        fileSizeBytes: bytes.byteLength,
      }),
    );
  }

  return assets;
}

/**
 * Walk `<p:embeddedFontLst><p:embeddedFont><p:font typeface="…"/>` and
 * collect (`<p:regular r:id="…"/>`) bindings. Bold / italic / bold-
 * italic relationships are folded into the same family today (we emit
 * a single asset per family on import; future work could split them
 * if the host project's model supports per-weight assets).
 */
function readEmbeddedFontList(presXml: string): readonly EmbeddedFontRef[] {
  const root = rootElement(parseOoxml(presXml));

  if (root === null) return [];

  const list = findDescendant(root, 'p:embeddedFontLst');

  if (list === null) return [];

  const refs: EmbeddedFontRef[] = [];

  for (const entry of findChildren(list, 'p:embeddedFont')) {
    const fontMeta = findChild(entry, 'p:font');
    const familyName = fontMeta !== null ? (getAttr(fontMeta, 'typeface') ?? '') : '';

    if (familyName.length === 0) continue;

    for (const variant of ['p:regular', 'p:bold', 'p:italic', 'p:boldItalic'] as const) {
      const variantNode = findChild(entry, variant);

      if (variantNode === null) continue;

      const relId = getAttr(variantNode, 'r:id') ?? getAttr(variantNode, 'id');

      if (relId === undefined || relId.length === 0) continue;

      refs.push({ relId, familyName });
    }
  }

  return refs;
}

const TTF_SIGNATURE = [0x00, 0x01, 0x00, 0x00];
const OTTO_SIGNATURE = [0x4f, 0x54, 0x54, 0x4f];

function detectFontFormat(bytes: Uint8Array): 'ttf' | 'otf' {
  if (bytes.byteLength < 4) return 'ttf';

  const header = Array.from(bytes.slice(0, 4));

  if (header.every((b, i) => b === OTTO_SIGNATURE[i])) return 'otf';
  if (header.every((b, i) => b === TTF_SIGNATURE[i])) return 'ttf';

  // Unknown / "true"-tagged TrueType / obfuscated → assume TTF; the
  // PptxEmbeddedFontAsset format is informational, not load-gated.
  return 'ttf';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }

  return btoa(binary);
}
