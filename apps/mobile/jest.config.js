module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@planner/shared$': '<rootDir>/../../packages/shared/src',
    // Babel helpers emitted while compiling packages/shared resolve from the
    // app's node_modules, as Metro does through `nodeModulesPaths`.
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*)/)',
  ],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // The first test in a file also pays for loading the screen's modules; on a
  // busy machine with every worker running that can pass 5 s.
  testTimeout: 15000,
};
