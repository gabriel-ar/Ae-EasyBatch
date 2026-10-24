import { test } from '@playwright/test';
import type { ElementHandle, Page } from 'puppeteer-core';
import { CEFConnection, GetConnection } from '../helpers/cef-helpers';
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

const Sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function CsaEval(script: string): Promise<string> {
    return page.evaluate((script: string): Promise<string> => {
        // @ts-ignore
        const a_cep = window.__adobe_cep__;
        return new Promise((resolve) => a_cep.evalScript(script, (r: string) => resolve(r)));
    }, script);
}

async function WaitForPageContext(timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await page.waitForSelector('.header_tabs', { timeout: 3000 });
            return;
        } catch {
            await Sleep(500);
        }
    }
    throw new Error('Page context did not become ready');
}

async function OpenProject(projectPath: string, name: string) {
    if (!projectPath) throw new Error(`Missing ${name} in tests/.env.local (see tests/.env.example)`);
    if ((await CsaEval(`new File(${JSON.stringify(projectPath)}).exists`)) !== 'true') {
        throw new Error(`Project not found: ${projectPath}`);
    }

    await CsaEval('app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES)');
    await CsaEval(`app.openFast(new File(${JSON.stringify(projectPath)}))`);

    // The extension reloads when a project opens
    await Sleep(2000);
    await WaitForPageContext();

    const noTmpls = await page.$('.fs_no_tmpls');
    if (noTmpls) {
        await (await noTmpls.$('button::-p-text(Reload)'))?.tap();
        await page.waitForSelector('.fs_no_tmpls', { hidden: true });
    }
}

async function SelectTemplate(name: string) {
    await con.DropdownSelect('.header_template .dropdown', name);
    await Sleep(500);
}

async function GoToTab(tab: 'Data' | 'Output' | 'Settings') {
    const btn = await Find(`.header_tabs button::-p-text(${tab})`);
    await btn.tap();
    await Sleep(400);
}

async function Find(selector: string): Promise<ElementHandle<Element>> {
    const el = await page.waitForSelector(selector, { timeout: 5000 });
    if (!el) throw new Error(`Element not found: ${selector}`);
    return el as ElementHandle<Element>;
}

async function OpenMenu(button: 'File' | 'Edit' | 'View') {
    await (await Find(`nav button::-p-text(${button})`)).tap();
    await page.waitForFunction(() => {
        const m = document.querySelector('.c_menu') as HTMLElement | null;
        return !!m && getComputedStyle(m).opacity === '1';
    });
}

async function CloseMenu() {
    const bg = await page.$('.c_menu_bg');
    if (bg) await bg.tap();
    await page.waitForSelector('.c_menu', { hidden: true });
}

/** Sets the textarea content through real input events so Svelte bindings update */
async function SetTextarea(selector: string, value: string) {
    const ta = await Find(selector);
    await ta.click({ count: 3 });
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type(value);
    await Sleep(400);
}

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

/**
 * The panel can't be resized from the test, so show a banner inside the panel and wait until the
 * user has resized it and pressed Continue. The banner is removed before returning so it never
 * ends up in a screenshot. There is no timeout; the calling test must disable its own.
 */
async function WaitForManualResize(message: string) {
    test.setTimeout(0);
    console.log(`\n>>> MANUAL STEP: ${message}, then press Continue in the panel.\n`);

    await page.evaluate(
        (msg, attr) => new Promise<void>((resolve) => {
            const bar = document.createElement('div');
            bar.setAttribute(attr, '');
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
        message,
        OVERLAY_ATTR
    );

    // Let the layout settle after the resize
    await Sleep(800);
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
        await OpenProject(CFG.projectTeam, 'DOCS_PROJECT_TEAM');
        await SelectTemplate(CFG.tmplTeam);
        await GoToTab('Data');
    });

    test('top-bar-hl-template', async () => {
        await WaitForManualResize('Resize the panel so we can see up the to Flag L column');
        const tmpl = await Find('.header_template');
        await WithHighlights([[tmpl, COLORS.red, { offset: -6 }]], async () => {
            await Shoot('top-bar-hl-template', await PanelTop());
        });
    });

    test('data-hl-menu', async () => {
        const nav = await Find('nav.dat_bar');
        const row = await Find(FirstRow);
        await WithHighlights([[nav, COLORS.yellow, { offset: -5 }], [row, COLORS.green, { offset: 0, overlay: true }]], async () => {
            await Shoot('data-hl-menu', await PanelTop(432));
        });
    });

    test('data-hl-preview', async () => {
        const preview = await Find(`${FirstRow} .row_opts_preview`);
        const gear = await Find('.dat_table thead th button');
        await WithHighlights([[preview, COLORS.blue], [gear, COLORS.purple, { offset: -2 }]], async () => {
            await Shoot('data-hl-preview', await PanelTop());
        });
    });

    test('data-hl-row-opts', async () => {
        const opts = await Find(`${FirstRow} .row_opts`);
        const head = await Find('.dat_table thead');
        const row = await Find(FirstRow);
        await WithHighlights([[opts, COLORS.blue]], async () => {
            await Shoot('data-hl-row-opts', await Around([head, row], 6));
        });
    });

    for (const m of [
        { button: 'File', name: 'data-hl-menu-file' },
        { button: 'Edit', name: 'data-hl-menu-edit' },
        { button: 'View', name: 'data-hl-menu-view' },
    ] as const) {
        test(m.name, async () => {
            await OpenMenu(m.button);
            const nav = await Find('nav.dat_bar');
            const menu = await Find('.c_menu');
            await Shoot(m.name, await Around([nav, menu], 10));
            await CloseMenu();
        });
    }

    test('datar-hl-edit', async () => {
        await OpenMenu('Edit');
        const item = await Find('.c_menu button::-p-text(Add Row After)');
        await WithHighlights([[item, COLORS.green]], async () => {
            await Shoot('datar-hl-edit', await PanelTop());
        });
        await CloseMenu();
    });

    test('data-replaceable', async () => {
        await (await Find('.dat_table thead th button')).tap();
        const modal = await Find('#alternate_modal .wrapper');
        await Sleep(500);
        await Shoot('data-replaceable', await Around([modal], 0));
        await (await Find('#alternate_modal .modal-actions button::-p-text(Done)')).tap();
        await page.waitForSelector('#alternate_modal', { hidden: true });
    });

    test('export and export-pattern', async () => {
        await GoToTab('Output');
        await Find('main.output');
        await SetTextarea('#save_pattern_ta', 'Renders/{Tricode L}vs{Tricode R}');
        const header = await Find('header');
        const actions = await Find('.out_actions_cont');
        await Shoot('export', await Around([header, actions], 0));

        await SetTextarea('#save_pattern_ta', 'Renders/Promos/PROMO MATCH {Tricode L}vs{Tricode R}');
        const title = await Find('main.output h4');
        const preview = await Find('main.output .out_prev');
        const ta = await Find('#save_pattern_ta');
        await Shoot('export-pattern', await Around([title, ta, preview], 12));
    });
});

// Same project as above, still open
test.describe('Properties demo template', () => {
    test.describe.configure({ mode: 'serial' });

    test('select template', async () => {
        await SelectTemplate(CFG.tmplProps);
        await GoToTab('Data');
    });

    test('data-hl-row-props', async () => {
        await WaitForManualResize('Resize the panel so every column of the row is visible');
        const head = await Find('.dat_table thead');
        const row = await Find(FirstRow);
        await Shoot('data-hl-row-props', await Around([head, row], 0));
    });
});

test.describe('Goal Takeover project', () => {
    test.describe.configure({ mode: 'serial' });

    test('open project', async () => {
        await OpenProject(CFG.projectGoal, 'DOCS_PROJECT_GOAL');
        await SelectTemplate(CFG.tmplGoal);
        await GoToTab('Output');
    });

    test('export-multi', async () => {

        // Multi-Output mode is expected to be saved in the project; switch if it isn't
        if (!(await page.$('.out_sub_render'))) {
            await con.DropdownSelect('main.output .dropdown', 'Multi-Output');
            await Sleep(500);
        }

        const header = await Find('header');
        const actions = await Find('.out_actions_cont');
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
