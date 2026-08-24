-- 2026-08-24 — One-Shot: Billing-Testdaten-Purge (T015362).
--
-- ══════════════════════════════════════════════════════════════════════════
--  BEWUSSTER, PROTOKOLLERTER GOBD-EINGRIFF — NICHT automatisiert ausführen!
-- ══════════════════════════════════════════════════════════════════════════
--
-- Entfernt die in der Prod-DB (fleet / website) akkumulierten Systemtest-
-- Rechnungen und -Kunden, die wegen der GoBD-Trigger (no_delete / immutable)
-- auf normalem Weg unantastbar sind. Seit T015362 exempiert der Trigger-Code
-- Testdaten (is_test_data = true), sodass dieser Eingriff OHNE Deaktivierung
-- eines Triggers auskommt.
--
-- Zielbestand lt. Messung 2026-08-23:
--   - 427 festgeschriebene (gelockte) Testrechnungen, Status open/paid/
--     partially_paid, Kunden `Test Customer <test-*@example.de>`
--   - 1632 Testkunden kumulativ; nach dem Vor-Eingriff vom 2026-08-23
--     (1206 Entwürfe + 1205 verwaiste Kunden entfernt) noch 427 mit
--     Rechnungsbezug. Keine einzige echte Rechnung existiert.
--
-- Abgrenzung (mehrfach abgesichert, Transaktion bricht sonst komplett ab):
--   - Gelöscht wird NUR `is_test_data = true` UND E-Mail `*@example.*`.
--   - Guard 1: als Test markierte Rechnungen bei Nicht-Example-Kunden → ABBRUCH.
--   - Guard 2: fälschlich markierte Echtkunden (E-Mail ≠ @example.*) → ABRUCH.
--
-- VORAUSSETZUNGEN (geprüft, hart):
--   1. T015362-Code ist deployed und initBillingTables() gelaufen
--      (Spalten billing_*.is_test_data existieren).
--   2. GoBD-Trigger-Funktionen enthalten die Testdaten-Ausnahme
--      (billing_invoices_no_delete() referenziert is_test_data).
--
-- PROTOKOLLIERUNG: Jeder Schritt zählt über RAISE NOTICE; die vollständige
-- Ausgabe ist im Ticket T015362 zu dokumentieren (bewusster GoBD-Eingriff,
-- vgl. OpenSpec-Anforderung lückenloser Nummernkreis / Unveränderbarkeit).
--
-- BACKUP (PFLICHT vor Ausführung, wie beim Vor-Eingriff 2026-08-23):
--   POD=$(kubectl --context fleet -n workspace get pods -l app=shared-db -o name | head -1); POD=${POD#pod/}
--   kubectl --context fleet -n workspace exec "$POD" -c postgres -- \
--     pg_dump -U postgres -d website --data-only \
--       -t 'billing_*' -t invoice_counters -t eur_bookings -t vat_id_validations \
--     > "backup-billing-$(date +%F).sql"
--
-- AUSFÜHRUNG (nur manuell, mit Acknowledgement-GUC):
--   cat scripts/one-shot/purge-billing-testdata.sql | kubectl --context fleet -n workspace exec -i "$POD" -c postgres -- \
--     env PGOPTIONS='-c t015362.purge_ack=gobd-eingriff-bewusst' \
--     psql -U postgres -d website -v ON_ERROR_STOP=1 -f -
--
-- RUNTIME-CHECK: script=purge-billing-testdata marker=t015362.purge_ack

\set ON_ERROR_STOP on
BEGIN;

-- ── Acknowledgement-Gate: Skript läuft nur mit expliziter Bestätigung. ──────
DO $$
BEGIN
  IF COALESCE(current_setting('t015362.purge_ack', true), '')
       <> 'gobd-eingriff-bewusst' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'ABBRUCH: bewusster GoBD-Eingriff (T015362) — Ausführung nur mit '
                || 'PGOPTIONS=''-c t015362.purge_ack=gobd-eingriff-bewusst''. '
                || 'Siehe Kopftext dieses Skripts (Backup-Pflicht, Protokollierung).';
  END IF;
END
$$;

-- ── Voraussetzungen prüfen (Schema + Trigger-Ausnahme). ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'billing_invoices'
                    AND column_name = 'is_test_data') THEN
    RAISE EXCEPTION 'VORAUSSETZUNG FEHLT: billing_invoices.is_test_data existiert nicht — erst T015362 deployen (initBillingTables).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'billing_customers'
                    AND column_name = 'is_test_data') THEN
    RAISE EXCEPTION 'VORAUSSETZUNG FEHLT: billing_customers.is_test_data existiert nicht — erst T015362 deployen.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                  WHERE proname = 'billing_invoices_no_delete'
                    AND pg_get_functiondef(oid) LIKE '%is_test_data%') THEN
    RAISE EXCEPTION 'VORAUSSETZUNG FEHLT: GoBD-Trigger billing_invoices_no_delete() exempiert Testdaten nicht — Deploy von T015362 abwarten (sonst bleiben gelockte Testrechnungen unloeschbar).';
  END IF;
END
$$;

-- ── Kennzeichnung, Guards und Löschungen (eine plpgsql-Einheit). ────────────
DO $purge$
DECLARE
  cnt INT;
BEGIN
  -- Kennzeichnung (idempotent; UPDATE trifft keine GoBD-geschützten Felder).
  UPDATE billing_customers
     SET is_test_data = true
   WHERE is_test_data = false
     AND email ILIKE '%@example.%';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'markiert: billing_customers (Testkunden): %', cnt;

  UPDATE billing_invoices bi
     SET is_test_data = true
    FROM billing_customers c
   WHERE bi.customer_id = c.id
     AND c.email ILIKE '%@example.%'
     AND bi.is_test_data = false;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'markiert: billing_invoices (Testrechnungen): %', cnt;

  -- Abbruch-Guards VOR den Löschungen.
  SELECT count(*) INTO cnt
    FROM billing_invoices bi
   WHERE bi.is_test_data
     AND EXISTS (SELECT 1 FROM billing_customers c
                  WHERE c.id = bi.customer_id
                    AND c.email NOT ILIKE '%@example.%');
  IF cnt > 0 THEN
    RAISE EXCEPTION 'ABBRUCH: % als Test markierte Rechnungen gehoeren zu Nicht-Example-Kunden — Kennzeichnung manuell pruefen.', cnt;
  END IF;

  SELECT count(*) INTO cnt
    FROM billing_customers
   WHERE is_test_data
     AND email NOT ILIKE '%@example.%';
  IF cnt > 0 THEN
    RAISE EXCEPTION 'ABBRUCH: % Kunden mit Nicht-Example-E-Mail tragen is_test_data=true — falsche Kennzeichnung?', cnt;
  END IF;

  -- Löschungen: Kinder zuerst (FKs ohne CASCADE), dann Rechnungen, dann Kunden.
  DELETE FROM billing_audit_log a USING billing_invoices bi
   WHERE a.invoice_id = bi.id AND bi.is_test_data;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: billing_audit_log: %', cnt;

  DELETE FROM billing_invoice_dunnings d USING billing_invoices bi
   WHERE d.invoice_id = bi.id AND bi.is_test_data;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: billing_invoice_dunnings: %', cnt;

  DELETE FROM billing_invoice_payments p USING billing_invoices bi
   WHERE p.invoice_id = bi.id AND bi.is_test_data;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: billing_invoice_payments: %', cnt;

  DELETE FROM billing_nachweis n USING billing_invoices bi
   WHERE n.invoice_id = bi.id AND bi.is_test_data;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: billing_nachweis: %', cnt;

  DELETE FROM billing_invoice_documents doc USING billing_invoices bi
   WHERE doc.invoice_id = bi.id AND bi.is_test_data;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: billing_invoice_documents: %', cnt;

  -- EUR-Buchungen nicht löschen (eigenes GoBD-Relevantlager): nur Referenz lösen.
  UPDATE eur_bookings SET invoice_id = NULL
   WHERE invoice_id IN (SELECT id FROM billing_invoices WHERE is_test_data);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'detached: eur_bookings.invoice_id -> NULL: %', cnt;

  -- Selbstreferenzen auf Testrechnungen lösen (Felder sind nicht GoBD-geschützt).
  UPDATE billing_invoices SET parent_invoice_id = NULL
   WHERE parent_invoice_id IN (SELECT id FROM billing_invoices WHERE is_test_data);
  UPDATE billing_invoices SET cancels_invoice_id = NULL
   WHERE cancels_invoice_id IN (SELECT id FROM billing_invoices WHERE is_test_data);
  UPDATE billing_quotes SET converted_to_invoice_id = NULL
   WHERE converted_to_invoice_id IN (SELECT id FROM billing_invoices WHERE is_test_data);

  DELETE FROM billing_invoice_line_items li USING billing_invoices bi
   WHERE li.invoice_id = bi.id AND bi.is_test_data;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: billing_invoice_line_items: %', cnt;

  DELETE FROM billing_invoices WHERE is_test_data;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: billing_invoices: %', cnt;

  DELETE FROM billing_quotes q USING billing_customers c
   WHERE q.customer_id = c.id AND c.email ILIKE '%@example.%';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: billing_quotes (Testkunden): %', cnt;

  DELETE FROM vat_id_validations v USING billing_customers c
   WHERE v.customer_id = c.id AND c.email ILIKE '%@example.%';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: vat_id_validations (Testkunden): %', cnt;

  DELETE FROM billing_customers
   WHERE is_test_data AND email ILIKE '%@example.%';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'geloescht: billing_customers: %', cnt;
END
$purge$;

-- ── Nummernkreis-Reset: BEWUSST NOCH NICHT AKTIV (nur kommentiert). ─────────
-- Erst nach erfolgreichem Purge und erneuter Prüfung freigeben (Ticket T015362,
-- Punkt "Nummernkreis"): Der Reset setzt je Brand/Jahr auf die höchste noch
-- vergebene RE-Nummer — solange alle Testrechnungen entfernt sind, ist das die
-- höchste Echt-Rechnungsnummer; der lückenlose Nummernkreis bleibt gewahrt,
-- es gibt keine Kollision. Vorzeitiger Reset würde Nummernkollisionen erzeugen.
--
-- UPDATE invoice_counters ic
--    SET counter = COALESCE((
--          SELECT MAX(substring(bi.number FROM '[0-9]+$')::INT)
--            FROM billing_invoices bi
--           WHERE bi.brand = ic.brand
--             AND bi.number LIKE 'RE-' || ic.year || '-%'
--    ), 0)
--  WHERE ic.kind = 'invoice';

COMMIT;
