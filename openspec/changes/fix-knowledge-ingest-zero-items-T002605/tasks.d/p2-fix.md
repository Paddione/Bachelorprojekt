# Partial p2 — Fix: Live-Quellen, Zero-Item-Guard, Markdown-Suspend

> **Agent:** deepseek-* | **Files:** k3d/knowledge-ingest-cronjob.yaml, scripts/knowledge/ingest-bug-tickets.mjs, scripts/knowledge/ingest-prs.mjs, scripts/knowledge/lib-knowledge-pg.mjs | **Steps:** 7
> **Context budget:** Script-Kopien konvergieren — jede Änderung im ConfigMap-Block (`data:` in k3d/knowledge-ingest-cronjob.yaml) 1:1 in die lokale Datei übernehmen.
> **Verify:** `task workspace:validate` + `node --check` auf beide Script-Kopien + `kubectl kustomize k3d >/dev/null`

## Task List

### 1. `ingest-bug-tickets.mjs` (ConfigMap-Kopie) auf `tickets.tickets` umstellen

- [ ] **1.1** Im `data:`-Block der ConfigMap `knowledge-scripts` in `k3d/knowledge-ingest-cronjob.yaml` den SQL-Block von `ingest-bug-tickets.mjs` ersetzen:

```sql
SELECT t.external_id AS ticket_id, t.title, t.description, t.status, t.brand, t.created_at,
       (SELECT l.pr_number FROM tickets.ticket_links l
         WHERE l.from_id = t.id AND l.kind = 'fixes' AND l.pr_number IS NOT NULL
         ORDER BY l.created_at DESC LIMIT 1) AS fixed_in_pr
  FROM tickets.tickets t
 WHERE t.brand = $1 AND t.type IN ('bug','fix')
 ORDER BY t.created_at DESC
```

  `COLLECTION_NAME`/`COLLECTION_SOURCE` unverändert ("Bug Tickets"/`bug_tickets`); `sourceUri = bug:${ticket_id}`; `metadata.ticket_id = external_id` (keine nicht-existenten Spalten wie `id`/`title` auf `tickets.tickets` verwenden — `title` existiert dort, `ticket_id` nicht).

### 2. Zero-Item-Guard in `ingest-bug-tickets.mjs`

- [ ] **2.1** Nach der Query einfügen: bei `rows.length === 0` den Live-Store prüfen:

```sql
SELECT COUNT(*) FROM tickets.tickets WHERE brand = $1 AND type IN ('bug','fix')
```

- [ ] **2.2** Guard-Logik:
  - Live-Count > 0 → `console.error('0 bug tickets, but live store has ' + count + ' — source misconfiguration?')` auf stderr + `process.exit(1)` (CronJob wird rot)
  - Live-Count === 0 → `console.log('0 bug tickets (live store empty — nothing to ingest)')` + weiter mit Exit 0

### 3. `ingest-prs.mjs` (ConfigMap-Kopie) auf ticket_links-Join umstellen

- [ ] **3.1** SQL-Block ersetzen:

```sql
SELECT DISTINCT l.pr_number, t.title, t.description
  FROM tickets.ticket_links l
  JOIN tickets.tickets t ON t.id = l.from_id
 WHERE l.pr_number IS NOT NULL
 ORDER BY l.pr_number DESC
```

  `sourceUri = pr:${pr_number}`; Metadaten OHNE `merged_at`/`labels` (existieren auf dieser Quelle nicht); `COLLECTION_NAME` unverändert ("PR History").

### 4. Zero-Item-Guard in `ingest-prs.mjs`

- [ ] **4.1** Analog Schritt 2: bei `rows.length === 0` Live-Count prüfen:

```sql
SELECT COUNT(DISTINCT pr_number) FROM tickets.ticket_links WHERE pr_number IS NOT NULL
```

- [ ] **4.2** Guard-Logik identisch: count > 0 → Warnung auf stderr + Exit 1; count === 0 → Log + Exit 0.

### 5. Lokale Kopien synchronisieren

- [ ] **5.1** Dieselben Änderungen (Steps 1–4) in `scripts/knowledge/ingest-bug-tickets.mjs` und `scripts/knowledge/ingest-prs.mjs` übernehmen. `scripts/knowledge/lib-knowledge-pg.mjs` nur anfassen, wenn ein gemeinsamer Guard-Helfer dort zentralisiert wird — sonst unverändert lassen (Datei bleibt im Plan als "nur falls nötig" geführt).

### 6. Markdown-CronJob suspendieren

- [ ] **6.1** In `k3d/knowledge-ingest-cronjob.yaml` für `knowledge-ingest-markdown` `spec.suspend: true` setzen.
- [ ] **6.2** Kommentar im `ingest-markdown.mjs`-ConfigMap-Block ergänzen:
  `# Suspended (T002605): Markdown-Ingest läuft bewusst lokal-only — task knowledge:reindex SOURCE=markdown (Repo-Mount nötig)`

### 7. Validieren

- [ ] **7.1** `task workspace:validate` (Kustomize-Dry-Run) — muss ohne Fehler laufen.
- [ ] **7.2** `node --check scripts/knowledge/ingest-bug-tickets.mjs && node --check scripts/knowledge/ingest-prs.mjs`
- [ ] **7.3** `kubectl kustomize k3d >/dev/null` — ConfigMap-Block parst.
- [ ] **7.4** `grep -c 'bachelorprojekt.features' k3d/knowledge-ingest-cronjob.yaml` → 0; `grep -c 'bugs.bug_tickets' k3d/knowledge-ingest-cronjob.yaml` → 0.

## Verification

- Kustomize baut ohne Fehler; beide Script-Kopien syntaktisch valide
- Deployte ConfigMap-Kopie enthält `tickets.tickets`/`tickets.ticket_links`, kein `bachelorprojekt.features`/`bugs.bug_tickets`
- Markdown-CronJob hat `spec.suspend: true`
