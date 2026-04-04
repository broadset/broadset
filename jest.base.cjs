/**
 * Shared Jest base config — extend in every package's jest.config.cjs:
 *
 *   const base = require('../../jest.base.cjs');
 *   module.exports = { ...base };
 *
 * All code is browser-only. testEnvironment defaults to 'jsdom'.
 */
const path = require('path');

module.exports = {
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: [require.resolve('./test/jest.setup.js')],
  moduleNameMapper: {
    '[.](css|less|scss)$': require.resolve('./test/mocks/styleMock.js'),
    '[.](svg|png|jpg|jpeg|gif|webp)$': require.resolve('./test/mocks/fileMock.js'),
    // @heroui/react is ESM-only (no "require" export condition).
    // Map it directly to its ESM entry so babel-jest can transform it.
    '^@heroui/react$': path.resolve(__dirname, 'node_modules/@heroui/react/dist/index.js'),
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@heroui|@react-aria|@react-stately|@react-types|react-aria-components|tailwind-merge|tailwind-variants|@radix-ui|@internationalized)/)',
  ],
  transform: {
    '^.+\\.m?[jt]sx?$': ['babel-jest', { configFile: require.resolve('./babel.config.json') }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json'],
};
