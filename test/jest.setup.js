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
