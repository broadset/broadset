/**
 * Jest moduleNameMapper for @heroui/react.
 *
 * @heroui/react is ESM-only (no "require" export condition). Map it directly
 * to its ESM entry so babel-jest can transform it for jsdom tests.
 *
 * Used only by the workspaces that import @heroui/react in their tests
 * (ui, demo). Layer it on top of jest.base.cjs in those workspaces' configs.
 */
const path = require('path');

module.exports = {
  '^@heroui/react$': path.resolve(__dirname, 'node_modules/@heroui/react/dist/index.js'),
};
