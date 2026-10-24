import { defineConfig } from '@playwright/test';

/**
 * Separate config so normal `npm run test:e2e` never regenerates documentation screenshots.
 * Run with `npm run docs:screenshots`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: ['**/screenshots.spec.ts'],
  timeout: 60 * 1000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'tests/test-results/',
});
