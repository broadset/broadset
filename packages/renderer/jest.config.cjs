const base = require('../../jest.base.cjs');

module.exports = {
  ...base,
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.m?[jt]sx?$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: false }], '@babel/preset-typescript'],
        plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }]],
      },
    ],
  },
};
