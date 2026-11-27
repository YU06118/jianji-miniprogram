/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/miniprogram'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          types: ['jest', 'miniprogram-api-typings'],
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/miniprogram/$1',
  },
  collectCoverageFrom: [
    'miniprogram/utils/**/*.ts',
    'miniprogram/services/**/*.ts',
    '!miniprogram/**/__tests__/**',
  ],
};
