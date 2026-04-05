const base = require('../../jest.base.cjs');

module.exports = {
  ...base,
  transformIgnorePatterns: [
    'node_modules/(?!(@heroui|@react-aria|@react-stately|@react-types|react-aria-components|tailwind-merge|tailwind-variants|@radix-ui|@internationalized|@libpdf|@noble|@scure|asn1js|pkijs|pvtsutils|pvutils)/)',
  ],
};
