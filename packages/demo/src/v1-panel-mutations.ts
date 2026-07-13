import { updateElementRectV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import type { PropertyValue } from '@broadset/ui';

import { updateV1TransformAxis } from './v1-transform-axes';

const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})([0-9a-f]{2})?$/iu;

function parseHexColor(value: string): projectFormatV1.ColorValue | undefined {
  const match = HEX_COLOR_PATTERN.exec(value.trim());

  if (match === null) return undefined;

  const channels = match[1];
  const alpha = match[2];

  if (channels === undefined) return undefined;

  return {
    kind: 'color',
    space: 'srgb',
    channels: [
      Number.parseInt(channels.slice(0, 2), 16) / 255,
      Number.parseInt(channels.slice(2, 4), 16) / 255,
      Number.parseInt(channels.slice(4, 6), 16) / 255,
    ],
    alpha: alpha === undefined ? 1 : Number.parseInt(alpha, 16) / 255,
  };
}

function updateTextRuns(
  element: projectFormatV1.TextElement,
  updater: (run: projectFormatV1.TextRun) => projectFormatV1.TextRun,
): projectFormatV1.TextElement {
  return {
    ...element,
    text: {
      paragraphs: element.text.paragraphs.map((paragraph) => ({
        ...paragraph,
        runs: paragraph.runs.map(updater),
      })),
    },
  };
}

function updateTextContent(element: projectFormatV1.TextElement, content: string): projectFormatV1.TextElement {
  let updated = false;

  return {
    ...element,
    text: {
      paragraphs: element.text.paragraphs.map((paragraph) => ({
        ...paragraph,
        runs: paragraph.runs.map((run) => {
          if (updated) return run;

          updated = true;

          return { ...run, text: content };
        }),
      })),
    },
  };
}

function updateContent(element: projectFormatV1.Element, value: string): projectFormatV1.Element {
  switch (element.kind) {
    case 'text':
      return updateTextContent(element, value);
    case 'qrcode':
      return { ...element, qrcode: { ...element.qrcode, value } };
    case 'clock':
      return { ...element, clock: { ...element.clock, format: value } };

    case 'ticker': {
      const first = element.ticker.items[0];

      return first === undefined ? element : (
          {
            ...element,
            ticker: {
              ...element.ticker,
              items: element.ticker.items.map((item, index) => (index === 0 ? { ...item, text: value } : item)),
            },
          }
        );
    }

    default:
      return element;
  }
}

function updateSolidFill(element: projectFormatV1.Element, color: projectFormatV1.ColorValue): projectFormatV1.Element {
  const fills = element.appearance.fills;
  const firstFill = fills[0];
  const fill: projectFormatV1.FillLayer = {
    id: firstFill?.id ?? projectFormatV1.idSchema.parse(`${element.id}-ui-fill`),
    enabled: true,
    opacity: firstFill?.opacity ?? 1,
    blendMode: firstFill?.blendMode ?? 'normal',
    paint: { kind: 'solid', color },
  };

  return {
    ...element,
    appearance: {
      ...element.appearance,
      fills: firstFill === undefined ? [fill] : fills.map((candidate, index) => (index === 0 ? fill : candidate)),
    },
  };
}

function updateTextProperty(options: {
  readonly element: projectFormatV1.Element;
  readonly key: string;
  readonly value: PropertyValue;
}): projectFormatV1.Element {
  if (options.element.kind !== 'text') return options.element;

  if (options.key === 'fontSize' && typeof options.value === 'number' && options.value > 0) {
    const size: number = options.value;

    return updateTextRuns(options.element, (run) => ({
      ...run,
      properties: { ...run.properties, size },
    }));
  }

  if (options.key === 'fontWeight' && typeof options.value === 'number' && Number.isInteger(options.value)) {
    const weight: number = options.value;

    return updateTextRuns(options.element, (run) => ({
      ...run,
      properties: { ...run.properties, weight },
    }));
  }

  if (options.key === 'fontColor' && typeof options.value === 'string') {
    const color = parseHexColor(options.value);

    return color === undefined ?
        options.element
      : updateTextRuns(options.element, (run) => ({
          ...run,
          properties: { ...run.properties, color },
        }));
  }

  return options.element;
}

function updateTransformAxisProperty(options: {
  readonly element: projectFormatV1.Element;
  readonly key: 'rotateX' | 'rotateY' | 'rotateZ' | 'translateZ';
  readonly value: PropertyValue;
}): projectFormatV1.Element {
  if (typeof options.value !== 'number' || !Number.isFinite(options.value)) return options.element;

  return {
    ...options.element,
    geometry: {
      ...options.element.geometry,
      transform: updateV1TransformAxis({
        transform: options.element.geometry.transform,
        axis: options.key,
        value: options.value,
      }),
    },
  };
}

function updateGeometryProperty(options: {
  readonly element: projectFormatV1.Element;
  readonly key: string;
  readonly value: PropertyValue;
}): projectFormatV1.Element | undefined {
  const { element, key, value } = options;

  switch (key) {
    case 'x':
      return typeof value === 'number' ? updateElementRectV1(element, { x: value }) : element;
    case 'y':
      return typeof value === 'number' ? updateElementRectV1(element, { y: value }) : element;
    case 'width':
      return typeof value === 'number' && value > 0 ? updateElementRectV1(element, { width: value }) : element;
    case 'height':
      return typeof value === 'number' && value > 0 ? updateElementRectV1(element, { height: value }) : element;
    case 'rotation':
      return typeof value === 'number' ? updateElementRectV1(element, { rotation: value }) : element;
    case 'rotateX':
    case 'rotateY':
    case 'rotateZ':
    case 'translateZ':
      return updateTransformAxisProperty({ element, key, value });
    default:
      return undefined;
  }
}

export function updateElementFromPanelV1(options: {
  readonly element: projectFormatV1.Element;
  readonly key: string;
  readonly value: PropertyValue;
}): projectFormatV1.Element {
  const { element, key, value } = options;
  const geometryUpdated = updateGeometryProperty(options);

  if (key === 'name' && typeof value === 'string') return { ...element, name: value };
  if (key === 'content' && typeof value === 'string') return updateContent(element, value);
  if (geometryUpdated !== undefined) return geometryUpdated;

  if (key === 'opacity' && typeof value === 'number' && value >= 0 && value <= 1) {
    return { ...element, appearance: { ...element.appearance, opacity: value } };
  }

  if ((key === 'backgroundColor' || key === 'fill') && typeof value === 'string') {
    const color = parseHexColor(value);

    return color === undefined ? element : updateSolidFill(element, color);
  }

  return updateTextProperty(options);
}
