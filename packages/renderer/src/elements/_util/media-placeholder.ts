import type { BroadsetElement } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';

export type MediaKind = 'image' | 'video';

/**
 * Render a visible placeholder for broken or empty media elements. Used by
 * image and video renderers so broken content never leaves an invisible gap
 * at the element's dimensions.
 */
export function renderMediaPlaceholder(host: HTMLElement, element: BroadsetElement, kind: MediaKind): void {
  const placeholder = document.createElement('div');
  const label = kind === 'image' ? 'Image' : 'Video';
  const contentText = resolveContentAsPlainString(element.content);

  placeholder.textContent = contentText.trim() === '' ? `${label} unavailable` : `${label} unavailable: ${element.name}`;
  placeholder.setAttribute('aria-label', `${element.name} placeholder`);
  placeholder.style.width = '100%';
  placeholder.style.height = '100%';
  placeholder.style.display = 'flex';
  placeholder.style.alignItems = 'center';
  placeholder.style.justifyContent = 'center';
  placeholder.style.textAlign = 'center';
  placeholder.style.padding = '8px';
  placeholder.style.boxSizing = 'border-box';
  placeholder.style.backgroundColor = 'rgba(15, 23, 42, 0.42)';
  placeholder.style.border = '1px dashed rgba(148, 163, 184, 0.6)';
  placeholder.style.color = '#e2e8f0';
  placeholder.style.fontSize = '12px';
  placeholder.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  host.replaceChildren(placeholder);
}
