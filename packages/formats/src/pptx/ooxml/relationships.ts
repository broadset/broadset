import type { OoxmlRelationship, OoxmlRelId } from '../types';
import { XML_DECLARATION } from './xml';

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
 * the importer.
 */
export function parseRelationshipsXml(body: string): readonly OoxmlRelationship[] {
  const rels: OoxmlRelationship[] = [];
  // Match `<Relationship …/>` but NOT the wrapping `<Relationships …>`
  // element. The attribute list may contain `/` (URLs in Type) and `>`
  // never appears unescaped inside an attribute value, so we key off the
  // self-closing `/>` terminator.
  const re = /<Relationship(?![a-zA-Z])\s+([^>]+?)\s*\/>/g;

  for (const match of body.matchAll(re)) {
    const attrs = match[1] ?? '';
    const id = attrs.match(/\bId="([^"]*)"/)?.[1];
    const type = attrs.match(/\bType="([^"]*)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]*)"/)?.[1];
    const mode = attrs.match(/\bTargetMode="([^"]*)"/)?.[1];

    if (!id || !type || !target) continue;
    if (!id.startsWith('rId')) continue;

    const rel: OoxmlRelationship =
      mode === 'External'
        ? { id: id as OoxmlRelId, type, target, external: true }
        : { id: id as OoxmlRelId, type, target };

    rels.push(rel);
  }

  return rels;
}
