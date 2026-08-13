# Design: dev-up-llm-proxy

## Architektur

```
task sdlc:up  (bestehend, erweitert)
  │
  ├─► k3d-Cluster (sdlc:cluster:create, idempotent)
  ├─► Stack deployen (sdlc:deploy)
  ├─► llm-proxy starten (llm:proxy:start, /livez-idempotent)        [T002655]
  ├─► NEU: lokales Chat-Loadout starten
  │     └─ scripts/sdlc/llm-up.sh        ← idempotent, via Proxy-Admin-API
  └─► health-gate.sh --timeout 120       ← NEU: + Readiness- + Loadout-Probe

task sdlc:down  (bestehend, erweitert)
  ├─► NEU: Chat-Loadout stoppen (scripts/sdlc/llm-up.sh down, best-effort)
  ├─► llm-proxy stoppen (llm:proxy:stop)                              [T002655]
  └─► k3d-Cluster löschen (sdlc:cluster:delete)
```

## Mechanik

### scripts/sdlc/llm-up.sh (neu)

Idempotenter Start/Stopp des konfigurierten Chat-Loadouts über die
Proxy-Admin-API (kein Proxy-Verhaltens-Change — nur Orchestrierung):

| Modus | Verhalten |
|---|---|
| `up` (default) | `GET /admin/loadouts/status` → Loadout `running`+`healthy` ⇒ „bereits laufend“, Exit 0. Loadout `stopped` ⇒ `POST /admin/loadouts/<slug>/start`, dann Poll auf `running`+`healthy` (Timeout 120 s). Konflikt (409, fremdes `chat-gpu`-Loadout aktiv) ⇒ Fehlermeldung mit `conflictSlug`, Exit 1. Proxy offline (kein `/livez`) ⇒ Fehlermeldung, Exit 1 (fail-fast). |
| `down` | `POST /admin/loadouts/<slug>/stop` wenn Loadout läuft (best-effort; Proxy nicht erreichbar ⇒ Warnung, Exit 0). |

Konfiguration: `LLM_PROXY_PORT` (Default 18235, wie in llm-Taskfile),
`SDLC_LLM_LOADOUT` (Default `gemma26-throughput` — T003204).

Status-Parsing via `jq` auf `/admin/loadouts/status`-Antwort (Schlüssel:
`running`/`healthy` je Loadout-Eintrag; exakte Feldnamen werden im
Implementierungs-Task gegen die laufende Proxy-Instanz verifiziert).

### health-gate.sh (erweitert)

Nach der bestehenden `/livez`-Probe zwei neue Proben (gleiche
fail()-Semantik — Komponente + beobachteter Zustand, nicht generisch):

1. **llm-proxy-readiness**: Poll `GET /health` bis `ready: true` oder Timeout.
   Bei 503 mit `ready: false` fail mit den `degraded`-Backends aus der
   Antwort (die Spec „Health endpoint reports readiness, not liveness“ liefert
   die Namen). Nur `livez` ok, `/health` 503 ⇒ FAIL „partially started stack
   is not reported as success“ (SSOT-Szenario).
2. **llm-loadout**: `GET /admin/loadouts/status` → das konfigurierte Loadout
   `running` + `healthy`; sonst FAIL mit Loadout-Slug + beobachtetem State.

Achtung Kaltstart: Nach dem Proxy-Start liest die Backend-Registry aus der
Cluster-DB (Poll 30 s) — die Readiness-Probe pollt deshalb bis `--timeout`.

### taskfiles/Taskfile.sdlc.yml (erweitert)

- `sdlc:up`: nach dem Proxy-Block `- scripts/sdlc/llm-up.sh` einfügen (vor
  `health-gate.sh`). Reihenfolge Cluster → Stack → Proxy → Loadout → Gate.
- `sdlc:down`: vor `llm:proxy:stop` den Schritt `- scripts/sdlc/llm-up.sh down || true`
  (best-effort: Loadout stoppen, bevor der Proxy weg ist).

### Tests (tests/spec/sdlc-isolation/llm-up-health.bats, neu)

Output-Verifikation (T002448-M4), keine Source-Greps auf die Implementierung:
- `task --dry sdlc:sdlc:up` → Reihenfolge `llm:proxy:start` < `llm-up.sh` < `health-gate`
- `task --dry sdlc:sdlc:down` → `llm-up.sh down` < `llm:proxy:stop`
- `llm-up.sh` gegen nicht erreichbaren Proxy (Port ohne Lauscher) → Exit ≠ 0, Meldung nennt Proxy/Port
- `llm-up.sh` mit `SDLC_LLM_LOADOUT` auf unbekannten Slug → Exit ≠ 0, Meldung nennt Slug
- `health-gate.sh` mit `LLM_PROXY_PORT` auf freiem Port → Exit ≠ 0, Meldung nennt `llm-proxy`
- Positiv-Anker: gleicher Test prüft zuerst, dass der gültige Fall durchläuft
  (T002356-M1)

## Verifikation

```bash
task sdlc:up        # Cluster + Stack + Proxy + Loadout + Gate (alles grün)
task sdlc:health    # händische Wiederholung des Gates (nicht im Scope, falls
                    # nicht vorhanden: scripts/sdlc/health-gate.sh direkt)
task sdlc:down      # Loadout → Proxy → Cluster (Reihenfolge umgekehrt)
```

## Risiken

- `/admin/loadouts/status`-Antwortformat kann sich mit Proxy-Versionen ändern;
  Feldnamen werden im Implementierungsschritt gegen die laufende Instanz
  verifiziert und im Test nur semantisch (Substring) statt format-genau
  geprüft (T002716).
- Ohne lokale GPU/Modelle schlägt der Gate im llm-Teil fehl — korrekt:
  der Stack ist dann nicht komplett, und der Output benennt die Komponente.
