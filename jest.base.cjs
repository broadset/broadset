/**
 * Shared Jest base config — extend in every package's jest.config.cjs:
 *
 *   const base = require('../../jest.base.cjs');
 *   module.exports = { ...base };
 *
 * All code is browser-only. testEnvironment defaults to 'jsdom'.
 */
module.exports = {
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: [require.resolve('./test/jest.setup.js')],
  moduleNameMapper: {
    '[.](css|less|scss)$': require.resolve('./test/mocks/styleMock.js'),
    '[.](svg|png|jpg|jpeg|gif|webp)$': require.resolve('./test/mocks/fileMock.js'),
  },
  transform: {
    '^.+\\.m?[jt]sx?$': ['babel-jest', { configFile: require.resolve('./babel.config.json') }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json'],
};
