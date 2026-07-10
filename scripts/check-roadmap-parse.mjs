import { lineNumberAt } from './check-documentation-markdown.mjs';

const INITIATIVE_ID_PATTERN = /W[0-6]-[A-Z][A-Z0-9]*-\d{2}/;
export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
export const STATUSES = ['discovery', 'approved', 'implementing', 'measuring', 'shipped', 'stopped', 'superseded'];
export const STATUSES_REQUIRING_EVIDENCE = ['implementing', 'measuring', 'shipped'];

const REGISTRY_START_MARKER = '<!-- BEGIN MANAGED: INITIATIVE REGISTRY -->';
const REGISTRY_END_MARKER = '<!-- END MANAGED: INITIATIVE REGISTRY -->';

function splitRow(row) {
  return row
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Registry rows live inside the managed block of the index: | ID | Wave | Size | Title | Dependencies |.
 * Returns rows plus structural problems (missing markers, data rows whose first
 * cell is not a valid initiative ID) so malformed rows cannot vanish silently.
 */
export function parseRegistry(indexBody) {
  const start = indexBody.indexOf(REGISTRY_START_MARKER);
  const end = indexBody.indexOf(REGISTRY_END_MARKER);
  const scoped = start >= 0 && end > start ? indexBody.slice(start, end) : indexBody;
  const offset = start >= 0 && end > start ? start : 0;
  const rows = [];
  const rowPattern = new RegExp(String.raw`^\|\s*(${INITIATIVE_ID_PATTERN.source})\s*\|.*\|$`, 'gmu');
  for (const match of scoped.matchAll(rowPattern)) {
    const columns = splitRow(match[0]);
    rows.push({
      id: columns[0],
      wave: columns[1] ?? '',
      size: columns[2] ?? '',
      title: columns[3] ?? '',
      dependencies: columns[4] ?? '',
      line: lineNumberAt(indexBody, offset + match.index),
    });
  }
  const invalidRows = [];
  const idPattern = new RegExp(String.raw`^${INITIATIVE_ID_PATTERN.source}$`, 'u');
  for (const match of scoped.matchAll(/^\|.*\|$/gmu)) {
    const firstCell = splitRow(match[0])[0] ?? '';
    if (firstCell === '' || firstCell === 'ID' || /^[:\s-]*$/u.test(firstCell) || idPattern.test(firstCell)) continue;
    invalidRows.push({ cell: firstCell, line: lineNumberAt(indexBody, offset + match.index) });
  }
  return { rows, invalidRows, markersPresent: start >= 0 && end > start };
}

/**
 * Wave definition sections: "## <ID> — <title> (<SIZE>)" headings followed by a
 * bold Dependencies line. Sections run until the next H2 heading or EOF.
 */
export function parseWaveDefinitions(body) {
  const definitions = [];
  const headingPattern = new RegExp(
    String.raw`^## (${INITIATIVE_ID_PATTERN.source}) — (.+) \((S|M|L|XL|XXL)\)$`,
    'gmu',
  );
  const headings = [...body.matchAll(headingPattern)];
  const anyH2 = [...body.matchAll(/^## /gmu)].map((match) => match.index);
  for (const match of headings) {
    const sectionStart = match.index;
    const nextH2 = anyH2.find((index) => index > sectionStart);
    const section = body.slice(sectionStart, nextH2 ?? body.length);
    const dependencyLines = [...section.matchAll(/^- \*\*Dependencies:\*\* (.+)$/gmu)];
    definitions.push({
      id: match[1],
      title: match[2],
      size: match[3],
      dependencies: dependencyLines[0]?.[1]?.trim() ?? null,
      dependencyLineCount: dependencyLines.length,
      userVisible: /^- \*\*User-visible:\*\* yes/mu.test(section),
      line: lineNumberAt(body, sectionStart),
    });
  }
  return definitions;
}

/** Implementation sections: "## <ID> tasks" headings; slice tables detected by their header row. */
export function parseImplementationSections(body) {
  const sections = [];
  const headingPattern = new RegExp(String.raw`^## (${INITIATIVE_ID_PATTERN.source}) tasks$`, 'gmu');
  const headings = [...body.matchAll(headingPattern)];
  const anyH2 = [...body.matchAll(/^## /gmu)].map((match) => match.index);
  for (const match of headings) {
    const sectionStart = match.index;
    const nextH2 = anyH2.find((index) => index > sectionStart);
    const section = body.slice(sectionStart, nextH2 ?? body.length);
    sections.push({
      id: match[1],
      hasSliceTable: /^\|\s*Slice\s*\|.*\|\s*Merge prerequisite\s*\|$/imu.test(section),
      line: lineNumberAt(body, sectionStart),
    });
  }
  return sections;
}

/** RFC register rows: | RFC-## | ... | Status | — Status is the LAST column. */
export function parseRfcRegister(body) {
  const headerMatch = /^\|.*\|$/mu.exec(
    body
      .split(/^\|\s*RFC-\d{2}/mu)[0]
      ?.split('\n')
      .filter((line) => line.startsWith('|'))[0] ?? '',
  );
  const headerCells = headerMatch ? splitRow(headerMatch[0]) : [];
  const statusIndex = headerCells.findIndex((cell) => cell.toLowerCase() === 'status');
  const rows = [];
  for (const match of body.matchAll(/^\|\s*(RFC-\d{2})\s*\|.*\|$/gmu)) {
    const columns = splitRow(match[0]);
    rows.push({
      id: columns[0],
      status: (statusIndex >= 0 ? columns[statusIndex] : columns[columns.length - 1]) ?? '',
      line: lineNumberAt(body, match.index),
    });
  }
  return rows;
}

export function parseIoDecisionIds(decisionsBody) {
  return new Set([...decisionsBody.matchAll(/^[-*]\s+\*\*(IO-D-\d{2})\b/gmu)].map((match) => match[1]));
}

/** Quality-gate definitions are index table rows whose first cell is a QG ID. */
export function parseQualityGateIds(indexBody) {
  return new Set([...indexBody.matchAll(/^\|\s*(QG-[A-Z][A-Z0-9]*-\d{2})\s*\|/gmu)].map((match) => match[1]));
}

export function findQualityGateCitations(body) {
  const citations = [];
  for (const match of body.matchAll(/QG-[A-Z][A-Z0-9]*-\d{2}/gu)) {
    citations.push({ id: match[0], line: lineNumberAt(body, match.index) });
  }
  return citations;
}

export function parseDependencyTokens(value) {
  if (value === 'none') return [];
  return value.split('/').map((token) => token.trim());
}

export function isParseableDependencyExpression(value) {
  const token = String.raw`(?:${INITIATIVE_ID_PATTERN.source}|RFC-\d{2}|IO-D-\d{2})`;
  return value === 'none' || new RegExp(`^${token}(?:/${token})*$`, 'u').test(value);
}

/** Counts prose words: markdown table scaffolding (pipes, separator dashes) is not prose. */
export function countWords(body) {
  return body.split(/\s+/u).filter((token) => token.replace(/[|:\-=]+/gu, '').length > 0).length;
}

export function waveNumber(waveOrId) {
  const match = /W([0-6])/u.exec(waveOrId);
  return match ? Number(match[1]) : null;
}

/** Directive entries are H2 headings: "## D-### — YYYY-MM-DD — <scope>". */
export function findMalformedDirectiveHeadings(body) {
  const malformed = [];
  for (const match of body.matchAll(/^## .+$/gmu)) {
    const heading = match[0];
    if (!/^## D[-\d]/u.test(heading)) continue;
    if (!/^## D-\d{3} — \d{4}-\d{2}-\d{2} — .+$/u.test(heading)) {
      malformed.push({ heading, line: lineNumberAt(body, match.index) });
    }
  }
  return malformed;
}
