import type { projectFormatV1 as ProjectFormatV1 } from '@broadset/model';
import { projectFormatV1 } from '@broadset/model';

import { computeSha256DigestV1, packageBlobReferenceV1 } from './blob-reference';

const DIGEST_PREFIX = 'sha256:';
const DEFAULT_PIXEL_SIZE = 1;
const DEFAULT_BIT_DEPTH = 8;
const DEFAULT_FONT_WEIGHT = 400;
const DEFAULT_FONT_STRETCH = 1;

export interface ResourceCollectionV1 {
  readonly resources: ProjectFormatV1.ProjectResources;
  readonly blobs: ReadonlyMap<ProjectFormatV1.Sha256Digest, Uint8Array>;
}

export interface ResourceCollectorV1 {
  addImageAsset(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
    readonly pixelSize?: readonly [number, number];
  }): Promise<ProjectFormatV1.Id>;
  addMissingImageAsset(input: {
    readonly reference: string;
    readonly mediaType?: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
    readonly pixelSize?: readonly [number, number];
  }): Promise<ProjectFormatV1.Id>;
  addFontAsset(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
  }): Promise<ProjectFormatV1.Id>;
  addVectorAsset(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
    readonly intrinsicBounds: ProjectFormatV1.AssetIntrinsicMetadata['intrinsicBounds'];
  }): Promise<ProjectFormatV1.Id>;
  addForeignAsset(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
    readonly intrinsicBounds: ProjectFormatV1.AssetIntrinsicMetadata['intrinsicBounds'];
  }): Promise<ProjectFormatV1.Id>;
  addFontFamily(input: {
    readonly familyName: string;
    readonly faces: readonly ProjectFormatV1.FontFaceResource[];
    readonly id?: ProjectFormatV1.Id;
  }): ProjectFormatV1.Id;
  collect(): ResourceCollectionV1;
}

function contentAddressedId(prefix: string, digest: ProjectFormatV1.Sha256Digest): ProjectFormatV1.Id {
  return projectFormatV1.idSchema.parse(`${prefix}-${digest.slice(DIGEST_PREFIX.length)}`);
}

function validName(name: string | undefined, fallback: string): string {
  return name === undefined || name.trim().length === 0 ? fallback : name;
}

function positiveInteger(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_PIXEL_SIZE;
}

function fontFormat(mediaType: string): ProjectFormatV1.FontAsset['metadata']['format'] {
  const normalized = mediaType.toLowerCase();

  if (normalized.includes('woff2')) return 'woff2';
  if (normalized.includes('woff')) return 'woff';
  if (normalized.includes('ttf') || normalized.includes('truetype')) return 'truetype';
  if (normalized.includes('type1')) return 'type1';
  if (normalized.includes('collection')) return 'collection';

  return 'opentype';
}

export function createResourceCollectorV1(): ResourceCollectorV1 {
  const assets = new Map<ProjectFormatV1.Id, ProjectFormatV1.Asset>();
  const fonts = new Map<ProjectFormatV1.Id, ProjectFormatV1.FontFamilyResource>();
  const blobs = new Map<ProjectFormatV1.Sha256Digest, Uint8Array>();
  let familySequence = 0;

  async function addImageAsset(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
    readonly pixelSize?: readonly [number, number];
  }): Promise<ProjectFormatV1.Id> {
    const bytes = Uint8Array.from(input.bytes);
    const blob = await packageBlobReferenceV1(bytes, input.mediaType);
    const assetId = input.id ?? contentAddressedId('asset', blob.digest);
    const [pixelWidth, pixelHeight] = input.pixelSize ?? [DEFAULT_PIXEL_SIZE, DEFAULT_PIXEL_SIZE];
    const asset: ProjectFormatV1.ImageAsset = {
      id: assetId,
      kind: 'image',
      name: validName(input.name, 'Imported image'),
      blob,
      metadata: {
        pixelWidth: positiveInteger(pixelWidth),
        pixelHeight: positiveInteger(pixelHeight),
        orientation: 1,
        hasAlpha: false,
        bitDepth: DEFAULT_BIT_DEPTH,
        colorModel: 'unknown',
      },
    };

    blobs.set(blob.digest, bytes);
    // First registration wins when a caller reuses an explicit id for different content.
    if (!assets.has(assetId)) assets.set(assetId, asset);

    return assetId;
  }

  async function addMissingImageAsset(input: {
    readonly reference: string;
    readonly mediaType?: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
    readonly pixelSize?: readonly [number, number];
  }): Promise<ProjectFormatV1.Id> {
    const digest = await computeSha256DigestV1(new TextEncoder().encode(input.reference));
    const assetId = input.id ?? contentAddressedId('asset', digest);
    const [pixelWidth, pixelHeight] = input.pixelSize ?? [DEFAULT_PIXEL_SIZE, DEFAULT_PIXEL_SIZE];
    const asset: ProjectFormatV1.ImageAsset = {
      id: assetId,
      kind: 'image',
      name: validName(input.name, 'External image'),
      blob: {
        digest,
        byteLength: 0,
        mediaType: input.mediaType ?? 'application/octet-stream',
        source: { kind: 'missing', ...(input.reference === '' ? {} : { lastKnownName: input.reference }) },
      },
      metadata: {
        pixelWidth: positiveInteger(pixelWidth),
        pixelHeight: positiveInteger(pixelHeight),
        orientation: 1,
        hasAlpha: false,
        bitDepth: DEFAULT_BIT_DEPTH,
        colorModel: 'unknown',
      },
    };

    if (!assets.has(assetId)) assets.set(assetId, asset);

    return assetId;
  }

  async function addFontAsset(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
  }): Promise<ProjectFormatV1.Id> {
    const bytes = Uint8Array.from(input.bytes);
    const blob = await packageBlobReferenceV1(bytes, input.mediaType);
    const assetId = input.id ?? contentAddressedId('font', blob.digest);
    const name = validName(input.name, 'Imported font');
    const asset: ProjectFormatV1.FontAsset = {
      id: assetId,
      kind: 'font',
      name,
      blob,
      metadata: {
        format: fontFormat(input.mediaType),
        postScriptName: name,
        family: name,
        weight: DEFAULT_FONT_WEIGHT,
        style: 'normal',
        stretch: DEFAULT_FONT_STRETCH,
        variableAxes: [],
        unicodeCoverage: [],
        embeddingPermissions: 'restricted',
      },
    };

    blobs.set(blob.digest, bytes);
    if (!assets.has(assetId)) assets.set(assetId, asset);

    return assetId;
  }

  async function addVectorAsset(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
    readonly intrinsicBounds: ProjectFormatV1.AssetIntrinsicMetadata['intrinsicBounds'];
  }): Promise<ProjectFormatV1.Id> {
    const bytes = Uint8Array.from(input.bytes);
    const blob = await packageBlobReferenceV1(bytes, input.mediaType);
    const assetId = input.id ?? contentAddressedId('vector', blob.digest);
    const asset: ProjectFormatV1.VectorAsset = {
      id: assetId,
      kind: 'vector',
      name: validName(input.name, 'Imported vector'),
      blob,
      metadata: { intrinsicBounds: input.intrinsicBounds },
    };

    blobs.set(blob.digest, bytes);
    if (!assets.has(assetId)) assets.set(assetId, asset);

    return assetId;
  }

  async function addForeignAsset(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly name?: string;
    readonly id?: ProjectFormatV1.Id;
    readonly intrinsicBounds: ProjectFormatV1.AssetIntrinsicMetadata['intrinsicBounds'];
  }): Promise<ProjectFormatV1.Id> {
    const bytes = Uint8Array.from(input.bytes);
    const blob = await packageBlobReferenceV1(bytes, input.mediaType);
    const assetId = input.id ?? contentAddressedId('foreign', blob.digest);
    const asset: ProjectFormatV1.ForeignAsset = {
      id: assetId,
      kind: 'foreign',
      name: validName(input.name, 'Imported foreign asset'),
      blob,
      metadata: { intrinsicBounds: input.intrinsicBounds },
    };

    blobs.set(blob.digest, bytes);
    if (!assets.has(assetId)) assets.set(assetId, asset);

    return assetId;
  }


  function addFontFamily(input: {
    readonly familyName: string;
    readonly faces: readonly ProjectFormatV1.FontFaceResource[];
    readonly id?: ProjectFormatV1.Id;
  }): ProjectFormatV1.Id {
    familySequence += 1;

    const familyId = input.id ?? projectFormatV1.idSchema.parse(`family-${String(familySequence)}`);

    if (!fonts.has(familyId)) {
      fonts.set(familyId, {
        id: familyId,
        familyName: validName(input.familyName, 'Imported font family'),
        fallbackFontIds: [],
        faces: [...input.faces],
      });
    }

    return familyId;
  }

  function collect(): ResourceCollectionV1 {
    return {
      resources: {
        assets: [...assets.values()],
        fonts: [...fonts.values()],
        swatches: [],
        variables: [],
        styles: [],
        outputProfiles: [],
      },
      blobs: new Map(blobs),
    };
  }

  return {
    addImageAsset,
    addMissingImageAsset,
    addFontAsset,
    addVectorAsset,
    addForeignAsset,
    addFontFamily,
    collect,
  };
}
