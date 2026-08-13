# P2 — Tests: BATS (STRUCT2-Failing-Test)

_Teil von `openspec/changes/dev-up-llm-proxy/tasks.md` (T002656)._

## Kontext

Dieses Partial läuft beim Execute als Erstes: Es schreibt den roten Test gegen
den noch unveränderten Stand (P1-Implementierung fehlt) — `expected: FAIL`.
P1 macht ihn danach grün.

Output-Verifikation statt Source-Greps (T002448-M4): die Tests führen
`task --dry` und die Skripte AUS und prüfen Exit-Codes und Meldungen.
Semantik statt Darstellung (T002716): Substring-Proben ohne Zeilenanker,
keine exakten Fehlerformulierungen festnageln.

## S1-Budgets

| Datei | Ist | Limit | Budget |
|---|---|---|---|
| `tests/spec/sdlc-isolation/llm-up-health.bats` | net-new | `.bats` kein Limit in `gates.yaml` | n/a |

## Tasks

### 1. `tests/spec/sdlc-isolation/llm-up-health.bats` anlegen (net-new)

Eigene Datei pro Vorgang (T002416) unter `tests/spec/sdlc-isolation/`
(SSOT-Spec-Verzeichnis). Header-Kommentar mit SSOT-Verweis
(`openspec/changes/dev-up-llm-proxy/tasks.md`, T002656). Runner:
`tests/unit/lib/bats-core/bin/bats`.

Testfälle (jeweils mit Positiv-Anker zuerst, T002356-M1):

1. **task-Liste enthält `sdlc:up`/`sdlc:down` und `dev:up` ist NICHT gelistet**
   (Positiv-Anker: `task --list-all` ist nicht leer und enthält `dev:deploy`
   — bestehende Konvention aus `sdlc-up-command.bats`).
2. **`task --dry sdlc:sdlc:up`-Reihenfolge**: `llm:proxy:start` vor
   `llm-up.sh` vor `health-gate` (Zeilen-Positionen vergleichen — Muster aus
   `sdlc-up-command.bats`).
3. **`task --dry sdlc:sdlc:down`-Reihenfolge**: `llm-up.sh down` vor
   `llm:proxy:stop` vor `sdlc:cluster:delete`.
4. **`llm-up.sh` gegen toten Port failt benannt**: `LLM_PROXY_PORT` auf einen
   freien Port setzen, `scripts/sdlc/llm-up.sh` ausführen → Exit ≠ 0, Output
   nennt Proxy/Port (Substring `llm-up` oder `proxy` — ohne Zeilenanker).
   Positiv-Anker im selben Test: zuerst ein Lauf mit gesetztem
   `SDLC_LLM_LOADOUT` gegen denselben toten Port — Ausgabe enthält den
   Fehlerpfad überhaupt erst (Anker: Exit ≠ 0 ist schon der Anker).
5. **`llm-up.sh` mit unbekanntem Loadout-Slug failt benannt**:
   `SDLC_LLM_LOADOUT=nonexistent-loadout` → Exit ≠ 0, Meldung nennt den Slug
   (Substring `nonexistent-loadout`).
6. **`health-gate.sh` failt bei nicht-ready-Proxy benannt**:
   `LLM_PROXY_PORT` auf freien Port → Exit ≠ 0, Output nennt `llm-proxy`
   (Substring ohne Anker).
7. **`llm-up.sh` best-effort-down**: mit `down` gegen toten Port → Exit 0
   (Warnung, kein Fehler — SSOT-Szenario „Shutdown tolerates an
   already-stopped loadout“).

Nur Tests mit deterministischem Ergebnis (kein Live-Cluster nötig: toter
Port ist überall reproduzierbar); Cluster-abhängige Proben wie im
bestehenden `sdlc-up-command.bats` mit `skip`-Guard versehen, falls nötig.

### 2. Rot-Nachweis (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/llm-up-health.bats
```

- **expected: FAIL** — `llm-up.sh` existiert noch nicht, `sdlc:up`/`sdlc:down`
  haben die neuen Schritte noch nicht, der Gate kennt die Proben noch nicht.
  Die Testfälle 2–7 schlagen benannt fehl (Datei fehlt / Schritt fehlt /
  Probe fehlt), nicht mit einer leeren Kandidatenliste (jeder Negativtest hat
  seinen Positiv-Anker).

### 3. Grün-Nachweis nach P1

Nachdem P1 die Implementierung geliefert hat, denselben Runner erneut
ausführen und Grün bestätigen (dieser Schritt wird beim Execute nach P1
geprüft; die Ausführung selbst liegt in der Verify-Phase des Index).
