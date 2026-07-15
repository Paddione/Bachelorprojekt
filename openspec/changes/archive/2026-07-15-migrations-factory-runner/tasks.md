---
title: "migrations-factory-runner — Implementation Plan"
ticket_id: T001677
domains: [db, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# migrations-factory-runner — Implementation Plan

_Ticket: T001677_

Konsolidiert das zweite, bisher ungetrackte Migrationssystem
(`scripts/migrations/*.sql`) unter einen getrackten Runner analog zu
`website/src/db/migrate.ts`. Kernlogik wird **bewusst dupliziert** (kein
Cross-Workspace-Import), eigene Tracking-Tabelle
`public.factory_schema_migrations`, neues Taskfile-Target `factory:migrate`,
Verankerung in `workspace:deploy`, plus einmaliger, Ist-Zustand-geprüfter
Backfill als Runbook-Schritt. Alle Design-Entscheidungen sind bindend
festgelegt in `docs/superpowers/specs/2026-07-09-migrations-factory-runner-design.md`
(Abschnitt „Angenommene Entscheidungen").

## File Structure

Neue Dateien:

```
scripts/migrate-factory.mjs                                  # NEU — getrackter Runner (Duplikat von migrate.ts-Logik)
scripts/migrate-factory.test.mjs                             # NEU — node --test Unit-Test (analog migrate.test.ts)
```

Geänderte Dateien:

```
Taskfile.yml                                                 # NEU: Target factory:migrate + 3 Einbindungsstellen in workspace:deploy
package.json                                                 # NEU: scripts-Eintrag "test:migrate-factory"
.github/workflows/ci.yml                                     # NEU: CI-Step "node --test scripts/migrate-factory.test.mjs"
openspec/changes/migrations-factory-runner/specs/database.md # Delta-Spec (bereits befüllt) — target-spec: database
```

Nicht in dieser PR geändert (erst beim Archivieren gemerged):

```
openspec/specs/database.md                                   # SSOT — Delta wird via /opsx:archive gemerged, NICHT hier editiert
```

### S1-Budget-Notation (Zeilenlimits, Ratchet gegen Baseline)

Ermittelt via `jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json`:

| Datei | Ext-Limit | Baseline | Ist (`wc -l`) | Budget / Bemerkung |
|-------|-----------|----------|---------------|--------------------|
| `scripts/migrate-factory.mjs` | 500 (`.mjs`) | nicht-baselined | 0 (neu) | Ziel ~110 Zeilen (Vorbild `migrate.ts`=112) → Budget ~390, Wachstumsreserve reichlich |
| `scripts/migrate-factory.test.mjs` | 500 (`.mjs`) | nicht-baselined | 0 (neu) | Ziel ~180 Zeilen (Vorbild `migrate.test.ts`=169) → Budget ~320 |
| `Taskfile.yml` | — (`.yml` nicht S1-limitiert) | nicht-baselined | 4710 | S1 greift nicht für `.yml`; +~40 Zeilen unkritisch |
| `package.json` | — (`.json` nicht S1-limitiert) | nicht-baselined | 30 | +1 Zeile |
| `.github/workflows/ci.yml` | — (`.yml` nicht S1-limitiert) | nicht-baselined | n/a | +2 Zeilen (ein CI-Step) |

S2 (Import-Zyklen): entfällt — `.mjs` steht außerhalb der `website`/`e2e`
tsconfig-Graphen. S3 (Hostnamen): entfällt — keine Brand-Domain-Literale;
DB-Ziel kommt aus `DATABASE_URL`/`ENV_CONTEXT`. S4 (Orphans): `migrate-factory.mjs`
wird von `Taskfile.yml` (`factory:migrate`) erreicht, `migrate-factory.test.mjs`
von `package.json` + `ci.yml` — beide nicht-orphan.

## Task 1 — RED: Failing Unit-Test für `factory_schema_migrations`-Bootstrap + Skip-Logik

Schreibe `scripts/migrate-factory.test.mjs` (node `--test` + `node:assert`,
NICHT vitest — Repo-Root-`scripts`-Namespace nutzt `node --test`, siehe
`scripts/track-pr.test.mjs`, `scripts/build-learning-assets.test.mjs`). Der Test
importiert die (noch nicht existierende) Funktion `runMigrations` aus
`./migrate-factory.mjs` und deckt dieselben Fälle wie `website/src/db/migrate.test.ts` ab:

1. `applies files in lexicographic sort order and ignores non-.sql entries`
2. `skips already-tracked files and only runs untracked ones`
3. Backfill-Fälle `42P07`/`42710`/`42701` (Datei wird getrackt, Lauf fährt fort)
4. `aborts on a real error outside the allowlist and does not track the file` (z. B. `42601`)
5. `bootstraps public.factory_schema_migrations before the tracking SELECT`
6. `runs the whole pass on a single dedicated client` (`pool.connect` genau 1×, `client.release` 1×)

Der Test benutzt einen Mock-Pool (analog `createMockPool` in `migrate.test.ts`,
aber mit `node:test` `mock.fn`) und mockt das Dateisystem über einen
injizierbaren Parameter ODER — falls `runMigrations` `readdirSync` direkt nutzt —
über ein temporäres Verzeichnis. Bevorzugt: `runMigrations(pool, { migrationsDir })`
nimmt das Verzeichnis als Option, sodass der Test ein `tmp`-Fixture-Dir mit
`20260520_a.sql`/`20260703_b.sql` anlegen kann (kein Modul-Mock nötig, da
`node --test` kein `vi.mock` hat).

Der Bootstrap-Assert prüft, dass der erste Query-Call
`CREATE TABLE IF NOT EXISTS public.factory_schema_migrations` matcht und der
`SELECT filename FROM public.factory_schema_migrations`-Call danach kommt.

Registriere den Test in `package.json` `scripts` (neben den bestehenden `test:*`):

```json
"test:migrate-factory": "node --test scripts/migrate-factory.test.mjs"
```

**RED-Verifikation** (Test schlägt fehl, weil `scripts/migrate-factory.mjs` noch nicht existiert):

```bash
cd /tmp/wt-migrations-factory-runner
npm run test:migrate-factory
# expected: FAIL (rot — Modul ./migrate-factory.mjs nicht gefunden / runMigrations undefined)
```

## Task 2 — GREEN: `scripts/migrate-factory.mjs` implementieren

Implementiere den Runner als reine ESM-Datei (`import { Pool } from 'pg'`),
dupliziere die Logik aus `website/src/db/migrate.ts` (bindende Entscheidung 1),
mit diesen Abweichungen:

- Tracking-Tabelle: `public.factory_schema_migrations` (bindende Entscheidung 2),
  Spalten `filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()`.
- Migrations-Verzeichnis: `scripts/migrations/` relativ zum Skript
  (`join(__dirname, 'migrations')`). Erlaube Override via
  `runMigrations(pool, { migrationsDir })` für den Test.
- Exportiere `ALREADY_EXISTS_SQLSTATES = new Set(['42P07','42710','42701'])`,
  `isPgError(e)`, `runMigrations(pool, opts)` — genau wie das Vorbild.
- Single-Client-Garantie: `const client = await pool.connect()` einmalig, gesamter
  Lauf (Bootstrap, SELECT, alle Dateien) auf `client`, `client.release()` im `finally`.
- Pro Datei: `BEGIN` → `client.query(sql)` → `INSERT INTO public.factory_schema_migrations (filename) VALUES ($1)` → `COMMIT`;
  im `catch`: `ROLLBACK`, bei SQLSTATE in Allowlist `INSERT ... ON CONFLICT DO NOTHING` + `continue`,
  sonst `throw new Error('migration <f> failed: ...')`.
- `main()`: liest `DATABASE_URL`, wirft ohne, baut `new Pool({ connectionString })`,
  `runMigrations(pool)`, `pool.end()` im `finally`. Direktaufruf-Guard wie im Vorbild
  (`import.meta.url === 'file://' + process.argv[1]`).
- Logging über `console.log`/`console.error` (kein `../lib/logger`-Import — der existiert
  im Repo-Root-`scripts`-Namespace nicht).

**GREEN-Verifikation:**

```bash
cd /tmp/wt-migrations-factory-runner
npm run test:migrate-factory
# erwartet: alle Tests grün
wc -l scripts/migrate-factory.mjs   # muss < 500 sein (S1)
```

## Task 3 — Taskfile-Target `factory:migrate` + 3 Einbindungsstellen in `workspace:deploy`

3a. Neues Target `factory:migrate` in `Taskfile.yml` direkt nach `website:migrate`
(aktuell Zeile 3335). Repliziere das Port-Forward-Pattern von `website:migrate`
(bindende Entscheidung 4) — eigener Task, KEIN Refactor von `website:migrate`:

```yaml
  factory:migrate:
    desc: "Run scripts/migrations/*.sql against the target DB (idempotent, tracked in public.factory_schema_migrations). ENV=dev|mentolder|korczewski."
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        set -euo pipefail
        source scripts/env-resolve.sh "{{.ENV}}"
        ctx_flag=""
        [ "{{.ENV}}" != "dev" ] && ctx_flag="--context $ENV_CONTEXT"
        NS="${WORKSPACE_NAMESPACE:-workspace}"

        echo "Waiting for shared-db to be ready before running factory migrations..."
        kubectl $ctx_flag -n "$NS" rollout status deployment/shared-db --timeout=120s

        echo "Fetching postgres superuser password from ${NS}/shared-db..."
        PG_PW=$(kubectl $ctx_flag -n "$NS" exec deploy/shared-db -- \
          printenv POSTGRES_PASSWORD | tr -d '\r\n')
        if [ -z "$PG_PW" ]; then
          echo "ERROR: could not read POSTGRES_PASSWORD from shared-db"; exit 1
        fi

        echo "Port-forwarding shared-db (5432) and running factory migrations..."
        kubectl $ctx_flag -n "$NS" port-forward svc/shared-db 5432:5432 \
          >/tmp/factory-migrate-pf.log 2>&1 &
        PF=$!
        trap 'kill $PF 2>/dev/null' EXIT
        sleep 3

        DATABASE_URL="postgres://postgres:${PG_PW}@localhost:5432/website" \
          node scripts/migrate-factory.mjs
```

Begründung Ziel-DB `website`: `scripts/migrations/*.sql` adressieren die Schemas
`tickets.*`/`coaching.*`, die (wie `factory_psql -d website` zeigt) in der
`website`-Datenbank auf `shared-db` liegen — identisch zum `website:migrate`-Ziel.

3b. Einbindung an den drei `task website:migrate`-Stellen (bindende Entscheidung 5):
je eine Zeile `task factory:migrate ENV="{{.ENV}}"` DIREKT NACH der bestehenden
`task website:migrate ENV="{{.ENV}}"`-Zeile:

- `Taskfile.yml:2554` (dev-Pfad in `workspace:deploy`)
- `Taskfile.yml:2683` (prod-Pfad in `workspace:deploy`)
- `Taskfile.yml:3512` (`feature:website`-Rollout-Pfad)

> Hinweis: Zeilennummern verschieben sich nach Einfügen von 3a — verankere die
> Edits am Kontext-String `task website:migrate ENV="{{.ENV}}"` (3 Vorkommen),
> nicht an der absoluten Zeilennummer.

**Verifikation:**

```bash
cd /tmp/wt-migrations-factory-runner
task --list-all | grep 'factory:migrate'                    # Target existiert
grep -c 'task factory:migrate ENV=' Taskfile.yml            # erwartet: 3
task workspace:validate                                     # Manifest-/Taskfile-Sanity
```

## Task 4 — CI-Step registrieren (Test-Aggregat-Einbindung)

Da `test:changed` node-`.test.mjs`-Skripte NICHT automatisch aggregiert
(`RUN_SCRIPTS=true` mappt via `scripts/find-changed-tests.sh` nur auf BATS-Dateien),
folge dem etablierten Muster für node-Skript-Tests: ein dedizierter CI-Step in
`.github/workflows/ci.yml` direkt neben dem bestehenden
`node --test scripts/build-learning-assets.test.mjs` (aktuell Zeile 123-124):

```yaml
      - name: Verify factory migration runner (unit test)
        run: node --test scripts/migrate-factory.test.mjs
```

`package.json`-Eintrag `test:migrate-factory` (aus Task 1) bleibt der lokale
Einstieg. Da `Taskfile.yml` + `package.json` geändert werden, setzt
`scripts/find-changed-tests.sh` ohnehin `RUN_ALL`/BATS-Fallback — der neue Node-Test
läuft dediziert im CI-Step, nicht über `test:changed`.

**Verifikation:**

```bash
cd /tmp/wt-migrations-factory-runner
grep -q 'node --test scripts/migrate-factory.test.mjs' .github/workflows/ci.yml && echo "CI-Step vorhanden"
```

## Task 5 — Backfill als dokumentierter Runbook-Schritt (kein Deploy-Code)

Der einmalige Backfill ist ein **operativer, manuell ausgeführter Schritt** VOR der
ersten produktiven Aktivierung (bindende Entscheidung 6) — KEIN bei jedem Deploy
laufender Code. Dokumentiere ihn als Runbook-Abschnitt im Delta-Spec-Kontext bzw.
im PR-Body. Ablauf pro Brand-DB (`mentolder` → `workspace`, `korczewski` →
`workspace-korczewski`):

**Schritt A — Ist-Zustand pro Brand prüfen** (NICHT blind alle 17 eintragen —
Risiko divergenter Teilmengen zwischen mentolder/korczewski). Für jede der 17
Dateien wird ihr Marker-Objekt gegen `information_schema`/`pg_indexes`/Row-Existenz
geprüft. Marker-Ableitung (führendes DDL/Seed-Statement je Datei):

| Datei | Marker-Objekt | Prüf-Query (gegen DB `website`) |
|-------|---------------|--------------------------------|
| `2026-06-10-provider-routing.sql` | Tabelle `tickets.provider_config` | `SELECT to_regclass('tickets.provider_config') IS NOT NULL` |
| `2026-06-14-coaching-data-migrate.sql` | Tabelle `coaching.ki_config_id_map` | `SELECT to_regclass('coaching.ki_config_id_map') IS NOT NULL` |
| `2026-06-14-factory-run-budget.sql` | Tabelle `tickets.factory_run_budget` | `SELECT to_regclass('tickets.factory_run_budget') IS NOT NULL` |
| `2026-06-14-provider-config-unify.sql` | Index `provider_config_coaching_brand_provider` | `SELECT count(*)>0 FROM pg_indexes WHERE indexname='provider_config_coaching_brand_provider'` |
| `2026-06-15-cockpit-feature-suggest.sql` | Spalte `tickets.tickets.next_step` | `SELECT count(*)>0 FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='next_step'` |
| `2026-06-17-scout-drift.sql` | Spalte `tickets.tickets.scout_drift` | `information_schema.columns` wie oben, `column_name='scout_drift'` |
| `2026-06-17-triage-columns.sql` | Spalte `tickets.tickets.triaged_at` | `information_schema.columns` wie oben, `column_name='triaged_at'` |
| Seed-Dateien (`*-deepseek-seed`, `*-llm-availability-seed`, `*-local-qwen35-seed`, `2026-07-09-ticket-triage-local-qwen35`) | Zeilen in `tickets.provider_config` | Row-Existenz per distinktivem Key (z. B. `SELECT count(*)>0 FROM tickets.provider_config WHERE <seed-key>`) — Seed-Datei öffnen, den eingefügten identifizierenden Wert als Prädikat verwenden |
| übrige Dateien (`ai-question-human-answer`, `cockpit-rollup-view`, `grilling-answers`, `context-budget`, `coaching-is-test-data`, `coaching-phase2-drop-legacy`) | jeweils führendes DDL/View/Spalten-Statement der Datei | analog `to_regclass(...)` (Tabelle/View) bzw. `information_schema.columns` (Spalte) — Marker beim Ausführen des Runbooks aus der ersten wirksamen Anweisung der Datei ableiten |

Für jede Datei, deren Marker-Query `true` liefert, wird der Dateiname in Schritt B
eingetragen. Dateien, deren Marker `false` liefert (Migration auf dieser Brand noch
NICHT angewendet), werden NICHT vorbefüllt — sie laufen beim ersten
`factory:migrate` regulär durch.

**Schritt B — Backfill-Insert** (nur für als applied verifizierte Dateien), gegen
die jeweilige Brand-DB via `BRAND=<brand> factory_psql`:

```sql
CREATE TABLE IF NOT EXISTS public.factory_schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.factory_schema_migrations (filename) VALUES
  ('<verifizierter-dateiname-1>'), ('<verifizierter-dateiname-2>')  -- nur applied-Marker
ON CONFLICT DO NOTHING;
```

**Schritt C — Verifikation vor Aktivierung:**

```bash
# Pro Brand: getrackte Anzahl == Anzahl der als applied verifizierten Dateien
BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; echo "SELECT count(*) FROM public.factory_schema_migrations;" | factory_psql'
BRAND=korczewski bash -c 'source scripts/factory/lib.sh; echo "SELECT count(*) FROM public.factory_schema_migrations;" | factory_psql'
```

> Reihenfolge-Garantie: Weil die drei `task factory:migrate`-Einbindungen (Task 3b)
> und der Runner selbst idempotent + getrackt sind, ist der Backfill ein reiner
> Sicherheitsschritt gegen Seed-Doppelläufe. Wird er vergessen, würden nur die
> Seed-Migrationen (INSERT ohne `ON CONFLICT`) beim ersten Lauf Duplikate erzeugen —
> DDL-Dateien fängt die SQLSTATE-Backfill-Logik ab. Der Backfill wird daher VOR dem
> ersten Merge-Deploy dieser PR auf beiden Brands ausgeführt und in Schritt C
> verifiziert.

## Task 6 — Delta-Spec-Requirement (bereits befüllt) validieren

`openspec/changes/migrations-factory-runner/specs/database.md` enthält die beiden
ADDED-Requirements (getrackter Runner + SQLSTATE-Backfill inkl.
Ist-Zustand-Backfill-Scenario), Ziel-SSOT `database`. `openspec/specs/database.md`
wird NICHT in dieser PR editiert — der Merge erfolgt erst bei `/opsx:archive`.

**Verifikation:**

```bash
cd /tmp/wt-migrations-factory-runner
task test:openspec           # bzw. bash scripts/openspec.sh validate — muss grün sein
```

## Task 7 — Finale Verifikation (mandatory CI-Gates)

```bash
cd /tmp/wt-migrations-factory-runner
npm run test:migrate-factory   # Runner-Unit-Test grün
task test:openspec             # OpenSpec-Delta gültig
task test:changed              # gezielte Tests für geänderte Domains + quality-gate
task freshness:regenerate      # generierte Artefakte (test-inventory, repo-index, …) aktualisieren
task freshness:check           # CI-Äquivalent: Freshness + quality:check (S1–S4-Ratchet) + Baseline-Assertion
```

Erwartetes Ergebnis: alle grün; `docs/code-quality/baseline.json` unverändert (keine
neuen Baseline-Keys — `migrate-factory.mjs`/`.test.mjs` bleiben unter dem `.mjs`-Limit 500).
