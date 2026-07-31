export default {
  clearMocks: true,
  coverageDirectory: 'coverage',
  // Source files use explicit `.js` extensions for NodeNext ESM resolution;
  // map them back to the `.ts` source so Jest can resolve the real files.
  // Restricted to `src/` so dependencies' own relative requires (e.g. drizzle-orm's
  // internal `.cjs` files) are never rewritten.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['@swc/jest', { jsc: { target: 'es2022' } }],
  },
};
