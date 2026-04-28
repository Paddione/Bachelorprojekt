#!/usr/bin/env node
// One-shot GoBD backfill: populate belegnummer + skr_konto on legacy eur_bookings rows.
// Idempotent — only updates rows where the column is currently NULL.
//
// Usage:
//   SESSIONS_DATABASE_URL=postgresql://… node website/scripts/gobd-backfill.mjs
import pg from 'pg';

const url = process.env.SESSIONS_DATABASE_URL;
if (!url) {
  console.error('SESSIONS_DATABASE_URL is required');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });

try {
  const bn = await pool.query(`
    UPDATE eur_bookings e
       SET belegnummer = i.number
      FROM billing_invoices i
     WHERE e.invoice_id = i.id AND e.belegnummer IS NULL
  `);
  console.log(`belegnummer: ${bn.rowCount} rows updated`);

  const bnMan = await pool.query(`
    UPDATE eur_bookings
       SET belegnummer = 'MAN-' || id::text
     WHERE belegnummer IS NULL AND invoice_id IS NULL
  `);
  console.log(`belegnummer (manual): ${bnMan.rowCount} rows updated`);

  const skr = await pool.query(`
    UPDATE eur_bookings
       SET skr_konto = CASE
         WHEN type='income' AND EXISTS (
           SELECT 1 FROM billing_invoices i
            WHERE i.id = eur_bookings.invoice_id AND i.tax_mode='kleinunternehmer'
         ) THEN '8195'
         WHEN type='income'      THEN '8400'
         WHEN type='pretax'      THEN '1576'
         WHEN type='vat_payment' THEN '1780'
         WHEN type='vat_refund'  THEN '1781'
         ELSE '4980'
       END
     WHERE skr_konto IS NULL
  `);
  console.log(`skr_konto: ${skr.rowCount} rows updated`);
} finally {
  await pool.end();
}
