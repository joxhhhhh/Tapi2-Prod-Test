/**
 * Tapi 2 production (tapi.app) — functional tests, 7 per trust
 *
 *   Job: Edit fields — title, description and cost limit save
 *   Job: Cancel a job
 *   Job: Close a job
 *   Job: Add a note
 *   Invoice: Delete — invoice moves to deleted and can be reopened
 *   Settings: Business settings pages load (Company, Workflow sections, Policies, Tenant Concierge)
 *   Settings: User list loads and pages through
 *
 * Each job and invoice test works on a fresh record it creates, never on existing data.
 * THIS CHANGES PRODUCTION DATA: it creates, cancels and closes real jobs and uploads and deletes
 * real invoices.
 *
 * Trusts default to the three ABC production trusts. Override with PROD_TRUSTS="ABC Liquid NZ1".
 */

import { test, expect } from '@playwright/test';
import { AGENT, TRUSTS, SS, openApp, switchTrust, openBusinessSettings, createJob, addJobNote, uploadInvoice, jobAction } from '../tapi2.js';


for (const trust of TRUSTS) {
    test.describe(trust, () => {
        const slug = trust.replace(/\W+/g, '-');
        const title = () => `Func-${slug}-${Date.now()}`;

        test.beforeEach(async ({ page }) => {
            test.setTimeout(4 * 60 * 1000);
            await openApp(page);
            await switchTrust(page, trust);
        });

        test('Job: Edit fields — title, description and cost limit save', async ({ page }) => {
            const t = title();
            await createJob(page, trust, t);
            await page.getByRole('button', { name: 'Edit job' }).click();
            await page.getByRole('textbox', { name: 'Keep it short!' }).fill(`${t} edited`);
            await page.locator('textarea').fill(`${t} description edited`);
            await page.getByRole('textbox').nth(2).fill('1000');   // cost limit
            await page.getByRole('button', { name: 'Update job' }).click();
            await expect(page.getByText('Job updated successfully')).toBeVisible({ timeout: 20000 });
            await expect(page.getByText(`${t} edited`).first()).toBeVisible();
            await SS(page, `${slug}-job-edited`);
        });

        test('Job: Cancel a job', async ({ page }) => {
            await createJob(page, trust, title());
            await jobAction(page, 'Cancel job', { confirm: true });
            await expect(page.getByRole('button', { name: 'Send work order' })).toBeHidden({ timeout: 15000 });
            await SS(page, `${slug}-job-cancelled`);
        });

        test('Job: Close a job', async ({ page }) => {
            await createJob(page, trust, title());
            await jobAction(page, 'Close job', { confirm: true });
            await expect(page.getByRole('button', { name: 'Send work order' })).toBeHidden({ timeout: 15000 });
            await SS(page, `${slug}-job-closed`);
        });

        test('Job: Add a note', async ({ page }) => {
            await createJob(page, trust, title());
            await addJobNote(page, `Functional note ${Date.now()}`);
        });

        test('Invoice: Delete — invoice moves to deleted and can be reopened', async ({ page }) => {
            await uploadInvoice(page, trust);
            await page.getByRole('button', { name: 'More options' }).click();
            await page.getByRole('option', { name: 'Delete' }).click();
            await page.getByRole('textbox').fill('Automated functional test');
            await page.locator('[data-test="delete-invoice-submit-button"]').click();
            await expect(page.locator('[data-test="reopen-invoice-button"]')).toBeVisible({ timeout: 20000 });
            await SS(page, `${slug}-invoice-deleted`);
        });

        test('Settings: Business settings pages load', async ({ page }) => {
            await openBusinessSettings(page);
            await expect(page.getByRole('heading', { name: 'Company details' })).toBeVisible({ timeout: 20000 });

            await page.getByRole('link', { name: 'Workflow', exact: true }).click();
            await expect(page).toHaveURL(/\/business\/settings\/workflow/);
            for (const section of ['Notifications', 'Reminders', 'Restrictions & privacy']) {
                const button = page.getByRole('button', { name: section });
                await expect(button, `Workflow section "${section}"`).toBeVisible({ timeout: 15000 });
                await button.click();
            }

            for (const [tab, url] of [['Policies', /policies/], ['Tenant Concierge', /tenant_concierge/], ['Company', /company/]]) {
                await page.getByRole('link', { name: tab, exact: true }).click();
                await expect(page, `${tab} page`).toHaveURL(url, { timeout: 15000 });
            }
            await SS(page, `${slug}-business-settings`);
        });

        test('Settings: User list loads and pages through', async ({ page }) => {
            await openBusinessSettings(page);
            await page.getByRole('link', { name: 'Users', exact: true }).click();
            await expect(page).toHaveURL(/\/business\/settings\/users/);
            await expect(page.getByText(AGENT).first()).toBeVisible({ timeout: 20000 });

            // Page forward while there's a next page (the recording went three pages in).
            const next = page.getByRole('button', { name: 'Next' });
            for (let i = 0; i < 3 && await next.isEnabled({ timeout: 3000 }).catch(() => false); i++) {
                await next.click();
                await page.waitForLoadState('domcontentloaded');
            }
            await SS(page, `${slug}-users`);
        });
    });
}
