-- 20261007_business_memberships.sql — Benutzer-zu-Business-Zuordnungen plus Inbox-Referenz
CREATE TABLE IF NOT EXISTS public.business_memberships (
  user_key   text NOT NULL,
  brand      text NOT NULL,
  role       text NOT NULL CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_key, brand)
);

CREATE INDEX IF NOT EXISTS business_memberships_brand_idx
  ON public.business_memberships (brand);
CREATE INDEX IF NOT EXISTS business_memberships_user_key_idx
  ON public.business_memberships (user_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_memberships TO website;

ALTER TABLE public.inbox_items ADD COLUMN IF NOT EXISTS brand text;

CREATE INDEX IF NOT EXISTS inbox_items_brand_idx
  ON public.inbox_items (brand);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'brands') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_memberships_brand_fkey') THEN
      ALTER TABLE public.business_memberships ADD CONSTRAINT business_memberships_brand_fkey
        FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbox_items_brand_fkey') THEN
      ALTER TABLE public.inbox_items ADD CONSTRAINT inbox_items_brand_fkey
        FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
  ELSE
    RAISE NOTICE 'Brand-Tabelle fehlt, Fremdschlüssel übersprungen (Härtung folgt)';
  END IF;
END $$;
