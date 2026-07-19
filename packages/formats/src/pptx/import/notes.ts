import {
  findDescendant,
  findDescendants,
  getAttr,
  getText,
  parseOoxml,
  rootElement,
  type XmlElement,
} from '../ooxml/ast';
import { OOXML_REL_TYPES } from '../ooxml/namespaces';
import type { parseRelationshipsXml } from '../ooxml/relationships';
import { type OoxmlPackage, readTextPart } from '../ooxml/zip';

/**
 * Read a slide's notes body by following its `notesSlide` relationship.
 */
export function extractSlideNotes(
  pkg: OoxmlPackage,
  slidePath: string,
  slideRels: ReturnType<typeof parseRelationshipsXml>,
): string | null {
  const notesRel = slideRels.find((r) => r.type === OOXML_REL_TYPES.notesSlide);

  if (notesRel === undefined) return null;

  const slideDir = slidePath.substring(0, slidePath.lastIndexOf('/'));
  const notesPath = resolvePath(slideDir, notesRel.target);
  const notesXml = readTextPart(pkg, notesPath);

  if (notesXml === null) return null;

  // Notes shapes carry their text in `<p:sp>` whose `<p:nvSpPr>` flags
  // a body-type placeholder. Find that shape and walk every `<a:t>`
  // descendant.
  const root = rootElement(parseOoxml(notesXml));

  if (root === null) return null;

  const bodyShape = findBodyShape(root);
  const scope = bodyShape ?? root;
  const runs = findDescendants(scope, 'a:t')
    .map((t) => getText(t))
    .filter((s) => s.length > 0);

  return runs.length > 0 ? runs.join('\n') : null;
}

/**
 * Walk a notes-slide AST looking for the `<p:sp>` whose `<p:ph>`
 * placeholder type is `body`.
 */
function findBodyShape(root: XmlElement): XmlElement | null {
  for (const sp of findDescendants(root, 'p:sp')) {
    const ph = findDescendant(sp, 'p:ph');

    if (ph !== null && getAttr(ph, 'type') === 'body') return sp;
  }

  return null;
}

function resolvePath(baseDir: string, target: string): string {
  const baseParts = baseDir.split('/').filter((p) => p.length > 0);
  const targetParts = target.split('/');
  const stack = [...baseParts];

  for (const part of targetParts) {
    if (part === '..') {
      stack.pop();
    } else if (part !== '.' && part.length > 0) {
      stack.push(part);
    }
  }

  return stack.join('/');
}
