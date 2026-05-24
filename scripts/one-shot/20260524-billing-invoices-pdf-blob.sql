-- Add pdf_blob and e-invoice columns to billing_invoices (schema drift fix)
-- These columns are referenced in native-billing.ts but were never added via migration.
-- Apply to BOTH clusters: mentolder + korczewski
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS pdf_blob      bytea;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS factur_x_xml  text;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS xrechnung_xml text;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS pdf_a3_blob   bytea;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS zugferd_xml   text;
