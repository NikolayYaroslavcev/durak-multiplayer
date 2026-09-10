/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^@game/game-core$': '<rootDir>/../../packages/game-core/src/index.ts',
    '^@game/game-core/(.*)$': '<rootDir>/../../packages/game-core/src/$1',
  },
  testTimeout: 10000,
};
