import type { BroadsetDocument, BroadsetElement, FontAsset, TextBody } from '@broadset/model';

import { subsetFont } from '../../_shared/fonts/subset';
import type { ContentTypesBuilder } from '../ooxml/content-types';
import { OOXML_CONTENT_TYPES, OOXML_REL_TYPES } from '../ooxml/namespaces';
import type { RelationshipAllocator } from '../ooxml/relationships';
import type { AsyncFontResolver, PptxExportWarning } from '../types';

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

interface AttachEmbeddedFontsAsyncArgs extends AttachEmbeddedFontsArgs {
  readonly resolveFontBytes?: AsyncFontResolver;
  readonly fontFetchTimeoutMs?: number;
  readonly fontMaxBytes?: number;
}

const DEFAULT_FONT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_FONT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Walk the document's elements collecting the codepoints each font
 * family actually renders.
 *
 * Three contribution paths:
 *
 *   1. Element-level `style.fontFamily` plus a plain-string content.
 *   2. Each run inside a `TextBody` content — runs may override the
 *      element-level family via `run.props.style.fontFamily`.
 *      Mixed-language text bodies (e.g. a Latin run + a CJK run)
 *      use this path so each family gets only the codepoints it
 *      actually renders.
 *   3. Runs without a per-run family fall back to the element's
 *      `style.fontFamily`.
 *
 * Without (2) the importer / exporter would only embed the element's
 * primary family, leaving CJK / RTL runs to render with the
 * consumer's fallback font even though the user picked a specific
 * face.
 */
export function collectFontUsage(elements: readonly BroadsetElement[]): readonly FontUsage[] {
  const accumulator = new Map<string, Set<number>>();
  const addCodepoints = (family: string, text: string): void => {
    if (family.length === 0 || text.length === 0) return;

    const set = accumulator.get(family) ?? new Set<number>();

    for (const codepoint of text) {
      const cp = codepoint.codePointAt(0);

      if (typeof cp === 'number') set.add(cp);
    }

    accumulator.set(family, set);
  };

  for (const element of elements) {
    const elementFamily = typeof element.style.fontFamily === 'string' ? element.style.fontFamily : '';
    const content = element.content;

    if (typeof content === 'string') {
      addCodepoints(elementFamily, content);
      continue;
    }

    if (isTextBody(content)) {
      collectTextBodyUsage(content, elementFamily, addCodepoints);
    }
  }

  return Array.from(accumulator, ([familyName, codepoints]) => ({ familyName, codepoints }));
}

function collectTextBodyUsage(
  body: TextBody,
  elementFamily: string,
  addCodepoints: (family: string, text: string) => void,
): void {
  for (const paragraph of body.paragraphs) {
    for (const run of paragraph.runs) {
      const runFamily = readRunFontFamily(run.props?.style);

      addCodepoints(runFamily.length > 0 ? runFamily : elementFamily, run.text);
    }
  }
}

function readRunFontFamily(style: Readonly<Record<string, unknown>> | undefined): string {
  if (style === undefined) return '';

  const family = style['fontFamily'];

  return typeof family === 'string' ? family : '';
}

function isTextBody(value: unknown): value is TextBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { readonly paragraphs?: unknown }).paragraphs)
  );
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
  return finaliseEmbeds(
    contentTypes,
    embedSync({
      document,
      fontAssets,
      parts,
      presRels,
      warnings,
    }),
  );
}

interface SyncEmbedArgs {
  readonly document: BroadsetDocument;
  readonly fontAssets: readonly FontAsset[];
  readonly parts: Map<string, Uint8Array>;
  readonly presRels: RelationshipAllocator;
  readonly warnings: PptxExportWarning[];
}

interface UsageMatch {
  readonly asset: FontAsset;
  readonly codepoints: ReadonlySet<number>;
}

function collectMatchedUsage(document: BroadsetDocument, fontAssets: readonly FontAsset[]): readonly UsageMatch[] {
  if (fontAssets.length === 0) return [];

  const usage = collectFontUsage(document.elements);

  if (usage.length === 0) return [];

  const usageByFamily = new Map(usage.map((u) => [u.familyName, u.codepoints] as const));
  const matches: UsageMatch[] = [];

  for (const asset of fontAssets) {
    const codepoints = usageByFamily.get(asset.familyName);

    if (codepoints === undefined || codepoints.size === 0) continue;

    matches.push({ asset, codepoints });
  }

  return matches;
}

function embedSync({ document, fontAssets, parts, presRels, warnings }: SyncEmbedArgs): readonly EmbedResult[] {
  const matches = collectMatchedUsage(document, fontAssets);
  const embeds: EmbedResult[] = [];
  let counter = 0;

  for (const match of matches) {
    const bytes = resolveFontBytes(match.asset);

    if (bytes === null) {
      warnings.push({
        code: 'font-embed-skipped',
        message: `Font "${match.asset.familyName}" not embedded — only assets with an "embedded" data-URI source are supported by the sync exporter.`,
      });
      continue;
    }

    counter += 1;
    embeds.push(writeFontPart(match.asset, bytes, match.codepoints, counter, parts, presRels, warnings));
  }

  return embeds;
}

/**
 * Async font-embedding path — used by {@link buildPptxPackageWithReport}.
 * Falls back to the sync resolver for `embedded` sources, then routes
 * `url` / `file` sources through the caller-supplied
 * {@link AsyncFontResolver} with a per-font abort timeout and byte
 * cap. Returning null from the resolver, throwing inside it, and
 * exceeding the byte cap each surface a `font-embed-skipped` warning
 * — the export still produces a valid `.pptx`, the consumer just
 * substitutes a fallback font for the missing family at render time.
 */
export async function attachEmbeddedFontsAsync({
  document,
  fontAssets,
  parts,
  contentTypes,
  presRels,
  warnings,
  resolveFontBytes: resolveAsync,
  fontFetchTimeoutMs = DEFAULT_FONT_FETCH_TIMEOUT_MS,
  fontMaxBytes = DEFAULT_FONT_MAX_BYTES,
}: AttachEmbeddedFontsAsyncArgs): Promise<string> {
  const matches = collectMatchedUsage(document, fontAssets);
  const embeds: EmbedResult[] = [];
  let counter = 0;

  for (const match of matches) {
    const bytes = await resolveBytes(match.asset, { resolveAsync, timeoutMs: fontFetchTimeoutMs, maxBytes: fontMaxBytes, warnings });

    if (bytes === null) continue;

    counter += 1;
    embeds.push(writeFontPart(match.asset, bytes, match.codepoints, counter, parts, presRels, warnings));
  }

  return finaliseEmbeds(contentTypes, embeds);
}

function finaliseEmbeds(contentTypes: ContentTypesBuilder, embeds: readonly EmbedResult[]): string {
  if (embeds.length === 0) return '';

  contentTypes.addDefault(FONT_PART_EXT, OOXML_CONTENT_TYPES.font);

  return `<p:embeddedFontLst>${embeds.map(buildEmbeddedFontXml).join('')}</p:embeddedFontLst>`;
}

interface ResolveBytesArgs {
  readonly resolveAsync: AsyncFontResolver | undefined;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly warnings: PptxExportWarning[];
}

async function resolveBytes(asset: FontAsset, args: ResolveBytesArgs): Promise<Uint8Array | null> {
  const sync = resolveFontBytes(asset);

  if (sync !== null) return sync;

  const resolver = args.resolveAsync;

  if (resolver === undefined) {
    args.warnings.push({
      code: 'font-embed-skipped',
      message: `Font "${asset.familyName}" not embedded — non-embedded source ("${asset.source.type}") and no async resolveFontBytes was supplied.`,
    });

    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, args.timeoutMs);

  try {
    const fetched = await resolver(asset, controller.signal);

    if (fetched === null) {
      args.warnings.push({
        code: 'font-embed-skipped',
        message: `Font "${asset.familyName}" resolver returned null — no bytes to embed.`,
      });

      return null;
    }

    if (fetched.byteLength > args.maxBytes) {
      args.warnings.push({
        code: 'font-embed-skipped',
        message: `Font "${asset.familyName}" exceeded the ${String(args.maxBytes)}-byte cap (${String(fetched.byteLength)} bytes); not embedded.`,
      });

      return null;
    }

    return fetched;
  } catch (err) {
    args.warnings.push({
      code: 'font-embed-skipped',
      message: `Font "${asset.familyName}" resolver threw — not embedded.`,
      detail: err instanceof Error ? err.message : 'unknown resolver error',
    });

    return null;
  } finally {
    clearTimeout(timer);
  }
}

function writeFontPart(
  asset: FontAsset,
  bytes: Uint8Array,
  codepoints: ReadonlySet<number>,
  counter: number,
  parts: Map<string, Uint8Array>,
  presRels: RelationshipAllocator,
  warnings: PptxExportWarning[],
): EmbedResult {
  const subset = subsetFont(bytes, codepoints);

  if (subset === null) {
    warnings.push({
      code: 'font-embed-skipped',
      message: `Font "${asset.familyName}" subsetting failed — emitting full font bytes instead.`,
    });
  }

  const finalBytes = subset ?? bytes;
  const partFileName = `font${String(counter)}.${FONT_PART_EXT}`;
  const partPath = `${FONT_PART_PREFIX}${String(counter)}.${FONT_PART_EXT}`;
  const relTarget = `fonts/${partFileName}`;
  const relId = presRels.add(OOXML_REL_TYPES.font, relTarget);

  parts.set(partPath, finalBytes);

  return { relId, partFileName, familyName: asset.familyName, postScriptName: asset.postScriptName };
}

/**
 * Default async font resolver. Calls global `fetch` with the export
 * pipeline's abort signal so the resolver inherits the per-font
 * timeout. Reads the response stream up to the byte cap and aborts
 * on overflow — protects against an unbounded server response. Only
 * acts on `url` sources; `file` sources are skipped (Node-only file
 * I/O is the host's responsibility, not the formats package).
 */
export function defaultUrlFontResolver(maxBytes: number = DEFAULT_FONT_MAX_BYTES): AsyncFontResolver {
  return async (asset, signal) => {
    if (asset.source.type !== 'url') return null;

    const response = await fetch(asset.source.url, { signal });

    if (!response.ok) {
      throw new Error(`HTTP ${String(response.status)} ${response.statusText}`);
    }

    const contentLengthHeader = response.headers.get('content-length');

    if (contentLengthHeader !== null) {
      const declared = Number.parseInt(contentLengthHeader, 10);

      if (Number.isFinite(declared) && declared > maxBytes) {
        throw new Error(`Content-Length ${String(declared)} exceeds ${String(maxBytes)}-byte cap`);
      }
    }

    const buffer = await response.arrayBuffer();

    if (buffer.byteLength > maxBytes) {
      throw new Error(`Body ${String(buffer.byteLength)} bytes exceeds ${String(maxBytes)}-byte cap`);
    }

    return new Uint8Array(buffer);
  };
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
