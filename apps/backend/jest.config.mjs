export default {
  clearMocks: true,
  coverageDirectory: 'coverage',
  // Source files use explicit `.js` extensions for NodeNext ESM resolution;
  // map them back to the `.ts` source so Jest can resolve the real files.
  // Restricted to `src/` so dependencies' own relative requires (e.g. drizzle-orm's
  // internal `.cjs` files) are never rewritten.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // The workspace shared package's built output is ESM (`export * from`),
    // which Jest's CommonJS runtime can't parse without an extra transform.
    // Resolving straight to its TypeScript source lets the existing `@swc/jest`
    // transform (below) handle it the same as the backend's own source files.
    '^@binder-project-planner/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['@swc/jest', { jsc: { target: 'es2022' } }],
  },
};
