# p1-import-depth — Import-Tiefe korrigieren

## Ziel

Die vier Lib-Imports in der Kunden-Detailseite um genau eine `../`-Ebene
kürzen. Danach löst jeder relative Import der Datei auf eine existierende
Datei unter `components/website/src/lib/` auf.

## Budgets

- `components/website/src/pages/owner/kunden/[id].astro`: Ist 149 Zeilen,
  nicht-baselined, wirksame Schwelle ist das statische Limit — die Änderung
  ist zeilenneutral (4 Zeilen geändert, keine dazu). Budget ausreichend.
- `tests/spec/client-directory.bats`: wächst nur im Stage-Commit um den Guard
  (Ist 71 plus Guard), nicht-baselined. Budget ausreichend.

Keine Baseline-Einträge hinzufügen. Keine neuen Import-Zyklen (der Fix stellt
die beabsichtigte Kante wieder her, die Geschwisterdatei belegt die Form).
Keine neuen `any`-Typen.

<!-- vitest: kein neuer Test nötig, weil reiner Import-Pfad-Fix ohne Logikänderung -->

## Steps

1. In `components/website/src/pages/owner/kunden/[id].astro` die Zeilen 2 bis 5
   ändern, jeweils ein `../`-Segment entfernen:
   - `from '../../../../lib/owner-guard'` wird `from '../../../lib/owner-guard'`
   - `from '../../../../lib/auth'` wird `from '../../../lib/auth'`
   - `from '../../../../lib/messaging-db'` wird `from '../../../lib/messaging-db'`
   - `from '../../../../lib/clients'` wird `from '../../../lib/clients'`
   - Keine sonstige Zeile der Datei anfassen.
2. Guard grün laufen lassen (im Worktree):
   `tests/unit/lib/bats-core/bin/bats tests/spec/client-directory.bats`
   Alle 6 Cases müssen grün sein.
3. Ticket-Akzeptanz prüfen: `astro check` meldet keine Errors mehr in dieser
   Datei. Ab `components/website/`:
   `pnpm run astro:check 2>&1 | grep -c "kunden/\[id\]"` muss `0` ausgeben.
   Maßgeblich ist nur diese Datei; andere bereits bestehende Findings des
   Gesamtlaufs gehören nicht in diesen Fix.
