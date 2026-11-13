module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@planner/shared$': '<rootDir>/../../packages/shared/src',
  },
  testTimeout: 30000,
};
