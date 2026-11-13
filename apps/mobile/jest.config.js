module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@planner/shared$': '<rootDir>/../../packages/shared/src',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*)/)',
  ],
  setupFiles: ['<rootDir>/jest.setup.ts'],
};
