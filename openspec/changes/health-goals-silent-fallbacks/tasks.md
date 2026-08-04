---
title: "health-goals-silent-fallbacks — Implementation Plan"
ticket_id: T002648
domains: [health-goals, ci, factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# health-goals-silent-fallbacks — Implementation Plan

_Ticket: T002648_

Der Fix repariert sechs Fundstellen einer Fehlerklasse: **der Fehlerpfad ist
stumm**. Drei Messungen fallen still aus (G-IF01, G-DEP01, G-DEP02), drei
lesende Stellen zeigen nach dem SDLC-Split ins Leere. Ursachen sind auf `main`
@600863701 reproduziert und im Proposal Symptom-gegen-Ursache getrennt.

## File Structure

```
scripts/lib/mcp-endpoint-probe.py        (neu)  G-IF01: Registry lesen, TCP proben
scripts/lib/pnpm-audit-count.py          (neu)  G-DEP01: high/critical zaehlen
scripts/lib/pnpm-outdated-majors.py      (neu)  G-DEP02: Major-Spruenge zaehlen
scripts/health-goals-check.sh            (mod)  3 inline-Python-Bloecke -> Helfer-Aufrufe
scripts/health-goals-update.sh           (mod)  HG_GEN_JSON-Default auf sdlc/
scripts/health-goals-llm-fill.sh         (mod)  HG_GEN_JSON-Default auf sdlc/
scripts/factory/auto-close-merged.sh     (mod)  Allowlist-Pfad auf sdlc/
.claude/lib/goals.md                     (mod)  G-IF01-Messkommando + Absicht angleichen
tests/spec/health-goals/measurement-integrity.bats        (neu, bereits im RED-Commit)
tests/spec/health-goals/goals-data-path-consistency.bats  (neu, bereits im RED-Commit)
```

**S1-Budgets** — Ist-Zeilen und Restbudget gegen die wirksame Schwelle. Keine
der Dateien steht in `docs/code-quality/baseline.json`, es gilt also das
Typ-Limit (`.sh` 800, `.py` 800):

| Datei | Ist | Budget |
|---|---|---|
| `scripts/health-goals-check.sh` | 787 | 13 |
| `scripts/health-goals-update.sh` | 362 | 438 |
| `scripts/health-goals-llm-fill.sh` | 284 | 516 |
| `scripts/factory/auto-close-merged.sh` | 172 | 628 |

Die drei neuen `scripts/lib/`-Helfer starten bei 0 gegen ein Limit von 800 und
werden je etwa 25–40 Zeilen groß; sie sind hier nicht aufgeführt, weil es für
noch nicht existierende Dateien kein gemessenes Ist gibt.

Das Restbudget von **13 Zeilen** in `health-goals-check.sh` ist der Grund für die
Auslagerung, nicht nur ihr Nebeneffekt: die drei inline-Python-Blöcke belegen
dort zusammen rund 45 Zeilen. Sie in Helfer zu **extrahieren** und durch je einen
Aufruf zu ersetzen ist die Verkleinerung, die das Gate ohnehin verlangt — die
Datei schrumpft dabei um etwa 35 Zeilen, statt die 13 zu verbrauchen. Kein
kosmetisches Zusammenziehen.

## Verify (RED → GREEN)

- [ ] **Task 1 — Failing-Test-Step (RED).** Die beiden BATS-Dateien sind bereits
      geschrieben und im Stage-Commit enthalten. Vor jeder Implementierung
      nachweisen, dass alle acht Blöcke rot sind, und zwar **aus dem jeweils
      gemeinten Grund** (die Meldungstexte benennen ihn):

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/health-goals/measurement-integrity.bats \
  tests/spec/health-goals/goals-data-path-consistency.bats
# expected: FAIL (8/8 rot — G-IF01 liefert '-', die drei Helfer fehlen,
#                 der HG_GEN_JSON-Default zeigt auf eine geloeschte Datei)
```

- [ ] **Task 2 — `scripts/lib/mcp-endpoint-probe.py` anlegen.** Liest die
      Registry (Pfad aus `HG_MCP_REGISTRY`, Default
      `docs/agent-guide/registry/mcp.yaml`), sammelt `clients` mit
      `transport: http`, zieht Host und Port aus der `endpoint`-URL
      (`urllib.parse`, nicht per Regex) und probt jeden per
      `socket.create_connection(timeout=2)`. Gibt die Zahl nicht erreichbarer
      Endpunkte auf stdout aus.

      Zwei Verhaltensregeln, die den ursprünglichen Defekt ausschließen:
      1. Ist die Kandidatenmenge **leer**, wird ein das Ziel verletzender Wert
         ausgegeben und eine Diagnose nach stderr geschrieben — nicht `-`. Eine
         Registry ohne Kandidaten ist ein Strukturbruch, kein Messergebnis
         (REQ-HG-MEASURE-FAIL-LOUD-001).
      2. Kein bare `except:`. Ausschließlich `except Exception:` bzw. die
         konkreten Socket-Fehler — sonst fängt der Handler den eigenen
         `SystemExit` und druckt ein zweites Token.

      Die `HG_MCP_REGISTRY`-Variable ist kein Beiwerk: ohne sie ist der
      Leer-Fall nur durch Editieren der echten Registry testbar.

- [ ] **Task 3 — Die beiden pnpm-Parser anlegen.**

      `scripts/lib/pnpm-audit-count.py` liest die vollständige stdin als **ein**
      JSON-Objekt (`json.load`), zählt die Einträge in `advisories` mit
      `severity` in `high`/`critical` und gibt die Zahl aus. Ist die Eingabe
      nicht parsbar, Exit ≠ 0 **ohne** Zahl auf stdout — ein Gate, das bei
      kaputter Eingabe `0` meldet, behauptet „keine Schwachstellen"
      (REQ-HG-MEASURE-FAIL-LOUD-001, Scenario 2). Leeres `advisories`-Objekt
      bleibt der legitime Null-Fall mit Exit 0.

      `scripts/lib/pnpm-outdated-majors.py` liest stdin als JSON-Objekt
      `{paket: {current, latest}}`, vergleicht die Major-Komponenten (führendes
      `^`/`~` strippen) und zählt echte Major-Sprünge.

- [ ] **Task 4 — `scripts/health-goals-check.sh` auf die Helfer umstellen.** Die
      drei inline-Python-Blöcke bei G-IF01 (~Zeile 476), G-DEP01 (~745) und
      G-DEP02 (~757) durch Aufrufe ersetzen.

      Beim `pnpm`-Aufruf darf der Exit-Code des Produzenten **nicht** als
      Fehlersignal der Messung gewertet werden: `pnpm outdated` endet mit
      gefundenen Paketen als Exit 1, das ist sein Normalfall. Unter
      `set -uo pipefail` (Zeile 23) hängt der bisherige Fallback-Zweig sonst ein
      zweites Token an den bereits korrekt gedruckten Wert. Ausgabe erfassen und
      dann parsen, statt den Pipeline-Status zu interpretieren.

      Die Unterscheidung „node_modules fehlt" (legitim `-`, CI-Fall) gegen
      „Parsen gescheitert" (Messfehler) bleibt erhalten
      (REQ-HG-MEASURE-FAIL-LOUD-001, Scenario 3).

- [ ] **Task 5 — Die drei toten Pfade nachziehen und `goals.md` angleichen.**

      Pfade auf `website/src/lib/sdlc/goals-data.generated.json`:
      `HG_GEN_JSON`-Default in `scripts/health-goals-update.sh:38` und
      `scripts/health-goals-llm-fill.sh:33`, Allowlist-Zeile in
      `scripts/factory/auto-close-merged.sh:64`.

      `tests/spec/health-goals.bats` und `.github/workflows/health-goals.yml`
      bleiben unangetastet — beide liegen im offenen
      `fix/sdlc-split-followup-T002639`.

      In `.claude/lib/goals.md` zeigt das dokumentierte G-IF01-Messkommando noch
      auf `servers` und berechnet ein `total`, das es nie verwendet — der im
      Fließtext beschriebene Positiv-Anker existierte nur als Absicht. Kommando
      und Beschreibung auf das tatsächliche Verhalten bringen (http-Clients,
      Leer-Fall verletzt das Ziel).

- [ ] **Task 6 — GREEN nachweisen.** Dieselben acht Blöcke müssen grün sein, und
      der Report muss G-IF01 ohne Shell-Fehler ausweisen:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/health-goals/measurement-integrity.bats \
  tests/spec/health-goals/goals-data-path-consistency.bats
# expected: PASS (8/8)

bash scripts/health-goals-check.sh --fast --only=G-IF01 2>&1 \
  | grep -c 'integer expression expected'
# expected: 0

task health:goals:drift 2>&1 | grep -c 'nicht gefunden'
# expected: 0
```

- [ ] **Task 7 — Final Verification.** Die drei verbindlichen Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

      `freshness:regenerate` zieht auch `website/src/data/test-inventory.json`
      nach — die beiden neuen BATS-Dateien ändern das Inventar, und der
      CI-Job vergleicht es gegen den Commit.
