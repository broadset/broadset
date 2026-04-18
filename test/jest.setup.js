require('@testing-library/jest-dom');

// jsdom does not expose TextEncoder / TextDecoder which some libraries need.
const { TextEncoder, TextDecoder } = require('node:util');
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}

// jsdom does not expose structuredClone; forward from Node global.
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (v) => require('node:v8').deserialize(require('node:v8').serialize(v));
}

// jsdom does not implement SVG geometry APIs (getTotalLength / getPointAtLength)
// and does not even expose an SVGPathElement subclass — createElementNS returns
// a base SVGElement. Libraries like flubber feature-detect `window` and prefer
// the browser path, which then throws. Polyfill both methods on SVGElement
// using svg-path-properties; only path elements will ever call them.
if (typeof SVGElement !== 'undefined' && typeof SVGElement.prototype.getTotalLength !== 'function') {
  const { svgPathProperties } = require('svg-path-properties');
  const cache = new WeakMap();
  const getProps = function (element) {
    const d = element.getAttribute('d') ?? '';
    const cached = cache.get(element);
    if (cached && cached.d === d) return cached.props;
    const props = new svgPathProperties(d);
    cache.set(element, { d, props });
    return props;
  };
  SVGElement.prototype.getTotalLength = function () {
    return getProps(this).getTotalLength();
  };
  SVGElement.prototype.getPointAtLength = function (len) {
    return getProps(this).getPointAtLength(len);
  };
}
