import type { BroadsetDocument, BroadsetElement, FontAsset } from '@broadset/model';

import { subsetFont } from '../../_shared/fonts/subset';
import type { ContentTypesBuilder } from '../ooxml/content-types';
import { OOXML_CONTENT_TYPES, OOXML_REL_TYPES } from '../ooxml/namespaces';
import type { RelationshipAllocator } from '../ooxml/relationships';
import type { PptxExportWarning } from '../types';

/**
 * `<p:embeddedFontLst>` emission. Walks the document's text elements,
 * collects (familyName, codepoints) usage, and matches against the
 * caller-supplied {@link FontAsset} array. Each matched font is
 * subsetted via the shared `_shared/fonts/` subsetter, written as a
 * `ppt/fonts/font{N}.fntdata` part, and registered as a relationship
 * from `presentation.xml`.
 *
 * The returned `<p:embeddedFontLst>…</p:embeddedFontLst>` XML fragment
 * is spliced into `presentation.xml` after `<p:notesSz>` per the
 * ECMA-376 element order. When no fonts qualify the function returns
 * an empty string and no parts / rels are emitted.
 */

const FONT_PART_PREFIX = 'ppt/fonts/font';
const FONT_PART_EXT = 'fntdata';
const ASSET_FONT_FILE_EXTENSION_REGEX = /\.(ttf|otf|woff2?)$/i;

interface FontUsage {
  readonly familyName: string;
  readonly codepoints: ReadonlySet<number>;
}

interface EmbedResult {
  readonly relId: string;
  readonly partFileName: string;
  readonly familyName: string;
  readonly postScriptName: string;
}

interface AttachEmbeddedFontsArgs {
  readonly document: BroadsetDocument;
  readonly fontAssets: readonly FontAsset[];
  readonly parts: Map<string, Uint8Array>;
  readonly contentTypes: ContentTypesBuilder;
  readonly presRels: RelationshipAllocator;
  readonly warnings: PptxExportWarning[];
}

/**
 * Walk the document's elements collecting the codepoints each
 * `style.fontFamily` actually renders. Only text-bearing elements
 * contribute. Element-level `style.fontFamily` is the authoritative
 * font reference today — per-run families (which would need TextBody
 * runs) are not yet stored in the model.
 */
export function collectFontUsage(elements: readonly BroadsetElement[]): readonly FontUsage[] {
  const accumulator = new Map<string, Set<number>>();

  for (const element of elements) {
    const family = element.style.fontFamily;

    if (typeof family !== 'string' || family.length === 0) continue;

    const text = typeof element.content === 'string' ? element.content : '';

    if (text.length === 0) continue;

    const set = accumulator.get(family) ?? new Set<number>();

    for (const codepoint of text) {
      const cp = codepoint.codePointAt(0);

      if (typeof cp === 'number') set.add(cp);
    }

    accumulator.set(family, set);
  }

  return Array.from(accumulator, ([familyName, codepoints]) => ({ familyName, codepoints }));
}

/**
 * Decode the embedded data URI for a font asset. Returns null for
 * non-embedded sources (`url` / `file`) — those need an async
 * resolver supplied by the caller.
 */
function resolveFontBytes(asset: FontAsset): Uint8Array | null {
  if (asset.source.type !== 'embedded') return null;

  const dataUri = asset.source.dataUri;
  const commaIndex = dataUri.indexOf(',');

  if (commaIndex < 0) return null;

  const meta = dataUri.slice(0, commaIndex);
  const payload = dataUri.slice(commaIndex + 1);

  if (!meta.includes(';base64')) return null;

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

/**
 * Side-effect: writes one `ppt/fonts/font{N}.fntdata` part per
 * matched FontAsset and allocates the corresponding relationship.
 * Returns the `<p:embeddedFontLst>` XML fragment for the caller to
 * splice into `presentation.xml`.
 */
export function attachEmbeddedFonts({
  document,
  fontAssets,
  parts,
  contentTypes,
  presRels,
  warnings,
}: AttachEmbeddedFontsArgs): string {
  if (fontAssets.length === 0) return '';

  const usage = collectFontUsage(document.elements);

  if (usage.length === 0) return '';

  const usageByFamily = new Map(usage.map((u) => [u.familyName, u.codepoints] as const));
  const embeds: EmbedResult[] = [];

  let counter = 0;

  for (const asset of fontAssets) {
    const codepoints = usageByFamily.get(asset.familyName);

    if (codepoints === undefined || codepoints.size === 0) continue;

    const bytes = resolveFontBytes(asset);

    if (bytes === null) {
      warnings.push({
        code: 'font-embed-skipped',
        message: `Font "${asset.familyName}" not embedded — only assets with an "embedded" data-URI source are supported by the sync exporter.`,
      });
      continue;
    }

    const subset = subsetFont(bytes, codepoints);

    if (subset === null) {
      warnings.push({
        code: 'font-embed-skipped',
        message: `Font "${asset.familyName}" subsetting failed — emitting full font bytes instead.`,
      });
    }

    const finalBytes = subset ?? bytes;

    counter += 1;

    const partFileName = `font${String(counter)}.${FONT_PART_EXT}`;
    const partPath = `${FONT_PART_PREFIX}${String(counter)}.${FONT_PART_EXT}`;
    const relTarget = `fonts/${partFileName}`;
    const relId = presRels.add(OOXML_REL_TYPES.font, relTarget);

    parts.set(partPath, finalBytes);
    embeds.push({ relId, partFileName, familyName: asset.familyName, postScriptName: asset.postScriptName });
  }

  if (embeds.length === 0) return '';

  contentTypes.addDefault(FONT_PART_EXT, OOXML_CONTENT_TYPES.font);

  return `<p:embeddedFontLst>${embeds.map(buildEmbeddedFontXml).join('')}</p:embeddedFontLst>`;
}

function buildEmbeddedFontXml(embed: EmbedResult): string {
  const family = escapeXmlAttr(embed.familyName);

  return `<p:embeddedFont><p:font typeface="${family}"/><p:regular r:id="${embed.relId}"/></p:embeddedFont>`;
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Reverse direction: given a `BroadsetDocument`'s assets list, return
 * the subset that looks like fonts. Helper used by callers that load
 * the document via `import-document.ts` and want to surface fonts to
 * the exporter without manually filtering. Recognised by `kind:'font'`
 * (when the asset originates from BroadsetProject), or — when the
 * asset list is heterogeneous — by file extension on the source URL.
 */
export function isFontAssetCandidate(asset: { readonly mimeType?: string; readonly source?: { readonly type: string; readonly url?: string } }): boolean {
  if (typeof asset.mimeType === 'string' && asset.mimeType.startsWith('font/')) return true;

  const source = asset.source;

  if (source?.type !== 'url' || typeof source.url !== 'string') return false;

  return ASSET_FONT_FILE_EXTENSION_REGEX.test(source.url);
}
