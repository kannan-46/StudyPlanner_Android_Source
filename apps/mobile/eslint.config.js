// Flat-config shim: the repo root has a flat config that ignores apps/mobile,
// so ESLint 8 would otherwise skip every file here. Reuse the RN eslintrc.
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  { ignores: ['android/**', 'node_modules/**'] },
  ...compat.config(require('./.eslintrc.js')),
];
