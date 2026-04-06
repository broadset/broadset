import type { BroadsetElementStyle, BroadsetGradient, BroadsetGradientStop } from '@broadset/model';

function formatGradientStop(stop: BroadsetGradientStop): string {
  return `${stop.color} ${String(stop.position)}%`;
}

function serializeGradient(gradient: string | BroadsetGradient): string {
  if (typeof gradient === 'string') {
    return gradient;
  }

  const stops = gradient.stops.map(formatGradientStop).join(', ');

  switch (gradient.type) {
    case 'linear': {
      const angle = gradient.angle ?? 180;

      return `linear-gradient(${String(angle)}deg, ${stops})`;
    }

    case 'radial': {
      const center = gradient.center ?? [50, 50];

      return `radial-gradient(circle at ${String(center[0])}% ${String(center[1])}%, ${stops})`;
    }

    case 'conic': {
      const angle = gradient.angle ?? 0;
      const center = gradient.center ?? [50, 50];

      return `conic-gradient(from ${String(angle)}deg at ${String(center[0])}% ${String(center[1])}%, ${stops})`;
    }
  }
}

export function applyBackgroundStyle(node: HTMLElement, style: BroadsetElementStyle): void {
  if (style.backgroundGradient !== undefined) {
    node.style.backgroundColor = '';
    node.style.background = serializeGradient(style.backgroundGradient);

    return;
  }

  if (style.backgroundColor !== undefined) {
    node.style.background = '';
    node.style.backgroundColor = style.backgroundColor;

    return;
  }

  node.style.background = '';
  node.style.backgroundColor = '';
}
