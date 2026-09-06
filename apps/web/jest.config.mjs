/**
 * Jest for the web app, through Next's preset: it wires the SWC transform (TSX, JSX, the shared package's raw TypeScript),
 * CSS imports and the `@` alias from tsconfig, so this file only says where the tests are and what runs before them.
 */
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

export default createJestConfig({
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/**/*.test.{ts,tsx}'],   // a test with no JSX is a .ts file
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },   // the preset maps `@` for imports; jest.mock() needs it spelled out too
  restoreMocks: true,                                   // every jest.spyOn is undone after each test
  clearMocks: true,                                     // and every jest.fn() forgets its calls, so tests cannot leak into each other
  watchman: false,                                      // file crawling without Watchman: one less machine-specific dependency
});