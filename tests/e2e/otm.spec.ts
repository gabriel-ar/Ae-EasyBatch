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

        const fs_no_tmpls = await page.$('.fs_no_tmpls');   
        if (fs_no_tmpls) {
            const dismissBtn = await fs_no_tmpls.$('button::-p-text( Reload)');
            expect(dismissBtn, 'has Dismiss button for no templates message').toBeTruthy();
            await dismissBtn!.tap();

            // Verify the message is dismissed
            const stillThere = await page.$('.fs_no_tmpls');
            expect(stillThere, '"no templates" message is dismissed').toBeNull();
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
    });

    test('edit the contents of the second row', async () => {
        const second_row = await page.$('.dat_table tbody tr:nth-child(2)');
        expect(second_row, 'has second row in the table').toBeTruthy();

        await EditCell(page, CellType.Text, 2, 2, 'New Linked Text');
        await EditCell(page, CellType.Color, 2, 3, 'ff0000');
        await EditCell(page, CellType.D1, 2, 4, '75');
        await EditCell(page, CellType.D3, 2, 5, { x: '80', y: '20', z: '10' });

        // Verify the changes
        expect(await GetCell(page, CellType.Text, 2, 2), 'text input cell was updated').toBe('New Linked Text');
        expect(await GetCell(page, CellType.Color, 2, 3), 'color input cell was updated').toBe('ff0000');
        expect(await GetCell(page, CellType.D1, 2, 4), 'single dimension number input cell was updated').toBe('75');
        const updatedPos = await GetCell(page, CellType.D3, 2, 5) as { x: string, y: string, z: string };
        expect(updatedPos.x, 'triple dimension number input cell was updated for X').toBe('80');
        expect(updatedPos.y, 'triple dimension number input cell was updated for Y').toBe('20');
        expect(updatedPos.z, 'triple dimension number input cell was updated for Z').toBe('10');

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

    });

});

test.describe('OtM Render', async () => {

    test('should change mode and allow for base path setup', async () => {
        const outputTab = await page.$('.header_tabs button::-p-text(Output)');
        expect(outputTab, 'has Output tab button').toBeTruthy();
        await outputTab!.tap();

        const sel = await con.DropdownSelect('.output span .dropdown', 'One to Many');
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

        const selOutMode = await con.DropdownSelect('.out_sub_render_cont .setting:nth-of-type(3) .dropdown', 'H.264 - Match Render Settings - 40 Mbps');
        expect(selOutMode, 'selected H.264 - Match Render Settings - 40 Mbps').toBeTruthy();

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
            const fullPath = path.join(await GetProjectFilePath(page), p + ".mp4");

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
            .filter(file => file.endsWith('.mp4'))
            .map(file => ({ path: path.join(rendersFolder, file), file: file }));

        console.log('Renders to check:', renderedPaths.map(p => p.path));

        for (const p of renderedPaths) {
            console.log('Checking render output for:', p);

            const renderPath = path.join(p.path).replaceAll("\\", "\\\\");
            const result = await CsaEval(`CheckRenderResult("${renderPath}")`, page);
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
    Image
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
        default:
            throw new Error(`Unsupported cell type ${cellType}`);
    }
}

