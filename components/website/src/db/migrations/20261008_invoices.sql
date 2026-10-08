-- 20261008_invoices.sql — Basis-Rechnungen für die Massage-Praxis (T901027)
--
-- Regelquelle: docs/website/massage-privacy-requirements/README.md §5
-- (Pflichtangaben §14 UStG, §19-Hinweis bei Kleinunternehmer, Aufbewahrung
-- nach §257 HGB / §147 AO / GoBD — Belege werden nie gelöscht, Korrektur
-- nur per Storno und Neuausstellung).
--
-- Abgrenzung: public.massage_invoices ist bewusst NICHT billing_invoices.
-- Letztere gehört dem Portal-Billing (Kunden-FK, Dunning, DATEV-Export) und
-- darf nicht umgenutzt werden. Die Massage-Rechnung ist ein eigener,
-- einfacher Beleg mit eingefrorenem Preis-Snapshot.
--
-- Nummern: fortlaufend und lückenlos pro Brand und Jahr, Anzeigeformat
-- JJJJ-NNNN bildet der Service (invoices.ts). Snapshot-Spalten werden nach
-- der Ausstellung nie per UPDATE verändert, nur gelesen.

CREATE TABLE IF NOT EXISTS public.massage_invoices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand TEXT NOT NULL,
  invoice_year INT NOT NULL,
  invoice_number INT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_contact TEXT NOT NULL,
  service_key TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_duration_min INT NOT NULL,
  unit_price_cents INT NOT NULL CHECK (unit_price_cents >= 0),
  tax_mode TEXT NOT NULL CHECK (tax_mode IN ('kleinunternehmer', 'regelbesteuerung')),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount_cents INT NOT NULL DEFAULT 0,
  gross_amount_cents INT NOT NULL,
  tax_note TEXT,
  issue_date DATE NOT NULL,
  service_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen', 'bezahlt', 'storniert')),
  payment_method TEXT CHECK (payment_method IN ('sepa', 'cash', 'bank', 'other')),
  appointment_token TEXT,
  cancels_invoice_id TEXT REFERENCES public.massage_invoices(id),
  notes TEXT,
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, invoice_year, invoice_number)
);

-- Dedupe pro Termin: höchstens eine Rechnung je Brand und Buchungsreferenz.
-- NULL-Token (z. B. Korrektur-Nachfolger) bleiben davon ausgenommen.
CREATE UNIQUE INDEX IF NOT EXISTS massage_invoices_brand_token_idx
  ON public.massage_invoices (brand, appointment_token)
  WHERE appointment_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.massage_invoice_sequences (
  brand TEXT NOT NULL,
  invoice_year INT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (brand, invoice_year)
);

CREATE INDEX IF NOT EXISTS massage_invoices_brand_status_idx
  ON public.massage_invoices (brand, status);
CREATE INDEX IF NOT EXISTS massage_invoices_brand_year_number_idx
  ON public.massage_invoices (brand, invoice_year, invoice_number);

GRANT SELECT, INSERT, UPDATE ON public.massage_invoices TO website;
GRANT SELECT, INSERT, UPDATE ON public.massage_invoice_sequences TO website;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'brands') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'massage_invoices_brand_fkey') THEN
      ALTER TABLE public.massage_invoices ADD CONSTRAINT massage_invoices_brand_fkey
        FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'massage_invoice_sequences_brand_fkey') THEN
      ALTER TABLE public.massage_invoice_sequences ADD CONSTRAINT massage_invoice_sequences_brand_fkey
        FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
  ELSE
    RAISE NOTICE 'Brand-Tabelle fehlt, Fremdschlüssel übersprungen (Härtung folgt)';
  END IF;
END $$;
