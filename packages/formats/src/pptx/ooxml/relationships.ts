import type { OoxmlRelationship, OoxmlRelId } from '../types';
import { findChildrenByNs, getAttr, parseOoxml, rootElement } from './ast';
import { XML_DECLARATION } from './xml';

const PACKAGE_RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/**
 * OOXML relationship allocator. A single PPTX part may carry many
 * relationships (image refs, rels to masters / layouts / notes /
 * custom-xml / theme); this helper enforces the `rId{n}` convention and
 * keeps allocation deterministic per part.
 */
export class RelationshipAllocator {
  #next: number;
  readonly #rels: OoxmlRelationship[] = [];

  constructor(start = 1) {
    this.#next = start;
  }

  /** Allocate a new `rId{n}` and register the relationship. */
  add(type: string, target: string, external?: boolean): OoxmlRelId {
    // The ID is always `rId` + a non-negative integer — the cast is a
    // narrowing from `rId${string}` (which `String(number)` produces)
    // to the equivalent `rId${number}` template-literal type.
    const id = `rId${String(this.#next)}` as OoxmlRelId;

    this.#next += 1;
    this.#rels.push({ id, type, target, ...(external ? { external: true } : {}) });

    return id;
  }

  /** Snapshot of the allocated relationships for serialization. */
  entries(): readonly OoxmlRelationship[] {
    return this.#rels;
  }
}

/** Serialize an `_rels/*.xml.rels` part for a collection of relationships. */
export function buildRelationshipsXml(rels: readonly OoxmlRelationship[]): string {
  const body = rels
    .map((r) => {
      const externalAttr = r.external === true ? ' TargetMode="External"' : '';

      return `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"${externalAttr}/>`;
    })
    .join('');

  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

/**
 * Parse a `_rels/*.xml.rels` part body into relationship records.
 * Tolerant of unknown attributes so future OOXML extensions don't break
 * the importer. Walks the XML AST so attribute order and quote style
 * are immaterial.
 */
export function parseRelationshipsXml(body: string): readonly OoxmlRelationship[] {
  const root = rootElement(parseOoxml(body));

  if (root === null) return [];
  if (root.local !== 'Relationships' || root.ns !== PACKAGE_RELS_NS) return [];

  const rels: OoxmlRelationship[] = [];

  for (const node of findChildrenByNs(root, PACKAGE_RELS_NS, 'Relationship')) {
    const id = getAttr(node, 'Id');
    const type = getAttr(node, 'Type');
    const target = getAttr(node, 'Target');
    const mode = getAttr(node, 'TargetMode');

    if (id === undefined || type === undefined || target === undefined) continue;
    if (!id.startsWith('rId')) continue;

    const rel: OoxmlRelationship =
      mode === 'External'
        ? { id: id as OoxmlRelId, type, target, external: true }
        : { id: id as OoxmlRelId, type, target };

    rels.push(rel);
  }

  return rels;
}
