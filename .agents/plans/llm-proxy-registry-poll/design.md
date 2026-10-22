---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-22
---

# llm-proxy-registry-poll — Design (Fix)

## Symptom (Fakt) vs. Ursache (Hypothese → belegt)

- Symptom: `website`-DB auf devmesh-shared-db hat 5,4 % Rollback-Rate
  (353485 Commits / 19185 Rollbacks); 60 von 62 ERRORs im 30-min-Fenster.
- Ursache (belegt durch Pod-Logs + Code): `scripts/llm-proxy/server.mjs:21`
  startet `startRegistryPoll(30_000)`; `backends.mjs:17` fragt
  `FROM tickets.llm_proxy_backends` ab. Das `tickets`-Schema existiert seit
  Ticket-Retirement (2026-10-14) nicht mehr in der DB (Katalog geprüft).
  Jeder Poll bricht ab → Rollback-Zähler. Takt im Log exakt 30 s.
- Abgegrenzte Eigenfehler: 2 ERROR-Zeilen vom 2026-10-22 02:45 UTC stammen von
  einer Audit-Probe (`ORDER BY`-Typo), nicht vom App-Verhalten.

## Entschiedene Richtung (Prior-Art zuerst)

- `scripts/lib/llm-stack-measure.sh:266-269` dokumentiert den Zielzustand:
  „Der Live-Proxy nutzt LLM_PROXY_BACKENDS_JSON aus der Unit-Umgebung."
- `backends.mjs:21-23` implementiert den Bypass bereits
  (`LLM_PROXY_BACKENDS_JSON` gewinnt vor DB-Poll).
- Aber: keine Manifest/Unit-Datei im Repo setzt die Variable
  (Repo-weit gesucht, 0 Treffer) — der devmesh-Pod fällt auf den DB-Poll
  zurück. Genau diese Lücke schließt der Fix.
- Verworfene Alternativen:
  - Neue Registry-Tabelle (`ops.llm_proxy_backends`): stellt retirtes
    Schema-Konzept wieder her, braucht Migration + Ownership — zu schwer
    für einen stillen 30-s-Poller.
  - Poll ganz entfernen: verliert Laufzeit-Umschaltung ohne Restart.
  - `tickets`-Shim-View: Reanimation des Retirements, abgelehnt.

## Scope

Rein: `LLM_PROXY_BACKENDS_JSON` in `dev-local/components/llm-services/deployment.yaml`
(mcp-node-Container), Kommentar in `bge-routes.mjs:79`, RED-Test (liegt bei).
Raus: `backends.mjs`-Logik (unverändert, DB-Fallback bleibt für Pfade ohne Env),
`taskfiles/Taskfile.devmesh.yml:213`-Statuscheck (gleiche Ursachenfamilie,
aber ungetesteter Pfad → separates Follow-up, kein Scope-Creep).
