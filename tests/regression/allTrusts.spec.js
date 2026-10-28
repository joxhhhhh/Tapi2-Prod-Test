/**
 * Tapi 2 production (tapi.app) — regression, one end-to-end flow per trust
 *
 * For each trust: create a job, add a note, upload an invoice, and approve it without a job.
 * THIS CHANGES PRODUCTION DATA: it creates real jobs and approves real invoices, which sync to
 * each trust's integration (Palace, Reapit PM, PropertyMe).
 *
 * Trusts default to the three ABC production trusts. Override with PROD_TRUSTS="ABC Liquid NZ1".
 */

import { test } from '@playwright/test';
import { TRUSTS, SS, openApp, switchTrust, createJob, addJobNote, uploadInvoice, approveInvoice } from '../tapi2.js';


for (const trust of TRUSTS) {
    test(`${trust} — job and invoice end to end`, async ({ page }) => {
        test.setTimeout(5 * 60 * 1000);
        const slug = trust.replace(/\W+/g, '-');
        const stamp = Date.now();

        await openApp(page);
        await switchTrust(page, trust);

        await createJob(page, trust, `Reg-${slug}-${stamp}`);
        await addJobNote(page, `Regression note ${stamp}`);
        await SS(page, `${slug}-job`);

        await uploadInvoice(page, trust);
        await approveInvoice(page, { number: `Reg-${slug.slice(0, 15)}-${stamp}`, description: 'Trust regression test' });
        await SS(page, `${slug}-invoice-approved`);
    });
}
