const base = require('../../jest.base.cjs');

module.exports = {
  ...base,
  // ESM-only packages must be transformed by Babel for Jest's CommonJS test runner.
  // mediabunny is ESM-only and provides video container muxing (MP4/WebM).
  transformIgnorePatterns: [
    'node_modules/(?!(@heroui|@react-aria|@react-stately|@react-types|react-aria-components|tailwind-merge|tailwind-variants|@radix-ui|@internationalized|@libpdf|@noble|@scure|asn1js|pkijs|pvtsutils|pvutils|mediabunny)/)',
  ],
};
