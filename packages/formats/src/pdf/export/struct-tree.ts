import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { type PDFDocument, PDFName, type PDFPage } from 'pdf-lib';

/**
 * Emit the minimal `/StructTreeRoot` + `/MarkInfo` machinery PDF/A-2a
 * (ISO 19005-2 §6.7) requires for tagged-PDF accessibility.
 *
 * The structure tree is intentionally flat: one structure element per
 * Broadset element, parented under a single document-level Document
 * structure element. Real assistive tech needs richer hierarchy
 * (paragraphs, lists, tables) to fully utilise a tag tree, but a flat
 * tree is sufficient to satisfy the validator's structural floor and
 * lets every painted element carry an alt-text / actual-text
 * description in future iterations.
 *
 * Role mapping (Broadset element kind → PDF structure type):
 * - `text` → `Span` (inline text runs)
 * - `image` / `svg` / `qrcode` → `Figure` (graphic content)
 * - `rectangle` / `ellipse` / `path` → `Figure` (vector shapes)
 * - `group` → `Form` (a logical container)
 * - `clock` / `ticker` / `video` → `Figure` (rendered as static graphics in PDF)
 */
export function attachPdfaStructureTree(pdf: PDFDocument, page: PDFPage, doc: BroadsetDocument): void {
  if (doc.elements.length === 0) {
    attachEmptyStructureTree(pdf);

    return;
  }

  const pageRef = pdf.context.getObjectRef(page.node);

  if (pageRef === undefined) return;

  const structTreeRootRef = pdf.context.nextRef();
  const documentStructRef = pdf.context.nextRef();
  const elementStructRefs = doc.elements.map(() => pdf.context.nextRef());

  // Emit a structure element per Broadset element. Each element points
  // at its parent (the document structure element) and references the
  // page where it's painted.
  for (let i = 0; i < doc.elements.length; i++) {
    const element = doc.elements[i];
    const ref = elementStructRefs[i];

    if (element === undefined || ref === undefined) continue;

    pdf.context.assign(
      ref,
      pdf.context.obj({
        Type: 'StructElem',
        S: structureTypeForElement(element),
        P: documentStructRef,
        Pg: pageRef,
        Alt: alternateTextForElement(element),
      }),
    );
  }

  // Document structure element — the root container for every element
  // structure in the page. /K is the array of children.
  pdf.context.assign(
    documentStructRef,
    pdf.context.obj({
      Type: 'StructElem',
      S: 'Document',
      P: structTreeRootRef,
      K: elementStructRefs,
    }),
  );

  // /StructTreeRoot — the catalog-level entry. /K points to the root
  // document structure element, /ParentTree is required by the spec
  // (we emit a minimal ParentTree with no entries since none of our
  // structure elements need MCID lookups in the current flat tree).
  const parentTreeRef = pdf.context.register(pdf.context.obj({ Nums: [] }));

  pdf.context.assign(
    structTreeRootRef,
    pdf.context.obj({
      Type: 'StructTreeRoot',
      K: documentStructRef,
      ParentTree: parentTreeRef,
      ParentTreeNextKey: 0,
    }),
  );

  pdf.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);
  pdf.catalog.set(
    PDFName.of('MarkInfo'),
    pdf.context.obj({ Marked: true }),
  );

  // PDF/A-2a (ISO 19005-2 §6.2.10) requires a /Lang entry on either
  // the catalog or each structure element. Default to English; future
  // work can read a per-document language declaration off the model.
  pdf.catalog.set(PDFName.of('Lang'), pdf.context.obj('en-US'));
}

function attachEmptyStructureTree(pdf: PDFDocument): void {
  const structTreeRootRef = pdf.context.register(
    pdf.context.obj({
      Type: 'StructTreeRoot',
      ParentTree: pdf.context.obj({ Nums: [] }),
      ParentTreeNextKey: 0,
    }),
  );

  pdf.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);
  pdf.catalog.set(PDFName.of('MarkInfo'), pdf.context.obj({ Marked: true }));
  pdf.catalog.set(PDFName.of('Lang'), pdf.context.obj('en-US'));
}

function structureTypeForElement(element: BroadsetElement): string {
  switch (element.type) {
    case 'text':
      return 'Span';
    case 'group':
      return 'Form';
    case 'image':
    case 'svg':
    case 'qrcode':
    case 'rectangle':
    case 'ellipse':
    case 'path':
    case 'video':
    case 'clock':
    case 'ticker':
      return 'Figure';
    default:
      return 'Figure';
  }
}

function alternateTextForElement(element: BroadsetElement): string {
  // PDF/A-2a §6.7.1 requires alternative text on every Figure. Use
  // the element's name when set; otherwise fall back to a kind label
  // so screen-readers can at least identify the type.
  if (element.name.trim().length > 0) return element.name;

  return `${element.type} element`;
}
