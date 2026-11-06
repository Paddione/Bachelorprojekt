# p2 — Blast-Radius-Gate + Rollback-Notiz (Tests-Rolle, nach p1)

## Ziel
Beleg, dass Cache-Konsolidierung + Fan-in-Umleitung nichts gebrochen haben.
Full-Suite läuft explizit NICHT — nur diese Gates.

## Gate A (Pflicht): `components/website/src/lib/auth.test.ts`
- Befehl (Repo-Root): `task test:changed` — erwartet: grün, `auth.test.ts`
  in der Selection enthalten.
- Direktbefehl (Fallback/Beleg):
  `pnpm --dir components/website test:unit src/lib/auth.test.ts`
  (`vitest run`) — erwartet: alle Tests grün.

## Gate B (Pflicht): ~20 Admin-Routen-Tests mit `lib/auth`-Import
Je Datei via `pnpm --dir components/website test:unit <pfad>` (oder gesammelt
in einem `vitest run`-Aufruf mit allen Pfaden) — erwartet: alle grün.
Liste (Blast-Radius aus Graph, Stand 2026-11-06):
- `src/pages/api/auth/me` (Testdatei dazu)
- `src/pages/portal/sign/[assignmentId]` (Testdatei dazu)
- `src/pages/internal/applications/list` (Testdatei dazu)
- `src/pages/api/admin/content/restore`, `.../content/save`, `.../content/versions`
- `src/pages/api/admin/backup-status`, `.../ai-quality`
- `src/pages/api/admin/coaching/ki-config/active`, `.../ki-config/models`
- `src/pages/api/admin/questionnaires/assignments/[id]/archive`, `.../reassign`
- `src/pages/api/admin/billing/sepa-export`, `.../billing/[id]/validate`,
  `.../billing/[id]/payments`, `.../billing/datev-export`
- `src/pages/api/admin/sessions/index`, `.../sessions/templates/[id]`,
  `.../sessions/templates/index`, `.../sessions/history/index`

Mit-prüfen (kein hartes Gate, Ergebnis in `phase-events.log` vermerken):
`src/lib/admin-api.test.ts`, `src/lib/admin/*-Tests`.

## Gate C (Beleg-Artefakt)
`phase-events.log`: p0-Counts vs. p2-Counts (Diff ≈ 0 bei reinen
`getSession`/`isAdmin`-Callern), Gate-A-/Gate-B-Ergebnisse mit Befehl +
Erwartungswert, Commit-SHA des geprüften Stands.

## Rollback-Notiz
Rollback = Revert des p1-Commits (keine Migration, kein Schema, keine
Datenänderung — Cache ist rein prozess-lokal). Nach Revert nur Gate A +
Stichprobe Gate B (3 Dateien) erneut grün belegen.

## Gates (p2Done = Plan-Done)
- Gate A grün, Gate B alle ~20 grün, `phase-events.log` vollständig.
- STOP: > 2 rote Gate-B-Dateien mit gemeinsamem Fehlermuster → kein
  Fix-Forward im selben Stapel; an Primary zurückgeben (Cache-Semantik
  vs. Test-Fakes klären).
