import type { BroadsetDocument } from '@broadset/model';
import {
  type PDFContext,
  PDFDict,
  type PDFDocument,
  PDFName,
  type PDFPage,
  type PDFRef,
  PDFString,
} from 'pdf-lib';

const PROPERTIES_KEY = PDFName.of('Properties');
const RESOURCES_KEY = PDFName.of('Resources');

/**
 * Resource-dict name an OCG ref is registered under in a page's
 * `/Resources /Properties`. The `/OC <name> BDC` marked-content
 * operator references the ref via this name.
 */
export interface OcgResourceBinding {
  readonly pageId: string;
  readonly resourceName: PDFName;
  readonly ref: PDFRef;
}

export interface OcgRegistration {
  /** Map of Broadset page id → registered OCG reference. */
  readonly refsByPageId: ReadonlyMap<string, PDFRef>;
  /**
   * Map of Broadset element id → resource binding to use when wrapping
   * the element's painting in `/OC <name> BDC ... EMC`. Built during
   * registration by walking each Broadset page's `elements` array.
   */
  readonly bindingByElementId: ReadonlyMap<string, OcgResourceBinding>;
}

/**
 * Register one Optional Content Group per Broadset page and attach them
 * to the document catalog's `/OCProperties` dictionary (PDF 1.5+ layer
 * model). The default configuration enables every OCG so readers that
 * don't expose UI controls render the full content set.
 *
 * Per-element membership is wired here too: each Broadset page's
 * `elements: PageElementInstance[]` lists the elements that appear on
 * that page; the binding map lets the renderer wrap each element's
 * painting in `/OC <name> BDC ... EMC` so PDF readers can toggle
 * per-page visibility from the layers panel.
 */
export function registerPageOcgs(pdf: PDFDocument, doc: BroadsetDocument): OcgRegistration {
  const context = pdf.context;
  const refsByPageId = new Map<string, PDFRef>();
  const bindingByElementId = new Map<string, OcgResourceBinding>();
  const refs: PDFRef[] = [];

  let pageIndex = 0;

  for (const page of doc.pages) {
    const ocgRef = createOcg(context, page.name);
    const resourceName = PDFName.of(`BS_OC_${String(pageIndex)}`);

    refsByPageId.set(page.id, ocgRef);
    refs.push(ocgRef);

    for (const pageElement of page.elements) {
      // First page wins when an element appears on multiple pages —
      // the "primary" page assignment matches Broadset's first-page-
      // is-canonical rule for elements that exist across pages via
      // override layers.
      if (!bindingByElementId.has(pageElement.elementId)) {
        bindingByElementId.set(pageElement.elementId, {
          pageId: page.id,
          resourceName,
          ref: ocgRef,
        });
      }
    }

    pageIndex += 1;
  }

  if (refs.length === 0) {
    return { refsByPageId, bindingByElementId };
  }

  // /OCProperties carries the list of all OCGs plus a default config
  // (`/D`) declaring which are visible on load. Every OCG is on by
  // default — Broadset's visibility system lives at the element level,
  // not the OCG level.
  const ocgsArray = context.obj(refs);
  const defaultConfig = context.obj({
    Order: refs,
    ON: refs,
    OFF: [],
  });

  const ocProperties = context.obj({
    OCGs: ocgsArray,
    D: defaultConfig,
  });

  pdf.catalog.set(PDFName.of('OCProperties'), ocProperties);

  return { refsByPageId, bindingByElementId };
}

/**
 * Insert each page's OCG reference into the page's `/Resources
 * /Properties` dictionary under its bound resource name so the
 * marked-content `/OC <name> BDC` operator resolves to the OCG ref.
 *
 * Idempotent — calling twice with the same registration is a no-op
 * because the dict's `set` overwrites with the same value.
 */
export function attachOcgResourceBindings(
  pdf: PDFDocument,
  page: PDFPage,
  registration: OcgRegistration,
): void {
  if (registration.bindingByElementId.size === 0) return;

  const resources = readOrCreateResourcesDict(pdf, page);
  const properties = readOrCreatePropertiesDict(pdf, resources);
  const seen = new Set<string>();

  for (const binding of registration.bindingByElementId.values()) {
    const key = binding.resourceName.asString();

    if (seen.has(key)) continue;

    seen.add(key);
    properties.set(binding.resourceName, binding.ref);
  }
}

function createOcg(context: PDFContext, name: string): PDFRef {
  const ocgDict = context.obj({
    Type: 'OCG',
    Name: PDFString.of(name),
  });

  return context.register(ocgDict);
}

function readOrCreateResourcesDict(pdf: PDFDocument, page: PDFPage): PDFDict {
  const existing = page.node.Resources();

  if (existing !== undefined) {
    return existing;
  }

  const created = PDFDict.withContext(pdf.context);

  page.node.set(RESOURCES_KEY, created);

  return created;
}

function readOrCreatePropertiesDict(pdf: PDFDocument, resources: PDFDict): PDFDict {
  const existing = resources.lookupMaybe(PROPERTIES_KEY, PDFDict);

  if (existing !== undefined) return existing;

  const created = PDFDict.withContext(pdf.context);

  resources.set(PROPERTIES_KEY, created);

  return created;
}
