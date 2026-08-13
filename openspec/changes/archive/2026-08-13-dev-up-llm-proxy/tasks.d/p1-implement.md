# P1 — Implementierung: Skript, Health-Gate, Taskfile

_Teil von `openspec/changes/dev-up-llm-proxy/tasks.md` (T002656)._

## Kontext

`sdlc:up` (T002655) startet den llm-proxy nur als Prozess (Liveness via
`/livez`). Dieser Partial fügt den lokalen Modell-Teil hinzu: das
konfigurierte Chat-Loadout wird idempotent gestartet und der Health-Gate prüft
Readiness und Loadout-Gesundheit. Keine Änderungen an `scripts/llm-proxy/*`
(Proxy-Verhalten bleibt).

## S1-Budgets (wirksame Schwelle)

| Datei | Ist | Baseline | Limit | Budget |
|---|---|---|---|---|
| `scripts/sdlc/llm-up.sh` | net-new | — | `.sh` 800 | 800 |
| `scripts/sdlc/health-gate.sh` | 123 | nicht baselined | `.sh` 800 | 677 |
| `taskfiles/Taskfile.sdlc.yml` | 286 | nicht baselined | `.yml` kein Limit in `gates.yaml` | n/a |

## Tasks

### 1. `scripts/sdlc/llm-up.sh` anlegen (net-new)

Idempotenter Start/Stopp des konfigurierten Chat-Loadouts über die
Proxy-Admin-API. `set -euo pipefail`.

- Umgebung: `LLM_PROXY_PORT` (Default 18235), `SDLC_LLM_LOADOUT` (Default
  `gemma26-throughput`).
- Modus `up` (Default):
  1. Proxy erreichbar? `GET /livez` — sonst Fehler mit Port, Exit 1
     (fail-fast, keine halbe Arbeit).
  2. `GET /admin/loadouts/status` → Loadout-Status ermitteln
     (Feldnamen der Antwort zuerst gegen die laufende lokale Instanz
     verifizieren — `curl -s localhost:18235/admin/loadouts/status | jq .`).
  3. Läuft das Loadout bereits (`running` + `healthy`)? ⇒ Meldung
     „bereits laufend“, Exit 0 (Idempotenz).
  4. Loadout `stopped`? ⇒ `POST /admin/loadouts/<slug>/start`; danach Poll
     auf `running` + `healthy` (Timeout 120 s, Intervall 2 s); bei Timeout
     Fehler mit letztem Status, Exit 1.
  5. Start antwortet mit 409 (Konflikt, `exclusiveGroup chat-gpu` belegt)?
     ⇒ Fehlermeldung nennt `conflictSlug` aus der Antwort, Exit 1 — das
     fremde Loadout wird NICHT gestoppt (SSOT-Szenario).
  6. Unbekannter Slug / 404? ⇒ Fehler nennt den Slug, Exit 1.
- Modus `down` (`llm-up.sh down`): läuft das Loadout, `POST
  /admin/loadouts/<slug>/stop`; Proxy nicht erreichbar oder Loadout schon
  gestoppt ⇒ Warnung, Exit 0 (best-effort).
- Ausgaben als einzelne Zeilen mit Prefix `[llm-up]`, Fehler nach stderr.
- Nur `curl`/`jq`/`grep` als externe Abhängigkeiten.

### 2. `scripts/sdlc/health-gate.sh` erweitern

Nach der bestehenden `/livez`-Probe zwei neue Proben mit derselben
`fail()`-Semantik (Komponente + beobachteter Zustand, benannt in
`FAILED[]`):

1. **llm-proxy-readiness**: Poll `GET /health` bis `ready: true` oder
   `--timeout` erreicht (nach Kaltstart liest die Backend-Registry bis zu
   30 s nach — deshalb Poll, kein Einzelversuch). `ready: false`/503 ⇒ fail
   mit den `degraded`-Backends aus der Antwort (z. B. „llm-proxy-readiness:
   ready=false (degraded: gemma26-throughput)“).
2. **llm-loadout**: `GET /admin/loadouts/status` → konfiguriertes Loadout
   (`SDLC_LLM_LOADOUT`, Default wie im Skript) ist `running` + `healthy`;
   sonst fail mit Slug + State. Env-Vars `LLM_PROXY_PORT`/`SDLC_LLM_LOADOUT`
   oben im Skript zu den bestehenden Defaults ergänzen (Muster
   `LLM_PROXY_LIVEZ`).

Der bestehende `pass`-Pfad für `llm-proxy` (livez) bleibt unverändert.

### 3. `taskfiles/Taskfile.sdlc.yml` erweitern

- `sdlc:up`: nach dem Proxy-Block (vor `health-gate.sh`) den Schritt
  `- scripts/sdlc/llm-up.sh` einfügen — Reihenfolge:
  Cluster → Stack → Proxy → Loadout → Gate.
- `sdlc:down`: vor `task llm:proxy:stop` den Schritt
  `- scripts/sdlc/llm-up.sh down || true` (best-effort: Loadout stoppen,
  solange der Proxy noch lebt — die systemd-run-Loadout-Units überleben den
  Proxy-Prozess sonst).

### 4. Grün-Nachweis (Implementierung steht)

Den P2-Test gegen diesen Stand laufen lassen und Grün bestätigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/llm-up-health.bats
```

## Nicht im Scope

- `scripts/llm-proxy/*` (Proxy-Verhalten, Loadout-Logik) — nur Konsument der
  Admin-API
- Neue systemd-Units (`llama-gemma26.service` etc. — Epic-Design war überholt)
- `dev:up`/`dev:down`-Tasks (SSOT-Verbot)
