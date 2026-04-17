import { CEFConnection, GetConnection } from '../helpers/cef-helpers';
import { test, expect } from '@playwright/test';
import type { Page } from 'puppeteer-core';
import * as fs from 'fs';
import path from 'path';
import { text } from 'stream/consumers';

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

// Run tests in this suite sequentially to maintain state
test.describe.configure({ mode: 'serial' });

/**
 * Wait for the CEF page execution context to be ready.
 * After events that reload the page (app.open, window.location.reload)
 * the old context is destroyed; any Puppeteer call will throw until the
 * new context finishes loading.  This helper retries until #app is found.
 */
async function WaitForPageContext(page: Page, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await page.waitForSelector('#app', { timeout: 3000 });
            return;
        } catch {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    throw new Error(`Page context did not become ready within ${timeoutMs}ms`);
}

test.describe('Load the test project', async () => {

    test('sould close the previously opened project without saving', async () => {
        await CsaEval('app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES)', page);

        const hasProject = await CsaEval('app.project.file === null', page) === 'false';
        console.log("Project open after close attempt:", await CsaEval('app.project.file', page));
        expect(hasProject, 'project was closed successfully').toBeFalsy();
    });

    const testProjectPath = path.join(process.cwd(), 'tests/projects/tests-26.aet').replaceAll("\\", "\\\\");
    console.log("Resolved test project path: ", testProjectPath);

    test('project file exists', async () => {
        console.log("Checking test project path: ", testProjectPath);
        const existEval = (await CsaEval(`new File("${testProjectPath}").exists`, page)) === 'true' ? true : false;
        console.log("Test project file existence check result: ", existEval);
        expect(existEval, `Test project file exists at ${testProjectPath}`).toBeTruthy();
    });

    test('should load the test project', async () => {
        await CsaEval(`app.open(new File("${testProjectPath}"))`, page);

        const loaded = await CsaEval(`app.project.file ? app.project.file.fsName : ""`, page);

        console.log("Checking loaded vs expected", loaded, path.normalize(testProjectPath));
        expect(loaded === path.normalize(testProjectPath), 'Project loaded successfully').toBe(true);
    });

});

test.describe('Reset and load template', async () => {

    test('dismises the "no templates" message if shown', async () => {

        // After loading a new project the CEP extension reloads, which
        // destroys the old page execution context.  Poll until the new
        // context is ready.
        await WaitForPageContext(page);

        const fs_no_tmpls = await page.$('.fs_no_tmpls');   
        if (fs_no_tmpls) {
            const dismissBtn = await fs_no_tmpls.$('button::-p-text(Reload)');
            expect(dismissBtn, 'has Dismiss button for no templates message').toBeTruthy();
            await dismissBtn!.tap();

            // Wait until the message is dismissed and goes away
            await page.waitForSelector('.fs_no_tmpls', { hidden: true });
        } else {
            console.log('"No templates" message was not shown, no need to dismiss');
        }

    });

    test('should load the main UI', async () => {

        // Verify we're connected to the extension
        const appElement = await page.$('.header_tabs');
        expect(appElement, 'has header_tabs element').toBeTruthy();
    });

    test('should reset the settings to default', async () => {
        // Click the Settings tab
        const settingsTab = await page.$('.header_tabs button::-p-text(Settings)');
        expect(settingsTab, 'has Settings tab button').toBeTruthy();
        await settingsTab!.tap();

        // Click the "Reset to Default" button
        const resetButton = await page.waitForSelector('main.settings button::-p-text(Reset Settings)', { timeout: 2000 });
        expect(resetButton, 'has Reset to Default button').toBeTruthy();
        await resetButton!.tap();

        // ResetSettings() calls setTimeout(() => window.location.reload(), 1000)
        // Wait for the reload to fire, then for the new context to be ready.
        await new Promise(r => setTimeout(r, 1500));
        await WaitForPageContext(page);
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
        expect(await page.$('.dat_table th::-p-text(CB )'), 'table has CB header').toBeTruthy();
        expect(await page.$('.dat_table th::-p-text(Select )'), 'table has Select header').toBeTruthy();
    });

    test('should display the default data from the template', async () => {
        // Verify that the data table has been populated

        const firstRow = await page.$('.dat_table tbody tr:first-child');
        expect(firstRow, 'has data table with at least one row').toBeTruthy();

        EditCell(page, CellType.Text, 1, 7, 'headshot');

        expect(await GetCell(page, CellType.Text, 1, 2), 'text input cell has default data').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'color input cell has default data').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'single dimension number input cell has default data').toBe('55');

        const triple = await GetCell(page, CellType.D3, 1, 5) as { x: string, y: string, z: string };
        expect(triple.x, 'triple dimension number input cell has default data for X').toBe('10');
        expect(triple.y, 'triple dimension number input cell has default data for Y').toBe('20');
        expect(triple.z, 'triple dimension number input cell has default data for Z').toBe('0');

        const img_in = await firstRow!.$('td:nth-child(6) button');
        expect(img_in, 'image input cell has default data').toBeTruthy();

        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'checkbox input cell has default data').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'menu input cell has default data').toBe('1');
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

        await input_field!.click({ clickCount: 3 });

        // Enter a file path pattern
        await input_field!.type('./assets/', { delay: 100 });

        expect(await con.DropdownSelect('#alternate_modal .dropdown', 'CommentField'), 'selects Comment Field from dropdown').toBeTruthy();
        expect(await con.DropdownSelect('#alternate_modal .dropdown', 'Row Number'), 'selects Row Number from dropdown').toBeTruthy();

        await input_field!.evaluate(el => {
            const input = el as HTMLTextAreaElement;
            input.selectionStart = input.selectionEnd = input.value.length;
        });

        await input_field!.type('.jpg');

        expect(await input_field!.evaluate(el => (el as HTMLInputElement).value),
            'input field has updated pattern with file extension').toBe('./assets/{CommentField}{row_number}.jpg');

        const preview = await page.$('#alternate_modal .out_prev');
        expect(await preview?.evaluate(el => el.textContent), 'preview was updated as expected').toBe('./assets/headshot0.jpg');

        //save and close the modal
        const save_btn = await page.$('#alternate_modal .modal-actions button::-p-text(Done)');
        expect(save_btn, 'has Done button').toBeTruthy();
        await save_btn!.tap();

        // Verify that the modal closed and the new pattern is displayed in the table header
        const modal = await page.$('#alternate_modal');
        expect(modal, 'modal is closed after saving').toBeNull();

        expect(await GetCell(page, CellType.Image, 1, 6), 'table cell shows updated pattern preview').toBe('./assets/headshot0.jpg');
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

        expect(await GetCell(page, CellType.Text, 2, 2), 'new row has text input cell').toBe("Linked text");
        expect(await GetCell(page, CellType.Color, 2, 3), 'new row has color input cell').toBe("00ffdc");
        expect(await GetCell(page, CellType.D1, 2, 4), 'new row has single dimension number input cell').toBe("55");

        const pos = await GetCell(page, CellType.D3, 2, 5) as { x: string, y: string, z: string };
        expect(pos.x, 'new row has triple dimension number input cell with default X value').toBe("10");
        expect(pos.y, 'new row has triple dimension number input cell with default Y value').toBe("20");
        expect(pos.z, 'new row has triple dimension number input cell with default Z value').toBe("0");

        const img_in = await new_row?.$('td:nth-child(6)');
        expect(await img_in?.$('button'), 'new row has image input cell with setup button').toBeTruthy();
        expect(await GetCell(page, CellType.Image, 2, 6), 'new row has image input cell with expected file path').toBe("./assets/headshot1.jpg");
        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'new row has checkbox input cell with default value').toBe('1');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'new row has menu input cell with default value').toBe('1');
    });

    test('edit the contents of the second row', async () => {
        const second_row = await page.$('.dat_table tbody tr:nth-child(2)');
        expect(second_row, 'has second row in the table').toBeTruthy();

        await EditCell(page, CellType.Text, 2, 2, 'Row Two Custom');
        await EditCell(page, CellType.Color, 2, 3, 'aa2233');
        await EditCell(page, CellType.D1, 2, 4, '123');
        await EditCell(page, CellType.D3, 2, 5, { x: '400', y: '500', z: '600' });
        await EditCell(page, CellType.Checkbox, 2, 8, '0');
        await EditCell(page, CellType.Menu, 2, 9, '2');

        // Verify the changes
        expect(await GetCell(page, CellType.Text, 2, 2), 'text input cell was updated').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 2, 3), 'color input cell was updated').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 2, 4), 'single dimension number input cell was updated').toBe('123');
        const updatedPos = await GetCell(page, CellType.D3, 2, 5) as { x: string, y: string, z: string };
        expect(updatedPos.x, 'triple dimension number input cell was updated for X').toBe('400');
        expect(updatedPos.y, 'triple dimension number input cell was updated for Y').toBe('500');
        expect(updatedPos.z, 'triple dimension number input cell was updated for Z').toBe('600');

        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'checkbox input cell was updated').toBe('0');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'menu input cell was updated').toBe('2');

        let footerInfo = page.waitForFunction(
            () => {
                const footer = document.querySelector('footer');
                return footer?.textContent?.trim() === 'Previewed Row 1';
            },
            { timeout: 5000 }
        );
        expect(await footerInfo, 'footer text was updated to "Previewed Row 1"').toBeTruthy();


    });

    test('verify the contents of the first row are unchanged', async () => {
        const firstRow = await page.$('.dat_table tbody tr:first-child');
        expect(firstRow, 'has data table with at least one row').toBeTruthy();

        expect(await GetCell(page, CellType.Text, 1, 2), 'first column has default data').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'second column has default data').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'third column has default data').toBe('55');

        const pos = await GetCell(page, CellType.D3, 1, 5) as { x: string, y: string, z: string };
        expect(pos.x, 'fourth column triple dimension number input cell X value is unchanged').toBe('10');
        expect(pos.y, 'fourth column triple dimension number input cell Y value is unchanged').toBe('20');
        expect(pos.z, 'fourth column triple dimension number input cell Z value is unchanged').toBe('0');

        expect(await GetCell(page, CellType.Image, 1, 6), 'image path preview is unchanged').toBe('./assets/headshot0.jpg');
        expect(await GetCell(page, CellType.Text, 1, 7), 'comment field is unchanged').toBe('headshot');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'checkbox is unchanged').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'menu is unchanged').toBe('1');

    });

});

// ============================================================================
// UI Menu & Navigation Tests
// These tests exercise the Edit menu, View menu, right-click context menu,
// and row navigation. The state is restored at the end so subsequent tests
// (OtM Render) see the same 2-row table that "Filling Data" produced.
// ============================================================================

test.describe('Edit Menu', async () => {

    // --- State coming in: 2 rows (row1 = defaults, row2 = edited) ---

    test('should add a row after the current row via Edit menu', async () => {
        // Click on the first row to select it
        //Always inside the row, select the first/6th cell to avoid clicking inside the inputs
        const firstRow = await page.$('.dat_table tbody tr:first-child td:nth-child(6)');
        expect(firstRow, 'first row exists').toBeTruthy();
        await firstRow!.tap();

        // Open Edit menu and click "Add Row After"
        const editBtn = await page.$('nav button::-p-text(Edit)');
        expect(editBtn, 'has Edit button').toBeTruthy();
        await editBtn!.tap();

        const addAfterBtn = await page.$('.c_menu button::-p-text(Add Row After\nN)');
        expect(addAfterBtn, 'has Add Row After button').toBeTruthy();
        await addAfterBtn!.tap();

        // Should now have 3 rows; new row inserted at position 2 (cloned from row 1)
        const rows = await page.$$('.dat_table tbody tr');
        expect(rows.length, 'table now has 3 rows').toBe(3);

        // Row 1: original defaults (untouched)
        expect(await GetCell(page, CellType.Text, 1, 2), 'row 1 text is original').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'row 1 color is original').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'row 1 slider is original').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'row 1 checkbox is original').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'row 1 menu is original').toBe('1');

        // Row 2: new row cloned from row 1 (defaults)
        expect(await GetCell(page, CellType.Text, 2, 2), 'new row 2 text cloned from row 1').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 2, 3), 'new row 2 color cloned from row 1').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 2, 4), 'new row 2 slider cloned from row 1').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'new row 2 checkbox cloned from row 1').toBe('1');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'new row 2 menu cloned from row 1').toBe('1');

        // Row 3: previously row 2 (edited), shifted down
        expect(await GetCell(page, CellType.Text, 3, 2), 'old row 2 shifted to row 3').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 3, 3), 'old row 2 color shifted to row 3').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 3, 4), 'old row 2 slider shifted to row 3').toBe('123');
        expect(await GetCell(page, CellType.Checkbox, 3, 8), 'old row 2 checkbox shifted to row 3').toBe('0');
        expect(await GetCell(page, CellType.Menu, 3, 9), 'old row 2 menu shifted to row 3').toBe('2');
    });

    test('should add a row before the current row via Edit menu', async () => {
        // Select row 1
        const firstRow = await page.$('.dat_table tbody tr:first-child td:nth-child(6)');
        await firstRow!.tap();

        // Open Edit menu and click "Add Row Before"
        const editBtn = await page.$('nav button::-p-text(Edit)');
        await editBtn!.tap();

        const addBeforeBtn = await page.$('.c_menu button::-p-text(Add Row Before)');
        expect(addBeforeBtn, 'has Add Row Before button').toBeTruthy();
        await addBeforeBtn!.tap();

        // Should now have 4 rows; new row inserted at position 1 (cloned from old row 1)
        const rows = await page.$$('.dat_table tbody tr');
        expect(rows.length, 'table now has 4 rows').toBe(4);

        // Row 1: new row cloned from old row 1 (defaults)
        expect(await GetCell(page, CellType.Text, 1, 2), 'new row 1 text is default').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'new row 1 color is default').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'new row 1 slider is default').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'new row 1 checkbox is default').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'new row 1 menu is default').toBe('1');

        // Row 2: original defaults (shifted from old row 1)
        expect(await GetCell(page, CellType.Text, 2, 2), 'original row shifted to row 2').toBe('Linked text');
        expect(await GetCell(page, CellType.D1, 2, 4), 'original row 2 slider is default').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'original row 2 checkbox is default').toBe('1');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'original row 2 menu is default').toBe('1');

        // Row 4: edited row (should still have distinct values)
        expect(await GetCell(page, CellType.Text, 4, 2), 'edited row at position 4').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 4, 3), 'edited row color at position 4').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 4, 4), 'edited row slider at position 4').toBe('123');
        expect(await GetCell(page, CellType.Checkbox, 4, 8), 'edited row checkbox at position 4').toBe('0');
        expect(await GetCell(page, CellType.Menu, 4, 9), 'edited row menu at position 4').toBe('2');
    });

    test('should delete a row via Edit menu', async () => {
        // Select the newly inserted row 1 (clone)
        const firstRow = await page.$('.dat_table tbody tr:first-child');
        await firstRow!.tap();

        // Open Edit menu and click "Delete"
        const editBtn = await page.$('nav button::-p-text(Edit)');
        await editBtn!.tap();

        const deleteBtn = await page.$('.c_menu button::-p-text(Delete)');
        expect(deleteBtn, 'has Delete button in Edit menu').toBeTruthy();
        await deleteBtn!.tap();

        // Should now have 3 rows
        const rows = await page.$$('.dat_table tbody tr');
        expect(rows.length, 'table has 3 rows after deletion').toBe(3);

        // Row 1: original defaults (was at position 2 before)
        expect(await GetCell(page, CellType.Text, 1, 2), 'row 1 text is original default').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'row 1 color is original default').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'row 1 slider is original default').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'row 1 checkbox is original default').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'row 1 menu is original default').toBe('1');

        // Row 3: edited row is still at the end
        expect(await GetCell(page, CellType.Text, 3, 2), 'edited row still at row 3').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.D1, 3, 4), 'edited row slider still at row 3').toBe('123');
        expect(await GetCell(page, CellType.Checkbox, 3, 8), 'edited row checkbox still at row 3').toBe('0');
        expect(await GetCell(page, CellType.Menu, 3, 9), 'edited row menu still at row 3').toBe('2');
    });

    test('should delete the middle row to restore to 2 rows', async () => {
        // Row 2 is the duplicate default row cloned earlier; delete it
        const secondRow = await page.$('.dat_table tbody tr:nth-child(2) td:nth-child(6)');
        expect(secondRow, 'row 2 exists').toBeTruthy();
        await secondRow!.tap();

        const editBtn = await page.$('nav button::-p-text(Edit)');
        await editBtn!.tap();

        const deleteBtn = await page.$('.c_menu button::-p-text(Delete)');
        await deleteBtn!.tap();

        const rows = await page.$$('.dat_table tbody tr');
        expect(rows.length, 'table restored to 2 rows').toBe(2);

        // Verify both original rows are intact with their distinctive values
        expect(await GetCell(page, CellType.Text, 1, 2), 'row 1 text intact').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'row 1 color intact').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'row 1 slider intact').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'row 1 checkbox intact').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'row 1 menu intact').toBe('1');

        expect(await GetCell(page, CellType.Text, 2, 2), 'row 2 text intact').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 2, 3), 'row 2 color intact').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 2, 4), 'row 2 slider intact').toBe('123');
        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'row 2 checkbox intact').toBe('0');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'row 2 menu intact').toBe('2');
    });

});


test.describe('Right-Click Context Menu', async () => {

    // --- State: 2 rows (row1 = defaults, row2 = edited) ---

    test('should open the context menu on right-click', async () => {
        const firstRow = await page.$('.dat_table tbody tr:first-child td:first-child');
        expect(firstRow, 'first row exists').toBeTruthy();

        // Trigger right-click (context menu)
        await firstRow!.click({ button: 'right' });

        // The context menu should appear
        const contextMenu = await page.waitForSelector('.c_menu', { timeout: 2000 });
        expect(contextMenu, 'context menu appeared').toBeTruthy();

        // Verify expected menu items are present
        const addAfterItem = await contextMenu!.$('button::-p-text(Add Row After)');
        expect(addAfterItem, 'context menu has "Add Row After"').toBeTruthy();

        const addBeforeItem = await contextMenu!.$('button::-p-text(Add Row Before)');
        expect(addBeforeItem, 'context menu has "Add Row Before"').toBeTruthy();

        const deleteItem = await contextMenu!.$('button::-p-text(Delete)');
        expect(deleteItem, 'context menu has "Delete"').toBeTruthy();

        const previewItem = await contextMenu!.$('button::-p-text(Preview)');
        expect(previewItem, 'context menu has "Preview"').toBeTruthy();

        const copyFromPreviewItem = await contextMenu!.$('button::-p-text(Copy from Preview)');
        expect(copyFromPreviewItem, 'context menu has "Copy from Preview"').toBeTruthy();

        const renderItem = await contextMenu!.$('button::-p-text(Render Row)');
        expect(renderItem, 'context menu has "Render Row"').toBeTruthy();

        // Close the menu by clicking the background
        const menuBg = await page.$('.c_menu_bg');
        await menuBg!.tap();

        // Verify menu is closed
        const closedMenu = await page.$('.c_menu');
        expect(closedMenu, 'context menu is closed').toBeNull();
    });

    test('should add a row after via context menu', async () => {
        const secondRow = await page.$('.dat_table tbody tr:nth-child(2) td:first-child');
        await secondRow!.click({ button: 'right' });

        const addAfterBtn = await page.waitForSelector('.c_menu button::-p-text(Add Row After)');
        await addAfterBtn!.tap();

        const rows = await page.$$('.dat_table tbody tr');
        expect(rows.length, 'table has 3 rows after context-menu add').toBe(3);

        // Row 1: original defaults (untouched)
        expect(await GetCell(page, CellType.Text, 1, 2), 'row 1 text untouched').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'row 1 color untouched').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'row 1 slider untouched').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'row 1 checkbox untouched').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'row 1 menu untouched').toBe('1');

        // Row 2: edited row (untouched)
        expect(await GetCell(page, CellType.Text, 2, 2), 'row 2 text untouched').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 2, 3), 'row 2 color untouched').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 2, 4), 'row 2 slider untouched').toBe('123');
        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'row 2 checkbox untouched').toBe('0');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'row 2 menu untouched').toBe('2');

        // New row 3 should have values cloned from row 2 (the edited row)
        expect(await GetCell(page, CellType.Text, 3, 2), 'new row 3 text cloned from row 2').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 3, 3), 'new row 3 color cloned from row 2').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 3, 4), 'new row 3 slider cloned from row 2').toBe('123');

        const pos = await GetCell(page, CellType.D3, 3, 5) as { x: string, y: string, z: string };
        expect(pos.x, 'new row 3 pos X cloned from row 2').toBe('400');
        expect(pos.y, 'new row 3 pos Y cloned from row 2').toBe('500');
        expect(pos.z, 'new row 3 pos Z cloned from row 2').toBe('600');

        expect(await GetCell(page, CellType.Image, 3, 6), 'new row 3 image path cloned from row 2').toBe('./assets/headshot2.jpg');
        expect(await GetCell(page, CellType.Checkbox, 3, 8), 'new row 3 checkbox cloned from row 2').toBe('0');
        expect(await GetCell(page, CellType.Menu, 3, 9), 'new row 3 menu cloned from row 2').toBe('2');
    });

    test('should delete the added row via context menu to restore state', async () => {
        // Right-click the new row 3
        const thirdRow = await page.$('.dat_table tbody tr:nth-child(3) td:first-child');
        await thirdRow!.click({ button: 'right' });

        const deleteBtn = await page.waitForSelector('.c_menu button::-p-text(Delete)');
        await deleteBtn!.tap();

        const rows = await page.$$('.dat_table tbody tr');
        expect(rows.length, 'table restored to 2 rows').toBe(2);

        // Verify both original rows survived
        expect(await GetCell(page, CellType.Text, 1, 2), 'row 1 text intact').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'row 1 color intact').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'row 1 slider intact').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'row 1 checkbox intact').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'row 1 menu intact').toBe('1');

        expect(await GetCell(page, CellType.Text, 2, 2), 'row 2 text intact').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 2, 3), 'row 2 color intact').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 2, 4), 'row 2 slider intact').toBe('123');
        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'row 2 checkbox intact').toBe('0');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'row 2 menu intact').toBe('2');
    });

    test('should add a row before via context menu', async () => {
        // Right-click the first row
        const firstRow = await page.$('.dat_table tbody tr:first-child td:first-child');
        await firstRow!.click({ button: 'right' });

        const addBeforeBtn = await page.waitForSelector('.c_menu button::-p-text(Add Row Before)');
        await addBeforeBtn!.tap();

        const rows = await page.$$('.dat_table tbody tr');
        expect(rows.length, 'table has 3 rows after add-before').toBe(3);

        // Row 1: new row cloned from old row 1 (defaults)
        expect(await GetCell(page, CellType.Text, 1, 2), 'new row 1 text is default').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'new row 1 color is default').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'new row 1 slider is default').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'new row 1 checkbox is default').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'new row 1 menu is default').toBe('1');

        // Row 2: original row 1 pushed down (defaults)
        expect(await GetCell(page, CellType.Text, 2, 2), 'original row 1 now at row 2').toBe('Linked text');
        expect(await GetCell(page, CellType.D1, 2, 4), 'original row 1 slider at row 2').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'original row 1 checkbox at row 2').toBe('1');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'original row 1 menu at row 2').toBe('1');

        // Row 3: edited row (distinctive values)
        expect(await GetCell(page, CellType.Text, 3, 2), 'edited row at position 3').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 3, 3), 'edited row color at position 3').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 3, 4), 'edited row slider at position 3').toBe('123');
        expect(await GetCell(page, CellType.Checkbox, 3, 8), 'edited row checkbox at position 3').toBe('0');
        expect(await GetCell(page, CellType.Menu, 3, 9), 'edited row menu at position 3').toBe('2');
    });

    test('should delete the row added before to restore state', async () => {
        const firstRow = await page.$('.dat_table tbody tr:first-child td:first-child');
        await firstRow!.click({ button: 'right' });

        const deleteBtn = await page.waitForSelector('.c_menu button::-p-text(Delete)');
        await deleteBtn!.tap();

        const rows = await page.$$('.dat_table tbody tr');
        expect(rows.length, 'table restored to 2 rows').toBe(2);

        // Verify both original rows survived with distinctive values
        expect(await GetCell(page, CellType.Text, 1, 2), 'row 1 text intact').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'row 1 color intact').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'row 1 slider intact').toBe('55');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'row 1 checkbox intact').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'row 1 menu intact').toBe('1');

        expect(await GetCell(page, CellType.Text, 2, 2), 'row 2 text intact').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 2, 3), 'row 2 color intact').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 2, 4), 'row 2 slider intact').toBe('123');
        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'row 2 checkbox intact').toBe('0');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'row 2 menu intact').toBe('2');
    });

});


test.describe('View Menu', async () => {
    // --- State: 2 rows, table mode, data tab ---

    test('should switch to detail view via View menu', async () => {
        const viewBtn = await page.$('nav button::-p-text(View)');
        expect(viewBtn, 'has View button').toBeTruthy();
        await viewBtn!.tap();

        const detailBtn = await page.waitForSelector('.c_menu button::-p-text(Show in Detail)');
        expect(detailBtn, 'has "Show in Detail" option').toBeTruthy();
        await detailBtn!.tap();

        // Verify detail view is shown (the detail header with navigation is present)
        const detailHeader = await page.waitForSelector('.dets_header', { timeout: 2000 });
        expect(detailHeader, 'detail view header is visible').toBeTruthy();

        // The table should no longer be visible
        const table = await page.$('.dat_table');
        expect(table, 'table is hidden in detail view').toBeNull();
    });

    test('should display the correct row data in detail view', async () => {
        // Detail view should show row 1 initially (curr_row_i = 0 after previous tests)
        // Check the row number input
        const rowInput = await page.$('.dets_header_nav input[type="number"]');
        expect(rowInput, 'has row number input').toBeTruthy();

        const rowValue = await rowInput!.evaluate(el => (el as HTMLInputElement).value);
        // curr_row_i might be 0 or 1 depending on the last selected row; check the fields
        const rowNum = parseInt(rowValue);
        expect(rowNum, 'row number is valid').toBeGreaterThanOrEqual(1);
        expect(rowNum, 'row number is within range').toBeLessThanOrEqual(2);
    });

    test('should navigate to next row via View menu', async () => {
        // First, ensure we are at row 1 by navigating to it
        const rowInput = await page.$('.dets_header_nav input[type="number"]');
        const currentVal = await rowInput!.evaluate(el => (el as HTMLInputElement).value);

        // If not on row 1, use Previous Row to get there
        if (currentVal !== '1') {
            const prevBtn = await page.$('.dets_header_nav button[data-tooltip="Previous Row"]');
            await prevBtn!.tap();
        }

        // Verify we're on row 1
        const row1Val = await rowInput!.evaluate(el => (el as HTMLInputElement).value);
        expect(row1Val, 'starting on row 1').toBe('1');

        // Open View menu and click "Next Row"
        const viewBtn = await page.$('nav button::-p-text(View)');
        await viewBtn!.tap();

        const nextRowBtn = await page.waitForSelector('.c_menu button::-p-text(Next Row)');
        await nextRowBtn!.tap();

        // Verify we moved to row 2
        const updatedVal = await rowInput!.evaluate(el => (el as HTMLInputElement).value);
        expect(updatedVal, 'navigated to row 2').toBe('2');
    });

    test('should navigate to previous row via View menu', async () => {
        const rowInput = await page.$('.dets_header_nav input[type="number"]');

        // We should be on row 2 from the previous test
        const currentVal = await rowInput!.evaluate(el => (el as HTMLInputElement).value);
        expect(currentVal, 'currently on row 2').toBe('2');

        // Open View menu and click "Previous Row"
        const viewBtn = await page.$('nav button::-p-text(View)');
        await viewBtn!.tap();

        const prevRowBtn = await page.waitForSelector('.c_menu button::-p-text(Previous Row)');
        await prevRowBtn!.tap();

        // Verify we moved back to row 1
        const updatedVal = await rowInput!.evaluate(el => (el as HTMLInputElement).value);
        expect(updatedVal, 'navigated back to row 1').toBe('1');
    });

    test('should navigate using the detail view header buttons', async () => {
        const rowInput = await page.$('.dets_header_nav input[type="number"]');
        expect(await rowInput!.evaluate(el => (el as HTMLInputElement).value), 'starting on row 1').toBe('1');

        // Click Next Row button in the detail header
        const nextBtn = await page.$('.dets_header_nav button[data-tooltip="Next Row"]');
        expect(nextBtn, 'has Next Row button in detail header').toBeTruthy();
        await nextBtn!.tap();

        expect(await rowInput!.evaluate(el => (el as HTMLInputElement).value), 'moved to row 2').toBe('2');

        // Click Previous Row button in the detail header
        const prevBtn = await page.$('.dets_header_nav button[data-tooltip="Previous Row"]');
        expect(prevBtn, 'has Previous Row button in detail header').toBeTruthy();
        await prevBtn!.tap();

        expect(await rowInput!.evaluate(el => (el as HTMLInputElement).value), 'moved back to row 1').toBe('1');
    });

    test('should not navigate past the first row', async () => {
        const rowInput = await page.$('.dets_header_nav input[type="number"]');
        expect(await rowInput!.evaluate(el => (el as HTMLInputElement).value), 'on row 1').toBe('1');

        const prevBtn = await page.$('.dets_header_nav button[data-tooltip="Previous Row"]');
        await prevBtn!.tap();

        // Should still be on row 1
        expect(await rowInput!.evaluate(el => (el as HTMLInputElement).value), 'still on row 1').toBe('1');
    });

    test('should not navigate past the last row', async () => {
        const rowInput = await page.$('.dets_header_nav input[type="number"]');

        // Navigate to row 2 (last row)
        const nextBtn = await page.$('.dets_header_nav button[data-tooltip="Next Row"]');
        await nextBtn!.tap();
        expect(await rowInput!.evaluate(el => (el as HTMLInputElement).value), 'on row 2').toBe('2');

        // Try to go to next row — should stay on row 2
        await nextBtn!.tap();
        expect(await rowInput!.evaluate(el => (el as HTMLInputElement).value), 'still on row 2 (last row)').toBe('2');
    });

    test('should add and delete rows from detail view', async () => {
        const rowInput = await page.$('.dets_header_nav input[type="number"]');

        // Navigate to row 1
        const prevBtn = await page.$('.dets_header_nav button[data-tooltip="Previous Row"]');
        await prevBtn!.tap();

        // Add row after using detail header button
        const addAfterBtn = await page.$('.dets_header_nav button[data-tooltip="Add Row After"]');
        expect(addAfterBtn, 'has Add Row After button in detail header').toBeTruthy();
        await addAfterBtn!.tap();

        // Row count should be displayed as "/ 3"
        const headerText = await page.$eval('.dets_header_nav', el => el.textContent?.trim());
        expect(headerText, 'detail header shows 3 total rows').toContain('/ 3');

        // Add row before using detail header button
        const addBeforeBtn = await page.$('.dets_header_nav button[data-tooltip="Add Row Before"]');
        expect(addBeforeBtn, 'has Add Row Before button in detail header').toBeTruthy();
        await addBeforeBtn!.tap();

        const headerText2 = await page.$eval('.dets_header_nav', el => el.textContent?.trim());
        expect(headerText2, 'detail header shows 4 total rows').toContain('/ 4');

        // Now delete the two extra rows to restore to 2 rows, staying in detail view
        // Row layout after adds: row1=new-before, row2=original-default, row3=new-after, row4=edited
        // Current row after add_before is the newly inserted row (row 1)

        // Navigate to row 1 (the one added before) and delete it via Edit menu
        const navToRow1 = await page.$('.dets_header_nav input[type="number"]');
        const currentRow = await navToRow1!.evaluate(el => (el as HTMLInputElement).value);
        // Make sure we're on row 1
        while (await navToRow1!.evaluate(el => (el as HTMLInputElement).value) !== '1') {
            const prevNav = await page.$('.dets_header_nav button[data-tooltip="Previous Row"]');
            await prevNav!.tap();
        }

        // Delete row 1 via Edit menu
        const editBtn1 = await page.$('nav button::-p-text(Edit)');
        await editBtn1!.tap();
        let deleteBtn = await page.waitForSelector('.c_menu button::-p-text(Delete)');
        await deleteBtn!.tap();

        // Verify row count is now 3
        let headerText3 = await page.$eval('.dets_header_nav', el => el.textContent?.trim());
        expect(headerText3, 'detail header shows 3 total rows after first delete').toContain('/ 3');

        // Now row 2 is the one added after (new-after); navigate to it and delete it
        // After deleting row 1, we should be on row 1 (original-default)
        // Navigate to row 2 (the new-after row)
        const nextNav = await page.$('.dets_header_nav button[data-tooltip="Next Row"]');
        await nextNav!.tap();
        expect(await navToRow1!.evaluate(el => (el as HTMLInputElement).value), 'on row 2').toBe('2');

        // Delete row 2 via Edit menu
        const editBtn2 = await page.$('nav button::-p-text(Edit)');
        await editBtn2!.tap();
        deleteBtn = await page.waitForSelector('.c_menu button::-p-text(Delete)');
        await deleteBtn!.tap();

        // Verify row count is now 2
        let headerText4 = await page.$eval('.dets_header_nav', el => el.textContent?.trim());
        expect(headerText4, 'detail header shows 2 total rows after second delete').toContain('/ 2');
    });

    test('should switch to table view via View menu', async () => {
        // We might already be in table view from the previous test, but let's ensure
        // by going to detail view first, then back
        const viewBtn = await page.$('nav button::-p-text(View)');
        await viewBtn!.tap();

        const detailBtn = await page.waitForSelector('.c_menu button::-p-text(Show in Detail)');
        await detailBtn!.tap();

        // Confirm we're in detail view
        const detailHeader = await page.waitForSelector('.dets_header', { timeout: 2000 });
        expect(detailHeader, 'in detail view').toBeTruthy();

        // Now switch to table via View menu
        const viewBtn2 = await page.$('nav button::-p-text(View)');
        await viewBtn2!.tap();

        const tableBtn = await page.waitForSelector('.c_menu button::-p-text(Show as Table)');
        expect(tableBtn, 'has "Show as Table" option').toBeTruthy();
        await tableBtn!.tap();

        // Verify table view is shown
        const table = await page.waitForSelector('.dat_table', { timeout: 2000 });
        expect(table, 'table view is visible').toBeTruthy();

        const detailGone = await page.$('.dets_header');
        expect(detailGone, 'detail header is no longer visible').toBeNull();
    });

    test('should open and close the Edit View modal via View menu', async () => {
        const viewBtn = await page.$('nav button::-p-text(View)');
        await viewBtn!.tap();

        const editViewBtn = await page.waitForSelector('.c_menu button::-p-text(Edit View...)');
        expect(editViewBtn, 'has "Edit View..." option').toBeTruthy();
        await editViewBtn!.tap();

        // Modal should open
        const modal = await page.waitForSelector('.modal h4::-p-text(Edit View)', { timeout: 2000 });
        expect(modal, 'Edit View modal is open').toBeTruthy();

        // Verify column items are listed
        const columnItems = await page.$$('.modal .column-item');
        expect(columnItems.length, 'modal shows column items').toBeGreaterThan(0);

        // Close the modal without changes
        const doneBtn = await page.$('.modal .modal-actions button::-p-text(Done)');
        expect(doneBtn, 'has Done button').toBeTruthy();
        await doneBtn!.tap();

        // Verify modal is closed
        const closedModal = await page.$('.modal h4::-p-text(Edit View)');
        expect(closedModal, 'modal is closed').toBeNull();
    });

    test('should toggle column visibility in Edit View modal', async () => {
        // Count the current number of visible table headers
        const headersBefore = await page.$$('.dat_table thead th');
        const visibleCountBefore = headersBefore.length; // includes the row-number th

        // Open Edit View modal
        const viewBtn = await page.$('nav button::-p-text(View)');
        await viewBtn!.tap();
        const editViewBtn = await page.waitForSelector('.c_menu button::-p-text(Edit View...)');
        await editViewBtn!.tap();
        await page.waitForSelector('.modal h4::-p-text(Edit View)', { timeout: 2000 });

        // Toggle visibility of the first column item (hide it)
        const firstToggle = await page.$('.modal .column-item:first-child .visibility-toggle');
        expect(firstToggle, 'has visibility toggle for first column').toBeTruthy();
        await firstToggle!.tap();

        // Close modal
        const doneBtn = await page.$('.modal .modal-actions button::-p-text(Done)');
        await doneBtn!.tap();

        // Verify one fewer column header in the table
        const headersAfter = await page.$$('.dat_table thead th');
        expect(headersAfter.length, 'one column was hidden').toBe(visibleCountBefore - 1);

        // Re-open the modal and toggle the column back to visible
        const viewBtn2 = await page.$('nav button::-p-text(View)');
        await viewBtn2!.tap();
        const editViewBtn2 = await page.waitForSelector('.c_menu button::-p-text(Edit View...)');
        await editViewBtn2!.tap();
        await page.waitForSelector('.modal h4::-p-text(Edit View)', { timeout: 2000 });

        // The hidden column will be at the end of the list; find the one with EyeClosed
        const hiddenItems = await page.$$('.modal .column-item:not(.visible) .visibility-toggle');
        expect(hiddenItems.length, 'one column is hidden in the modal').toBeGreaterThanOrEqual(1);
        // Toggle it back
        await hiddenItems[0].tap();

        const doneBtn2 = await page.$('.modal .modal-actions button::-p-text(Done)');
        await doneBtn2!.tap();

        // Verify columns are restored
        const headersRestored = await page.$$('.dat_table thead th');
        expect(headersRestored.length, 'columns restored to original count').toBe(visibleCountBefore);

        // Restore the original column order via app state, since toggling visibility
        // moves the re-enabled column to the end of the list
        await page.evaluate(() => {
            const s = (window as any).__app_state__;
            const tmpl = s.proj.tmpls[s.proj.sel_tmpl];
            tmpl.view_cols = tmpl.columns.map((_: any, i: number) => i);
        });

        // Verify the column order was restored by checking the first header
        const firstHeader = await page.$('.dat_table thead th:nth-child(2)');
        const firstHeaderText = await firstHeader?.evaluate(el => el.textContent?.trim());
        expect(firstHeaderText, 'first column header is back to original order').toBe('RepText');
    });
});

test.describe('Final State Verification', async () => {

    test('should verify the table has exactly 2 rows with expected data', async () => {
        // Make sure we're on the Data tab in table view
        const dataTab = await page.$('.header_tabs button::-p-text(Data)');
        await dataTab!.tap();

        const table = await page.waitForSelector('.dat_table', { timeout: 2000 });
        expect(table, 'table is visible').toBeTruthy();

        const rows = await page.$$('.dat_table tbody tr');
        expect(rows.length, 'table has exactly 2 rows').toBe(2);

        // Row 1: defaults
        expect(await GetCell(page, CellType.Text, 1, 2), 'row 1 text').toBe('Linked text');
        expect(await GetCell(page, CellType.Color, 1, 3), 'row 1 color').toBe('00ffdc');
        expect(await GetCell(page, CellType.D1, 1, 4), 'row 1 slider').toBe('55');
        const pos1 = await GetCell(page, CellType.D3, 1, 5) as { x: string, y: string, z: string };
        expect(pos1.x, 'row 1 pos X').toBe('10');
        expect(pos1.y, 'row 1 pos Y').toBe('20');
        expect(pos1.z, 'row 1 pos Z').toBe('0');
        expect(await GetCell(page, CellType.Text, 1, 7), 'row 1 comment').toBe('headshot');
        expect(await GetCell(page, CellType.Checkbox, 1, 8), 'row 1 checkbox').toBe('1');
        expect(await GetCell(page, CellType.Menu, 1, 9), 'row 1 menu').toBe('1');

        // Row 2: edited values (distinctive)
        expect(await GetCell(page, CellType.Text, 2, 2), 'row 2 text').toBe('Row Two Custom');
        expect(await GetCell(page, CellType.Color, 2, 3), 'row 2 color').toBe('aa2233');
        expect(await GetCell(page, CellType.D1, 2, 4), 'row 2 slider').toBe('123');
        const pos2 = await GetCell(page, CellType.D3, 2, 5) as { x: string, y: string, z: string };
        expect(pos2.x, 'row 2 pos X').toBe('400');
        expect(pos2.y, 'row 2 pos Y').toBe('500');
        expect(pos2.z, 'row 2 pos Z').toBe('600');
        expect(await GetCell(page, CellType.Checkbox, 2, 8), 'row 2 checkbox').toBe('0');
        expect(await GetCell(page, CellType.Menu, 2, 9), 'row 2 menu').toBe('2');
    });

});


test.describe('Add Property to Template', async () => {
    test('should call Test_AddPropToEGP to add a new property to the Essential Graphics panel', async () => {
        const result = await CsaEval('Test_AddPropToEGP()', page);
        const parsed = JSON.parse(result);
        console.log('Test_AddPropToEGP result:', parsed);
        expect(parsed.success, 'Test_AddPropToEGP succeeded').toBeTruthy();
    });

    test('should reload the extension and detect the new column', async () => {
        // Click the reload button in the header
        const reloadBtn = await page.$('.header_reload button');
        expect(reloadBtn, 'has reload button in header').toBeTruthy();
        await reloadBtn!.tap();

        // Switch to Data tab to see the table
        const dataTab = await page.waitForSelector('.header_tabs button::-p-text(Data)', { timeout: 5000 });
        await dataTab!.tap();

        // Wait for the new "Other Prop" column header to appear
        const newColHeader = await page.waitForSelector('.dat_table th::-p-text(Other Prop )', { timeout: 5000 });
        expect(newColHeader, 'table has new "Other Prop" column header').toBeTruthy();
    });

    test('should have the correct default value for the new column', async () => {
        // The new column should be the last one — find its index
        const headerTexts = await page.$$eval('.dat_table thead th', ths =>
            ths.map(th => th.textContent?.trim() ?? '')
        );
        console.log('Column headers after reload:', headerTexts);

        const newColIndex = headerTexts.findIndex(h => h.startsWith('Other Prop'));
        expect(newColIndex, '"Other Prop" column found in headers').toBeGreaterThan(0);

        // Column index in the DOM is 1-based (nth-child), and headerTexts is 0-based
        const colNum = newColIndex + 1;

        // The new property is a color — read its default value for both rows
        const row1Color = await GetCell(page, CellType.Color, 1, colNum);
        expect(row1Color, 'row 1 new column default value').toBe('faff00');

        const row2Color = await GetCell(page, CellType.Color, 2, colNum);
        expect(row2Color, 'row 2 new column default value').toBe('faff00');
    });
});


test.describe('OtM Render', async () => {

    test('should change mode and allow for base path setup', async () => {
        const outputTab = await page.$('.header_tabs button::-p-text(Output)');
        expect(outputTab, 'has Output tab button').toBeTruthy();
        await outputTab!.tap();

        const sel = await con.DropdownSelect('.output span .dropdown', 'Multi-Output');
        expect(sel, 'has OtM template option').toBeTruthy();

        await page.evaluate(() => {
            const s = (window as any).__app_state__;
            s.proj.tmpls[s.proj.sel_tmpl].base_path = 'renders/otm_test';
        });

        const pathPreview = await page.$('.output span::-p-text(renders/otm_test)');
        expect(pathPreview, 'shows updated base path in Output tab').toBeTruthy();
    });

    test('setup exports', async () => {

        const exp1 = await con.DropdownSelect('.output .dropdown.search-enabled', 'OtM_Export1');
        expect(exp1, 'has OtM export option 1').toBeTruthy();

        const addExpBtn = await page.$('.output .setting button::-p-text(Add)');
        expect(addExpBtn, 'has Add button for exports in Output tab').toBeTruthy();
        await addExpBtn!.tap();

        const patternEditBtn = await page.$('.out_sub_render_cont .setting button');
        expect(patternEditBtn, 'has Edit button for export pattern in Output tab').toBeTruthy();
        await patternEditBtn!.tap();

        //wait for modal
        const modal_header = await page.waitForSelector('.modal h4::-p-text(Render Save Path Pattern)');
        expect(modal_header, 'shows the File Path Pattern modal').toBeTruthy();

        const textarea = await page.$('.modal textarea');
        expect(textarea, 'has textarea for export pattern input').toBeTruthy();

        //empty textarea and enter new pattern
        await textarea!.click({ clickCount: 3 });

        await textarea!.type('{base_path}/');

        const sel1 = await con.DropdownSelect('.modal .dropdown', 'Template Name');
        expect(sel1, 'selected Template Name').toBeTruthy();

        await textarea!.evaluate(el => {
            const input = el as HTMLTextAreaElement;
            input.selectionStart = input.selectionEnd = input.value.length;
        });
        await textarea!.type('-');

        const sel2 = await con.DropdownSelect('.modal .dropdown', 'Composition');
        expect(sel2, 'selected Composition').toBeTruthy();

        await textarea!.evaluate(el => {
            const input = el as HTMLTextAreaElement;
            input.selectionStart = input.selectionEnd = input.value.length;
        });
        await textarea!.type('-');

        const sel3 = await con.DropdownSelect('.modal .dropdown', 'Row Number');
        expect(sel3, 'selected Row Number').toBeTruthy();


        expect(await textarea?.evaluate(ta => ta.value.trim()), 'textarea has updated pattern')
            .toBe('{base_path}/{template_name}-{comp_name}-{row_number}');

        let previewInfo = await page.waitForFunction(
            () => {
                const preview = document.querySelector('.modal .out_prev');
                return preview?.textContent?.trim() === 'renders/otm_test/OtM-OtM_Export1-0';
            },
            { timeout: 5000 }
        );
        expect(previewInfo, 'preview was updated as expected').toBeTruthy();

        const saveBtn = await page.$('.modal .modal-actions button::-p-text(Close)');
        expect(saveBtn, 'has Close button to save export pattern').toBeTruthy();
        await saveBtn!.tap();

        const selRenderSetts = await con.DropdownSelect('.out_sub_render_cont .setting:nth-of-type(2) .dropdown', 'Best Settings');
        expect(selRenderSetts, 'selected Best Settings').toBeTruthy();

        const selOutMode = await con.DropdownSelect('.out_sub_render_cont .setting:nth-of-type(3) .dropdown', 'High Quality with Alpha');
        expect(selOutMode, 'selected High Quality with Alpha').toBeTruthy();

        //add second export

        const exp2 = await con.DropdownSelect('.output .dropdown.search-enabled', 'OtM_Export2');
        expect(exp2, 'has OtM export option 1').toBeTruthy();
        await addExpBtn!.tap();

        const patternPreview2 = await page.$('.out_sub_render:nth-of-type(2) .out_prev span:nth-of-type(2)');
        expect(await patternPreview2?.evaluate(el => el.textContent?.trim()), 'shows updated pattern for second export').toBe("renders/otm_test/OtM-OtM_Export2-0");

    });

    let renderedPaths: string[] = [];

    test('start renders', async () => {
        test.setTimeout(40_000);

        // 0. Clean the renders folder so we start from a known empty state
        const rendersFolder = path.join(await GetProjectFilePath(page), '/renders/otm_test');
        if (fs.existsSync(rendersFolder)) {
            fs.rmSync(rendersFolder, { recursive: true, force: true });
        }
        fs.mkdirSync(rendersFolder, { recursive: true });

        const renderBtn = await page.$('.output button::-p-text(Batch One to Many)');
        expect(renderBtn, 'has Batch One to Many render button').toBeTruthy();
        await renderBtn!.tap();

        // 1. Wait for BatchRender to return — the results table appears as soon as
        //    the render queue has been populated (before actual encoding starts)
        const resultsTable = await page.waitForSelector('table.render_results', { timeout: 30_000 });
        expect(resultsTable, 'render results table appeared').toBeTruthy();

        // 2. Collect the intended output paths from the DOM before the render starts
        renderedPaths = await page.$$eval(
            'table.render_results tbody tr td:nth-child(3)',
            tds => tds.map(td => td.textContent?.trim()).filter(Boolean) as string[]
        );
        expect(renderedPaths.length, 'render results table has rows with paths').toBeGreaterThan(0);
        console.log('Expected output paths:', renderedPaths);

        // 3. Poll the AE render queue until encoding finishes
        await WaitForRenderQueue(page, 300_000);

    });

    test('verify that the renders exist', async () => {

        let all_found = true;

        // 4. Verify each output file was actually written to disk
        for (const p of renderedPaths) {
            const fullPath = path.join(await GetProjectFilePath(page), p + ".mov");

            let exists = fs.existsSync(fullPath);
            let size = exists ? fs.statSync(fullPath).size : 0;

            if (!exists || size <= 10_000) {
                all_found = false;
            }

            console.log('Checking output file:', fullPath, 'exists:', exists, 'size:', size);
        }

        expect(all_found, 'all expected output files were found with non-zero size').toBeTruthy();
    });

    test('renders are similar to expected output', async () => {
        // 5. (Optional) Check that the rendered files are visually similar to expected output using the CompareResults composition in the test project

        const rendersFolder = path.join(await GetProjectFilePath(page), 'renders', 'otm_test');

        let renderedPaths = fs.readdirSync(rendersFolder)
            .filter(file => file.endsWith('.mov'))
            .map(file => ({ path: path.join(rendersFolder, file), file: file }));

        console.log('Renders to check:', renderedPaths.map(p => p.path));

        for (const p of renderedPaths) {
            console.log('Checking render output for:', p);

            const renderPath = path.join(p.path).replaceAll("\\", "\\\\");
            const result = await CsaEval(`Test_CheckRenderResult("${renderPath}")`, page);
            const checkResult = JSON.parse(result);

            const avg_color = (checkResult.color[0] + checkResult.color[1] + checkResult.color[2]) / 3;

            console.log('CheckRenderResult for', renderPath, 'returned:', checkResult, 'average color:', avg_color);
            expect(checkResult.success && avg_color < 0.009, `Render in range ${p.file} (${avg_color})`).toBeTruthy();
        }
    });
});

/**Helper function to evaluate a script in the CEP environment */
async function CsaEval(script: string, page: Page) {
    return page.evaluate((script: string): Promise<string> => {
        // @ts-ignore
        const a_cep = window.__adobe_cep__;
        return new Promise((resolve) => {
            a_cep.evalScript(script, (result: string) => {
                resolve(result);
            });
        });
    }, script);//evaluate
}

/** Retrieves the current After Effects project file path */
async function GetProjectFilePath(page: Page): Promise<string> {
    const result = await CsaEval('app.project.file.parent ? app.project.file.parent.fsName : ""', page);
    return result as string;
}

/**
 * Polls the AE render queue status via ExtendScript until it finishes.
 * RQStatus enum: STOPPED=1, NEEDS_OUTPUT=2, RENDERING=3, DONE=4, ERR_STOPPED=5
 */
async function WaitForRenderQueue(page: Page, timeoutMs = 120_000): Promise<void> {
    const pollInterval = 2_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const status = await CsaEval('app.project.renderQueue.rendering', page) as string;
        console.log('Current render queue status:', status);

        if (status === 'false') {
            return; // Render queue is not rendering, which means it has finished
        }

        await new Promise(r => setTimeout(r, pollInterval));
    }

    throw new Error(`Render queue did not complete within ${timeoutMs}ms`);
}

    
enum CellType {
    Text,
    Color,
    D1,
    D2,
    D3,
    Image,
    Checkbox,
    Menu
}

type CellRef = {
    row: number;
    col: number;
    type: CellType;
}

async function EditCell(page: Page, cellType: CellType, row: number, col: number, values: string | { x: string, y: string, z: string }): Promise<CellRef> {
    const cellSelector = `.dat_table tbody tr:nth-child(${row}) td:nth-child(${col})`;

    const cell = await page.$(cellSelector);
    if (!cell) {
        throw new Error(`Cell at row ${row}, column ${col} not found`);
    }

    switch (cellType) {
        case CellType.Text: {
            const input = await cell.$('textarea');
            if (!input) throw new Error(`Text textarea not found at row ${row}, col ${col}`);
            await input.click({ clickCount: 3 });
            await input.type(values as string);
            break;
        }
        case CellType.Color: {
            const input = await cell.$('input');
            if (!input) throw new Error(`Color input not found at row ${row}, col ${col}`);
            await input.click({ clickCount: 3 });
            await input.type(values as string);
            break;
        }
        case CellType.D1: {
            const input = await cell.$('input[type="number"]');
            if (!input) throw new Error(`Number input not found at row ${row}, col ${col}`);
            await input.click({ clickCount: 3 });
            await input.type(values as string);
            break;
        }
        case CellType.D2: {
            const { x, y } = values as { x: string, y: string, z: string };
            const inputs = await cell.$$('input[type="number"]');
            if (inputs.length < 2) throw new Error(`Expected at least 2 number inputs at row ${row}, col ${col}`);
            await inputs[0].click({ clickCount: 3 });
            await inputs[0].type(x);
            await inputs[1].click({ clickCount: 3 });
            await inputs[1].type(y);
            break;
        }
        case CellType.D3: {
            const { x, y, z } = values as { x: string, y: string, z: string };
            const inputs = await cell.$$('input[type="number"]');
            if (inputs.length < 3) throw new Error(`Expected at least 3 number inputs at row ${row}, col ${col}`);
            await inputs[0].click({ clickCount: 3 });
            await inputs[0].type(x);
            await inputs[1].click({ clickCount: 3 });
            await inputs[1].type(y);
            await inputs[2].click({ clickCount: 3 });
            await inputs[2].type(z);
            break;
        }
        case CellType.Image:
            throw new Error(`Image cells are not directly editable via EditCell; use the file path modal instead`);
        case CellType.Checkbox: {
            const input = await cell.$('input[type="checkbox"]');
            if (!input) throw new Error(`Checkbox input not found at row ${row}, col ${col}`);
            const currentChecked = await input.evaluate(el => (el as HTMLInputElement).checked);
            const desiredChecked = values === '1' || values === 'true';
            if (currentChecked !== desiredChecked) {
                await input.click();
            }
            break;
        }
        case CellType.Menu: {
            const select = await cell.$('select');
            if (!select) throw new Error(`Select input not found at row ${row}, col ${col}`);
            await select.select(values as string);
            break;
        }
        default:
            throw new Error(`Unsupported cell type ${cellType}`);
    }

    return { row, col, type: cellType };
}

async function GetCell(page: Page, cellType: CellType, row: number, col: number): Promise<string | { x: string, y: string, z: string }> {
    const cellSelector = `.dat_table tbody tr:nth-child(${row}) td:nth-child(${col})`;

    const cell = await page.$(cellSelector);
    if (!cell) {
        throw new Error(`Cell at row ${row}, column ${col} not found`);
    }

    switch (cellType) {
        case CellType.Text: {
            const input = await cell.$('textarea');
            if (!input) throw new Error(`Text textarea not found at row ${row}, col ${col}`);
            return input.evaluate(el => el.value);
        }
        case CellType.Color: {
            const input = await cell.$('input');
            if (!input) throw new Error(`Color input not found at row ${row}, col ${col}`);
            return input.evaluate(el => el.value);
        }
        case CellType.D1: {
            const input = await cell.$('input[type="number"]');
            if (!input) throw new Error(`Number input not found at row ${row}, col ${col}`);
            return input.evaluate(el => el.value);
        }
        case CellType.D2: {
            const inputs = await cell.$$('input[type="number"]');
            if (inputs.length < 2) throw new Error(`Expected at least 2 number inputs at row ${row}, col ${col}`);
            const [x, y] = await Promise.all(inputs.slice(0, 2).map(i => i.evaluate(el => el.value)));
            return { x, y, z: '' };
        }
        case CellType.D3: {
            const inputs = await cell.$$('input[type="number"]');
            if (inputs.length < 3) throw new Error(`Expected at least 3 number inputs at row ${row}, col ${col}`);
            const [x, y, z] = await Promise.all(inputs.slice(0, 3).map(i => i.evaluate(el => el.value)));
            return { x, y, z };
        }
        case CellType.Image: {
            return cell.evaluate(el => el.textContent?.trim() ?? '');
        }
        case CellType.Checkbox: {
            const input = await cell.$('input[type="checkbox"]');
            if (!input) throw new Error(`Checkbox input not found at row ${row}, col ${col}`);
            const checked = await input.evaluate(el => (el as HTMLInputElement).checked);
            return checked ? '1' : '0';
        }
        case CellType.Menu: {
            const select = await cell.$('select');
            if (!select) throw new Error(`Select input not found at row ${row}, col ${col}`);
            return select.evaluate(el => (el as HTMLSelectElement).value);
        }
        default:
            throw new Error(`Unsupported cell type ${cellType}`);
    }
}

