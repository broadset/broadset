import type { PptxSourceElement } from '../project-model';

export function attachParentGroup(element: PptxSourceElement, parentGroupId: string | null): PptxSourceElement {
  return parentGroupId === null ? element : { ...element, groupId: parentGroupId };
}
