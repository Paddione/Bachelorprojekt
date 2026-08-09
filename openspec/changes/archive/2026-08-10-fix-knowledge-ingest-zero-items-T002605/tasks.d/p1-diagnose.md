# Partial p1 — Diagnose (Beweis, T002448-M5)

> **Agent:** deepseek-* | **Files:** keine | **Steps:** 7
> **Rolle:** impl (reine Verifikation + Entscheidungs-Gate, keine Datei-Änderung)
> **Verify:** Alle Counts entsprechen den Erwartungen; Ticket-Kommentar enthält die Evidenz-Tabelle.

## Task List

### 1. Evidenz-Queries gegen die fleet-Produktions-DB ausführen

- [ ] **1.1** Die fünf Evidenz-Queries ausführen (via `kubectl --context fleet -n workspace exec deploy/shared-db -c postgres -- psql -U website -d website -qtA` oder mcp-postgres):

```sql
SELECT COUNT(*) FROM bachelorprojekt.features;                          -- erwartet: 0
SELECT COUNT(*) FROM bugs.bug_tickets;                                  -- erwartet: 0
SELECT brand, type, COUNT(*) FROM tickets.tickets
 WHERE type IN ('bug','fix') GROUP BY brand, type;                      -- erwartet: mentolder fix=635
SELECT COUNT(DISTINCT pr_number) FROM tickets.ticket_links
 WHERE pr_number IS NOT NULL;                                           -- erwartet: 355
SELECT COUNT(*) FROM tickets.pr_events;                                 -- erwartet: 0 (kein Schreiber)
```

- [ ] **1.2** Abweichungen von den erwarteten Counts protokollieren (falls der Live-Store inzwischen Daten hat, ändert das die Guard-Erwartungen in p2, nicht die Quelle).

### 2. pg_stat-Write-Counter belegen (nie geschrieben)

- [ ] **2.1** Ausführen:

```sql
SELECT relname, n_tup_ins, n_tup_del FROM pg_stat_user_tables
 WHERE relname IN ('features','pr_events','bug_tickets') ORDER BY 1;
-- erwartet: alle n_tup_ins = 0 (die Tabellen wurden nie beschrieben)
```

### 3. ConfigMap-Drift prüfen

- [ ] **3.1** `kubectl --context fleet -n workspace get configmap knowledge-scripts -o yaml | grep -c 'bachelorprojekt.features'` — erwartet: ≥1 (deployte Kopie liest dieselbe leere Tabelle; nach p2: 0). Ergebnis notieren.

### 4. Entscheidung D2 belegen (Bug-Typ-Filter)

- [ ] **4.1** `type IN ('bug','fix')` gegen die Counts aus 1.1 abgleichen. Wenn `type='bug'` weiterhin 0 Zeilen hat und `type='fix'` die Daten trägt (T002329), gilt der Filter `type IN ('bug','fix')` — dokumentieren.

### 5. Entscheidung D3 belegen (PR-Quelle)

- [ ] **5.1** ticket_links-Join liefert ≥355 distinkte PRs → Live-Quelle. `tickets.pr_events` hat keinen Schreiber (n_tup_ins=0, kein INSERT im Repo außer Tests) → ticket_links-Join wählen.
- [ ] **5.2** Nachfolge-Vorschlag notieren: `tickets.pr_events`-Befüllung (GitHub-Sync) ist ein separates Ticket-Thema (SDLC-Timeline), nicht Teil dieses Fixes.

### 6. Entscheidung D4 belegen (Markdown)

- [ ] **6.1** Bestätigen: kein Repo-Mount im Cluster gewollt (Markdown-Ingest braucht `/repo`; läuft lokal per `task knowledge:reindex SOURCE=markdown`) → CronJob suspendieren + lokal-only dokumentieren.

### 7. Evidenz + Entscheidungen als Ticket-Kommentar protokollieren

- [ ] **7.1** Per ticket-mcp `add_comment` (visibility=internal) die Evidenz-Tabelle aus design.md + die Entscheidungen D2–D4 festhalten. Das schließt das Diagnose-Gate — p2 darf erst danach starten.

## Verification

- Alle Counts aus 1.1 entsprechen den Erwartungen (Abweichungen dokumentiert)
- Ticket-Kommentar T002605 enthält Evidenz + Entscheidungen
