import { statSync } from 'node:fs';
import path from 'node:path';

/** Creates one normalized finding record shared by every documentation check. */
export function createFinding(file, line, code, message) {
  return { file, line, code, message };
}

export function lineNumberAt(body, index) {
  return body.slice(0, index).split('\n').length;
}

export function normalizeRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function pathExistsSync(filePath) {
  try {
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

const FENCE_OPENING_PATTERN = /^\s{0,3}(`{3,}|~{3,})/u;
const FENCE_CLOSING_PATTERN = /^\s{0,3}(`{3,}|~{3,})\s*$/u;

/**
 * Blanks out fenced code block lines (``` or ~~~) while preserving the line
 * structure, so link/table/vocabulary scans skip code examples without
 * shifting the line numbers reported for real findings. Inline code spans are
 * intentionally kept — a stale reference in prose-level inline code is still a
 * stale reference.
 */
export function stripFencedCode(body) {
  let openingFence = null;
  return body
    .split('\n')
    .map((line) => {
      if (openingFence === null) {
        const opening = FENCE_OPENING_PATTERN.exec(line);
        if (opening === null) return line;
        openingFence = opening[1];
        return '';
      }
      const closing = FENCE_CLOSING_PATTERN.exec(line);
      if (closing !== null && closing[1][0] === openingFence[0] && closing[1].length >= openingFence.length) {
        openingFence = null;
      }
      return '';
    })
    .join('\n');
}

const LINK_TITLE_SUFFIX = /\s+("[^"]*"|'[^']*')$/u;

function resolveLinkTarget(rawTarget) {
  const target = rawTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) return target.slice(1, -1);
  return target.replace(LINK_TITLE_SUFFIX, '');
}

export function checkMarkdownLinks(rootDir, filePath, body) {
  const findings = [];
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let target = resolveLinkTarget(match[1]);
    if (/^(?:https?:|mailto:|data:|#)/u.test(target)) continue;
    target = target.split('#')[0];
    if (!target) continue;
    let decodedTarget = target;
    try {
      decodedTarget = decodeURIComponent(target);
    } catch {
      // The unresolved encoded path is reported below.
    }
    const resolved = path.resolve(path.dirname(filePath), decodedTarget);
    const relativeToRoot = path.relative(path.resolve(rootDir), resolved);
    const escapesRoot = relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot);
    if (escapesRoot || !pathExistsSync(resolved)) {
      findings.push(
        createFinding(
          normalizeRelative(rootDir, filePath),
          lineNumberAt(body, match.index),
          'broken-local-link',
          `local link target does not exist: ${target}`,
        ),
      );
    }
  }
  return findings;
}

function countPipes(line) {
  return (line.match(/\|/g) ?? []).length;
}

function isTableSeparator(line) {
  return /^\|\s*:?-{3,}/u.test(line);
}

export function checkMarkdownTables(rootDir, filePath, body) {
  const findings = [];
  const lines = body.split('\n');
  for (let index = 1; index < lines.length; index += 1) {
    if (isTableSeparator(lines[index - 1]) && isTableSeparator(lines[index])) {
      findings.push(
        createFinding(
          normalizeRelative(rootDir, filePath),
          index + 1,
          'consecutive-table-separators',
          'table contains consecutive separator rows',
        ),
      );
    }
    if (
      lines[index - 1].startsWith('|') &&
      isTableSeparator(lines[index]) &&
      countPipes(lines[index - 1]) !== countPipes(lines[index])
    ) {
      findings.push(
        createFinding(
          normalizeRelative(rootDir, filePath),
          index + 1,
          'table-column-mismatch',
          'table header and separator have different column counts',
        ),
      );
    }
  }
  return findings;
}

export function checkStrictJsonFences(rootDir, filePath, body) {
  const findings = [];
  for (const match of body.matchAll(/```json\s*\n([\s\S]*?)```/gu)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      findings.push(
        createFinding(
          normalizeRelative(rootDir, filePath),
          lineNumberAt(body, match.index),
          'invalid-json-fence',
          `strict JSON code fence is not parseable: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
  return findings;
}
