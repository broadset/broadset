import { mkdir, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { toJSONSchema } from 'zod';

const PROJECT_SCHEMA_ID = 'https://schema.broadset.dev/v1/project.schema.json';
const DEFAULT_OUTPUT = 'project/schema/v1/project.schema.json';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.') || path.extname(specifier) !== '') throw error;

      return nextResolve(`${specifier}.js`, context);
    }
  },
});

function compareUtf16CodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;

  return 0;
}

function sortJsonKeys(value) {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
      .map(([key, item]) => [key, sortJsonKeys(item)]),
  );
}

function closeFixedTuples(value) {
  if (Array.isArray(value)) return value.map(closeFixedTuples);
  if (value === null || typeof value !== 'object') return value;

  const closed = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, closeFixedTuples(item)]));

  if (Array.isArray(closed.prefixItems) && closed.items === undefined) {
    closed.items = false;
    closed.minItems = closed.prefixItems.length;
  }

  return closed;
}

function resolveLocalReference(root, reference) {
  if (!reference.startsWith('#/')) return undefined;

  return reference
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, segment) => {
      if (value === null || typeof value !== 'object') return undefined;

      return value[segment];
    }, root);
}

function inheritReferencedTypes(value, root = value) {
  if (Array.isArray(value)) {
    value.forEach((item) => inheritReferencedTypes(item, root));
    return;
  }
  if (value === null || typeof value !== 'object') return;

  if (typeof value.$ref === 'string' && value.type === undefined) {
    const referenced = resolveLocalReference(root, value.$ref);

    if (referenced !== null && typeof referenced === 'object' && typeof referenced.type === 'string') {
      value.type = referenced.type;
    }
  }

  Object.values(value).forEach((item) => inheritReferencedTypes(item, root));
}

function assertClosedCoreObjects(value, pointer = '', partial = false) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertClosedCoreObjects(item, `${pointer}/${String(index)}`, partial));
    return;
  }
  if (value === null || typeof value !== 'object') return;

  const markedPartial = value['x-broadset-partial'] === true;

  delete value['x-broadset-partial'];

  if (
    value.type === 'object' &&
    'properties' in value &&
    !partial &&
    !markedPartial &&
    value.additionalProperties !== false
  ) {
    throw new Error(`Core object permits unknown properties at ${pointer || '/'}`);
  }

  Object.entries(value).forEach(([key, item]) =>
    assertClosedCoreObjects(item, `${pointer}/${key}`, partial || markedPartial || key === 'if' || key === 'then'),
  );
}

function readOutputArgument() {
  const outputIndex = process.argv.indexOf('--output');

  if (outputIndex < 0) return DEFAULT_OUTPUT;
  const output = process.argv[outputIndex + 1];
  if (output === undefined || output.length === 0) throw new Error('--output requires a path');

  return output;
}

const projectModuleUrl = pathToFileURL(path.resolve('packages/model/dist/v1/project.js')).href;
const { broadsetProjectV1Schema } = await import(projectModuleUrl);
const generated = toJSONSchema(broadsetProjectV1Schema, {
  target: 'draft-2020-12',
  cycles: 'ref',
  reused: 'ref',
});
const schema = closeFixedTuples({
  ...generated,
  $id: PROJECT_SCHEMA_ID,
});

inheritReferencedTypes(schema);

assertClosedCoreObjects(schema);

const outputPath = path.resolve(readOutputArgument());
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(sortJsonKeys(schema), null, 2)}\n`);
