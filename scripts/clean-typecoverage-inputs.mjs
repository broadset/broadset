import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packagesDir = fileURLToPath(new URL('../packages/', import.meta.url));

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const packageDir = join(packagesDir, entry.name);

  rmSync(join(packageDir, 'dist'), { recursive: true, force: true });
  rmSync(join(packageDir, 'tsconfig.tsbuildinfo'), { force: true });
}
