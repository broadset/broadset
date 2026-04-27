import { XMLParser } from 'fast-xml-parser';

/**
 * Namespace-aware OOXML XML read / write wrappers. Replaces the regex
 * parsing the old implementation used. Every PPTX XML part (slide,
 * master, layout, theme, rels, content-types) routes through this
 * module.
 *
 * Security posture: fast-xml-parser does NOT follow external entities
 * (so external-DTD XXE is not a vector), and it does NOT recursively
 * expand DTD-declared entities (so billion-laughs depth-multiplication
 * is bounded). However, with `processEntities: true` the library DOES
 * expand DTD entities by one level on the matched text. Because of
 * that, `pptx/import.ts` rejects any XML part whose raw text contains
 * a `<!DOCTYPE>` declaration before this parser is reached — Office-
 * authored OOXML never emits DTDs, so a DOCTYPE in the wild is a
 * crafted payload. That pre-parse rejection is what satisfies the
 * cross-format Entity Expansion Hardening requirement in `spec.md`.
 */

/**
 * Parser options chosen for OOXML:
 *
 * - `ignoreAttributes: false` — OOXML puts most data in attributes.
 * - `attributeNamePrefix: '@_'` — stable attribute marker independent of
 *   any element name.
 * - `allowBooleanAttributes: false` — every attribute has a value.
 * - `parseAttributeValue: false` / `parseTagValue: false` — keep values
 *   as strings so importers own the coercion (`"1"` vs `"true"`).
 * - `preserveOrder: true` — slide children order is significant (z-order).
 * - `trimValues: false` — `<a:t>` text must preserve leading / trailing
 *   whitespace exactly.
 * - `processEntities: true` — decode standard XML entities (`&amp;`
 *   etc.); the library does NOT expand DTD-declared entities.
 */
const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: true,
  trimValues: false,
  processEntities: true,
} as const;

const parser = new XMLParser(PARSER_OPTIONS);

/**
 * Parse an OOXML XML string into fast-xml-parser's `preserveOrder` node
 * array. Returns `null` for empty / whitespace-only input so callers can
 * branch on optional parts.
 */
export function parseXml(input: string): unknown {
  if (input.trim().length === 0) return null;

  return parser.parse(input) as unknown;
}

/**
 * Escape a string for safe use as XML text content. Attribute escaping
 * goes through {@link escapeXmlAttribute} because `"` is only significant
 * inside attribute quotes.
 */
export function escapeXmlText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape a string for safe use as an XML attribute value. */
export function escapeXmlAttribute(input: string): string {
  return escapeXmlText(input).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Standard XML declaration header for OOXML parts. */
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
