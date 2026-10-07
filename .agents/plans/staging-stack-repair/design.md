---
title: "staging-stack-repair — Design"
ticket_id: T900806
status: approved
---

# staging-stack-repair — Design

Ersetzt den Plan vom 2026-09-28. Der workspace-staging-Stack auf `fleet` hatte am 2026-10-07
20 Failed-Jobs statt 5, RC4 (Pending `backup-pvc`) war erledigt, und die alte Annahme zu RC2
war falsch.

## Ziel und Erfolgskriterium

Alle CronJobs in `workspace-staging` laufen durch, Flux bleibt grün, und jede Ursache ist im
Repo behoben statt nur live geflickt. Abnahme: kein neuer Failed-Job über einen vollen
Cron-Zyklus (24 h) nach dem Deploy.

## Befunde (Symptom → belegte Ursache)

Alle Messungen read-only, Stand 2026-10-07, Context `fleet`. Loki über
`kubectl -n monitoring port-forward svc/loki 13100:3100`.

| ID | Symptom | Ursache | Beleg |
|---|---|---|---|
| RC1 | `sessions-purge`: `couldn't find key SESSIONS_CRON_TOKEN`; `billing-dunning-detection` und `monthly-billing`: HTTP 500 | `workspace-secrets` hat 70 Keys; `website-secrets/POCKET_ID_WEBSITE_SECRET` in `website-staging` ist leer, die Website lehnt jeden Request mit `POCKET_ID_WEBSITE_SECRET … is not set` ab | `kubectl -n website-staging get secret website-secrets -o json \| jq -r '.data.POCKET_ID_WEBSITE_SECRET\|@base64d\|length'` → `0`; Loki `{namespace="website-staging"} \|= "POCKET_ID_WEBSITE_SECRET"` |
| RC2 | `knowledge-ingest-prs/-bugs`, `knowledge-reindex-all`: `relation "knowledge.collections" does not exist` | 9 `public`-Tabellen der DB `website` gehören in Staging `postgres` statt `website` (u. a. `brands`, `customers`). Der postStart-Hook von `shared-db` führt `ensure-knowledge-schema.sh` mit `SET ROLE website` aus und scheitert am Foreign Key auf `public.brands`. `\|\| true` verschluckt den Fehler. `tickets.tickets` (App-Boot, `initTicketsSchema`) scheitert an denselben Foreign Keys. | Rollback-Probe: `BEGIN; <ensure-SQL>; ROLLBACK;` → `ERROR: permission denied for table brands`. Prod: `brands` gehört `website`, Staging: `postgres` mit nur `SELECT` |
| RC3 | `db-backup`, `pvc-backup`: `mkdir: cannot create directory '/backups/…': Permission denied`; `db-restore-verify`: `no backup generation found` | `backup-pvc` ist an das von Hand angelegte PV `backup-pvc-pkh8` (Typ `local`, Pfad `/mnt/local-storage/backup-pvc` auf `pk-hetzner-8`) gebunden. UID 65534 darf dort nicht schreiben. Prod nutzt eine dynamisch per local-path angelegte PVC. | Loki `{namespace="workspace-staging", pod=~"db-backup-.*"}` |
| RC5 | `llm-proxy-log-retention`: `permission denied for table llm_proxy_request_log` | Der Job macht `UPDATE`, `scripts/migrations/2026-08-10-llm-proxy-request-log.sql` gewährt `website` nur `SELECT, INSERT, DELETE`. Prod hat die Rechte von Hand. | `information_schema.role_table_grants` Staging `website: INSERT,SELECT,DELETE`, Prod inklusive `UPDATE` |
| RC6 | Staging-Website spricht die Nextcloud-DB im Prod-Namespace an | `environments/staging.yaml:48` setzt `NEXTCLOUD_DB_HOST: nextcloud-db.workspace.svc.cluster.local` | `kubectl -n workspace-staging get svc nextcloud-db` existiert |

Nicht im Umfang: Nextcloud `notify_push` meldet `Failed to setup redis subscription: Connection refused`. Eigenes Ticket.

## Entscheidungen

- **D1 (RC1):** Commit `f970659911` des Branches bleibt die Quelle. Beim Nachziehen auf `main`
  wird die einzige Konfliktursache übernommen: `8ce2d57d6` (T900728) hat `FACTORY_OTLP_TOKEN`
  in `OTEL_AUTH_TOKEN` umbenannt. Danach `env:seal` für Staging. `env:seal` rotiert nur
  `workspace-secrets`, `website-secrets` muss mitversiegelt werden. Die 7 leeren Werte
  (`GEMINI_API_KEY`, `GITHUB_MODELS_TOKEN`, `HUGGINGFACE_TOKEN`, `OPENCODE_API_KEY`,
  `OPENROUTER_API_KEY`, `PUSHOVER_TOKEN`, `PUSHOVER_USER`) sind optionale Drittanbieter-Keys,
  `env:validate` entscheidet.
- **D2 (RC2):** Owner-Normalisierung im postStart-Hook von `k3d/shared-db.yaml`, vor den
  ensure-Skripten: jede Tabelle in `public` der DB `website` mit Owner `postgres` bekommt
  `OWNER TO website`. Auf Prod ein No-op. Das `|| true` hinter den ensure-Skripten wird durch
  eine Fehlerausgabe ersetzt, die den Skriptnamen nennt, ohne den Hook abzubrechen (ein
  fehlschlagender postStart würde den Pod killen). Live: Neustart von `shared-db` in Staging.
  Verworfen: zusätzlicher Apply-Job (würde am selben Grant scheitern) und reiner Live-Fix
  (kehrt nach jedem Restore zurück).
- **D3 (RC3):** Kein Manifest-Change. Live: Inhalt des PV prüfen, dann `backup-pvc` und
  `backup-pvc-pkh8` löschen, Flux legt die PVC per local-path neu an.
- **D4 (RC5):** Migration auf `GRANT SELECT, INSERT, UPDATE, DELETE` erweitern und gegen
  Staging einspielen. `task db:migrate` kennt kein `ENV=staging`, daher `kubectl exec` mit
  `psql -f`.
- **D5 (RC6):** `NEXTCLOUD_DB_HOST` auf `nextcloud-db.workspace-staging.svc.cluster.local`.

## Tests

`tests/spec/staging-stack-repair.bats` prüft die Repo-Seite statisch (Querschnittstest auf
Konfiguration, Ausnahme nach `tests/CLAUDE.md`): Owner-Normalisierung vorhanden, kein stilles
`|| true`, `UPDATE`-Grant, kein Prod-Host in `staging.yaml`, Pflicht-Keys in der versiegelten
Datei. Die Laufzeitseite deckt die Live-Abnahme ab.
