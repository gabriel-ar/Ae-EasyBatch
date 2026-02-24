import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for testing EasyBatch CEP extension
 * Connects to the live After Effects CEF instance on port 8009
 * 
 * Prerequisites:
 * 1. After Effects must be running
 * 2. EasyBatch extension must be open
 * 3. Test project should be loaded (tests/fixtures/test-project.aep)
 */
export default defineConfig({
  // Specify test files in logical order (instead of alphabetical)
  testMatch: [
    '**/startup.spec.ts',
    '**/otm.spec.ts',
  ],
  
  // Timeout for each test
  timeout: 30 * 1000,
  
  // Timeout for expect() assertions
  expect: {
    timeout: 5000,
  },
  
  // Run tests in sequence (not parallel) since we're testing one AE instance
  fullyParallel: false,
  workers: 1,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry failed tests
  retries: 0,
  
  // Reporter to use
  reporter: [
    ['html'],
    ['list'],
  ],
  
  use: {
    // Base URL for CEF debugging port
    baseURL: 'http://localhost:8009',
    
    // Collect trace on failure for debugging
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video on failure
    video: 'retain-on-failure',
    
    // Emulate timezone
    timezoneId: 'America/New_York',
  },
  
  // Configure projects for different test scenarios
  projects: [
    {
      name: 'cef-chrome',
      use: { 
        ...devices['Desktop Chrome'],
        // CEF uses Chromium, so we test with Chrome
      },
    },
  ],
  
  // Output folder for test artifacts
  outputDir: 'tests/test-results/',
});
