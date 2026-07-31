import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const config = {
  clearMocks: true,
  coverageDirectory: 'coverage',
  // next/jest is expected to derive this from tsconfig's `paths`, but it's listed
  // explicitly here too so alias resolution doesn't silently depend on that.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
};

// next/jest loads the Next.js SWC config, handles CSS/asset imports, and applies
// the project's tsconfig path aliases (e.g. `@/*`) automatically.
export default createJestConfig(config);
