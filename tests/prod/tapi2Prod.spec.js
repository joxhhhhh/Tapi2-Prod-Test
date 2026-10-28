/**
 * Tapi 2 production (tapi.app) — end-to-end job and invoice flow
 *
 * Built from a codegen recording on tapi.app. Runs as one serial flow on one page:
 *   1. Global search opens and closes
 *   2. Create a job (tenant-reported, 27 Baker St, Lilydale)
 *   3. Add a note to the job
 *   4. Edit the job (title, priority, description, cost limit)
 *   5. Cancel job dialog opens (backed out, job not cancelled)
 *   6. Close job dialog opens (backed out, job not closed)
 *   7. Send a work order to supplier "Liquid"
 *   8. Invoices list opens an existing invoice
 *   9. Upload an invoice (supplier Liquid, 27 Baker St, agent Josh Sali)
 *  10. Add a note, delete, then reopen the invoice
 *  11. Match without a job, fill details, approve, and check the approved summary
 *
 * THIS CHANGES PRODUCTION DATA: it creates a real job, sends a real work order, and approves
 * a real $1,000 invoice (owner is notified). Run it only on purpose.
 *
 * Login comes from a saved session, never from a password in code. Save it once with:
 *   node save-session.js
 * Run:
 *   npx playwright test tests/prod --headed
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';

const BASE      = process.env.PROD_URL || 'https://tapi.app';
const PROPERTY  = { search: '27 b', option: 'Baker St Lilydale, VIC', summary: 'Baker St, Lilydale, VIC' };
const TENANCY   = 'Tony Stark & niko robin';
const SUPPLIER  = { search: 'josh', option: 'Liquid' };
const AGENT     = 'Josh Sali';
const EXPENSE   = '- Maintenance';
const INVOICE_FILE = path.resolve('tests/uploadfiles/Standard Invoice sure.pdf');

const stamp     = Date.now();
const JOB_TITLE = `Prod-E2E-${stamp}`;
const INV_NUM   = `PROD-${stamp}`;
const TOTAL     = 1000;
const TAX       = (TOTAL / 11).toFixed(2);   // 10% GST included in the total
const ddmmyyyy  = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const TODAY     = ddmmyyyy(new Date());
const DUE       = ddmmyyyy(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

const SS = (page, label) =>
    page.screenshot({ path: `tests/Screenshots/${Date.now()}-prod-${label}.png`, fullPage: true }).catch(() => {});

// Leaves a confirm dialog without confirming. The dialog's own "Cancel" button would cancel the job,
// so this uses "Back" (or the data-test back button some dialogs have) and never "Cancel".
async function backOutOfDialog(page, heading) {
    const title = page.getByRole('heading', { name: heading });
    await expect(title).toBeVisible({ timeout: 10000 });
    const dataTestBack = page.locator('[data-test="dialog-cancel-button"]');
    if (await dataTestBack.isVisible().catch(() => false)) await dataTestBack.click();
    else await page.getByRole('button', { name: 'Back', exact: true }).last().click();
    await expect(title).toBeHidden({ timeout: 10000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('Tapi 2 production — job and invoice flow', () => {
    /** @type {import('@playwright/test').Page} */
    let page;

    test.beforeAll(async ({ browser }) => {
        // browser.newPage() doesn't inherit the config's storageState, so pass the saved login in.
        page = await browser.newPage({ storageState: path.resolve('auth-session.json') });
        await page.route(/intercom(cdn)?\.(io|com)/, route => route.abort());
        await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (/\/auth/.test(page.url())) throw new Error('Not logged in to tapi.app — the saved session expired. Run node save-session.js again.');
        await expect(page.locator('[data-test="new-job-menu-link"]')).toBeVisible({ timeout: 30000 });
    });

    test.afterAll(async () => { await page?.close(); });

    test('1. Global search opens and closes', async () => {
        await page.locator('[data-test="app-menu-search-button"]').click();
        await page.getByRole('button', { name: 'Back' }).click();
        await expect(page.getByRole('button', { name: 'Back' })).toBeHidden();
    });

    test('2. Create a job', async () => {
        await page.locator('[data-test="new-job-menu-link"]').click();
        await page.getByRole('button', { name: 'Tenant' }).click();
        await page.getByRole('button', { name: 'Select property' }).click();
        await page.getByRole('searchbox', { name: 'Search properties...' }).fill(PROPERTY.search);
        await page.getByRole('option', { name: PROPERTY.option }).click();
        await page.getByRole('button', { name: new RegExp(`^${TENANCY}`) }).click();
        await page.getByRole('option', { name: new RegExp(`^${TENANCY}`) }).click();
        await page.getByRole('textbox', { name: 'Keep it short!' }).fill(JOB_TITLE);
        await page.getByRole('button', { name: 'Priority: Normal' }).click();
        await page.getByRole('option', { name: 'Important' }).click();
        await page.locator('[data-test="new-job-description-field"]').getByRole('textbox').fill('Production E2E run — description');
        await page.locator('[data-test="new-job-submit-button"]').click();
        await expect(page.getByText('Job created successfully')).toBeVisible({ timeout: 20000 });
        await SS(page, 'job-created');
    });

    test('3. Add a note to the job', async () => {
        await page.getByRole('button', { name: 'More options' }).click();
        await page.getByRole('button', { name: 'Add note' }).click();
        await page.getByRole('textbox').fill('Production E2E note');
        await page.getByRole('button', { name: 'No agent assigned' }).click();
        await page.getByRole('option', { name: AGENT }).click();
        await page.getByRole('button', { name: 'Add note' }).nth(1).click();
        await expect(page.getByText('Production E2E note').first()).toBeVisible({ timeout: 15000 });
    });

    test('4. Edit the job', async () => {
        await page.getByRole('button', { name: 'Edit job' }).click();
        await page.getByRole('textbox', { name: 'Keep it short!' }).fill(`${JOB_TITLE} edited`);
        await page.getByRole('button', { name: 'Priority: Important' }).click();
        await page.getByRole('option', { name: 'Normal' }).click();
        await page.locator('textarea').fill('Production E2E run — description edited');
        await page.getByRole('textbox').nth(2).fill('1000');   // cost limit
        await page.getByRole('button', { name: 'Update job' }).click();
        await expect(page.getByText('Job updated successfully')).toBeVisible({ timeout: 20000 });
        await expect(page.getByText(`${JOB_TITLE} edited`).first()).toBeVisible();
    });

    test('5. Cancel job dialog opens (backed out)', async () => {
        await page.getByRole('button', { name: 'More options' }).click();
        await page.getByRole('option', { name: 'Cancel job' }).click();
        await expect(page.getByText('Notify owner')).toBeVisible();
        await expect(page.getByText('Notify tenant')).toBeVisible();
        await backOutOfDialog(page, 'Cancel job?');
    });

    test('6. Close job dialog opens (backed out)', async () => {
        await page.getByRole('button', { name: 'More options' }).click();
        await page.getByRole('option', { name: 'Close job' }).click();
        await backOutOfDialog(page, /close job/i);
    });

    test('7. Send a work order', async () => {
        await page.getByRole('button', { name: 'Send work order' }).click();
        await page.getByRole('button', { name: 'Select supplier' }).click();
        await page.getByRole('searchbox', { name: 'Search suppliers' }).fill(SUPPLIER.search);
        await page.getByRole('option', { name: new RegExp(`^${SUPPLIER.option}`) }).first().click();
        await page.locator('[data-test="send-work-order-submit-button"]').click();
        await expect(page.getByText('Work order sent successfully')).toBeVisible({ timeout: 20000 });
        await expect(page.locator('[data-test="scheduling-job-task"]')).toBeVisible();
        await SS(page, 'work-order-sent');
    });

    test('8. Invoices list opens an invoice', async () => {
        await page.getByRole('link', { name: 'Invoices' }).click();
        const first = page.getByRole('link', { name: /^AA-/ }).first();
        await expect(first).toBeVisible({ timeout: 20000 });
        await first.click();
        await expect(page.getByRole('heading', { name: /^Invoice AA-/ })).toBeVisible({ timeout: 15000 });
    });

    test('9. Upload an invoice', async () => {
        await page.locator('[data-test="new-job-menu-link"]').click();
        await page.locator('[data-test="new-invoice-menu-link"]').click();
        // Catch the file picker so Playwright fills it, instead of Windows' Open dialog appearing.
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.getByRole('link', { name: 'Browse' }).click(),
        ]);
        await chooser.setFiles(INVOICE_FILE);
        await page.getByRole('button', { name: 'Select supplier' }).click();
        await page.getByRole('searchbox', { name: 'Search suppliers' }).fill(SUPPLIER.search);
        await page.getByRole('option', { name: SUPPLIER.option, exact: true }).click();
        await page.locator('[data-test="invoice-upload-property-field"]').getByRole('button', { name: 'Select property' }).click();
        await page.getByRole('searchbox', { name: 'Search properties...' }).fill(PROPERTY.search);
        await page.getByRole('option', { name: PROPERTY.option }).click();
        await page.getByRole('button', { name: 'Select agent' }).click();
        await page.getByRole('option', { name: AGENT }).click();
        await page.locator('[data-test="invoice-upload-submit-button"]').click();
        await expect(page.getByText('Uploaded file successfully')).toBeVisible({ timeout: 60000 });
        await SS(page, 'invoice-uploaded');
    });

    test('10. Note, delete and reopen the invoice', async () => {
        await page.locator('[data-test="processing-invoice-process-button"]').click();
        await page.getByRole('button', { name: 'Add note' }).click();
        await page.getByRole('textbox').fill('Production E2E invoice note');
        await page.locator('[data-test="invoice-note-submit-button"]').click();
        await expect(page.getByText('Production E2E invoice note').first()).toBeVisible({ timeout: 15000 });

        await page.getByRole('button', { name: 'More options' }).click();
        await page.getByRole('option', { name: 'Delete' }).click();
        await page.getByRole('textbox').fill('Production E2E delete check');
        await page.locator('[data-test="delete-invoice-submit-button"]').click();
        const reopen = page.locator('[data-test="reopen-invoice-button"]');
        await expect(reopen).toBeVisible({ timeout: 20000 });
        await reopen.click();
        await expect(page.getByText('Invoice reopened successfully')).toBeVisible({ timeout: 20000 });
    });

    test('11. Match without a job, approve, and check the summary', async () => {
        // "Process without job" checkbox
        await page.getByText('Process without job').click();
        await page.locator('[data-test="match-invoice-attach-invoice-button"]').click();
        await expect(page.locator('[data-test="matched-invoice-item"]').getByText(PROPERTY.summary)).toBeVisible({ timeout: 20000 });

        await page.locator('[data-test="confirm-invoice-description-field"]').getByRole('textbox').fill('Production E2E invoice');
        await page.locator('[data-test="confirm-invoice-number-field"]').getByRole('textbox').fill(INV_NUM);
        for (const [field, value] of [['confirm-invoice-date-field', TODAY], ['confirm-invoice-due-date-field', DUE]]) {
            const box = page.locator(`[data-test="${field}"]`).getByRole('textbox', { name: 'DD/MM/YYYY' });
            await box.fill(value);
            await box.press('Enter');
            await page.keyboard.press('Escape');
        }
        const total = page.locator('[data-test="confirm-invoice-total-field"]').getByRole('textbox');
        await total.fill(String(TOTAL));
        await page.getByText('Set to calculated tax from').click();
        await page.getByRole('button', { name: /^- / }).first().click();   // expense account dropdown
        await page.getByRole('option', { name: EXPENSE }).click();
        await SS(page, 'invoice-details-filled');

        await page.locator('[data-test="approve-invoice-button"]').click();
        await expect(page.getByText('Invoice approved successfully')).toBeVisible({ timeout: 30000 });

        const summary = page.locator('[data-test="approved-invoice-task"]');
        await expect(summary.getByText(INV_NUM)).toBeVisible();
        await expect(summary.getByText('Production E2E invoice')).toBeVisible();
        await expect(summary.getByText(TODAY)).toBeVisible();
        await expect(summary.getByText(DUE)).toBeVisible();
        await expect(summary.getByText(`$${TAX}`)).toBeVisible();
        await expect(summary.getByText('$1,000.00')).toBeVisible();
        await expect(summary.getByText(EXPENSE)).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Owner notified' })).toBeVisible();
        await SS(page, 'invoice-approved');
    });
});
