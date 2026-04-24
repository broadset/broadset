import type { BroadsetDocument } from '@broadset/model';
import { type PDFContext, type PDFDocument, PDFName, type PDFRef, PDFString } from 'pdf-lib';

export interface OcgRegistration {
  /** Map of Broadset page id → registered OCG reference. */
  readonly refsByPageId: ReadonlyMap<string, PDFRef>;
}

/**
 * Register one Optional Content Group per Broadset page and attach them
 * to the document catalog's `/OCProperties` dictionary (PDF 1.5+ layer
 * model). The default configuration enables every OCG so readers that
 * don't expose UI controls render the full content set.
 *
 * Multi-page Broadset documents map to multiple OCGs on the single PDF
 * page — matching the spec's "one OCG per page" statement. Assigning
 * specific elements to a specific OCG (via marked-content `/OC` wrappers)
 * depends on the multi-page-per-PDF-page rendering model that lands with
 * the dedicated multi-page exporter; the current single-PDF-page pipeline
 * registers the OCGs so PDF readers still list Broadset page names in
 * their layer UI.
 */
export function registerPageOcgs(pdf: PDFDocument, doc: BroadsetDocument): OcgRegistration {
  const context = pdf.context;
  const refsByPageId = new Map<string, PDFRef>();
  const refs: PDFRef[] = [];

  for (const page of doc.pages) {
    const ocgRef = createOcg(context, page.name);

    refsByPageId.set(page.id, ocgRef);
    refs.push(ocgRef);
  }

  if (refs.length === 0) {
    return { refsByPageId };
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

  return { refsByPageId };
}

function createOcg(context: PDFContext, name: string): PDFRef {
  const ocgDict = context.obj({
    Type: 'OCG',
    Name: PDFString.of(name),
  });

  return context.register(ocgDict);
}
