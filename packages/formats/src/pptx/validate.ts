import { OOXML_CONTENT_TYPES, OOXML_REL_TYPES } from './ooxml/namespaces';
import { parseRelationshipsXml } from './ooxml/relationships';
import { parseXml } from './ooxml/xml';
import { readOoxmlPackage, readTextPart } from './ooxml/zip';

/**
 * OOXML validation gate — a structural validator that runs against a
 * PPTX byte stream and reports ECMA-376 conformance issues PowerPoint
 * would reject at "Inspect Document" time.
 *
 * The checks here are intentionally narrow and fast: they catch the
 * "missing override / dangling relationship / malformed XML" class of
 * issues that cause PowerPoint's repair dialog. Full XSD validation is
 * deferred to a future external-tool CI gate (documented as a spec gap).
 */

type ValidationIssueLevel = 'error' | 'warning';

interface ValidationIssue {
  readonly level: ValidationIssueLevel;
  readonly code: string;
  readonly message: string;
  readonly part?: string;
}

interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Run validation against a PPTX package.
 */
export function validatePptxPackage(bytes: Uint8Array): ValidationResult {
  const issues: ValidationIssue[] = [];

  const pkg = tryRead(bytes, issues);

  if (pkg === null) return { valid: false, issues };

  const contentTypes = readTextPart(pkg, '[Content_Types].xml');
  const rootRels = readTextPart(pkg, '_rels/.rels');

  if (contentTypes === null) {
    issues.push({ level: 'error', code: 'missing-content-types', message: '[Content_Types].xml is missing' });
  }

  if (rootRels === null) {
    issues.push({ level: 'error', code: 'missing-root-rels', message: '_rels/.rels is missing' });
  }

  const presPath = rootRels !== null ? findPresentationPath(rootRels) : null;

  if (presPath === null) {
    issues.push({
      level: 'error',
      code: 'no-office-document-rel',
      message: 'Root rels do not point to a presentation',
    });
  } else if (pkg.get(presPath) === undefined) {
    issues.push({
      level: 'error',
      code: 'dangling-presentation-rel',
      message: `Root rel targets missing part: ${presPath}`,
      part: presPath,
    });
  }

  if (presPath !== null && contentTypes !== null) {
    validatePresentation(pkg, presPath, contentTypes, issues);
  }

  validateXmlParsability(pkg, issues);
  validateMacroRejection(pkg, issues);

  return { valid: issues.every((i) => i.level !== 'error'), issues };
}

function tryRead(bytes: Uint8Array, issues: ValidationIssue[]): ReturnType<typeof readOoxmlPackage> | null {
  try {
    return readOoxmlPackage(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ZIP error';

    issues.push({ level: 'error', code: 'zip-invalid', message: `Package is not a valid ZIP: ${message}` });

    return null;
  }
}

function findPresentationPath(rootRelsXml: string): string | null {
  const rels = parseRelationshipsXml(rootRelsXml);

  for (const rel of rels) {
    if (rel.type === OOXML_REL_TYPES.officeDocument) return rel.target;
  }

  return null;
}

function validatePresentation(
  pkg: ReturnType<typeof readOoxmlPackage>,
  presPath: string,
  contentTypes: string,
  issues: ValidationIssue[],
): void {
  const presXml = readTextPart(pkg, presPath);

  if (presXml === null) return;

  if (!presXml.includes('<p:presentation')) {
    issues.push({
      level: 'error',
      code: 'invalid-presentation-root',
      message: 'Presentation part root element is not <p:presentation>',
      part: presPath,
    });
  }

  // Every slide referenced by the presentation rels must exist and be
  // declared as a <Override ContentType="...slide+xml"> in
  // [Content_Types].xml. The inspect-document check fails loudest on
  // this pair.
  const baseName = presPath.split('/').pop() ?? '';
  const presRelsPath = `${presPath.substring(0, presPath.lastIndexOf('/'))}/_rels/${baseName}.rels`;
  const presRelsXml = readTextPart(pkg, presRelsPath);

  if (presRelsXml === null) return;

  const presDir = presPath.substring(0, presPath.lastIndexOf('/'));

  for (const rel of parseRelationshipsXml(presRelsXml)) {
    if (rel.type !== OOXML_REL_TYPES.slide) continue;

    const slidePath = joinPath(presDir, rel.target);

    if (pkg.get(slidePath) === undefined) {
      issues.push({
        level: 'error',
        code: 'dangling-slide-rel',
        message: `Slide rel ${rel.id} targets missing part: ${slidePath}`,
        part: slidePath,
      });
      continue;
    }

    if (!contentTypes.includes(`/${slidePath}`)) {
      issues.push({
        level: 'error',
        code: 'missing-slide-content-type',
        message: `Slide part missing <Override> in [Content_Types].xml: /${slidePath}`,
        part: slidePath,
      });
    } else if (!contentTypes.includes(OOXML_CONTENT_TYPES.slide)) {
      issues.push({
        level: 'error',
        code: 'missing-slide-content-type-type',
        message: 'No Override declares the slide content type',
      });
    }
  }
}

function joinPath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);

  const baseParts = baseDir.split('/').filter((p) => p.length > 0);
  const stack = [...baseParts];

  for (const part of target.split('/')) {
    if (part === '..') stack.pop();
    else if (part !== '.' && part.length > 0) stack.push(part);
  }

  return stack.join('/');
}

function validateXmlParsability(pkg: ReturnType<typeof readOoxmlPackage>, issues: ValidationIssue[]): void {
  for (const [path] of pkg) {
    if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue;

    const text = readTextPart(pkg, path);

    if (text === null) continue;

    try {
      const result = parseXml(text);

      if (result === null && text.trim().length > 0) {
        issues.push({ level: 'warning', code: 'empty-parse', message: 'XML parsed to null unexpectedly', part: path });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'parse failure';

      issues.push({ level: 'error', code: 'malformed-xml', message: `XML parse failed: ${message}`, part: path });
    }
  }
}

function validateMacroRejection(pkg: ReturnType<typeof readOoxmlPackage>, issues: ValidationIssue[]): void {
  // Security floor: PPTX macros / VBA must NOT appear in a Broadset
  // export. If any caller accidentally ships one through this module
  // surfaces it as a hard error.
  for (const [path] of pkg) {
    if (path === 'ppt/vbaProject.bin') {
      issues.push({
        level: 'error',
        code: 'macro-payload-present',
        message: 'Package contains vbaProject.bin — macros must be stripped',
        part: path,
      });
    }
  }
}
