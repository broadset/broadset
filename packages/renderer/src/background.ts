import {
  type BroadsetElementStyle,
  type BroadsetFill,
  gradientToCss,
  resolveStyleColor,
} from '@broadset/model';

/**
 * Applies the element's canonical {@link BroadsetFill} to a DOM host as
 * CSS `background-color` / `background-image`. Dispatches on
 * `fill.kind` per Phase 1 unit #8:
 *
 * - `none`: clears every background property.
 * - `solid`: writes `backgroundColor` from the canonical
 *   {@link BroadsetColor}; clears `backgroundImage`.
 * - `gradient`: writes the CSS gradient string to `backgroundImage`;
 *   clears `backgroundColor`. Stores the structured gradient JSON on
 *   `data-gradient` for playback animation targeting.
 * - `pattern` / `picture`: asset-registry resolution lands in Phase 4;
 *   for now, clears every background property and skips the
 *   `data-gradient` attribute so preflight surfaces the unused fill.
 */
export function applyBackgroundStyle(node: HTMLElement, style: BroadsetElementStyle): void {
  const fill = style.fill;

  if (fill.kind === 'gradient') {
    node.style.background = '';
    node.style.backgroundColor = '';
    node.style.backgroundImage = gradientToCss(fill.gradient);
    node.dataset['gradient'] = JSON.stringify(fill.gradient);

    return;
  }

  delete node.dataset['gradient'];

  if (fill.kind === 'solid') {
    const backgroundColorCss = resolveStyleColor(fill.color, { resolveTheme: false });

    if (backgroundColorCss !== undefined) {
      node.style.background = '';
      node.style.backgroundImage = '';
      node.style.backgroundColor = backgroundColorCss;

      return;
    }
  }

  node.style.background = '';
  node.style.backgroundImage = '';
  node.style.backgroundColor = '';
}

/**
 * Convenience shorthand for tests and playback adapters that only
 * need to know whether a fill is a solid color. Returns the canonical
 * CSS color string, or `undefined` for any non-solid kind.
 */
export function fillToCssBackgroundColor(fill: BroadsetFill): string | undefined {
  if (fill.kind !== 'solid') return undefined;

  return resolveStyleColor(fill.color, { resolveTheme: false });
}
