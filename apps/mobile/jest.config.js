module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@planner/shared$': '<rootDir>/../../packages/shared/src',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*)/)',
  ],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // The first test in a file also pays for loading the screen's modules; on a
  // busy machine with every worker running that can pass 5 s.
  testTimeout: 15000,
};
