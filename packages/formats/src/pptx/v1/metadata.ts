import { projectFormatV1 } from '@broadset/model';

import { containsForbiddenXmlDeclaration } from '../../_shared/import-limits';
import { verifyBlobBytesV1 } from '../../v1';
import { findChildByNs, getText, parseOoxml, rootElement } from '../ooxml/ast';
import { escapeXmlAttribute, escapeXmlText, XML_DECLARATION } from '../ooxml/xml';
import type { OoxmlPackage } from '../ooxml/zip';
import { readTextPart } from '../ooxml/zip';

export const BROADSET_PROJECT_PART = 'customXml/broadset-project.xml';
export const BROADSET_INTEROP_PART = 'customXml/broadset-interop.xml';
export const BROADSET_CUSTOM_PROPERTIES_PART = 'docProps/custom.xml';

const BROADSET_METADATA_NS = 'https://broadset.io/ns/pptx/1.0/';
const BROADSET_XMP_NS = 'https://broadset.io/ns/xmp/1.0/';

export function buildProjectMetadataXml(project: projectFormatV1.BroadsetProjectV1): string {
  const canonicalJson = projectFormatV1.canonicalizeProjectV1(project);

  return `${XML_DECLARATION}<bset:project xmlns:bset="${BROADSET_METADATA_NS}" version="1"><bset:canonicalJson>${escapeXmlText(canonicalJson)}</bset:canonicalJson></bset:project>`;
}

export function buildInteropMetadataXml(interop: projectFormatV1.InteropRegistry): string {
  return `${XML_DECLARATION}<bset:interop xmlns:bset="${BROADSET_METADATA_NS}" version="1"><bset:interopJson>${escapeXmlText(JSON.stringify(interop))}</bset:interopJson></bset:interop>`;
}

export function buildCustomPropertiesXml(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly exportedAt: number;
}): string {
  const xmp = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:broadset="${BROADSET_XMP_NS}" broadset:projectId="${escapeXmlAttribute(input.project.id)}" broadset:documentId="${escapeXmlAttribute(input.document.id)}" broadset:version="1" broadset:exportedAt="${String(input.exportedAt)}"/></rdf:RDF>`;

  return `${XML_DECLARATION}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="BroadsetProject"><vt:lpwstr>${escapeXmlText(xmp)}</vt:lpwstr></property></Properties>`;
}

function projectJsonFromXml(xml: string): string | undefined {
  const root = rootElement(parseOoxml(xml));

  if (root === null) return undefined;

  const canonicalJson = findChildByNs(root, BROADSET_METADATA_NS, 'canonicalJson');

  return canonicalJson === null ? undefined : getText(canonicalJson);
}

export async function readProjectMetadataV1(pkg: OoxmlPackage): Promise<projectFormatV1.BroadsetProjectV1 | undefined> {
  const xml = readTextPart(pkg, BROADSET_PROJECT_PART);

  if (xml === null || containsForbiddenXmlDeclaration(xml)) return undefined;

  try {
    const json = projectJsonFromXml(xml);

    if (json === undefined) return undefined;

    const loaded = await projectFormatV1.loadProjectV1Json(json);

    return loaded.status === 'loaded' ? loaded.project : undefined;
  } catch {
    return undefined;
  }
}

interface MetadataBlobCollectionV1 {
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly diagnostics: readonly projectFormatV1.InteropDiagnostic[];
}

export async function collectMetadataBlobs(
  pkg: OoxmlPackage,
  project: projectFormatV1.BroadsetProjectV1,
): Promise<MetadataBlobCollectionV1> {
  const blobs = new Map<projectFormatV1.Sha256Digest, Uint8Array>();
  const diagnostics: projectFormatV1.InteropDiagnostic[] = [];
  const packagedByDigest = new Map<projectFormatV1.Sha256Digest, Uint8Array>();
  const rejectedDigests = new Set<projectFormatV1.Sha256Digest>();
  const verificationCache = new Map<string, Awaited<ReturnType<typeof verifyBlobBytesV1>>>();
  const entries: readonly (readonly [string, Uint8Array])[] = [...pkg.entries()];

  for (const entry of entries) {
    const path: string = entry[0];
    const bytes: Uint8Array = entry[1];

    if (!path.startsWith('ppt/media/broadset-') && !path.startsWith('ppt/fonts/broadset-')) continue;

    const fileName: string = path.slice(path.lastIndexOf('/') + 1);
    const digestText: string = fileName.slice('broadset-'.length, 'broadset-'.length + 64);
    const digest = projectFormatV1.sha256DigestSchema.safeParse(`sha256:${digestText}`);

    if (digest.success) packagedByDigest.set(digest.data, bytes);
  }

  for (const asset of project.resources.assets) {
    const bytes = packagedByDigest.get(asset.blob.digest);

    if (bytes === undefined) continue;

    const cacheKey = `${asset.blob.digest}:${String(asset.blob.byteLength)}`;
    let integrity = verificationCache.get(cacheKey);

    if (integrity === undefined) {
      integrity = await verifyBlobBytesV1({ reference: asset.blob, bytes });
      verificationCache.set(cacheKey, integrity);
    }

    if (integrity.status === 'verified' && !rejectedDigests.has(asset.blob.digest)) {
      blobs.set(asset.blob.digest, integrity.bytes);
    } else if (integrity.status === 'rejected') {
      rejectedDigests.add(asset.blob.digest);
      blobs.delete(asset.blob.digest);
      diagnostics.push({
        code: `pptx.blob-${integrity.failure.code}`,
        severity: 'error',
        message: integrity.failure.message,
        dimension: 'semantics',
        pointer: `/resources/assets/${asset.id}/blob`,
      });
    }
  }

  return { blobs, diagnostics };
}
