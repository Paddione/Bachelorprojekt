---
ticket_id: T901750
plan_ref: .agents/plans/t901750-migrate-safety/tasks.md
---

# T901750 website:migrate Safety — Root-Cause-Design

Fix-Pfad-Brainstorming (Schritt 2.8), kompakt dokumentiert statt interaktiv:
keine interaktive Sitzung, User arbeitet asynchron an den Provider-Keys.

## Symptome vs. verifizierte Ursachen (Triage T002448-M5)

| # | Symptom (beobachtet) | Ursache (im Code belegt) |
|---|---|---|
| S1 | `task website:migrate ENV=staging` verband sich mit PROD (SCRAM-Fail gegen falschen Server) | Fester Local-Port `5432:5432` + `kubectl port-forward … &` ohne Liveness-/Ready-Prüfung (`sleep 3`). Ist 5432 belegt (fremder Forward), migriert der Task still die fremde DB. Namespace-Auflösung selbst ist korrekt (`staging.yaml` exportiert `WORKSPACE_NAMESPACE: workspace-staging` via Schema). |
| S2 | Unbekannte/vertippte ENV-Werte werden auf Task-Ebene nicht abgewiesen | `website:migrate` hat keine `preconditions` (Siblings `web:audit`/`a11y:axe` schon). `env-resolve.sh` scheitert bei fehlender Datei erst zur Laufzeit; `dev.yaml` setzt kein `WORKSPACE_NAMESPACE` → stiller Default `workspace`. |
| S3 | Frische DBs bleiben bei 20260917 stehen (Abort, kein Weiterkommen) | `20260917_application_pipeline_match_score.sql` sortiert vor `…_schema.sql` (`m` < `s`), enthält aber `ALTER TABLE applications.jobs` → `42P01` → harter Abort. Alle anderen Same-Date-Paare statisch geprüft, keine weiteren Kreuzabhängigkeiten. |
| S4 | Backfill trackt rolled-backte Files als applied (nur Skips beobachtet) | `migrate.ts` fängt `ALREADY_EXISTS` nach `ROLLBACK` ab und trackt. Latentes Teil-Applikations-Risiko bei Multi-Statement-Files. Verhalten ist per `migrate.test.ts` (`it.each` Backfill) bindender Vertrag → erhalten, aber laut machen. |

## Entscheidungen

- **D1 — Whitelist:** `preconditions` auf `dev|mentolder|korczewski|staging` (Sibling-Idiom). `dev` bleibt drin, sonst bricht `test_task_dry_run_website_migrate_env_dev_resolves_without_error`.
- **D2 — Ephemerer Port + Verify:** `kubectl port-forward svc/shared-db :5432`, Port aus `Forwarding from 127.0.0.1:PORT` parsen, TCP-Ready-Poll mit Timeout statt `sleep 3`, Liveness via `kill -0`, Ziel (`context`/`namespace`) vor dem Migrate echoen. Kein neues Skript (S4), alles inline im Task.
- **D3 — Ordering per Rename:** `git mv` match_score → `20260918_…` (Tag nach schema, Datum ist frei). SQL ist `IF NOT EXISTS`-idempotent → bereits getrackte DBs laufen die Datei als No-Op nach.
- **D4 — Backfill bleibt, wird laut:** `logger.info` → `logger.warn` mit File + Code + Handlungsanweisung. Kein Baseline-Mode, keine Statement-Splittung (beides Scope-Sprengung; alle Live-DBs sind voll getrackt, Execute verifiziert PROD read-only).
- **D5 — Kein neuer Test-Runner-Pfad:** pytest-Modul neben den Task-Level-Siblings, vitest nur erweitert, keine neue vitest-Datei.

## Edge-Cases

- `kubectl port-forward :5432` druckt den gewählten Port immer (`Forwarding from …`); Parse-Fail → Fail-closed.
- `task --dry` evaluiert Preconditions (empirisch belegt) → Whitelist ist dry-testbar.
- Rename betrifft `schema_migrations`-Historie: alter Dateiname bleibt als Zeile stehen, neuer läuft einmalig als No-Op → kein doppeltes DDL.
- `needs_pnpm`-Guard in `test_ci_cd_part1.py` verlangt weiter einen `pnpm`-Aufruf im Task-Body → `pnpm --dir components/website db:migrate` bleibt.

## Out of Scope (beobachtet, nicht hier)

- Fehlende ENV-Whitelists der Aufrufer (`website:deploy`, `workspace:deploy`) → Folge-Ticket.
- Staler `Apply manually`-Kommentar in `20260607_add_model_3d_type.sql` (migrate.ts führt die Datei automatisch aus).
- `MIGRATE_BASELINE`-Modus als Ersatz für Backfill (abgelehnt: Scope, Vertrag).
