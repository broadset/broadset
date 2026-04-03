import type { PageElement } from '@broadset/model';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { applyCommonStyles, applyElementStyle, registerBuiltInRenderers } from './built-in-renderers';
import type { ElementRendererInstance, RendererFactory } from './component-registry';
import { ComponentRegistry } from './component-registry';
import { DATA_ELEMENT_CONTENT, DATA_ELEMENT_ID } from './data-attributes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(overrides: Partial<PageElement> & { id: string; type: string }): PageElement {
  return {
    position: { x: 10, y: 20 },
    width: 200,
    height: 100,
    rotation: 0,
    content: '',
    parentId: null,
    groupId: null,
    ...overrides,
  };
}

function resolveFactory(registry: ComponentRegistry, type: string): RendererFactory {
  const factory = registry.resolveRenderer(type);

  if (factory === undefined) {
    throw new Error(`No renderer for type "${type}"`);
  }

  return factory;
}

function mountElement(registry: ComponentRegistry, element: PageElement, host: HTMLElement): ElementRendererInstance {
  const factory = resolveFactory(registry, element.type);
  const instance = factory(element, host);

  instance.mount();

  return instance;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyCommonStyles', () => {
  /**
   * @description Position, size, and rotation must be applied as absolute px
   * values so elements render at their specified coordinates on the canvas.
   */
  it('sets position, size as px and rotation as deg', () => {
    const el = makeElement({ id: 'e1', type: 'rectangle', rotation: 45 });
    const div = document.createElement('div');

    applyCommonStyles(div, el);

    expect(div.style.position).toBe('absolute');
    expect(div.style.left).toBe('10px');
    expect(div.style.top).toBe('20px');
    expect(div.style.width).toBe('200px');
    expect(div.style.height).toBe('100px');
    expect(div.style.transform).toBe('rotate(45deg)');
  });

  /**
   * @description When rotation is zero, no transform should be applied to
   * avoid unnecessary CSS property overhead.
   */
  it('omits transform when rotation is zero', () => {
    const el = makeElement({ id: 'e1', type: 'rectangle', rotation: 0 });
    const div = document.createElement('div');

    applyCommonStyles(div, el);

    expect(div.style.transform).toBe('');
  });
});

describe('applyElementStyle', () => {
  /**
   * @description Style properties on the element must be mapped to their
   * corresponding CSS properties on the target DOM element.
   */
  it('applies typography and background style properties', () => {
    const el = makeElement({
      id: 'e1',
      type: 'text',
      style: {
        opacity: 0.5,
        backgroundColor: '#ff0000',
        fontFamily: 'Helvetica',
        fontSize: 24,
        fontColor: '#00ff00',
        fontWeight: 'bold',
        textAlignment: 'center',
      },
    });
    const div = document.createElement('div');

    applyElementStyle(div, el);

    expect(div.style.opacity).toBe('0.5');
    expect(div.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(div.style.fontFamily).toBe('Helvetica');
    expect(div.style.fontSize).toBe('24px');
    expect(div.style.color).toBe('rgb(0, 255, 0)');
    expect(div.style.fontWeight).toBe('bold');
    expect(div.style.textAlign).toBe('center');
  });

  /**
   * @description When an element has no style object, applyElementStyle
   * should be a no-op without errors.
   */
  it('handles missing style gracefully', () => {
    const el = makeElement({ id: 'e1', type: 'rectangle' });
    const div = document.createElement('div');

    expect(() => {
      applyElementStyle(div, el);
    }).not.toThrow();
  });

  /**
   * @description Border properties must be applied including auto-setting
   * borderStyle to solid when borderWidth is specified.
   */
  it('applies border properties with solid style when width is set', () => {
    const el = makeElement({
      id: 'e1',
      type: 'rectangle',
      style: {
        opacity: 1,
        borderWidth: 2,
        borderColor: '#333',
        borderRadius: 8,
      },
    });
    const div = document.createElement('div');

    applyElementStyle(div, el);

    expect(div.style.borderWidth).toBe('2px');
    expect(div.style.borderStyle).toBe('solid');
    expect(div.style.borderColor).toBe('rgb(51, 51, 51)');
    expect(div.style.borderRadius).toBe('8px');
  });

  /**
   * @description SVG fill/stroke properties are stored as data attributes
   * (not CSS properties) so path/SVG renderers can read them.
   */
  it('stores fill/stroke as data attributes', () => {
    const el = makeElement({
      id: 'e1',
      type: 'path',
      style: {
        opacity: 1,
        fill: '#0000ff',
        stroke: '#ff0000',
        strokeWidth: 3,
      },
    });
    const div = document.createElement('div');

    applyElementStyle(div, el);

    expect(div.dataset['fill']).toBe('#0000ff');
    expect(div.dataset['stroke']).toBe('#ff0000');
    expect(div.dataset['strokeWidth']).toBe('3');
  });
});

describe('Built-in renderer output contracts', () => {
  let host: HTMLDivElement;
  let registry: ComponentRegistry;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    registry = new ComponentRegistry();
    registerBuiltInRenderers(registry);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  // -----------------------------------------------------------------------
  // Text renderer
  // -----------------------------------------------------------------------

  describe('text renderer', () => {
    /**
     * @description Text elements must produce a container with data-element-id
     * and a child with data-element-content containing the sanitized HTML.
     */
    it('renders sanitized text content with correct data attributes', () => {
      const el = makeElement({
        id: 'txt-1',
        type: 'text',
        content: '<b>Hello</b>',
        style: { opacity: 1, fontFamily: 'Arial', fontSize: 16, fontColor: '#fff' },
      });

      mountElement(registry, el, host);

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="txt-1"]`);

      expect(container).not.toBeNull();

      const content = container?.querySelector(`[${DATA_ELEMENT_CONTENT}]`);

      expect(content).not.toBeNull();
      expect(content?.innerHTML).toBe('<b>Hello</b>');
    });

    /**
     * @description Text renderer must strip script tags from content to
     * prevent XSS attacks (defense-in-depth at render time).
     */
    it('strips script tags from text content', () => {
      const el = makeElement({
        id: 'txt-xss',
        type: 'text',
        content: 'Safe<script>alert("xss")</script>Text',
      });

      mountElement(registry, el, host);

      const content = host.querySelector(`[${DATA_ELEMENT_CONTENT}]`);

      expect(content?.innerHTML).not.toContain('<script');
      expect(content?.innerHTML).toContain('Safe');
      expect(content?.innerHTML).toContain('Text');
    });

    /**
     * @description Text renderer must strip event handler attributes from
     * content to prevent XSS.
     */
    it('strips event handler attributes from text content', () => {
      const el = makeElement({
        id: 'txt-eh',
        type: 'text',
        content: '<b onmouseover="alert(1)">bold</b>',
      });

      mountElement(registry, el, host);

      const content = host.querySelector(`[${DATA_ELEMENT_CONTENT}]`);

      expect(content?.innerHTML).not.toContain('onmouseover');
      expect(content?.innerHTML).toContain('<b>');
      expect(content?.innerHTML).toContain('bold');
    });

    /**
     * @description Text renderer update must also sanitize content to
     * prevent XSS on dynamic updates.
     */
    it('sanitizes content on update', () => {
      const el = makeElement({
        id: 'txt-upd',
        type: 'text',
        content: 'initial',
      });

      const instance = mountElement(registry, el, host);

      instance.update(
        makeElement({
          id: 'txt-upd',
          type: 'text',
          content: '<img src=x onerror="alert(1)">updated',
        }),
      );

      const content = host.querySelector(`[${DATA_ELEMENT_CONTENT}]`);

      expect(content?.innerHTML).not.toContain('onerror');
      expect(content?.innerHTML).not.toContain('<img');
      expect(content?.innerHTML).toContain('updated');
    });
  });

  // -----------------------------------------------------------------------
  // Image renderer
  // -----------------------------------------------------------------------

  describe('image renderer', () => {
    /**
     * @description Image elements must render an img tag with src set to
     * the element content and proper sizing.
     */
    it('renders an img element with src from content', () => {
      const el = makeElement({
        id: 'img-1',
        type: 'image',
        content: 'https://example.com/photo.jpg',
      });

      mountElement(registry, el, host);

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="img-1"]`);
      const img = container?.querySelector('img');

      expect(img).not.toBeNull();
      expect(img?.src).toBe('https://example.com/photo.jpg');
      expect(img?.style.objectFit).toBe('cover');
    });

    /**
     * @description When the image fails to load, a placeholder must be
     * shown instead of a broken image icon.
     */
    it('shows fallback placeholder on image error', () => {
      const el = makeElement({
        id: 'img-err',
        type: 'image',
        content: 'https://example.com/broken.jpg',
      });

      mountElement(registry, el, host);

      const img = host.querySelector('img');

      // Trigger the onerror handler
      img?.dispatchEvent(new Event('error'));

      const placeholder = host.querySelector(`[${DATA_ELEMENT_ID}="img-err"]`)?.lastElementChild;

      expect(placeholder?.textContent).toBe('⚠ Image');
    });
  });

  // -----------------------------------------------------------------------
  // SVG renderer
  // -----------------------------------------------------------------------

  describe('svg renderer', () => {
    /**
     * @description SVG elements must render inline SVG content directly into
     * a content container, preserving the SVG markup.
     */
    it('renders inline SVG content', () => {
      const svgContent = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
      const el = makeElement({
        id: 'svg-1',
        type: 'svg',
        content: svgContent,
      });

      mountElement(registry, el, host);

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="svg-1"]`);
      const content = container?.querySelector(`[${DATA_ELEMENT_CONTENT}]`);
      const svg = content?.querySelector('svg');

      expect(svg).not.toBeNull();
      expect(svg?.querySelector('circle')).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Path renderer
  // -----------------------------------------------------------------------

  describe('path renderer', () => {
    /**
     * @description Path elements must render an SVG path with the d attribute
     * set from element content and fill/stroke from style.
     */
    it('renders SVG path with d attribute and fill/stroke', () => {
      const el = makeElement({
        id: 'path-1',
        type: 'path',
        content: 'M 0 0 L 100 100',
        style: { opacity: 1, fill: '#ff0000', stroke: '#00ff00', strokeWidth: 2 },
      });

      mountElement(registry, el, host);

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="path-1"]`);
      const path = container?.querySelector('path');

      expect(path).not.toBeNull();
      expect(path?.getAttribute('d')).toBe('M 0 0 L 100 100');
      expect(path?.getAttribute('fill')).toBe('#ff0000');
      expect(path?.getAttribute('stroke')).toBe('#00ff00');
      expect(path?.getAttribute('stroke-width')).toBe('2');
    });

    /**
     * @description Path elements without explicit fill must default to 'none'.
     */
    it('defaults fill to none when not specified', () => {
      const el = makeElement({
        id: 'path-nofill',
        type: 'path',
        content: 'M 0 0 L 50 50',
      });

      mountElement(registry, el, host);

      const path = host.querySelector('path');

      expect(path?.getAttribute('fill')).toBe('none');
    });
  });

  // -----------------------------------------------------------------------
  // Rectangle renderer
  // -----------------------------------------------------------------------

  describe('rectangle renderer', () => {
    /**
     * @description Rectangle elements must produce a div with data-element-id,
     * data-element-content, and applied styles.
     */
    it('renders a styled div with correct attributes', () => {
      const el = makeElement({
        id: 'rect-1',
        type: 'rectangle',
        style: { opacity: 1, backgroundColor: '#0000ff' },
      });

      mountElement(registry, el, host);

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="rect-1"]`);

      expect(container).not.toBeNull();
      expect(container?.hasAttribute(DATA_ELEMENT_CONTENT)).toBe(true);
      expect((container as HTMLElement).style.backgroundColor).toBe('rgb(0, 0, 255)');
    });
  });

  // -----------------------------------------------------------------------
  // Ellipse renderer
  // -----------------------------------------------------------------------

  describe('ellipse renderer', () => {
    /**
     * @description Ellipse elements must apply border-radius: 50% to produce
     * a circular/elliptical shape.
     */
    it('applies 50% border radius for elliptical shape', () => {
      const el = makeElement({
        id: 'ell-1',
        type: 'ellipse',
        style: { opacity: 1, backgroundColor: '#ff0000' },
      });

      mountElement(registry, el, host);

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="ell-1"]`) as HTMLElement;

      expect(container.style.borderRadius).toBe('50%');
    });
  });

  // -----------------------------------------------------------------------
  // Group renderer
  // -----------------------------------------------------------------------

  describe('group renderer', () => {
    /**
     * @description Group elements must render as positioned containers that
     * child elements can be appended into by the page renderer.
     */
    it('renders a positioned container with data attributes', () => {
      const el = makeElement({
        id: 'grp-1',
        type: 'group',
        position: { x: 50, y: 100 },
        width: 400,
        height: 200,
      });

      mountElement(registry, el, host);

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="grp-1"]`) as HTMLElement;

      expect(container).not.toBeNull();
      expect(container.hasAttribute(DATA_ELEMENT_CONTENT)).toBe(true);
      expect(container.style.position).toBe('absolute');
      expect(container.style.left).toBe('50px');
      expect(container.style.top).toBe('100px');
    });
  });

  // -----------------------------------------------------------------------
  // QR code renderer
  // -----------------------------------------------------------------------

  describe('qrcode renderer', () => {
    /**
     * @description QR code elements with content must render an actual SVG
     * QR code, not just placeholder text.
     */
    it('renders an SVG QR code from content', () => {
      const el = makeElement({
        id: 'qr-1',
        type: 'qrcode',
        content: 'https://example.com',
      });

      mountElement(registry, el, host);

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="qr-1"]`);
      const content = container?.querySelector(`[${DATA_ELEMENT_CONTENT}]`);
      const svg = content?.querySelector('svg');

      expect(svg).not.toBeNull();
    });

    /**
     * @description QR code elements with empty content should render an
     * empty content container (no SVG).
     */
    it('renders empty container when content is empty', () => {
      const el = makeElement({
        id: 'qr-empty',
        type: 'qrcode',
        content: '',
      });

      mountElement(registry, el, host);

      const content = host.querySelector(`[${DATA_ELEMENT_CONTENT}]`);

      expect(content?.querySelector('svg')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Fallback renderer
  // -----------------------------------------------------------------------

  describe('fallback renderer', () => {
    /**
     * @description Unknown element types must be handled by the fallback
     * renderer, displaying the element type name as text.
     */
    it('renders element type name for unknown types', () => {
      const el = makeElement({
        id: 'custom-1',
        type: 'custom-widget',
      });

      const factory = registry.resolveRenderer('custom-widget');

      if (factory === undefined) {
        throw new Error('Expected fallback renderer to be registered');
      }

      const instance = factory(el, host);

      instance.mount();

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="custom-1"]`);

      expect(container?.textContent).toBe('custom-widget');
    });
  });

  // -----------------------------------------------------------------------
  // Common contracts across all types
  // -----------------------------------------------------------------------

  describe('common output contracts', () => {
    const typesWithContent = ['text', 'image', 'svg', 'path', 'rectangle', 'ellipse', 'qrcode', 'group'] as const;

    /**
     * @description Every built-in renderer must set data-element-id on its
     * root container so the playback engine can target elements.
     */
    it.each(typesWithContent)('%s renderer sets data-element-id', (type) => {
      const el = makeElement({
        id: `${type}-contract`,
        type,
        content:
          type === 'text' ? 'text'
          : type === 'image' ? 'https://example.com/img.jpg'
          : type === 'svg' ? '<svg></svg>'
          : type === 'path' ? 'M 0 0'
          : type === 'qrcode' ? 'data'
          : '',
      });

      mountElement(registry, el, host);

      const container = host.querySelector(`[${DATA_ELEMENT_ID}="${type}-contract"]`);

      expect(container).not.toBeNull();
    });

    /**
     * @description Every built-in renderer must have exactly one element
     * with data-element-content as the animation target.
     */
    it.each(typesWithContent)('%s renderer has exactly one data-element-content', (type) => {
      const el = makeElement({
        id: `${type}-content`,
        type,
        content:
          type === 'text' ? 'text'
          : type === 'image' ? 'https://example.com/img.jpg'
          : type === 'svg' ? '<svg></svg>'
          : type === 'path' ? 'M 0 0'
          : type === 'qrcode' ? 'data'
          : '',
      });

      mountElement(registry, el, host);

      const contentElements = host.querySelectorAll(`[${DATA_ELEMENT_CONTENT}]`);

      expect(contentElements.length).toBe(1);
    });

    /**
     * @description Calling destroy() must remove the rendered element from
     * the DOM, leaving the host empty.
     */
    it.each(typesWithContent)('%s renderer destroy removes element from DOM', (type) => {
      const el = makeElement({
        id: `${type}-destroy`,
        type,
        content:
          type === 'text' ? 'text'
          : type === 'image' ? 'https://example.com/img.jpg'
          : type === 'svg' ? '<svg></svg>'
          : type === 'path' ? 'M 0 0'
          : type === 'qrcode' ? 'data'
          : '',
      });

      const instance = mountElement(registry, el, host);

      expect(host.children.length).toBe(1);

      instance.destroy();

      expect(host.children.length).toBe(0);
    });
  });
});
