import { test, expect, con} from '../helpers/cef-helpers';
import type { Page } from 'puppeteer-core';

/**
 * Test suite for extension startup and template loading
 * 
 * Prerequisites:
 * - After Effects is running
 * - EasyBatch extension is open
 * - Test project (tests/fixtures/test-project.aep) is loaded with at least one Essential Graphics template
 */

test.describe('Extension Startup', () => {
    let page: Page;

    test.beforeAll(async () => {
        page = con.page!;
    });

    test('should connect to CEF instance', async () => {
        // Verify we're connected to the extension
        const appElement = await page.$('#app');
        expect(appElement, 'has #app element').toBeTruthy();
    });

    test('should load and display templates', async () => {

        const element = await page.$('.fs_no_tmpls');
        expect(element, '"no templates" message not shown').toBeNull();

        // Verify template dropdown exists and has options
        const templateSelect = await page.$('.header_template .dropdown .dropdown-content');
        expect(templateSelect, 'has template dropdown').toBeTruthy();

        const optionCount = await page.$$eval('.header_template .dropdown .dropdown-content button', options => options.length);
        expect(optionCount, 'template dropdown has options').toBeGreaterThan(0);
    });


    test('should display propper content for selected tab', async () => {
        
        // Select "Data" tab
        const data_t = await page.$('.header_tabs button::-p-text(Data)');
        expect(data_t, 'has Data tab button').toBeTruthy();
        await data_t!.tap(); /// Use tap() because AE CEF works in touch mode for some reason

        // Verify data content is visible
        const table = await page.$('main .dat_table');
        expect(table, 'has Data tab content').toBeTruthy();
        console.log("Verified Data tab content");

        // Select "Output" tab
        const output_t = await page.$('.header_tabs button::-p-text(Output)');
        expect(output_t, 'has Output tab button').toBeTruthy();
        await output_t!.tap();
        console.log("Clicked Output tab");

        // Verify output content is visible
        const m_output = await page.$('main.output');
        expect(m_output, 'has Output tab content').toBeTruthy();
        console.log("Verified Output tab content");

        //Verify "Settings" tab
        const settings_t = await page.$('.header_tabs button::-p-text(Settings)');
        expect(settings_t, 'has Settings tab button').toBeTruthy();
        await settings_t!.tap();
        console.log("Clicked Settings tab");

        // Verify settings content is visible
        const m_setts = await page.$('main.settings');
        expect(m_setts, 'has Settings tab content').toBeTruthy();
        console.log("Verified Settings tab content");
    });

});
