/**
 * Shared helpers for the Tapi 2 production (tapi.app) suites.
 * Locators come from a codegen recording on tapi.app.
 */

import { expect } from '@playwright/test';
import path from 'node:path';

export const BASE = 'https://tapi.app';

// Per-trust test data. Each trust has its own suppliers; the property is the first "Baker" match.
export const TRUST_DATA = {
    'ABC Liquid NZ1':          { supplier: 'Super Mario Plumbing' },
    'ABC Console Big Company': { supplier: 'Super Mario Plumbing' },
    'ABC Property Me AUS':     { supplier: 'Liquid' },
};
export const PROPERTY_SEARCH = '27 b';
export const SUPPLIER_SEARCH = 'josh';
export const AGENT           = 'Josh Sali';

// Override with PROD_TRUSTS="ABC Liquid NZ1,ABC Property Me AUS". A separate name from the staging
// project's TRUSTS, so a TRUSTS value left in the terminal from a staging run can't leak in here.
export const TRUSTS = process.env.PROD_TRUSTS
    ? process.env.PROD_TRUSTS.split(',').map(t => t.trim())
    : Object.keys(TRUST_DATA);

export const INVOICE_FILE = path.resolve('tests/uploadfiles/Standard Invoice sure.pdf');

export const SS = (page, label) =>
    page.screenshot({ path: `tests/Screenshots/${Date.now()}-${label}.png`, fullPage: true }).catch(() => {});

const ddmmyyyy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
export const TODAY = ddmmyyyy(new Date());
export const IN_14_DAYS = ddmmyyyy(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

// Block Intercom so its banners never cover the page.
export async function blockIntercom(page) {
    await page.route(/intercom(cdn)?\.(io|com)/, route => route.abort());
}

// Opens the inbox with the saved session (auth-session.json via playwright.config.js).
export async function openApp(page) {
    await blockIntercom(page);
    await page.goto(`${BASE}/inbox/jobs`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (/\/auth/.test(page.url())) throw new Error('Not logged in to tapi.app — run "node save-session.js" to save a new login.');
    await expect(page.locator('[data-test="new-job-menu-link"]')).toBeVisible({ timeout: 30000 });
}

// Switches trust from the trust name at the bottom of the sidebar.
export async function switchTrust(page, trust) {
    const current = page.locator('.app-menu-company');
    const currentName = (await current.innerText()).trim();
    if (currentName === trust) return;
    await page.locator('a').filter({ hasText: currentName }).click();
    const option = page.getByRole('option', { name: trust, exact: true });
    if (!(await option.isVisible({ timeout: 8000 }).catch(() => false))) {
        const available = (await page.getByRole('option').allInnerTexts()).map(t => t.trim());
        throw new Error(`Trust "${trust}" not in the trust list. Available: ${available.join(', ')}`);
    }
    await option.click();
    await expect(current).toHaveText(new RegExp(`^\\s*${trust}\\s*$`), { timeout: 20000 });
}

// Opens Business settings from the user menu at the bottom of the sidebar.
export async function openBusinessSettings(page) {
    await page.getByText(`J ${AGENT}`).click();
    await page.getByRole('option', { name: 'Business settings' }).click();
    await expect(page).toHaveURL(/\/business\/settings\//, { timeout: 20000 });
}

async function pickProperty(page, trust, scope = page) {
    await scope.getByRole('button', { name: 'Select property' }).click();
    await page.getByRole('searchbox', { name: 'Search properties...' }).fill(PROPERTY_SEARCH);
    // Each trust has a different Baker St (27 27 Baker St, 27 Baker St Test, 27 Baker St Lilydale): take the first.
    const option = page.getByRole('option').filter({ hasText: /baker/i }).first();
    await expect(option, `a "Baker" property in ${trust}`).toBeVisible({ timeout: 15000 });
    await option.click();
}

// Creates a tenant-reported job and leaves the page on the new job.
export async function createJob(page, trust, title) {
    await page.goto(`${BASE}/inbox/jobs`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-test="new-job-menu-link"]').click();
    await page.getByRole('button', { name: 'Tenant' }).click();
    await pickProperty(page, trust);
    await page.getByRole('textbox', { name: 'Keep it short!' }).fill(title);
    await page.locator('[data-test="new-job-description-field"]').getByRole('textbox').fill(`${title} — automated test job`);
    await page.locator('[data-test="new-job-submit-button"]').click();
    await expect(page.getByText('Job created successfully')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Edit job' })).toBeVisible({ timeout: 20000 });
}

export async function addJobNote(page, text) {
    await page.getByRole('button', { name: 'Add note' }).first().click();
    await page.getByRole('textbox').fill(text);
    await page.getByRole('button', { name: 'Add note' }).nth(1).click();
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 15000 });
}

// Uploads an invoice for the trust's supplier and property, then opens it for processing.
export async function uploadInvoice(page, trust) {
    await page.goto(`${BASE}/inbox/jobs`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-test="new-job-menu-link"]').click();
    await page.locator('[data-test="new-invoice-menu-link"]').click();
    // Catch the file picker so Playwright fills it, instead of Windows' Open dialog appearing.
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('link', { name: 'Browse' }).click(),
    ]);
    await chooser.setFiles(INVOICE_FILE);
    await page.getByRole('button', { name: 'Select supplier' }).click();
    await page.getByRole('searchbox', { name: 'Search suppliers' }).fill(SUPPLIER_SEARCH);
    await page.getByRole('option', { name: TRUST_DATA[trust].supplier, exact: true }).click();
    await pickProperty(page, trust, page.locator('[data-test="invoice-upload-property-field"]'));
    const agent = page.getByRole('button', { name: 'Select agent' });
    if (await agent.isVisible().catch(() => false)) {
        await agent.click();
        await page.getByRole('option', { name: AGENT }).click();
    }
    await page.locator('[data-test="invoice-upload-submit-button"]').click();
    await expect(page.getByText('Uploaded file successfully')).toBeVisible({ timeout: 60000 });
    await page.locator('[data-test="processing-invoice-process-button"]').click();
}

// Matches the open invoice without a job, fills the details and approves it.
export async function approveInvoice(page, { number, description, total = 250 }) {
    await page.getByText('Process without job').click();
    await page.locator('[data-test="match-invoice-attach-invoice-button"]').click();
    await page.locator('[data-test="confirm-invoice-description-field"]').getByRole('textbox').fill(description);
    await page.locator('[data-test="confirm-invoice-number-field"]').getByRole('textbox').fill(number);
    for (const [field, value] of [['confirm-invoice-date-field', TODAY], ['confirm-invoice-due-date-field', IN_14_DAYS]]) {
        const box = page.locator(`[data-test="${field}"]`).getByRole('textbox', { name: 'DD/MM/YYYY' });
        await box.fill(value);
        await box.press('Enter');
        await page.keyboard.press('Escape');
    }
    await page.locator('[data-test="confirm-invoice-total-field"]').getByRole('textbox').fill(String(total));
    const calcTax = page.getByText('Set to calculated tax from');
    if (await calcTax.isVisible().catch(() => false)) await calcTax.click();
    await page.locator('[data-test="approve-invoice-button"]').click();
    await expect(page.getByText('Invoice approved successfully')).toBeVisible({ timeout: 30000 });
    // The summary's fields can be collapsed (hidden), so check the text rather than visibility.
    const summary = page.locator('[data-test="approved-invoice-task"]');
    await expect(summary).toContainText(number);
    await expect(summary).toContainText(description);
}

// Opens "Cancel job" or "Close job" from "More options" and confirms (or backs out of) it.
// Both open a side panel first:
//   Cancel job? — "Back" backs out, "Cancel" goes on
//   Close job?  — "Cancel" backs out, "Close" goes on (the panel's X button is also named "Close")
// Going on opens a confirm popup; its confirm button is "Proceed", "Close job" or "Cancel job".
const PANEL_BUTTONS = {
    'Cancel job': { back: 'Back',   proceed: 'Cancel' },
    'Close job':  { back: 'Cancel', proceed: 'Close' },
};

export async function jobAction(page, action, { confirm }) {
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('option', { name: action }).click();

    const panel = page.locator('.side-panel').filter({ has: page.getByRole('heading', { name: `${action}?` }) });
    const popup = page.locator('[data-test="dialog"]');
    await expect(panel.or(popup).first(), `${action} panel or popup`).toBeVisible({ timeout: 10000 });

    if (await panel.isVisible()) {
        const { back, proceed } = PANEL_BUTTONS[action];
        // .last(): the action button sits after the panel's X ("Close") button.
        await panel.getByRole('button', { name: confirm ? proceed : back, exact: true }).last().click();
        if (!confirm) { await expect(panel).toBeHidden({ timeout: 15000 }); return; }
    }

    if (!confirm) {
        await popup.locator('[data-test="dialog-cancel-button"]').click();
        await expect(popup).toBeHidden({ timeout: 15000 });
        return;
    }

    // Confirm popup: click whichever confirm button it has.
    await expect(popup, `${action} confirm popup`).toBeVisible({ timeout: 10000 });
    const confirmBtn = popup.locator('[data-test="dialog-confirm-button"]')
        .or(popup.getByRole('button', { name: new RegExp(`^(Proceed|${action}|Confirm|Yes)$`, 'i') }))
        .first();
    await confirmBtn.click();
    await expect(popup).toBeHidden({ timeout: 15000 });
    await expect(panel).toBeHidden({ timeout: 15000 });
}
