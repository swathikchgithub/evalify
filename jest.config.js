/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/__tests__/node/**/*.test.ts',
        '<rootDir>/__tests__/node/**/*.test.js',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
      },
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jest-environment-jsdom',
      testMatch: [
        '<rootDir>/__tests__/ui/**/*.test.ts',
        '<rootDir>/__tests__/ui/**/*.test.js',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
      },
    },
  ],
};

module.exports = config;
