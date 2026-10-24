import { test } from '@playwright/test';
import type { ElementHandle, Page } from 'puppeteer-core';
import { CEFConnection, GetConnection, Sleep } from '../helpers/cef-helpers';
import * as fs from 'fs';
import path from 'path';

/**
 * Generates the screenshots used by the documentation (docs/).
 *
 * Run with `npm run docs:screenshots`: this writes the images to tests/screenshots and
 * then copies them to docs/assets.
 *
 * Prerequisites:
 * - After Effects is running with the EasyBatch panel open (docked at roughly 900px wide)
 * - tests/.env.local defines the project paths (see tests/.env.example)
 *
 * Not automatable (native After Effects UI, not CEF): essential-graphics.png and
 * essential-graphics-sm.png. logo-round.png is a static asset.
 */

const envFile = path.join(process.cwd(), 'tests', '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const OUT_DIR = path.join(process.cwd(), 'tests', 'screenshots');
const CFG = {
    projectTeam: process.env.DOCS_PROJECT_TEAM ?? '',
    projectGoal: process.env.DOCS_PROJECT_GOAL ?? '',
    tmplTeam: process.env.DOCS_TEMPLATE_TEAM ?? 'Team vs Team',
    tmplProps: process.env.DOCS_TEMPLATE_PROPS ?? 'My Template',
    tmplGoal: process.env.DOCS_TEMPLATE_GOAL ?? 'Master',
};

const COLORS = {
    yellow: '#fff200',
    green: '#39ff14',
    blue: '#1e9bff',
    purple: '#8a2be2',
    red: '#e02020',
    orange: '#e08a20',
};

// Height of the top-of-panel shots, matching the existing images
const PANEL_TOP_HEIGHT = 400;

let page: Page;
let con: CEFConnection;

test.beforeAll(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    con = await GetConnection();
    page = con.page!;
});

/**
 * [element(s), color, options]. A negative `offset` draws the outline inside the element,
 * for elements that touch the edge of the panel and would otherwise be clipped.
 * With `overlay`, the box is a separate fixed element above everything else, positioned from the
 * element's bounding box and clamped to the viewport; use it when sticky/floating children hide the outline.
 * Passing an array of elements draws a single overlay box around all of them.
 */
type Highlight = [
    ElementHandle<Element> | ElementHandle<Element>[],
    string,
    { width?: number; offset?: number; overlay?: boolean }?,
];

const OVERLAY_ATTR = 'data-shot-overlay';

/** Outlines the elements, runs the capture, and removes the outlines */
async function WithHighlights(highlights: Highlight[], capture: () => Promise<void>) {
    for (const [target, color, opts] of highlights) {
        const width = opts?.width ?? 3;
        const offset = opts?.offset ?? 2;

        if (opts?.overlay || Array.isArray(target)) {
            const els = Array.isArray(target) ? target : [target];
            await page.evaluate(
                (c: string, width: number, offset: number, attr: string, ...elements: Element[]) => {
                    const rects = elements.map((e) => e.getBoundingClientRect());
                    const vw = document.documentElement.clientWidth;
                    const vh = document.documentElement.clientHeight;

                    // Grow by the offset (negative shrinks), then clamp so the whole border stays visible
                    const left = Math.max(0, Math.min(...rects.map((r) => r.left)) - offset);
                    const top = Math.max(0, Math.min(...rects.map((r) => r.top)) - offset);
                    const right = Math.min(vw, Math.max(...rects.map((r) => r.right)) + offset);
                    const bottom = Math.min(vh, Math.max(...rects.map((r) => r.bottom)) + offset);

                    const box = document.createElement('div');
                    box.setAttribute(attr, '');
                    box.style.cssText = [
                        'position:fixed',
                        `left:${left}px`,
                        `top:${top}px`,
                        `width:${right - left}px`,
                        `height:${bottom - top}px`,
                        'box-sizing:border-box',
                        `border:${width}px solid ${c}`,
                        'pointer-events:none',
                        'z-index:2147483647',
                    ].join(';');
                    document.body.appendChild(box);
                },
                color,
                width,
                offset,
                OVERLAY_ATTR,
                ...els
            );
            continue;
        }

        await target.evaluate(
            (e, c, width, offset) => {
                const h = e as HTMLElement;
                h.dataset.prevOutline = h.style.outline;
                h.dataset.prevOutlineOffset = h.style.outlineOffset;
                h.style.outline = `${width}px solid ${c}`;
                h.style.outlineOffset = `${offset}px`;
            },
            color,
            width,
            offset
        );
    }
    try {
        await capture();
    } finally {
        await page.evaluate((attr) => {
            document.querySelectorAll(`[${attr}]`).forEach((n) => n.remove());
        }, OVERLAY_ATTR);

        for (const [target, , opts] of highlights) {
            if (opts?.overlay || Array.isArray(target)) continue;
            await target.evaluate((e) => {
                const h = e as HTMLElement;
                h.style.outline = h.dataset.prevOutline ?? '';
                h.style.outlineOffset = h.dataset.prevOutlineOffset ?? '';
                delete h.dataset.prevOutline;
                delete h.dataset.prevOutlineOffset;
            });
        }
    }
}

/** Disables the test timeout (the user resizes at their own pace) and waits for the manual resize */
async function WaitForManualResize(message: string) {
    test.setTimeout(0);
    await con.WaitForManualResize(message);
}

type Clip = { x: number; y: number; width: number; height: number };

async function Viewport() {
    return page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
}

/** The top of the panel, full width */
async function PanelTop(height = PANEL_TOP_HEIGHT): Promise<Clip> {
    const vp = await Viewport();
    return { x: 0, y: 0, width: vp.w, height: Math.min(height, vp.h) };
}

/** Bounding box that contains all the elements, plus padding */
async function Around(elements: ElementHandle<Element>[], pad = 12): Promise<Clip> {
    const vp = await Viewport();
    const boxes = [];
    for (const el of elements) {
        const b = await el.boundingBox();
        if (!b) throw new Error('Element has no bounding box');
        boxes.push(b);
    }
    const x1 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
    const y1 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
    const x2 = Math.min(vp.w, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
    const y2 = Math.min(vp.h, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

async function Shoot(name: string, clip: Clip) {
    // Park the pointer away from the UI so hover styles and tooltips don't leak in
    await page.mouse.move(0, 0);
    await Sleep(300);
    const buf = await page.screenshot({ type: 'png', clip, captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), Buffer.from(buf));
}

const FirstRow = '.dat_table tbody tr:first-child';

test.describe('Team vs Team project', () => {
    test.describe.configure({ mode: 'serial' });

    test('open project', async () => {
        await con.OpenProject(CFG.projectTeam);
        await con.SelectTemplate(CFG.tmplTeam);
        await con.GoToTab('Data');
    });

    test('top-bar-hl-template', async () => {
        await WaitForManualResize('Resize the panel so we can see up the to Flag L column');
        const tmpl = await con.Find('.header_template');
        await WithHighlights([[tmpl, COLORS.red, { offset: -6 }]], async () => {
            await Shoot('top-bar-hl-template', await PanelTop(210));
        });
    });

    test('data-hl-menu', async () => {

        const nav = await con.Find('nav.dat_bar');
        const row = await con.Find(FirstRow);
        await WithHighlights([[nav, COLORS.yellow, { offset: -5 }], [row, COLORS.green, { offset: 0, overlay: true }]], async () => {
            await Shoot('data-hl-menu', await PanelTop(210));
        });
    });

    test('data-hl-preview', async () => {
        const preview = await con.Find(`${FirstRow} .row_opts_preview`);
        const gear = await con.Find('.dat_table thead th button');
        await WithHighlights([[preview, COLORS.blue], [gear, COLORS.purple, { offset: -2 }]], async () => {
            await Shoot('data-hl-preview', await PanelTop(210));
        });
    });

    test('datar-hl-edit', async () => {
        await con.OpenMenu('Edit');
        const item = await con.Find('.c_menu button::-p-text(Add Row After)');
        await WithHighlights([[item, COLORS.green]], async () => {
            await Shoot('datar-hl-edit', await PanelTop(250));
        });
        await con.CloseMenu();
    });

    test('data-replaceable', async () => {
        await (await con.Find('.dat_table thead th button')).tap();
        const modal = await con.Find('#alternate_modal .wrapper');
        // The check icon only renders once the previewed file is found
        await page.waitForSelector('#alternate_modal .out_prev + span svg', { timeout: 10_000 });
        await Sleep(500);
        await Shoot('data-replaceable', await Around([modal], 0));
        await (await con.Find('#alternate_modal .modal-actions button::-p-text(Done)')).tap();
        await page.waitForSelector('#alternate_modal', { hidden: true });
    });

    test('data-hl-row-opts', async () => {
        const opts = await con.Find(`${FirstRow} .row_opts`);
        const head = await con.Find('.dat_table thead');
        const row = await con.Find(FirstRow);
        await WithHighlights([[opts, COLORS.blue]], async () => {
            await Shoot('data-hl-row-opts', await Around([head, row], 0));
        });

        
    });

    test('resize-for-menus', async () => {
        await WaitForManualResize('Resize so the last menu can be seen');
    });

    for (const m of [
        { button: 'File', name: 'data-hl-menu-file' },
        { button: 'Edit', name: 'data-hl-menu-edit' },
        { button: 'View', name: 'data-hl-menu-view' },
    ] as const) {
        test(m.name, async () => {
            await con.OpenMenu(m.button);
            const nav = await con.Find('nav.dat_bar');
            const menu = await con.Find('.c_menu');
            await Shoot(m.name, await Around([nav, menu], 10));
            await con.CloseMenu();
        });
    }



    test('export and export-pattern', async () => {
        await con.GoToTab('Output');
        await con.Find('main.output');
        await con.SetTextarea('#save_pattern_ta', 'Renders/{Tricode L}vs{Tricode R}');
        const header = await con.Find('header');
        const actions = await con.Find('.out_actions_cont');
        await Shoot('export', await Around([header, actions], 0));

        await con.SetTextarea('#save_pattern_ta', 'Renders/Promos/PROMO MATCH {Tricode L}vs{Tricode R}');
        const title = await con.Find('main.output h4');
        const preview = await con.Find('main.output .out_prev');
        const ta = await con.Find('#save_pattern_ta');
        await Shoot('export-pattern', await Around([title, ta, preview], 12));
    });
});

// Same project as above, still open
test.describe('Properties demo template', () => {
    test.describe.configure({ mode: 'serial' });

    test('select template', async () => {
        await con.SelectTemplate(CFG.tmplProps);
        await con.GoToTab('Data');
    });

    test('data-hl-row-props', async () => {
        await WaitForManualResize('Resize the panel so every column of the row is visible');
        const head = await con.Find('.dat_table thead');
        const row = await con.Find(FirstRow);
        await Shoot('data-hl-row-props', await Around([head, row], 0));
    });
});

test.describe('Goal Takeover project', () => {
    test.describe.configure({ mode: 'serial' });

    test('open project', async () => {
        await con.OpenProject(CFG.projectGoal);
        await con.SelectTemplate(CFG.tmplGoal);
        await con.GoToTab('Output');
    });

    test('export-multi', async () => {

        // Multi-Output mode is expected to be saved in the project; switch if it isn't
        if (!(await page.$('.out_sub_render'))) {
            await con.DropdownSelect('main.output .dropdown', 'Multi-Output');
            await Sleep(500);
        }

        const header = await con.Find('header');
        const actions = await con.Find('.out_actions_cont');
        const addComp = (await page.evaluateHandle(() => {
            const h4 = Array.from(document.querySelectorAll('main.output h4')).find((h) =>
                h.textContent?.trim().startsWith('Add Composition')
            );
            return h4?.nextElementSibling ?? null;
        })).asElement() as ElementHandle<Element> | null;

        // Make sure every render is expanded, as in the docs image
        await page.$$eval('.out_sub_render', (els) => els.forEach((e) => ((e as HTMLDetailsElement).open = true)));
        await Sleep(300);
        const renders = (await page.$$('.out_sub_render')).slice(0, 2);

        const highlights: Highlight[] = [[renders, COLORS.purple, {offset: 5}]];
        if (addComp) highlights.push([addComp, COLORS.orange]);

        await WithHighlights(highlights, async () => {
        // Resize first: elements are queried and overlays positioned after the final layout
        await WaitForManualResize('Resize the panel to 580px width, and a height that shows all output renders');

            await Shoot('export-multi', await Around([header, actions], 0));
        });
    });
});
