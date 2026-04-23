import type { ElementRendererFactory } from '../core/contracts';
import { createSimpleRenderer } from './_util/simple-renderer';

/**
 * Fallback renderer for unknown element types. Produces a visible
 * "Unsupported" notice in place of the element so unknown content never
 * leaves an invisible gap and the type mismatch is immediately obvious in
 * the editor / preview / export.
 */
export function createFallbackRenderer(type: string): ElementRendererFactory {
  return createSimpleRenderer((host, element) => {
    host.textContent = `Unsupported element type: ${element.type === '' ? type : element.type}`;
    host.style.display = 'flex';
    host.style.alignItems = 'center';
    host.style.justifyContent = 'center';
    host.style.padding = '8px';
    host.style.fontFamily = 'ui-monospace, SFMono-Regular, monospace';
    host.style.fontSize = '12px';
    host.style.border = '1px dashed rgba(148, 163, 184, 0.6)';
    host.style.backgroundColor = 'rgba(15, 23, 42, 0.42)';
  });
}
