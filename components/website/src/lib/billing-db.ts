/**
 * billing-db.ts — Billing Schema-Initialisierung
 *
 * Extracted from website-db.ts (G-SIZE03 / T001293).
 * Contains only schema-init functions (DDL); the actual billing CRUD
 * operations live in native-billing.ts and the billing API route files,
 * which hold their own queries against `pool`.
 */

import { pool } from './db-pool';

// ── Billing Tables ───────────────────────────────────────────────────────────

async function initBillingAuditTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_audit_log (
      id            BIGSERIAL PRIMARY KEY,
      invoice_id    TEXT NOT NULL REFERENCES billing_invoices(id),
      action        TEXT NOT NULL,
      actor_user_id TEXT,
      actor_email   TEXT,
      from_status   TEXT,
      to_status     TEXT,
      reason        TEXT,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_audit_invoice ON billing_audit_log(invoice_id, created_at DESC)`);
}

async function installInvoiceImmutabilityTriggers(): Promise<void> {
  try {
    await installInvoiceImmutabilityTriggersInner();
  } catch (err) {
    // 42501 = insufficient_privilege. Triggers/functions exist from a prior
    // deploy under a different role (e.g. postgres superuser); current role
    // can't replace them but they enforce the same invariants. Leaving them
    // alone is correct — `initBillingTables` runs on every billing call so a
    // hard error here would break the entire billing API in production.
    if ((err as { code?: string } | null)?.code === '42501') return;
    throw err;
  }
}

async function installInvoiceImmutabilityTriggersInner(): Promise<void> {
  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_invoices_immutable() RETURNS trigger AS $fn$
    BEGIN
      IF OLD.locked = true THEN
        IF NEW.net_amount   IS DISTINCT FROM OLD.net_amount   OR
           NEW.tax_rate     IS DISTINCT FROM OLD.tax_rate     OR
           NEW.tax_amount   IS DISTINCT FROM OLD.tax_amount   OR
           NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR
           NEW.tax_mode     IS DISTINCT FROM OLD.tax_mode     OR
           NEW.customer_id  IS DISTINCT FROM OLD.customer_id  OR
           NEW.issue_date   IS DISTINCT FROM OLD.issue_date   OR
           NEW.due_date     IS DISTINCT FROM OLD.due_date     OR
           NEW.number       IS DISTINCT FROM OLD.number       OR
           NEW.brand        IS DISTINCT FROM OLD.brand        OR
           (OLD.hash_sha256 IS NOT NULL AND NEW.hash_sha256 IS DISTINCT FROM OLD.hash_sha256)
        THEN
          RAISE EXCEPTION 'GoBD: locked invoice % cannot be modified', OLD.id;
        END IF;
      END IF;
      RETURN NEW;
    END $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_invoices_no_delete() RETURNS trigger AS $fn$
    BEGIN
      IF OLD.locked = true THEN
        RAISE EXCEPTION 'GoBD: locked invoice % cannot be deleted', OLD.id;
      END IF;
      RETURN OLD;
    END $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_lines_immutable() RETURNS trigger AS $fn$
    DECLARE inv_locked boolean;
    BEGIN
      SELECT locked INTO inv_locked FROM billing_invoices
        WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
      IF inv_locked = true THEN
        RAISE EXCEPTION 'GoBD: cannot modify lines of locked invoice %', COALESCE(NEW.invoice_id, OLD.invoice_id);
      END IF;
      RETURN COALESCE(NEW, OLD);
    END $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`DROP TRIGGER IF EXISTS billing_invoices_immutable_trg ON billing_invoices`);
  await pool.query(`CREATE TRIGGER billing_invoices_immutable_trg
    BEFORE UPDATE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION billing_invoices_immutable()`);
  await pool.query(`DROP TRIGGER IF EXISTS billing_invoices_no_delete_trg ON billing_invoices`);
  await pool.query(`CREATE TRIGGER billing_invoices_no_delete_trg
    BEFORE DELETE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION billing_invoices_no_delete()`);
  await pool.query(`DROP TRIGGER IF EXISTS billing_lines_immutable_trg ON billing_invoice_line_items`);
  await pool.query(`CREATE TRIGGER billing_lines_immutable_trg
    BEFORE INSERT OR UPDATE OR DELETE ON billing_invoice_line_items
    FOR EACH ROW EXECUTE FUNCTION billing_lines_immutable()`);
}

let billingTablesReady = false;
export async function initBillingTables(): Promise<void> {
  if (billingTablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_customers (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      company       TEXT,
      address_line1 TEXT,
      city          TEXT,
      postal_code   TEXT,
      land_iso      CHAR(2) NOT NULL DEFAULT 'DE',
      vat_number    TEXT,
      sepa_iban     TEXT,
      sepa_bic      TEXT,
      sepa_mandate_ref  TEXT,
      sepa_mandate_date DATE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      typ           TEXT NOT NULL DEFAULT 'Kunde',
      CONSTRAINT billing_customers_brand_email_typ_key UNIQUE (brand, email, typ)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_customers_brand_fkey') THEN
          ALTER TABLE billing_customers ADD CONSTRAINT billing_customers_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  await pool.query(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS default_leitweg_id TEXT`);
  await pool.query(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS customers_id UUID REFERENCES customers(id)`);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='billing_customers' AND column_name='country'
      ) THEN
        ALTER TABLE billing_customers RENAME COLUMN country TO land_iso;
      END IF;
    END $$
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='billing_customers' AND column_name='land_iso' AND data_type != 'character'
      ) THEN
        ALTER TABLE billing_customers ALTER COLUMN land_iso TYPE CHAR(2);
      END IF;
    END $$
  `);
  await pool.query(`
    ALTER TABLE billing_customers
      ADD COLUMN IF NOT EXISTS typ TEXT NOT NULL DEFAULT 'Kunde'
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_customers_typ_chk'
      ) THEN
        ALTER TABLE billing_customers
          ADD CONSTRAINT billing_customers_typ_chk CHECK (typ IN ('Kunde'));
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_customers_brand_email_key'
      ) THEN
        ALTER TABLE billing_customers DROP CONSTRAINT billing_customers_brand_email_key;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_customers_brand_email_typ_key'
      ) THEN
        ALTER TABLE billing_customers
          ADD CONSTRAINT billing_customers_brand_email_typ_key UNIQUE (brand, email, typ);
      END IF;
    END $$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      number        TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'draft',
      customer_id   TEXT NOT NULL REFERENCES billing_customers(id),
      issue_date    DATE NOT NULL,
      due_date      DATE NOT NULL,
      service_period_start DATE,
      service_period_end   DATE,
      tax_mode      TEXT NOT NULL,
      net_amount    NUMERIC(12,2) NOT NULL,
      tax_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
      tax_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      gross_amount  NUMERIC(12,2) NOT NULL,
      notes         TEXT,
      payment_reference TEXT,
      locked        BOOLEAN NOT NULL DEFAULT false,
      cancels_invoice_id TEXT REFERENCES billing_invoices(id),
      retain_until  DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '10 years'),
      pdf_path      TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_invoices_brand_fkey') THEN
          ALTER TABLE billing_invoices ADD CONSTRAINT billing_invoices_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS pdf_path TEXT`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS leitweg_id TEXT`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS einvoice_validated_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS einvoice_validation_report JSONB`);
  await pool.query(`
    ALTER TABLE billing_invoices
      ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'regular',
      ADD COLUMN IF NOT EXISTS parent_invoice_id TEXT REFERENCES billing_invoices(id),
      ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'EUR',
      ADD COLUMN IF NOT EXISTS currency_rate NUMERIC(12,6),
      ADD COLUMN IF NOT EXISTS net_amount_eur  NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS gross_amount_eur NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS supply_type     TEXT
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_invoices_kind_chk'
      ) THEN
        ALTER TABLE billing_invoices
          ADD CONSTRAINT billing_invoices_kind_chk
          CHECK (kind IN ('regular','prepayment','final','gutschrift'));
      END IF;
    END $$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_invoice_dunnings (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      invoice_id    TEXT NOT NULL REFERENCES billing_invoices(id),
      brand         TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      level         SMALLINT NOT NULL,
      generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at       TIMESTAMPTZ,
      sent_by       TEXT,
      fee_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      interest_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      outstanding_at_generation NUMERIC(12,2) NOT NULL,
      pdf_path      TEXT,
      UNIQUE (invoice_id, level)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_invoice_dunnings_brand_fkey') THEN
          ALTER TABLE billing_invoice_dunnings ADD CONSTRAINT billing_invoice_dunnings_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_invoice_line_items (
      id          BIGSERIAL PRIMARY KEY,
      invoice_id  TEXT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
      unit        TEXT,
      unit_price  NUMERIC(12,2) NOT NULL,
      net_amount  NUMERIC(12,2) NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_invoice_payments (
      id           BIGSERIAL PRIMARY KEY,
      invoice_id   TEXT NOT NULL REFERENCES billing_invoices(id),
      brand        TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      paid_at      DATE NOT NULL,
      amount       NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
      method       TEXT NOT NULL,
      reference    TEXT,
      recorded_by  TEXT NOT NULL,
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_invoice_payments_brand_fkey') THEN
          ALTER TABLE billing_invoice_payments ADD CONSTRAINT billing_invoice_payments_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS billing_invoice_payments_invoice_idx
      ON billing_invoice_payments (invoice_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_quotes (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      number        TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'draft',
      customer_id   TEXT NOT NULL REFERENCES billing_customers(id),
      issue_date    DATE NOT NULL,
      valid_until   DATE,
      net_amount    NUMERIC(12,2) NOT NULL,
      tax_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
      gross_amount  NUMERIC(12,2) NOT NULL,
      notes         TEXT,
      converted_to_invoice_id TEXT REFERENCES billing_invoices(id),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_quotes_brand_fkey') THEN
          ALTER TABLE billing_quotes ADD CONSTRAINT billing_quotes_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  await pool.query(`
    ALTER TABLE billing_invoices
      ADD COLUMN IF NOT EXISTS hash_sha256    TEXT,
      ADD COLUMN IF NOT EXISTS pdf_mime       TEXT,
      ADD COLUMN IF NOT EXISTS pdf_size_bytes INTEGER,
      ADD COLUMN IF NOT EXISTS finalized_at   TIMESTAMPTZ
  `);
  await pool.query(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS leitweg_id VARCHAR(46)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_customers_leitweg ON billing_customers(leitweg_id) WHERE leitweg_id IS NOT NULL`);
  // Plan F: EU supply + export evidence
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_nachweis (
      id           BIGSERIAL PRIMARY KEY,
      invoice_id   TEXT NOT NULL REFERENCES billing_invoices(id),
      brand        TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      type         TEXT NOT NULL,
      received_at  DATE,
      document_ref TEXT,
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_nachweis_brand_fkey') THEN
          ALTER TABLE billing_nachweis ADD CONSTRAINT billing_nachweis_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  // Plan F: VAT ID validation log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vat_id_validations (
      id                  BIGSERIAL PRIMARY KEY,
      customer_id         TEXT REFERENCES billing_customers(id),
      vat_id              TEXT NOT NULL,
      country_code        CHAR(2) NOT NULL,
      valid               BOOLEAN NOT NULL,
      vies_name           TEXT,
      vies_address        TEXT,
      request_identifier  TEXT,
      validated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_suppliers (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      name          TEXT NOT NULL,
      email         TEXT,
      land_iso      CHAR(2) NOT NULL DEFAULT 'DE',
      ustidnr       TEXT,
      steuernummer  TEXT,
      iban          TEXT,
      bic           TEXT,
      bank_name     TEXT,
      address       TEXT,
      typ           TEXT DEFAULT 'Lieferant',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT billing_suppliers_brand_name_key UNIQUE (brand, name)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_suppliers_brand_fkey') THEN
          ALTER TABLE billing_suppliers ADD CONSTRAINT billing_suppliers_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_invoices (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      supplier_id   TEXT NOT NULL REFERENCES billing_suppliers(id),
      invoice_number TEXT,
      invoice_date  DATE NOT NULL,
      leistungsdatum DATE,
      net_amount    NUMERIC(12,2) NOT NULL,
      vat_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      gross_amount  NUMERIC(12,2) NOT NULL,
      vat_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
      currency      CHAR(3) NOT NULL DEFAULT 'EUR',
      description   TEXT,
      pdf_path      TEXT,
      status        TEXT NOT NULL DEFAULT 'open',
      paid_at       DATE,
      locked        BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_invoices_brand_fkey') THEN
          ALTER TABLE supplier_invoices ADD CONSTRAINT supplier_invoices_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  // Plan F: indexes for new child tables
  await pool.query(`
    CREATE INDEX IF NOT EXISTS billing_nachweis_invoice_idx
      ON billing_nachweis (invoice_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS vat_id_validations_customer_idx
      ON vat_id_validations (customer_id)
      WHERE customer_id IS NOT NULL
  `);
  // Plan F: billing_invoice_payments — rate at payment time
  await pool.query(`
    ALTER TABLE billing_invoice_payments
      ADD COLUMN IF NOT EXISTS payment_currency_rate NUMERIC(12,6)
  `);

  // Audit Phase 3 & 4: Billing Schema Cleanup
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_invoice_documents (
      invoice_id TEXT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
      format     TEXT NOT NULL,
      content    BYTEA NOT NULL,
      PRIMARY KEY (invoice_id, format)
    )
  `);

  // Migrate blobs to billing_invoice_documents
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='pdf_blob') THEN
        INSERT INTO billing_invoice_documents (invoice_id, format, content)
        SELECT id, 'pdf', pdf_blob FROM billing_invoices WHERE pdf_blob IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='pdf_a3_blob') THEN
        INSERT INTO billing_invoice_documents (invoice_id, format, content)
        SELECT id, 'pdf-a3', pdf_a3_blob FROM billing_invoices WHERE pdf_a3_blob IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='zugferd_xml') THEN
        INSERT INTO billing_invoice_documents (invoice_id, format, content)
        SELECT id, 'zugferd', zugferd_xml::bytea FROM billing_invoices WHERE zugferd_xml IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='factur_x_xml') THEN
        INSERT INTO billing_invoice_documents (invoice_id, format, content)
        SELECT id, 'factur-x', factur_x_xml::bytea FROM billing_invoices WHERE factur_x_xml IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='xrechnung_xml') THEN
        INSERT INTO billing_invoice_documents (invoice_id, format, content)
        SELECT id, 'xrechnung', xrechnung_xml::bytea FROM billing_invoices WHERE xrechnung_xml IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
    END $$;
  `);

  // Drop redundant columns
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='pdf_blob') THEN
        ALTER TABLE billing_invoices DROP COLUMN pdf_blob;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='pdf_a3_blob') THEN
        ALTER TABLE billing_invoices DROP COLUMN pdf_a3_blob;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='zugferd_xml') THEN
        ALTER TABLE billing_invoices DROP COLUMN zugferd_xml;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='factur_x_xml') THEN
        ALTER TABLE billing_invoices DROP COLUMN factur_x_xml;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='xrechnung_xml') THEN
        ALTER TABLE billing_invoices DROP COLUMN xrechnung_xml;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='paid_at') THEN
        ALTER TABLE billing_invoices DROP COLUMN paid_at;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='paid_amount') THEN
        ALTER TABLE billing_invoices DROP COLUMN paid_amount;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='dunning_level') THEN
        ALTER TABLE billing_invoices DROP COLUMN dunning_level;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_invoices' AND column_name='last_dunning_at') THEN
        ALTER TABLE billing_invoices DROP COLUMN last_dunning_at;
      END IF;
    END $$;
  `);

  // Create view
  await pool.query(`
    CREATE OR REPLACE VIEW v_billing_invoices_with_state AS
    SELECT
      i.*,
      COALESCE(p.paid_amount, 0) AS paid_amount,
      CASE WHEN COALESCE(p.paid_amount, 0) >= i.gross_amount THEN p.last_paid_at ELSE NULL END AS paid_at,
      COALESCE(d.dunning_level, 0) AS dunning_level,
      d.last_dunning_at
    FROM billing_invoices i
    LEFT JOIN (
      SELECT
        invoice_id,
        SUM(amount) AS paid_amount,
        MAX(paid_at) AS last_paid_at
      FROM billing_invoice_payments
      GROUP BY invoice_id
    ) p ON i.id = p.invoice_id
    LEFT JOIN (
      SELECT
        invoice_id,
        MAX(level) AS dunning_level,
        MAX(generated_at) AS last_dunning_at
      FROM billing_invoice_dunnings
      GROUP BY invoice_id
    ) d ON i.id = d.invoice_id;
  `);

  await initBillingAuditTable();
  await installInvoiceImmutabilityTriggers();
  billingTablesReady = true;
}

let taxModeTableReady = false;
export async function initTaxMonitorTables(): Promise<void> {
  if (taxModeTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tax_mode_changes (
      id            BIGSERIAL PRIMARY KEY,
      brand         TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_mode     TEXT NOT NULL,
      to_mode       TEXT NOT NULL,
      trigger_invoice_id TEXT,
      year_revenue_at_change NUMERIC(12,2),
      notes         TEXT
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_mode_changes_brand_fkey') THEN
          ALTER TABLE tax_mode_changes ADD CONSTRAINT tax_mode_changes_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  taxModeTableReady = true;
}

let eurTablesReady = false;
export async function initEurTables(): Promise<void> {
  if (eurTablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eur_bookings (
      id            BIGSERIAL PRIMARY KEY,
      brand         TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      booking_date  DATE NOT NULL,
      type          TEXT NOT NULL,
      category      TEXT NOT NULL,
      description   TEXT NOT NULL,
      net_amount    NUMERIC(12,2) NOT NULL,
      vat_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      invoice_id    TEXT REFERENCES billing_invoices(id),
      receipt_path  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eur_bookings_brand_fkey') THEN
          ALTER TABLE eur_bookings ADD CONSTRAINT eur_bookings_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  await pool.query(`
    ALTER TABLE eur_bookings
      ADD COLUMN IF NOT EXISTS belegnummer TEXT,
      ADD COLUMN IF NOT EXISTS skr_konto   TEXT
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id                   BIGSERIAL PRIMARY KEY,
      brand                TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      description          TEXT NOT NULL,
      purchase_date        DATE NOT NULL,
      net_purchase_price   NUMERIC(12,2) NOT NULL,
      vat_paid             NUMERIC(12,2) NOT NULL,
      useful_life_months   INT NOT NULL,
      correction_start_date DATE,
      is_gwg               BOOLEAN NOT NULL DEFAULT false,
      receipt_path         TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_brand_fkey') THEN
          ALTER TABLE assets ADD CONSTRAINT assets_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  eurTablesReady = true;
}
