-- T000725: Add category column to tickets.tickets for Mishap Auto-Kategorisierung
-- Run on both brand databases (workspace + workspace-korczewski).
-- Bestehende Zeilen bleiben NULL (kein Backfill nötig).

ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IN (
    'CI-Konflikt','Gate-Fehler','API-Fehler',
    'Scout-Qualität','Deploy-Fehler','Spec-Lücke',
    'Test-Lücke','Sonstige'
  ));
