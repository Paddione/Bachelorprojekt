---
title: "brain-ingest-loadout-swap — Implementation Plan"
ticket_id: T013593
domains: [llm-pipeline, scripts, tests]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-ingest-loadout-swap — Implementation Plan

_Ticket: T013593_

## File Structure

```
scripts/llm-proxy/loadout-pin.mjs          NEU  Pin-Zustand: evaluate/write/clear, PID-Liveness
scripts/llm-proxy/loadout-pin.test.mjs     NEU  node:test fuer evaluate (tot/unlesbar/ohne pid)
scripts/llm-proxy/server.mjs               MOD  3 Pin-Routen + Guard in start/stop (S1: 704/800)
scripts/brain-ingest-swap.sh               NEU  Swap-Wrapper: merken/pin/drain/wechseln/restore
taskfiles/Taskfile.brain.yaml              MOD  ingest:run|pilot|dry rufen den Wrapper
tests/spec/local-llm-proxy/brain-ingest-swap.bats  NEU  Restore, Drain-Deckel, Exit-Code, Abbruch
tests/spec/local-llm-proxy/brain-ingest-port.bats  MOD  Task-Defaults gegen Loadout-Port
```

**Abweichung vom geplanten Dateisatz:** `tests/spec/local-llm-proxy/loadout-pin.bats`
entfaellt. Das 423-Verhalten wird vollstaendig von `loadout-pin.test.mjs` (node:test) geprueft,
weil `pinGuard` eine reine Funktion ist. Ein BATS-Test haette dafuer den Proxy per HTTP
ansprechen muessen — der braucht in CI eine Ticket-DB und liefe dort auf ein `skip` hinaus,
also auf eine Messung der Runner-Ausstattung statt des Codes (T002716). Der Swap-Wrapper ist
Shell und wird weiterhin per BATS gegen einen Fake-Proxy geprueft.

**Delta-Spec-Abdeckung:** 17 der 18 Scenarios haengen an einem eigenen Test. Das Scenario
"The handler covers the window around stopping" hat keinen eigenen: ein Test, der das Signal
exakt zwischen Stop und Start platziert, waere ein Timing-Rennen und damit flaky. Getragen
wird es von derselben Zusicherung wie das Interrupt-Scenario — der `trap` wird vor `SWAPPED=1`
installiert, also vor dem ersten Stop — und der Interrupt-Test ist der Nachweis, dass der
Handler greift.

**S1-Budgets (nicht gebaselinet, `docs/code-quality/baseline.json` ist leer — wirksame
Schwelle ist das statische Limit aus `docs/code-quality/gates.yaml`):**

| Datei | Ist | Limit | Budget |
|---|---|---|---|
| `scripts/llm-proxy/server.mjs` | 704 | 800 (`.mjs`) | **96 Zeilen** |
| `scripts/brain-ingest.sh` | 649 | 800 (`.sh`) | 151 (wird nicht angefasst) |
| `scripts/brain-ingest-swap.sh` | 0 (neu) | 800 (`.sh`) | 800 |
| `scripts/llm-proxy/loadout-pin.mjs` | 0 (neu) | 800 (`.mjs`) | 800 |

`taskfiles/*.yaml` und `tests/**/*.bats` tragen kein S1-Limit (keine Extension-Eintraege in
`gates.yaml` → `s1.limits`).

**Die 96 Zeilen in `server.mjs` sind die einzige enge Stelle des Plans.** Deshalb liegt die
gesamte Pin-Auswertung in `loadout-pin.mjs`; `server.mjs` bekommt nur die drei
Routen-Weichen und einen Guard-Aufruf je Route. Das ist keine Stilfrage: eine Inline-Loesung
mit Liveness-Pruefung und Fail-closed-Zweigen schoebe die Datei ueber ihr Limit und machte CI
rot, ohne dass an der Implementierung etwas falsch waere.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Lege `tests/spec/local-llm-proxy/loadout-pin.bats` und
      `tests/spec/local-llm-proxy/brain-ingest-swap.bats` an sowie den erweiterten
      Task-Default-Check in `brain-ingest-port.bats`. Alle drei pruefen Verhalten, das es
      noch nicht gibt, und muessen auf diesem Branch scheitern.

      Jeder Test braucht einen **Positiv-Anker** vor der eigentlichen Aussage
      (Repo-Konvention, siehe Kopf von `brain-ingest-port.bats`): erst belegen, dass die
      Extraktion ueberhaupt etwas findet, dann die Aussage pruefen. Ohne Anker besteht ein
      Test vakuos, sobald ein `grep` ins Leere laeuft.

      Der Pin-Test spricht **nicht** den laufenden Proxy an, sondern startet den Server auf
      einem Ephemeral-Port gegen eine Fixture-`loadouts.json` und eine per `GPU_PIN_FILE`
      umgebogene Pin-Datei. Grund: in CI laeuft kein llm-proxy, und ein Test gegen den
      echten Dienst wuerde die Ausstattung des Runners messen statt den Zustand des Codes
      (T002716). Setzt ein Test doch ein externes Binary voraus, gehoert der Guard
      `command -v <binary> >/dev/null 2>&1 || skip "<binary> binary not installed"` schon
      in diese Rotphase.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/loadout-pin.bats \
  tests/spec/local-llm-proxy/brain-ingest-swap.bats \
  tests/spec/local-llm-proxy/brain-ingest-port.bats
# expected: FAIL (rot — weder Pin-Routen noch Swap-Wrapper existieren)
```

- [x] **Pin-Modul (GREEN 1).** `scripts/llm-proxy/loadout-pin.mjs` mit `evaluatePin()`,
      `writePin()`, `clearPin()` und `pinFilePath()`. `evaluatePin` spiegelt die
      Liveness-Regeln aus `gpu-lock.mjs` exakt: `ESRCH` heisst tot (Pin verwerfen, Datei
      entfernen), **jeder andere** Fehler heisst gehalten, unparsbare Datei heisst gehalten,
      fehlende oder nicht-numerische PID heisst gehalten. Pfad ueber `GPU_PIN_FILE`
      ueberschreibbar, damit Tests nicht die echte Datei anfassen.

      Die Regeln werden **kopiert, nicht importiert**: `gpu-lock.mjs` gibt zusaetzlich
      `drainingKinds` zurueck und entfernt beim Verwerfen die GPU-Lock-Datei. Ein
      gemeinsamer Helper muesste beide Bedeutungen tragen und waere an der Stelle
      missverstaendlich, an der Fail-closed-Verhalten eindeutig sein muss.

```bash
node --test scripts/llm-proxy/loadout-pin.test.mjs
```

- [x] **Proxy-Routen (GREEN 2).** In `scripts/llm-proxy/server.mjs`:
      `POST /admin/loadouts/pin` (Slug, PID, Reason → Token, `409` wenn ein fremder Pin
      haelt), `GET /admin/loadouts/pin`, `DELETE /admin/loadouts/pin`. In den vorhandenen
      `startMatch`/`stopMatch`-Zweigen je ein Guard davor: haelt ein Pin und passt das
      praesentierte Token nicht, `423` mit Code `locked_by_pin`, Slug und Besitzer-PID im
      Body.

      Die Routen kommen **vor** die `startMatch`-Zeile, sonst faengt das
      `^\/admin\/loadouts\/([a-z0-9-]+)\/start$`-Muster nichts Falsches ab — aber
      `/admin/loadouts/pin` matcht keines der beiden Muster, deshalb ist die Reihenfolge
      hier eine Lesbarkeits-, keine Korrektheitsfrage.

      **Budget-Disziplin:** hoechstens ~60 Zeilen in `server.mjs` (Ist 704, Limit 800).
      Wer mehr braucht, verschiebt in `loadout-pin.mjs`, statt das Limit auszureizen.

```bash
node --test scripts/llm-proxy/server.test.mjs
wc -l scripts/llm-proxy/server.mjs   # muss < 800 bleiben
```

- [x] **Swap-Wrapper (GREEN 3).** `scripts/brain-ingest-swap.sh` in dieser Reihenfolge:

      1. `trap` fuer `EXIT INT TERM` **zuerst** installieren — vor dem ersten Stop. Wird der
         Lauf zwischen Stop und Start abgebrochen, muss die Wiederherstellung trotzdem
         greifen.
      2. Laufendes `chat-gpu`-Loadout aus `GET /admin/loadouts/status` merken
         (`running == true`, `exclusiveGroup == "chat-gpu"`). Laeuft keines, den Zustand
         "nichts lief" merken und beim Restore auch nichts starten.
      3. Pin auf `brain-ingest` setzen, Token in einer Variablen halten.
      4. Drain: `GET /admin/state` pollen bis `inflight == 0` ueber alle `llamacpp`-Backends,
         mit Deckel (`SWAP_DRAIN_TIMEOUT`, Default 300s). Nicht erreichbar oder nicht
         parsbar → abbrechen. Deckel erreicht → abbrechen, Pin loesen, gemerktes Loadout
         **stehen lassen**, Ingest nicht starten.
      5. Gemerktes Loadout stoppen, `brain-ingest` starten (beide mit Pin-Token), auf
         Gesundheit warten.
      6. `scripts/brain-ingest.sh` mit `LM_STUDIO_URL=http://127.0.0.1:8100`,
         `LM_MODEL=gemma-4-12b-qat`, `MAX_PARALLEL=3` aufrufen — jeweils als
         `${VAR:-default}`, damit explizite Overrides gewinnen.
      7. Exit-Status des Ingests merken und am Ende propagieren.

      Der Trap-Handler stoppt `brain-ingest`, startet das gemerkte Loadout und loest den Pin
      — in dieser Reihenfolge, damit die `exclusiveGroup`-Pruefung des Proxys den Start
      nicht ablehnt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/brain-ingest-swap.bats
shellcheck scripts/brain-ingest-swap.sh
```

- [x] **Tasks umhaengen (GREEN 4).** `taskfiles/Taskfile.brain.yaml`: `ingest:run`,
      `ingest:pilot` und `ingest:dry` rufen `scripts/brain-ingest-swap.sh` statt
      `scripts/brain-ingest.sh`. Der Default `LM_STUDIO_URL=http://127.0.0.1:8089` mit
      `LM_MODEL=gemma12-vision` entfaellt in allen drei Tasks — er widerspricht dem
      Skript-Default `http://localhost:8100` aus `scripts/brain-ingest.sh:50` und dem
      Requirement, das Loadout, Skript und Backend-Migration auf denselben Port festlegt.
      `MAX_PARALLEL` steigt von 1 auf 3 (gemessen: 307-489 statt 255 tok/s, siehe
      `scripts/llm/measurements/2026-08-19-gemma12-slots.md`).

      `LM_DISABLE_THINKING`, `LM_MAX_TOKENS`, `LM_TIMEOUT` und `MAX_SOURCE_CHARS` bleiben
      unveraendert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/brain-ingest-port.bats
task --list | grep brain:ingest
```

- [x] **Delta-Spec-Abgleich.** `openspec/changes/brain-ingest-loadout-swap/specs/local-llm-proxy.md`
      gegen die Implementierung lesen: jedes Scenario muss von genau einem Test abgedeckt
      sein. Fehlt eine Abdeckung, kommt der Test dazu — nicht das Scenario weg.

```bash
task openspec:validate
```

- [x] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
