import type { PageElement } from '@broadset/model';
import { sanitizeTextContent } from '@broadset/model';
import qrcode from 'qrcode-generator';

import type { ElementRendererInstance } from './component-registry';
import { DATA_ELEMENT_CONTENT, DATA_ELEMENT_ID } from './data-attributes';

// ---------------------------------------------------------------------------
// Visual constants for placeholder / fallback renderers
// ---------------------------------------------------------------------------

const FALLBACK_BG_COLOR = '#555';
const FALLBACK_BORDER = '1px dashed #999';
const FALLBACK_TEXT_COLOR = '#aaa';
const FALLBACK_FONT_SIZE = '10px';

const IMAGE_PLACEHOLDER_BG = '#333';
const IMAGE_PLACEHOLDER_COLOR = '#999';
const IMAGE_PLACEHOLDER_FONT_SIZE = '12px';

// ---------------------------------------------------------------------------
// Common style helpers
// ---------------------------------------------------------------------------

/**
 * Apply common positional and visual styles to an element container.
 * Every rendered element gets position, size, rotation, and opacity.
 */
export function applyCommonStyles(container: HTMLElement, element: PageElement): void {
  const s = container.style;

  s.position = 'absolute';
  s.left = `${String(element.position.x)}px`;
  s.top = `${String(element.position.y)}px`;
  s.width = `${String(element.width)}px`;
  s.height = `${String(element.height)}px`;

  if (element.rotation !== 0) {
    s.transform = `rotate(${String(element.rotation)}deg)`;
  }
}

/**
 * Apply style properties from the element's style object to a DOM element.
 */
export function applyElementStyle(target: HTMLElement, element: PageElement): void {
  const style = element.style;

  if (style === undefined) {
    return;
  }

  if (typeof style['opacity'] === 'number') {
    target.style.opacity = String(style['opacity']);
  }

  if (typeof style['backgroundColor'] === 'string') {
    target.style.backgroundColor = style['backgroundColor'];
  }

  if (typeof style['backgroundGradient'] === 'string') {
    target.style.backgroundImage = style['backgroundGradient'];
  }

  if (typeof style['fontFamily'] === 'string') {
    target.style.fontFamily = style['fontFamily'];
  }

  if (typeof style['fontSize'] === 'number') {
    target.style.fontSize = `${String(style['fontSize'])}px`;
  }

  if (typeof style['fontColor'] === 'string') {
    target.style.color = style['fontColor'];
  }

  if (typeof style['fontWeight'] === 'string') {
    target.style.fontWeight = style['fontWeight'];
  }

  if (typeof style['textAlignment'] === 'string') {
    target.style.textAlign = style['textAlignment'];
  }

  if (typeof style['borderRadius'] === 'number') {
    target.style.borderRadius = `${String(style['borderRadius'])}px`;
  }

  if (typeof style['borderWidth'] === 'number') {
    target.style.borderWidth = `${String(style['borderWidth'])}px`;
    target.style.borderStyle = 'solid';
  }

  if (typeof style['borderColor'] === 'string') {
    target.style.borderColor = style['borderColor'];
  }

  if (typeof style['boxShadow'] === 'string') {
    target.style.boxShadow = style['boxShadow'];
  }

  if (typeof style['fill'] === 'string') {
    target.dataset['fill'] = style['fill'];
  }

  if (typeof style['stroke'] === 'string') {
    target.dataset['stroke'] = style['stroke'];
  }

  if (typeof style['strokeWidth'] === 'number') {
    target.dataset['strokeWidth'] = String(style['strokeWidth']);
  }
}

// ---------------------------------------------------------------------------
// Built-in renderers
// ---------------------------------------------------------------------------

function createTextRenderer(element: PageElement, host: HTMLElement): ElementRendererInstance {
  const container = document.createElement('div');

  return {
    mount(): void {
      container.setAttribute(DATA_ELEMENT_ID, element.id);
      applyCommonStyles(container, element);
      applyElementStyle(container, element);
      container.style.overflow = 'hidden';

      const content = document.createElement('div');

      content.setAttribute(DATA_ELEMENT_CONTENT, '');
      content.innerHTML = sanitizeTextContent(element.content);
      container.appendChild(content);
      host.appendChild(container);
    },
    update(updated: PageElement): void {
      applyCommonStyles(container, updated);
      applyElementStyle(container, updated);

      const content = container.querySelector(`[${DATA_ELEMENT_CONTENT}]`);

      if (content) {
        content.innerHTML = sanitizeTextContent(updated.content);
      }
    },
    destroy(): void {
      container.remove();
    },
  };
}

function createImageRenderer(element: PageElement, host: HTMLElement): ElementRendererInstance {
  const container = document.createElement('div');

  return {
    mount(): void {
      container.setAttribute(DATA_ELEMENT_ID, element.id);
      applyCommonStyles(container, element);
      applyElementStyle(container, element);
      container.style.overflow = 'hidden';

      const img = document.createElement('img');

      img.setAttribute(DATA_ELEMENT_CONTENT, '');
      img.src = element.content;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.alt = '';

      img.onerror = (): void => {
        img.style.display = 'none';

        const placeholder = document.createElement('div');

        placeholder.style.width = '100%';
        placeholder.style.height = '100%';
        placeholder.style.backgroundColor = IMAGE_PLACEHOLDER_BG;
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.color = IMAGE_PLACEHOLDER_COLOR;
        placeholder.style.fontSize = IMAGE_PLACEHOLDER_FONT_SIZE;
        placeholder.textContent = '⚠ Image';
        container.appendChild(placeholder);
      };

      container.appendChild(img);
      host.appendChild(container);
    },
    update(updated: PageElement): void {
      applyCommonStyles(container, updated);

      const img = container.querySelector('img');

      if (img) {
        img.src = updated.content;
      }
    },
    destroy(): void {
      container.remove();
    },
  };
}

function createSvgRenderer(element: PageElement, host: HTMLElement): ElementRendererInstance {
  const container = document.createElement('div');

  return {
    mount(): void {
      container.setAttribute(DATA_ELEMENT_ID, element.id);
      applyCommonStyles(container, element);
      applyElementStyle(container, element);

      const content = document.createElement('div');

      content.setAttribute(DATA_ELEMENT_CONTENT, '');
      content.innerHTML = element.content;
      content.style.width = '100%';
      content.style.height = '100%';

      const svg = content.querySelector('svg');

      if (svg) {
        svg.style.width = '100%';
        svg.style.height = '100%';
      }

      container.appendChild(content);
      host.appendChild(container);
    },
    update(updated: PageElement): void {
      applyCommonStyles(container, updated);

      const content = container.querySelector(`[${DATA_ELEMENT_CONTENT}]`);

      if (content) {
        content.innerHTML = updated.content;
      }
    },
    destroy(): void {
      container.remove();
    },
  };
}

function createPathRenderer(element: PageElement, host: HTMLElement): ElementRendererInstance {
  const container = document.createElement('div');

  return {
    mount(): void {
      container.setAttribute(DATA_ELEMENT_ID, element.id);
      applyCommonStyles(container, element);
      applyElementStyle(container, element);

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

      svg.setAttribute(DATA_ELEMENT_CONTENT, '');
      svg.setAttribute('viewBox', `0 0 ${String(element.width)} ${String(element.height)}`);
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.overflow = 'visible';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      path.setAttribute('d', element.content);

      const style = element.style;

      path.setAttribute('fill', typeof style?.['fill'] === 'string' ? style['fill'] : 'none');

      if (typeof style?.['stroke'] === 'string') {
        path.setAttribute('stroke', style['stroke']);
      }

      if (typeof style?.['strokeWidth'] === 'number') {
        path.setAttribute('stroke-width', String(style['strokeWidth']));
      }

      svg.appendChild(path);
      container.appendChild(svg);
      host.appendChild(container);
    },
    update(updated: PageElement): void {
      applyCommonStyles(container, updated);

      const path = container.querySelector('path');

      if (path) {
        path.setAttribute('d', updated.content);
      }
    },
    destroy(): void {
      container.remove();
    },
  };
}

function createRectangleRenderer(element: PageElement, host: HTMLElement): ElementRendererInstance {
  const container = document.createElement('div');

  return {
    mount(): void {
      container.setAttribute(DATA_ELEMENT_ID, element.id);
      container.setAttribute(DATA_ELEMENT_CONTENT, '');
      applyCommonStyles(container, element);
      applyElementStyle(container, element);
      host.appendChild(container);
    },
    update(updated: PageElement): void {
      applyCommonStyles(container, updated);
      applyElementStyle(container, updated);
    },
    destroy(): void {
      container.remove();
    },
  };
}

function createEllipseRenderer(element: PageElement, host: HTMLElement): ElementRendererInstance {
  const container = document.createElement('div');

  return {
    mount(): void {
      container.setAttribute(DATA_ELEMENT_ID, element.id);
      container.setAttribute(DATA_ELEMENT_CONTENT, '');
      applyCommonStyles(container, element);
      applyElementStyle(container, element);
      container.style.borderRadius = '50%';
      host.appendChild(container);
    },
    update(updated: PageElement): void {
      applyCommonStyles(container, updated);
      applyElementStyle(container, updated);
      container.style.borderRadius = '50%';
    },
    destroy(): void {
      container.remove();
    },
  };
}

function createGroupRenderer(element: PageElement, host: HTMLElement): ElementRendererInstance {
  // Note: children are appended by the page renderer, not the group renderer
  const container = document.createElement('div');

  return {
    mount(): void {
      container.setAttribute(DATA_ELEMENT_ID, element.id);
      container.setAttribute(DATA_ELEMENT_CONTENT, '');
      applyCommonStyles(container, element);
      applyElementStyle(container, element);
      host.appendChild(container);
    },
    update(updated: PageElement): void {
      applyCommonStyles(container, updated);
      applyElementStyle(container, updated);
    },
    destroy(): void {
      container.remove();
    },
  };
}

function createFallbackRenderer(element: PageElement, host: HTMLElement): ElementRendererInstance {
  const container = document.createElement('div');

  return {
    mount(): void {
      container.setAttribute(DATA_ELEMENT_ID, element.id);
      container.setAttribute(DATA_ELEMENT_CONTENT, '');
      applyCommonStyles(container, element);
      container.style.backgroundColor = FALLBACK_BG_COLOR;
      container.style.border = FALLBACK_BORDER;
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.color = FALLBACK_TEXT_COLOR;
      container.style.fontSize = FALLBACK_FONT_SIZE;
      container.textContent = element.type;
      host.appendChild(container);
    },
    update(updated: PageElement): void {
      applyCommonStyles(container, updated);
      container.textContent = updated.type;
    },
    destroy(): void {
      container.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// QR code renderer
// ---------------------------------------------------------------------------

function createQrcodeRenderer(element: PageElement, host: HTMLElement): ElementRendererInstance {
  const container = document.createElement('div');

  return {
    mount(): void {
      container.setAttribute(DATA_ELEMENT_ID, element.id);
      applyCommonStyles(container, element);
      applyElementStyle(container, element);

      const content = document.createElement('div');

      content.setAttribute(DATA_ELEMENT_CONTENT, '');
      content.style.width = '100%';
      content.style.height = '100%';

      if (element.content.length > 0) {
        renderQrInto(content, element.content);
      }

      container.appendChild(content);
      host.appendChild(container);
    },
    update(updated: PageElement): void {
      applyCommonStyles(container, updated);

      const content = container.querySelector(`[${DATA_ELEMENT_CONTENT}]`);

      if (content) {
        content.innerHTML = '';

        if (updated.content.length > 0) {
          renderQrInto(content as HTMLElement, updated.content);
        }
      }
    },
    destroy(): void {
      container.remove();
    },
  };
}

/** Generate a QR code SVG and insert it into the target element. */
function renderQrInto(target: HTMLElement, data: string): void {
  const qr = qrcode(0, 'M');

  qr.addData(data);
  qr.make();

  const svgTag = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });

  target.innerHTML = svgTag;

  const svg = target.querySelector('svg');

  if (svg) {
    svg.style.width = '100%';
    svg.style.height = '100%';
  }
}

// ---------------------------------------------------------------------------
// Registry population
// ---------------------------------------------------------------------------

export function registerBuiltInRenderers(registry: {
  registerBuiltIn: (
    type: string,
    factory: (element: PageElement, host: HTMLElement) => ElementRendererInstance,
  ) => void;
  setFallbackRenderer: (factory: (element: PageElement, host: HTMLElement) => ElementRendererInstance) => void;
}): void {
  registry.registerBuiltIn('text', createTextRenderer);
  registry.registerBuiltIn('image', createImageRenderer);
  registry.registerBuiltIn('svg', createSvgRenderer);
  registry.registerBuiltIn('path', createPathRenderer);
  registry.registerBuiltIn('rectangle', createRectangleRenderer);
  registry.registerBuiltIn('ellipse', createEllipseRenderer);
  registry.registerBuiltIn('qrcode', createQrcodeRenderer);
  registry.registerBuiltIn('group', createGroupRenderer);
  registry.setFallbackRenderer(createFallbackRenderer);
}
