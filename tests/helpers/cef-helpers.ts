import puppeteer from 'puppeteer-core';
import type { Browser, ElementHandle, Page } from 'puppeteer-core';

/**
 * Helper utilities for connecting to and interacting with 
 * the live After Effects CEP instance using Puppeteer
 * 
 * Puppeteer is used instead of Playwright because CEF doesn't support
 * browser context management that Playwright expects
 */

/**
 * Manages connection to the CEF (Chromium Embedded Framework) instance
 * running in After Effects. Maintains a singleton connection to avoid
 * reconnecting for each test.
 */
export class CEFConnection {
  private browser: Browser | null = null;
  page: Page | null = null;
  private readonly debugPort: number;
  private readonly pageSelectors: string[];

  constructor(debugPort: number = 8009, pageSelectors: string[] = ['index.html', 'dev.html', 'localhost:5173']) {
    this.debugPort = debugPort;
    this.pageSelectors = pageSelectors;

    this.Connect();
  }

  /**
   * Connect to the CEF instance being used by AE using Puppeteer
   * Returns the browser and page, reusing existing connection if available
   */
  async Connect() {
    try {
      // Connect to CEF via browserURL (Puppeteer feature)
      this.browser = await puppeteer.connect({
        browserURL: `http://localhost:${this.debugPort}`,
        defaultViewport: null,
      });

      // Get all pages (tabs) from the browser
      const pages = await this.browser.pages();

      // Find the extension page
      let extensionPage = pages.find((p) =>
        this.pageSelectors.some((selector) => p.url().includes(selector))
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
      console.log('Connected to CEF page:', extensionPage.url());

      this.page = extensionPage;
    } catch (error) {
      console.error('Failed to connect to CEF:', error);
      throw error;
    }
  }


  /**
   * Disconnect from CEF
   */
  async Disconnect(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Check if currently connected
   */
  IsConnected(): boolean {
    return this.browser !== null && this.page !== null;
  }

  /** * Helper to select an option from a dropdown in the extension UI
   * @param selector - CSS selector for the dropdown element
   * @param option - Visible text of the option to select
   */
  async DropdownSelect(selector: string, option: string, base_node: ElementHandle | null = null): Promise<boolean> {
    if (!this.page)
      return false;

    let dropdown = base_node !== null ? await base_node.$(selector) : await this.page.$(selector);
    if (!dropdown) throw new Error(`Dropdown not found: ${selector}`);



    //wait until options are loaded ('No options available' text disappears from the dropdown content)
    await this.page.waitForFunction(
      (sel) => {
        const dropdownContent = document.querySelector(sel);
        if (!dropdownContent) return false;
        return !dropdownContent.textContent?.trim().includes('No options available');
      },
      { timeout: 15000, polling: 900 },
      selector + ' .dropdown-content'
    );


    // Re-query the dropdown because page.goto
    dropdown = base_node !== null ? await base_node.$(selector) : await this.page.$(selector);
    if (!dropdown) throw new Error(`Dropdown not found after possible reload: ${selector}`);

    await dropdown.tap(); // Open the dropdown

    const opts = await dropdown.$$(`.dropdown-content button`);
    for (const opt of opts) {
      const text = await opt.evaluate((el) => el.textContent?.trim());

      if (text === option) {
        await opt.tap();
        return true;
      }
    }

    throw new Error(`Option "${option}" not found in dropdown: ${selector}`);
  }
}

// Singleton instance for convenience
const con = new CEFConnection();

export const GetConnection = async () => {
  if (!con.IsConnected()) {
    await con.Connect();
  }
  return con;
}

