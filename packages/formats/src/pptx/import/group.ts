import { type BroadsetElement } from '@broadset/model';

export function attachParentGroup(
  element: BroadsetElement,
  parentGroupId: string | null,
): BroadsetElement {
  return parentGroupId === null ? element : { ...element, groupId: parentGroupId };
}
