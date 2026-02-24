import {CEFConnection, GetConnection } from '../helpers/cef-helpers';
import { test, expect } from '@playwright/test';
import type { Page } from 'puppeteer-core';

/**
 * Test suite for extension startup and template loading
 * 
 * Prerequisites:
 * - After Effects is running
 * - EasyBatch extension is open
 * - Test project (tests/fixtures/test-project.aep) is loaded with at least one Essential Graphics template
 */
test.use({ trace: 'on' });
test.describe('One to Many', async () => {
    let page: Page;
    let con: CEFConnection;

    test.beforeAll(async () => {
        con = await GetConnection();
        page = con.page!;
    });

    test('should load the main UI', async () => {
        // Verify we're connected to the extension
        const appElement = await page.$('#app');
        expect(appElement, 'has #app element').toBeTruthy();
    });

    test('should reset the settings to default', async () => {
        // Click the Settings tab
        const settingsTab = await page.$('.header_tabs button::-p-text(Settings)');
        expect(settingsTab, 'has Settings tab button').toBeTruthy();
        await settingsTab!.tap();
        
        // Click the "Reset to Default" button
        const resetButton = await page.$('main.settings button::-p-text(Reset Settings)');
        expect(resetButton, 'has Reset to Default button').toBeTruthy();
        await resetButton!.tap();
    });

    test('should find and select the template in the dropdown', async () => {
        const element = await page.$('.fs_no_tmpls');
        expect(element, '"no templates" message not shown').toBeNull();

        const sel = await con.DropdownSelect('.header_template .dropdown', 'OtM');
        expect(sel, 'has OtM template option').toBeTruthy();
    });

    test('should load the template columns in the table', async () => {
        expect(await page.waitForSelector('.dat_table th::-p-text(RepText )'), 'table has RepText header').toBeTruthy();
        expect(await page.$('.dat_table th::-p-text(RepColor )'), 'table has RepColor header').toBeTruthy();
        expect(await page.$('.dat_table th::-p-text(RepText )'), 'table has RepText header').toBeTruthy();
        expect(await page.$('.dat_table th::-p-text(RepSlider )'), 'table has RepSlider header').toBeTruthy();
        expect(await page.$('.dat_table th::-p-text(RepPos )'), 'table has RepPos header').toBeTruthy();
        expect(await page.$('.dat_table th::-p-text(RepImage )'), 'table has RepImage header').toBeTruthy();
    });

    test('should display the default data from the template', async () => {
        // Verify that the data table has been populated

        const firstRow = await page.$('.dat_table tbody tr:first-child');
        expect(firstRow, 'has data table with at least one row').toBeTruthy();

        const txt_in = await firstRow!.$('td:nth-child(2) textarea');
        expect(await txt_in!.evaluate(el => el.value), 'text input cell has default data').toBe('Linked text');

        const color_in = await firstRow!.$('td:nth-child(3) input');
        expect(await color_in?.evaluate(el => el.value), 'color input cell has default data').toBe('00ffdc');

        const single_dim_in = await firstRow!.$('td:nth-child(4) input[type="number"]');
        expect(await single_dim_in?.evaluate(el => el.value), 'single dimension number input cell has default data').toBe('55');

        const triple_in1 = await firstRow!.$('td:nth-child(5) input[type="number"]:nth-of-type(1)');
        const triple_in2 = await firstRow!.$('td:nth-child(5) input[type="number"]:nth-of-type(2)');
        const triple_in3 = await firstRow!.$('td:nth-child(5) input[type="number"]:nth-of-type(3)');
        expect(await triple_in1?.evaluate(el => el.value), 'triple dimension number input cell has default data for X').toBe('10');
        expect(await triple_in2?.evaluate(el => el.value), 'triple dimension number input cell has default data for Y').toBe('20');
        expect(await triple_in3?.evaluate(el => el.value), 'triple dimension number input cell has default data for Z').toBe('0');

        const img_in = await firstRow!.$('td:nth-child(6) button');
        expect(img_in, 'image input cell has default data').toBeTruthy();
    });

    test('should allow for file path setup for the image replaceable', async () => {
        const setup_btn = await page.$('.dat_table thead th button');
        expect(setup_btn, 'has setup button for image replaceable').toBeTruthy();
        await setup_btn!.tap();

        //wait for modal
        const modal_header = await page.waitForSelector('#alternate_modal h4::-p-text(File Path Pattern)');
        expect(modal_header, 'shows File Path Pattern modal').toBeTruthy();

        const input_field =  await page.$('#alternate_modal #alt_src_pattern_ta');
        expect(input_field, 'has input field for file path pattern').toBeTruthy();

        // Enter a file path pattern
        await input_field!.type('./assets/headshot');

        expect(await con.DropdownSelect('#alternate_modal .dropdown', 'Row Number'), 'selects Row Number from dropdown').toBeTruthy();

        await input_field!.evaluate(el => {
            const input = el as HTMLTextAreaElement;
            input.selectionStart = input.selectionEnd = input.value.length;
        });

        await input_field!.type('.jpg');

        expect(await input_field!.evaluate(el => (el as HTMLInputElement).value),
         'input field has updated pattern with file extension').toBe('./assets/headshot{row_number}.jpg');

        const preview = await page.$('#alternate_modal .out_prev');
        expect(await preview?.evaluate(el => el.textContent), 'preview was updated as expected').toBe('./assets/headshot0.jpg');

        //save and close the modal
        const save_btn = await page.$('#alternate_modal .modal-actions button::-p-text(Done)');
        expect(save_btn, 'has Done button').toBeTruthy();
        await save_btn!.tap();

        // Verify that the modal closed and the new pattern is displayed in the table header
        const modal = await page.$('#alternate_modal');
        expect(modal, 'modal is closed after saving').toBeNull();
        
        const pattern_preview = await page.$eval('.dat_table tbody tr:first-child td:nth-child(6)', el => el.textContent.trim());
        expect(pattern_preview, 'table cell shows updated pattern preview').toBe('./assets/headshot0.jpg');

    
    });
    

});
