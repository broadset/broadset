import { type OoxmlPackage } from '../ooxml/zip';

export function findMasterPaths(pkg: OoxmlPackage): readonly string[] {
  const result: string[] = [];

  for (const path of packagePaths(pkg)) {
    if (path.startsWith('ppt/slideMasters/') && path.endsWith('.xml') && !path.includes('/_rels/')) {
      result.push(path);
    }
  }

  return result;
}

function packagePaths(pkg: OoxmlPackage): readonly string[] {
  return Array.from(pkg.keys());
}
