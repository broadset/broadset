import type { ShapeNameTag } from '../types';

/**
 * Shape-name tagging. Every Broadset element is emitted with a
 * `<p:cNvPr name="BSET:{uuid}:{kind}[:{dataField}]"/>` tag. PowerPoint,
 * Keynote, and LibreOffice preserve shape names across save, so this is
 * the primary element-identity carrier.
 *
 * Encoding: colon-separated fields, never contains colons inside a field
 * (Broadset ids and kinds are both colon-free; dataField is user-authored
 * but we escape colons to `%3A` before concatenation).
 */

const TAG_PREFIX = 'BSET';

/**
 * Encode a {@link ShapeNameTag} to its `BSET:…` wire form.
 */
export function encodeShapeName(tag: ShapeNameTag): string {
  const id = escapeField(tag.id);
  const kind = escapeField(tag.kind);
  const parts: string[] = [TAG_PREFIX, id, kind];

  if (tag.dataField !== undefined && tag.dataField.length > 0) {
    parts.push(escapeField(tag.dataField));
  }

  return parts.join(':');
}

/**
 * Decode a shape name back into its {@link ShapeNameTag}. Returns `null`
 * when the name is not a Broadset tag (user may have renamed the shape
 * in PowerPoint) — callers must fall back to content-hash matching.
 */
export function decodeShapeName(name: string): ShapeNameTag | null {
  if (!name.startsWith(`${TAG_PREFIX}:`)) return null;

  const parts = name.split(':');

  if (parts.length < 3) return null;

  const id = unescapeField(parts[1] ?? '');
  const kind = unescapeField(parts[2] ?? '');

  if (id.length === 0 || kind.length === 0) return null;

  const dataFieldRaw = parts.slice(3).join(':');
  const dataField = dataFieldRaw.length > 0 ? unescapeField(dataFieldRaw) : undefined;

  return dataField === undefined ? { id, kind } : { id, kind, dataField };
}

/**
 * True when the given shape name contains a `BSET:` prefix even if the
 * rest is corrupted. Callers can use this to distinguish "user renamed
 * the shape" from "this was never a Broadset shape".
 */
export function hasBroadsetPrefix(name: string | undefined): boolean {
  return name?.startsWith(`${TAG_PREFIX}:`) === true;
}

function escapeField(field: string): string {
  return field.replace(/%/g, '%25').replace(/:/g, '%3A');
}

function unescapeField(field: string): string {
  return field.replace(/%3A/g, ':').replace(/%25/g, '%');
}
