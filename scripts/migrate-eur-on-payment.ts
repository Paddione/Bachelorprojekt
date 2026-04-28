#!/usr/bin/env node
/**
 * One-shot migration for PR-A (TEILBEZAHLT).
 * - Synthesizes one billing_invoice_payments row for each existing 'paid' invoice
 *   whose ledger is empty.
 * - Deletes EÜR rows that were emitted at finalize-time for invoices that are
 *   still 'open' (i.e. unpaid at the moment of the cutover).
 *
 * Idempotent: re-running is a no-op once converged.
 *
 * Usage:
 *   DATABASE_URL=… node scripts/migrate-eur-on-payment.ts --dry-run
 *   DATABASE_URL=… node scripts/migrate-eur-on-payment.ts --apply
 */
import { Pool } from 'pg';

const dryRun = !process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.SESSIONS_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const paidInvoices = await client.query(`
      SELECT i.id, i.brand, i.paid_at, i.paid_amount, i.gross_amount, i.number
        FROM billing_invoices i
        LEFT JOIN billing_invoice_payments p ON p.invoice_id = i.id
       WHERE i.status='paid' AND p.id IS NULL
    `);
    console.log(`[paid→payments] ${paidInvoices.rowCount} invoice(s) to backfill`);
    for (const inv of paidInvoices.rows) {
      const amount = Number(inv.paid_amount ?? inv.gross_amount);
      console.log(`  + ${inv.number}: amount=${amount}, paid_at=${inv.paid_at}`);
      if (!dryRun) {
        await client.query(
          `INSERT INTO billing_invoice_payments
             (invoice_id, brand, paid_at, amount, method, recorded_by, notes)
           VALUES ($1,$2,$3,$4,'legacy','migration','PR-A backfill')`,
          [inv.id, inv.brand, inv.paid_at ?? new Date().toISOString().split('T')[0], amount],
        );
      }
    }

    const orphanBookings = await client.query(`
      SELECT b.id, b.invoice_id, b.net_amount, b.vat_amount, i.number, i.status
        FROM eur_bookings b
        JOIN billing_invoices i ON i.id = b.invoice_id
       WHERE b.category IN ('rechnungsstellung')
         AND i.status IN ('open','draft')
    `);
    console.log(`[finalize-eur cleanup] ${orphanBookings.rowCount} booking(s) to remove`);
    for (const b of orphanBookings.rows) {
      console.log(`  - eur_booking#${b.id} (${b.number}, status=${b.status}): -${b.net_amount} net, -${b.vat_amount} vat`);
      if (!dryRun) {
        await client.query(`DELETE FROM eur_bookings WHERE id=$1`, [b.id]);
      }
    }

    if (dryRun) {
      console.log('\n[dry-run] no changes committed. Re-run with --apply to persist.');
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
      console.log('\n[done] committed.');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
