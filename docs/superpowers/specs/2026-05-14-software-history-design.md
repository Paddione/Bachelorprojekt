# Software-History Timeline — Design

**Date:** 2026-05-14
**Branch:** `feature/software-history`
**Scope:** Admin-only (intern)

## Problem

`bachelorprojekt.features` enthält pro gemergtem PR eine Zeile (Titel, Body, Kategorie, Scope, Brand, `merged_at`). Daraus ist nicht ablesbar **wann ein Service hinzukam, geändert oder entfernt wurde**. Mattermost, InvoiceNinja und das alte Operator-Dashboard wurden über die Zeit ersetzt — diese Übergänge stecken nur in Commit-Messages.

Ziel: eine klassifizierte Event-Tabelle, deren laufende Summe der heutigen Software-Liste entspricht, und deren History zeigt, wann welcher Service auftauchte/verschwand.

## Non-Goals

- **Keine Marketing-Sektion** auf der Homepage — die Daten leben unter `/admin/software-history`. Wenn sich der interne Stand bewährt, kann später eine kuratierte Public-View nachziehen.
- **Kein automatischer Hook in `tracking-import`.** Klassifikation läuft manuell per Taskfile-Target. Re-Runs sind idempotent.
- **Kein Anthropic-Key.** Klassifikation läuft komplett über die lokale LiteLLM/Ollama-Strecke (Memory `reference_local_llm_classify_workflow`).

## Architektur

Drei Bausteine, jeweils isoliert testbar:

```
features (bestehend)              software_events (neu)
+--------------------+            +-----------------------+
| pr_number          |<-----------| pr_number FK          |
| title, description |            | service, area, kind   |
| merged_at, brand   |            | confidence, classifier|
+--------------------+            | classified_at, notes  |
                                  +-----------------------+
                                           ^
                                           |
                              +------------+------------+
                              |                         |
                  scripts/software-history-classify.py  views v_software_stack / v_software_history
                  (Ollama via LiteLLM, idempotent)      consumed by /admin/software-history
```

### 1. Schema (`deploy/tracking/software-history.sql`)

```sql
CREATE TABLE IF NOT EXISTS bachelorprojekt.software_events (
  id             BIGSERIAL PRIMARY KEY,
  pr_number      INTEGER NOT NULL REFERENCES bachelorprojekt.features(pr_number) ON DELETE CASCADE,
  service        TEXT NOT NULL,            -- 'mattermost', 'nextcloud-talk', 'livekit', …
  area           TEXT NOT NULL,            -- 'chat', 'files', 'video', 'auth', 'ai', 'office', 'internal', …
  kind           TEXT NOT NULL CHECK (kind IN ('added','removed','changed','irrelevant')),
  confidence     NUMERIC(3,2) NOT NULL DEFAULT 1.0,   -- 0.00–1.00
  classifier     TEXT NOT NULL,            -- 'llm:llama3.1', 'manual', 'llm:failed'
  classified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes          TEXT
);
CREATE INDEX idx_software_events_pr      ON bachelorprojekt.software_events (pr_number);
CREATE INDEX idx_software_events_service ON bachelorprojekt.software_events (service);
CREATE INDEX idx_software_events_kind    ON bachelorprojekt.software_events (kind);

-- Aktueller Stack: letzter relevanter Event pro Service, Removed/Irrelevant rausgefiltert.
CREATE OR REPLACE VIEW bachelorprojekt.v_software_stack AS
WITH last_event AS (
  SELECT DISTINCT ON (service)
    service, area, kind, classified_at,
    pr_number
  FROM bachelorprojekt.software_events
  WHERE kind <> 'irrelevant'
  ORDER BY service, classified_at DESC, id DESC
)
SELECT service, area, classified_at AS as_of, pr_number AS last_pr
FROM last_event
WHERE kind <> 'removed'
ORDER BY area, service;

-- Vollständige History inkl. Titel + Autor aus features.
CREATE OR REPLACE VIEW bachelorprojekt.v_software_history AS
SELECT
  e.id,
  e.pr_number,
  f.merged_at,
  f.title,
  f.brand,
  f.merged_by,
  e.service,
  e.area,
  e.kind,
  e.confidence,
  e.classifier,
  e.notes
FROM bachelorprojekt.software_events e
JOIN bachelorprojekt.features f ON f.pr_number = e.pr_number
WHERE e.kind <> 'irrelevant'
ORDER BY f.merged_at DESC, e.id DESC;
```

Grants: `SELECT` für die Service-Rolle `website`, `INSERT/UPDATE/DELETE` für `tracking-import` (Klassifikator) + `website` (Admin-Overrides).

### 2. Klassifikator (`scripts/software-history-classify.ts`)

Node-Script (TS, läuft per `pnpm tsx`) — passt zur restlichen `scripts/`-Konvention und teilt sich den `pg`-Client mit dem Website-Code.

Ablauf:
1. Connect zu `shared-db` (env `TRACKING_DB_URL`, identisch zu `task tracking:ingest:local`).
2. `SELECT pr_number, title, description, brand, merged_at FROM bachelorprojekt.features f WHERE NOT EXISTS (SELECT 1 FROM bachelorprojekt.software_events e WHERE e.pr_number = f.pr_number) ORDER BY merged_at ASC` — älteste zuerst, damit Chronologie stimmt.
3. Pro PR: POST an `${LITELLM_URL:-http://localhost:4000}/v1/messages` mit System-Prompt der `{events: [...]}` JSON erzwingt. Modell-Default `claude-3-5-sonnet-20241022` (das LiteLLM-Mapping auf Ollama macht die Übersetzung; siehe Memory).
4. JSON parsen, jedes Event als Row inserten. Bei Parse-/Connect-Fehler: ein einzelner Event-Row mit `kind='irrelevant'`, `classifier='llm:failed'`, `notes=<fehler>` → Re-Runs überspringen den PR per Default; `--retry-failed` löscht zuerst alle `llm:failed`-Events.
5. Manuelle Overrides (`classifier='manual'`) werden **nie** überschrieben — selbst `--force` lässt sie in Ruhe.

Flags:
- `--dry-run` — druckt Klassifikation, schreibt nichts.
- `--limit N` — nur N PRs (Smoke-Test).
- `--retry-failed` — nimmt `llm:failed` Events nochmal in die Mangel.

Taskfile-Eintrag (`Taskfile.yml`):
```yaml
software-history:classify:
  desc: Classify all unclassified PRs into software_events (uses local LLM via LiteLLM)
  cmds:
    - source scripts/env-resolve.sh "{{.ENV}}"
    - pnpm -C website exec tsx ../scripts/software-history-classify.ts {{.CLI_ARGS}}
software-history:psql:
  desc: psql into shared-db, software_events focused
  cmds:
    - kubectl exec -it -n "${WORKSPACE_NAMESPACE:-workspace}" --context "${ENV_CONTEXT:-k3d-mentolder}" deploy/shared-db -- psql -U postgres -d postgres
```

### 3. Admin-Ansicht

**Route:** `website/src/pages/admin/software-history.astro` (Authn über bestehende `oauth2-proxy → Keycloak admin group`-Middleware, identisch zu `/admin/bugs`).

**Layout (Svelte-Komponente `SoftwareHistory.svelte`):**
- Oben: **Heutiger Stack** — Card-Grid, gruppiert nach `area`. Jede Card listet die Services dieser Area, sortiert nach `as_of` desc. Klick auf Service → springt im History-Bereich zum letzten Event dieses Service (anchor scroll).
- Darunter: **History-Tabelle** — chronologisch absteigend. Spalten: Datum / Kind-Badge (➕/➖/✏️/⊘) / Service / Area / PR-Link (→ github.com/Paddione/Bachelorprojekt/pull/N) / Confidence / Classifier / Notes.
- Inline-Edit: Klick auf eine Zeile → Modal mit den 4 Feldern (service, area, kind, notes). Submit schreibt `classifier='manual'`, refresh.
- Filter-Bar: kind (multi-checkbox), area (dropdown), brand (mentolder/korczewski/both), Volltext über title.

**API:**
- `GET /api/admin/software-history?kind=&area=&brand=&q=&limit=&offset=` → `{stack: [...], events: [...]}`
- `PATCH /api/admin/software-history/:id` → body `{service, area, kind, notes}`; setzt `classifier='manual'`, `classified_at=now()`.
- `POST /api/admin/software-history/reclassify` → triggert `software-history:classify` als Kubernetes Job (analog zu `coaching:classify` Trigger im Coaching-Dashboard).

### Error Handling

| Fehlerquelle | Verhalten |
|--------------|-----------|
| LiteLLM down | Script bricht mit Exit-Code 2 nach 3 aufeinanderfolgenden Connect-Fehlern ab. Keine Partial-Writes. |
| LLM liefert Müll-JSON | PR bekommt einen `llm:failed` Event, Script läuft weiter. |
| DB-Konflikt (Service umbenannt) | Manueller Override via Admin-Page. |
| Klassifikation falsch | Override, Re-Run rührt's nicht an. |

### Tests

- **BATS unit** (`tests/unit/scripts/software-history-classify.bats`): mockt LiteLLM-Response, prüft Idempotenz und Manual-Override-Schutz.
- **SQL-Tests** (`tests/sql/software-history.sql`): kleines Fixture, dass `v_software_stack` `removed`-Services rausfiltert und letzter Event gewinnt.
- **CI**: kein neuer Workflow, aber `task test:unit` deckt das BATS-Script ab.
- **Manuelle Smoke nach Deploy**: `/admin/software-history` öffnen, sehen dass Stack ≈ heutiger Service-Liste entspricht.

## Backfill-Strategie

1. SQL-Migration apply (mentolder + korczewski).
2. `task software-history:classify ENV=mentolder` — läuft im Hintergrund über ~730 PRs, geschätzt 2–4h auf der RTX-5070-Ti-Box.
3. Spot-Check der ersten 50 Klassifikationen im Admin-UI, evtl. Overrides setzen.
4. Klassifikator-Output ist DB-resident; korczewski bekommt seine eigene Klassifikation per `ENV=korczewski` Re-Run (oder per `pg_dump` der Tabelle, da Daten brand-agnostisch).

## Open Questions (vor Plan)

Keine.

## Akzeptanzkriterien

- [ ] `bachelorprojekt.software_events` existiert in beiden prod-Clustern.
- [ ] `task software-history:classify ENV=mentolder` läuft erfolgreich über alle PRs, schreibt mindestens ein Event pro PR (kann `irrelevant` sein).
- [ ] `/admin/software-history` zeigt heutigen Stack + History; Override-Edit persistiert.
- [ ] Manuelle Overrides überleben `task software-history:classify --force`.
- [ ] BATS-Test grün.
