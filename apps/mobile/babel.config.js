module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // zod 4 uses `export * as ns from`, which Metro must transform.
  plugins: ['@babel/plugin-transform-export-namespace-from'],
};
