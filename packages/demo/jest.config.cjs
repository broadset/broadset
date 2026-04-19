const base = require('../../jest.base.cjs');
const heroui = require('../../jest.heroui-mapper.cjs');

module.exports = {
  ...base,
  moduleNameMapper: { ...base.moduleNameMapper, ...heroui },
};
