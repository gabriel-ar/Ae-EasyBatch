import { test as base } from '@playwright/test';
import { expect } from '@playwright/test';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';

/**
 * Helper utilities for connecting to and interacting with 
 * the live After Effects CEP instance using Puppeteer
 * 
 * Puppeteer is used instead of Playwright because CEF doesn't support
 * browser context management that Playwright expects
 */

let sharedBrowser: Browser | null = null;
let sharedPage: Page | null = null;

/**
 * Connect to the CEF instance using Puppeteer
 * This connects to the existing CEF browser without trying to manage it
 */
async function connectToCEF(): Promise<{ browser: Browser; page: Page }> {
  if (sharedBrowser && sharedPage) {
    return { browser: sharedBrowser, page: sharedPage };
  }

  try {
    // Connect to CEF via browserURL (Puppeteer feature)
    sharedBrowser = await puppeteer.connect({
      browserURL: 'http://localhost:8009',
      defaultViewport: null,
    });
    
    // Get all pages (tabs) from the browser
    const pages = await sharedBrowser.pages();

    // Find the extension page
    let extensionPage = pages.find(
      (p) =>
        p.url().includes('index.html') ||
        p.url().includes('dev.html') ||
        p.url().includes('localhost:5173')
    );

    if (!extensionPage) {
      extensionPage = pages[0];
      console.warn(
        `Could not find extension page. Using first available page: ${extensionPage?.url()}`
      );
    }

    if (!extensionPage) {
      throw new Error(
        'No pages found in CEF. Is the extension loaded in After Effects?'
      );
    }

    // Wait for the app to be ready
    await extensionPage.waitForSelector('#app', { timeout: 10000 });

    sharedPage = extensionPage;
    return { browser: sharedBrowser, page: sharedPage };
  } catch (error) {
    console.error('Failed to connect to CEF:', error);
    throw error;
  }
}

/**
 * Disconnect from CEF
 */
async function disconnectFromCEF() {
  if (sharedBrowser) {
    try {
      await sharedBrowser.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    sharedBrowser = null;
    sharedPage = null;
  }
}

/**
 * Export base Playwright test (we'll use Puppeteer for browser, Playwright for test framework)
 */
export const test = base;

// Re-export expect
export { expect };

/**
 * Helper to manually get the CEF page
 * Use this in tests: const page = await getCEFPage();
 */
export async function getCEFPage(): Promise<Page> {
  const { page } = await connectToCEF();
  return page;
}

/**
 * Helper to disconnect (call in afterAll if needed)
 */
export async function closeCEFConnection() {
  await disconnectFromCEF();
}

/**
 * Helper to wait for ExtendScript evaluation to complete
 * CEP extensions communicate async with After Effects
 */
export async function waitForExtendScript(page: Page, maxWait = 3000) {
  await new Promise(resolve => setTimeout(resolve, maxWait));
}

