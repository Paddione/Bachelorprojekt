---
ticket_id: T001995
plan_ref: openspec/changes/pocket-id-seed-early-abort/tasks.md
status: active
date: 2026-07-19
---

# pocket-id-client-seed: Early-Abort bei ungültigem API-Key

## Root Cause (aus T001992)

Wenn `POCKET_ID_API_KEY` nicht mehr gültig ist (z.B. Drift zwischen Sealed-Secret und
Pocket-IDs `api_keys`-Tabelle), scheitert jeder `curl`-Aufruf im Job mit 401. Der Job läuft
aber trotzdem für **jede** Zeile in `ROWS` weiter (`upsert()` pro Client), weil `curl -fsS`
bei 401 zwar einen Fehlercode liefert, aber `find_client_id()` diesen Fehler leise
verschluckt (`|| true`) und eine leere ID zurückgibt — was `upsert()` als "Client existiert
nicht" interpretiert und einen **POST** (Neuanlage) auslöst. Auch der POST scheitert mit
401, aber durch `set -e` (Shebang `-ec`) bricht das Skript erst an dieser Stelle ab, **nach**
mindestens einem versuchten Neuanlage-Call. Bei `restartPolicy: OnFailure` startet
Kubernetes den Container von vorn — jeder Retry erzeugt so potenziell weitere
Zombie-Client-Zeilen, bevor der Job endgültig failed (`backoffLimit: 2`).

## Fix-Ansatz

Direkt nach dem Setzen von `AUTH`/`CT` (vor der `ROWS`-Definition und vor der ersten
`upsert()`-Verarbeitung) einen einzelnen Auth-Check einbauen: `GET /api/oidc/clients` mit
`-w '%{http_code}'`. Bei HTTP-Status `401` oder `403` sofort mit einer klaren
Fehlermeldung abbrechen (`exit 1`), **bevor** irgendeine Zeile aus `ROWS` verarbeitet wird.

## Edge Cases

- Transiente Netzwerkfehler (Connection refused, siehe T001327) dürfen NICHT als
  Auth-Fehler interpretiert werden — nur ein tatsächlicher HTTP-401/403-Statuscode löst
  den Abbruch aus. `$CURL_RETRY` (inkl. `--retry-connrefused`) bleibt für den Auth-Check
  aktiv, sodass kurzzeitige Verbindungsprobleme beim Pod-Start (T001327) nicht fälschlich
  als 401 gewertet werden.
- Der Check darf keine zusätzlichen Zombie-Zeilen erzeugen — reines `GET`, kein
  `POST`/`PUT`.

## Nicht im Scope

- Kein periodischer Drift-Detector-CronJob (T001992-Klärungsrunde: bewusst nicht gewählt).
- Die Pagination-Lücke in `find_client_id()` selbst ist bereits in T001996 behoben
  (gemerged, PR #2991) — dieser Fix baut darauf auf.
