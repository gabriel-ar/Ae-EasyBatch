import { CEFConnection, GetConnection } from '../helpers/cef-helpers';
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

let page: Page;
let con: CEFConnection;

test.use({ trace: 'on' });
test.beforeAll(async () => {
    con = await GetConnection();
    page = con.page!;
});

test.describe('Basic Setup', async () => {
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
        expect(await page.$('.dat_table th::-p-text(CommentField )'), 'table has CommentField header').toBeTruthy();
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

        const input_field = await page.$('#alternate_modal #alt_src_pattern_ta');
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

test.describe('Filling Data', async () => {
    test('add new row', async () => {
        const edit_btn = await page.$('nav button::-p-text(Edit)');
        expect(edit_btn, 'has Edit button in nav bar').toBeTruthy();
        await edit_btn!.tap();

        const add_row_btn = await page.$('.c_menu button::-p-text(Add Row After N)');
        expect(add_row_btn, 'has Add Row After button in Edit menu').toBeTruthy();
        await add_row_btn!.tap();

        const new_row = await page.$('.dat_table tbody tr:nth-child(2)');
        expect(new_row, 'new row is added to the table').toBeTruthy();

        const td1 = await new_row?.$('td:nth-child(1)');
        expect(await td1?.evaluate(el => el.textContent?.trim()), 'new row has correct row number').toBe("2");

        const text_in = await new_row?.$('td:nth-child(2) textarea');
        expect(await text_in?.evaluate(el => el.value), 'new row has text input cell').toBe("Linked text");

        const color_in = await new_row?.$('td:nth-child(3) input');
        expect(await color_in?.evaluate(el => el.value), 'new row has color input cell').toBe("00ffdc");

        const single_dim_in = await new_row?.$('td:nth-child(4) input[type="number"]');
        expect(await single_dim_in?.evaluate(el => el.value), 'new row has single dimension number input cell').toBe("55");

        const triple_in1 = await new_row?.$('td:nth-child(5) input[type="number"]:nth-of-type(1)');
        expect(await triple_in1?.evaluate(el => el.value), 'new row has triple dimension number input cell with default X value').toBe("10");

        const triple_in2 = await new_row?.$('td:nth-child(5) input[type="number"]:nth-of-type(2)');
        expect(await triple_in2?.evaluate(el => el.value), 'new row has triple dimension number input cell with default Y value').toBe("20");

        const triple_in3 = await new_row?.$('td:nth-child(5) input[type="number"]:nth-of-type(3)');
        expect(await triple_in3?.evaluate(el => el.value), 'new row has triple dimension number input cell with default Z value').toBe("0");

        const img_in = await new_row?.$('td:nth-child(6)');
        expect(await img_in?.$('button'), 'new row has image input cell with setup button').toBeTruthy();
        expect(await img_in?.evaluate(el => el.textContent?.trim()), 'new row has image input cell with expected file path').toBe("./assets/headshot1.jpg");
    });

    test('edit the contents of the second row', async () => {
        const second_row = await page.$('.dat_table tbody tr:nth-child(2)');
        expect(second_row, 'has second row in the table').toBeTruthy();

        const text_in = await second_row!.$('td:nth-child(2) textarea');
        await text_in!.click({ clickCount: 3 });
        await text_in!.type('New Linked Text');

        const color_in = await second_row!.$('td:nth-child(3) input');
        await color_in!.click({ clickCount: 3 });
        await color_in!.type('ff0000');

        const single_dim_in = await second_row!.$('td:nth-child(4) input[type="number"]');
        await single_dim_in!.click({ clickCount: 3 });
        await single_dim_in!.type('75');

        const triple_in1 = await second_row!.$('td:nth-child(5) input[type="number"]:nth-of-type(1)');
        await triple_in1!.click({ clickCount: 3 });
        await triple_in1!.type('80');

        const triple_in2 = await second_row!.$('td:nth-child(5) input[type="number"]:nth-of-type(2)');
        await triple_in2!.click({ clickCount: 3 });
        await triple_in2!.type('20');

        const triple_in3 = await second_row!.$('td:nth-child(5) input[type="number"]:nth-of-type(3)');
        await triple_in3!.click({ clickCount: 3 });
        await triple_in3!.type('10');

        // Verify the changes
        expect(await text_in?.evaluate(el => el.value), 'text input cell was updated').toBe('New Linked Text');
        expect(await color_in?.evaluate(el => el.value), 'color input cell was updated').toBe('ff0000');
        expect(await single_dim_in?.evaluate(el => el.value), 'single dimension number input cell was updated').toBe('75');
        expect(await triple_in1?.evaluate(el => el.value), 'triple dimension number input cell was updated for X').toBe('80');
        expect(await triple_in2?.evaluate(el => el.value), 'triple dimension number input cell was updated for Y').toBe('20');
        expect(await triple_in3?.evaluate(el => el.value), 'triple dimension number input cell was updated for Z').toBe('10');


        let footerInfo = page.waitForFunction(
            () => {
                const footer = document.querySelector('footer');
                return footer?.textContent?.trim() === 'Previewed Row 1';
            },
            { timeout: 5000 }
        );
        expect(await footerInfo, 'footer text was updated to "Previewed Row 1"').toBeTruthy();
    });
});

