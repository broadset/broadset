import { OOXML_CONTENT_TYPES } from './namespaces';
import { XML_DECLARATION } from './xml';

/**
 * `[Content_Types].xml` orchestration. Every PPTX package has a root
 * `[Content_Types].xml` that declares:
 *
 *   - `<Default Extension="…" ContentType="…"/>` per file extension
 *     (`rels`, `xml`, `jpeg`, `png`, …).
 *   - `<Override PartName="…" ContentType="…"/>` per individual part
 *     (every slide, every master, every layout, every notesSlide,
 *     custom XML parts, docProps).
 *
 * PowerPoint rejects packages that omit any declared part's content
 * type, so the exporter must track every part it writes and append it
 * to the content-types builder before finalizing the ZIP.
 */

export interface ContentTypeDefault {
  readonly extension: string;
  readonly contentType: string;
}

export interface ContentTypeOverride {
  readonly partName: string;
  readonly contentType: string;
}

export class ContentTypesBuilder {
  readonly #defaults: ContentTypeDefault[] = [];
  readonly #overrides: ContentTypeOverride[] = [];
  readonly #seenExt = new Set<string>();
  readonly #seenPart = new Set<string>();

  constructor() {
    // Every PPTX package has these two defaults.
    this.addDefault('rels', OOXML_CONTENT_TYPES.rels);
    this.addDefault('xml', 'application/xml');
  }

  addDefault(extension: string, contentType: string): void {
    if (this.#seenExt.has(extension)) return;
    this.#seenExt.add(extension);
    this.#defaults.push({ extension, contentType });
  }

  addOverride(partName: string, contentType: string): void {
    const key = partName.startsWith('/') ? partName : `/${partName}`;

    if (this.#seenPart.has(key)) return;
    this.#seenPart.add(key);
    this.#overrides.push({ partName: key, contentType });
  }

  /** Serialize the builder to an `[Content_Types].xml` body. */
  build(): string {
    const defaults = this.#defaults
      .map((d) => `<Default Extension="${d.extension}" ContentType="${d.contentType}"/>`)
      .join('');
    const overrides = this.#overrides
      .map((o) => `<Override PartName="${o.partName}" ContentType="${o.contentType}"/>`)
      .join('');

    return `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}${overrides}</Types>`;
  }
}
