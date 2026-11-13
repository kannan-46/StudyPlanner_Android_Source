// Flat-config shim: the repo root has a flat config that ignores apps/mobile,
// so ESLint 8 would otherwise skip every file here. Reuse the RN eslintrc.
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  { ignores: ['android/**', 'node_modules/**'] },
  ...compat.config(require('./.eslintrc.js')),
  // Theme-driven styles are computed per render in the UI kit.
  {
    files: ['src/shared/ui/**'],
    rules: { 'react-native/no-inline-styles': 'off' },
  },
];
