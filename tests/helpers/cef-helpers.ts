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

  private connecting: Promise<void> | null = null;

  constructor(debugPort: number = 8009, pageSelectors: string[] = ['index.html', 'dev.html', 'localhost:5173']) {
    this.debugPort = debugPort;
    this.pageSelectors = pageSelectors;

    this.Connect().catch(() => { /* surfaced again when a test awaits GetConnection() */ });
  }

  /**
   * Connect to the CEF instance being used by AE using Puppeteer.
   * Concurrent calls share one connection: a second Puppeteer connection would produce another
   * Page object for the same tab, and element handles can't be used across Page objects.
   */
  Connect(): Promise<void> {
    if (!this.connecting) {
      this.connecting = this.DoConnect().catch((error) => {
        this.connecting = null;
        throw error;
      });
    }
    return this.connecting;
  }

  private async DoConnect() {
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
      this.connecting = null;
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

    // Tap the button itself: wide dropdowns (min-width / width:100%) have empty space around it
    const trigger = (await dropdown.$('.dropbtn')) ?? dropdown;
    await trigger.tap(); // Open the dropdown

    const opts = await dropdown.$$(`.dropdown-content button`);
    for (const opt of opts) {
      const text = await opt.evaluate((el) => el.textContent?.trim());

      if (text === option) {
        await opt.tap();
        return true;
      }
    }

    let availableOptions = await Promise.all(opts.map(o => o.evaluate(el => el.textContent?.trim())));
    throw new Error(`Option "${option}" not found in dropdown: ${selector}. Options were: ${availableOptions.join(', ')}`);
  }

  private get pg(): Page {
    if (!this.page) throw new Error('Not connected to CEF');
    return this.page;
  }

  /** Evaluates an ExtendScript snippet in After Effects through the CEP bridge */
  async CsaEval(script: string): Promise<string> {
    return this.pg.evaluate((script: string): Promise<string> => {
      // @ts-ignore
      const a_cep = window.__adobe_cep__;
      return new Promise((resolve) => a_cep.evalScript(script, (r: string) => resolve(r)));
    }, script);
  }

  /**
   * Waits for the page execution context to be usable again. After events that reload the
   * page (app.open, window.location.reload) the old context is destroyed and Puppeteer calls
   * throw until the new one finishes loading.
   */
  async WaitForPageContext(timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await this.pg.waitForSelector('.header_tabs', { timeout: 3000 });
        return;
      } catch {
        await Sleep(500);
      }
    }
    throw new Error(`Page context did not become ready within ${timeoutMs}ms`);
  }

  /** Closes the current project without saving, opens `projectPath` and waits for the extension to reload */
  async OpenProject(projectPath: string): Promise<void> {
    if (!projectPath) throw new Error('Project path is empty (see tests/.env.example)');
    if ((await this.CsaEval(`new File(${JSON.stringify(projectPath)}).exists`)) !== 'true') {
      throw new Error(`Project not found: ${projectPath}`);
    }

    await this.CsaEval('app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES)');
    await this.CsaEval(`app.openFast(new File(${JSON.stringify(projectPath)}))`);

    // The extension doesn't always reload on its own when a project opens
    this.pg.reload();
    await this.WaitForPageContext();

    const noTmpls = await this.pg.$('.fs_no_tmpls');
    if (noTmpls) {
      await (await noTmpls.$('button::-p-text(Reload)'))?.tap();
      await this.pg.waitForSelector('.fs_no_tmpls', { hidden: true });
    }
  }

  /** Waits for the element to exist and returns it, throwing if it doesn't show up */
  async Find(selector: string, timeout = 5000): Promise<ElementHandle<Element>> {
    const el = await this.pg.waitForSelector(selector, { timeout });
    if (!el) throw new Error(`Element not found: ${selector}`);
    return el as ElementHandle<Element>;
  }

  async SelectTemplate(name: string): Promise<void> {
    await this.DropdownSelect('.header_template .dropdown', name);
    await Sleep(500);
  }

  async GoToTab(tab: 'Data' | 'Output' | 'Settings'): Promise<void> {
    await (await this.Find(`.header_tabs button::-p-text(${tab})`)).tap();
    await Sleep(400);
  }

  /** Opens a menu of the Data tab bar and waits until it is fully visible */
  async OpenMenu(button: 'File' | 'Edit' | 'View'): Promise<void> {
    await this.pg.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await (await this.Find(`nav button::-p-text(${button})`)).tap();
    await this.pg.waitForFunction(() => {
      const m = document.querySelector('.c_menu') as HTMLElement | null;
      return !!m && getComputedStyle(m).opacity === '1';
    });
  }

  async CloseMenu(): Promise<void> {
    const bg = await this.pg.$('.c_menu_bg');
    if (bg) await bg.tap();
    await this.pg.waitForSelector('.c_menu', { hidden: true });
  }

  /** Replaces the textarea content through real input events so Svelte bindings update */
  async SetTextarea(selector: string, value: string): Promise<void> {
    const ta = await this.Find(selector);
    await ta.click({ count: 3 });
    await this.pg.keyboard.down('Control');
    await this.pg.keyboard.press('KeyA');
    await this.pg.keyboard.up('Control');
    await this.pg.keyboard.type(value);
    await Sleep(400);
  }

  /**
   * The panel can't be resized from a test, so show a banner (with the live size) inside the
   * panel and wait until the user has resized it and pressed Continue. The banner is removed
   * before returning. There is no timeout: callers should disable their own test timeout.
   */
  async WaitForManualResize(message: string): Promise<void> {
    console.log(`\n>>> MANUAL STEP: ${message}, then press Continue in the panel.\n`);

    await this.pg.evaluate(
      (msg) => new Promise<void>((resolve) => {
        const bar = document.createElement('div');
        bar.style.cssText = [
          'position:fixed',
          'left:0',
          'right:0',
          'bottom:0',
          'display:flex',
          'gap:8px',
          'align-items:center',
          'padding:8px',
          'background:rgba(179,107,0,0.6)',
          'color:#fff',
          'z-index:2147483647',
        ].join(';');
        const text = document.createElement('span');
        text.textContent = msg;
        text.style.flex = '1';
        const size = document.createElement('span');
        size.style.fontVariantNumeric = 'tabular-nums';
        const UpdateSize = () => {
          size.textContent = `${window.innerWidth} x ${window.innerHeight}`;
        };
        UpdateSize();
        window.addEventListener('resize', UpdateSize);
        const btn = document.createElement('button');
        btn.textContent = 'Continue';
        btn.onclick = () => {
          window.removeEventListener('resize', UpdateSize);
          bar.remove();
          resolve();
        };
        bar.append(text, size, btn);
        document.body.appendChild(bar);
      }),
      message
    );

    // Let the layout settle after the resize
    await Sleep(800);
  }
}

export const Sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Singleton instance for convenience
const con = new CEFConnection();

export const GetConnection = async () => {
  if (!con.IsConnected()) {
    await con.Connect();
  }
  return con;
}

