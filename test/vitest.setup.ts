import '@testing-library/jest-dom/vitest';

import { deserialize, serialize } from 'node:v8';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';
import { cleanup } from '@testing-library/react';
import { svgPathProperties } from 'svg-path-properties';
import { afterEach } from 'vitest';

// With `globals: false`, @testing-library/react cannot auto-register its
// `afterEach(cleanup)` side-effect, so DOM from previous tests leaks into
// subsequent ones. Register it here once for every jsdom test run.
afterEach(() => {
  cleanup();
});

if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as { TextEncoder: typeof NodeTextEncoder }).TextEncoder = NodeTextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as { TextDecoder: typeof NodeTextDecoder }).TextDecoder = NodeTextDecoder;
}

if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(value: T): T => deserialize(serialize(value)) as T;
}

// jsdom does not implement SVG geometry APIs (getTotalLength / getPointAtLength)
// and does not even expose an SVGPathElement subclass — createElementNS returns
// a base SVGElement. Libraries like flubber feature-detect `window` and prefer
// the browser path, which then throws. Polyfill both methods on SVGElement
// using svg-path-properties; only path elements will ever call them.
interface SvgGeometryPoint {
  readonly x: number;
  readonly y: number;
}

interface SvgGeometryTarget {
  getTotalLength(this: SVGElement): number;
  getPointAtLength(this: SVGElement, len: number): SvgGeometryPoint;
}

if (typeof SVGElement !== 'undefined') {
  const geometryProto = SVGElement.prototype as unknown as Partial<SvgGeometryTarget>;
  if (typeof geometryProto.getTotalLength !== 'function') {
    type PathProps = InstanceType<typeof svgPathProperties>;
    const cache = new WeakMap<SVGElement, { d: string; props: PathProps }>();
    const getProps = (element: SVGElement): PathProps => {
      const d = element.getAttribute('d') ?? '';
      const cached = cache.get(element);
      if (cached && cached.d === d) return cached.props;
      const props = new svgPathProperties(d);
      cache.set(element, { d, props });
      return props;
    };
    geometryProto.getTotalLength = function getTotalLength(this: SVGElement): number {
      return getProps(this).getTotalLength();
    };
    geometryProto.getPointAtLength = function getPointAtLength(this: SVGElement, len: number): SvgGeometryPoint {
      return getProps(this).getPointAtLength(len);
    };
  }
}
