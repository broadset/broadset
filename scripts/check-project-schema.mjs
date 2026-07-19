import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PROJECT_SCHEMA_ID = 'https://schema.broadset.dev/v1/project.schema.json';
const PROJECT_SCHEMA_RELATIVE_PATH = 'project/schema/v1/project.schema.json';

function createFinding(code, message) {
  return { file: PROJECT_SCHEMA_RELATIVE_PATH, line: 1, code, message };
}

export async function checkPublishedProjectSchema(rootDir) {
  let text;

  try {
    text = await readFile(path.join(rootDir, PROJECT_SCHEMA_RELATIVE_PATH), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [
        createFinding('project-schema-missing', 'published v1 project schema is missing; run npm run schema:project'),
      ];
    }

    throw error;
  }

  let schema;
  try {
    schema = JSON.parse(text);
  } catch (error) {
    return [
      createFinding(
        'project-schema-invalid',
        `published v1 project schema is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ];
  }

  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return [createFinding('project-schema-invalid', 'published v1 project schema must be a JSON object')];
  }

  if (schema.$id !== PROJECT_SCHEMA_ID) {
    return [createFinding('project-schema-id-drift', `published v1 project schema must use $id ${PROJECT_SCHEMA_ID}`)];
  }

  return [];
}
