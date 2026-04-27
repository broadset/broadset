import { type OoxmlPackage } from '../ooxml/zip';

export function findMasterPaths(pkg: OoxmlPackage): readonly string[] {
  const result: string[] = [];

  for (const [path] of pkg) {
    if (path.startsWith('ppt/slideMasters/') && path.endsWith('.xml') && !path.includes('/_rels/')) {
      result.push(path);
    }
  }

  return result;
}
