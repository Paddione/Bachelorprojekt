# Cockpit Action Inventory

_Stand: 2026-08-08 · Ticket T002643 (cockpit-realtime-push)_

Jede Aktion wird über den gebündelten Endpunkt `POST /sdlc/api/cockpit/actions`
ausgeführt. Der Endpunkt prüft die Admin-Sitzung, ruft die zuständige
Implementierung auf und schreibt eine Audit-Zeile (`tickets.cockpit_audit`) mit
`outcome` `success` oder `failure` — auch der Fehlschlag wird protokolliert.

Die Umkehrbarkeitsklasse stammt aus `action-policy.js` (`classify()`).
Unbekannte Aktionen gelten als `irreversible`.

## Aktionen

| Aktion | HTTP-Pfad | Methode | Umkehrbarkeit | Audit |
|---|---|---|---|---|
| `feature_action` | `/sdlc/api/cockpit/actions` | POST | `reversible` | success/failure |
| `feature_actions` | `/sdlc/api/cockpit/actions` | POST | `reversible` | success/failure |
| `batch` | `/sdlc/api/cockpit/actions` | POST | `reversible` | success/failure |
| `reorder` | `/sdlc/api/cockpit/actions` | POST | `reversible` | success/failure |
| `reparent` | `/sdlc/api/cockpit/actions` | POST | `reversible` | success/failure |
| `suggest` | `/sdlc/api/cockpit/actions` | POST | `irreversible` | success/failure |
| `factory_tick` | `/sdlc/api/cockpit/actions` | POST | `repeatable` | success/failure |
| `factory_enqueue` | `/sdlc/api/cockpit/actions` | POST | `repeatable` | success/failure |
| `factory_release_slot` | `/sdlc/api/cockpit/actions` | POST | `reversible` | success/failure |
| `flux_reconcile` | `/sdlc/api/cockpit/actions` | POST | `irreversible` | success/failure |
| `ci_rerun` | `/sdlc/api/cockpit/actions` | POST | `irreversible` | success/failure |
| `ticket_stage_plan` | `/sdlc/api/cockpit/actions` | POST | `reversible` | success/failure |
| `ticket_release_hold` | `/sdlc/api/cockpit/actions` | POST | `reversible` | success/failure |
| `ticket_close` | `/sdlc/api/cockpit/actions` | POST | `irreversible` | success/failure |

**Implementierungsdetails:**

- `feature_action`, `feature_actions`, `batch`, `reorder`, `reparent`, `suggest`:
  rufen `cockpit-db`-Funktionen auf. Die individuellen Routendateien
  (`feature-action.ts`, `feature-actions.ts`, `batch.ts`, `reorder.ts`,
  `reparent.ts`, `suggest.ts`) existieren weiterhin als API-Dokumentation und
  für programmatischen Zugriff.
- `factory_tick`, `factory_enqueue`, `factory_release_slot`:
  schreiben über `writeControl()` in die `factory_phase_events`-Tabelle.
  Die separate Route `GET /sdlc/api/factory-control` (`factory-control.ts`)
  liefert den lesenden Zugriff.
- `flux_reconcile`, `ci_rerun`:
  Shell-Ausführung (`scripts/flux.sh`, `gh-axi`). Irreversible externe Effekte.
- `ticket_stage_plan`, `ticket_release_hold`, `ticket_close`:
  Shell-Ausführung (`scripts/ticket.sh`). `close` ist irreversibel (Ticket
  geschlossen), die übrigen sind durch erneuten Aufruf revidierbar.

## Gepollte Restmenge

Diese Quellen haben **keine Postgres-Quelle** und können kein `NOTIFY` senden.
Sie bleiben daher gepollt (Client-seitiges `setInterval` über den Adapter).

| Quelle | Grund für Poll | Adapter-Methode |
|---|---|---|
| `cluster` | Pod-Zustände kommen von kubectl — keine Postgres-Quelle, kein `NOTIFY` möglich | `createPoll('pods-list', 30000)` |
| `ci` | CI-Läufe kommen von GitHub — keine Postgres-Quelle, kein `NOTIFY` möglich | `createPoll('ci', 120000)` |
| `models` | Modell-Gesundheit kommt von Ollama — keine Postgres-Quelle, kein `NOTIFY` möglich | `createPoll('models', 30000)` |
