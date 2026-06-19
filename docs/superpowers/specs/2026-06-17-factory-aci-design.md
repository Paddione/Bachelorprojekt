---
title: "Agent-Computer-Interface (ACI) mit lokalisiertem Edit/Repair-Loop"
date: 2026-06-17
status: implemented
ticket_id: T000931
plan_ref: docs/superpowers/plans/2026-06-17-factory-aci.md
domains: [factory]
---

# Agent-Computer-Interface (ACI) mit lokalisiertem Edit/Repair-Loop

## Problem

Die Factory-Build-Phase lässt das Modell **grob** im Repo wühlen: freie Datei-Tools, kein
erzwungener Fokus, keine Edit-Validierung. Auf DeepSeek äußert sich das als schwache Scout-/
Build-Qualität (»0 touched_files« auf trivialen Tasks, Scope-Drift). SWE-agents zentrale
Erkenntnis (19.5k★) ist, dass nicht das Modell, sondern das **Interface** der Hebel ist: ein
*enggeführtes* Agent-Computer-Interface (ACI) — gezieltes Anschauen kleiner Datei-Fenster,
Editieren mit sofortigem Syntax-/Lint-Check, automatischer Self-Repair-Loop — hebt schwächere
Modelle messbar an. OpenHands (77.4k★) und aider (46.3k★) bauen denselben lokalisierten Loop.

## Ziel

- Eine **ACI-Schicht** in der Factory-Build-Phase, die dem Build-Agenten ein kleines, striktes
  Tool-Set gibt statt freier Datei-Operationen.
- **Edit-mit-Validierung**: jeder Edit wird nach dem Schreiben syntax-/lint-geprüft; schlägt die
  Prüfung fehl, wird automatisch zurückgerollt und der Fehler an den Agenten zurückgespielt.
- **Self-Repair-Loop**: bei fehlgeschlagenem Edit/Test bis zu N gezielte Korrektur-Iterationen.
- **DeepSeek-kompatibel** und **Factory-observable** (jeder ACI-Schritt loggt, kein opaker Sprung).

## Nicht-Ziel

- **Adoption eines fremden Runtimes** (aider/OpenHands als Execution-Backend). Das würde den
  bestehenden `claude -p` + Workflow-Harness ersetzen und die DeepSeek-Anbindung brechen.
- Ersatz der Scout-Phase (ACI greift in der **Build**-Phase; Scout liefert weiter den Kontext).
- Eigene IDE/LSP-Vollintegration (v1 nutzt vorhandene CLI-Checks, kein Sprachserver pro Sprache).

## Lösung

### Komponente 1 — ACI-Tool-Set (`scripts/factory/aci/`)

Vier dünne, deterministische Tools, die dem Build-Agenten als einzige Datei-Schnittstelle
angeboten werden (statt freiem Read/Edit/Bash):

| Tool | Verhalten |
|---|---|
| `aci_view <file> [start:end]` | Zeilennummeriertes Fenster (Default ~80 Zeilen) — zwingt fokussiertes Lesen statt Voll-Datei-Dump |
| `aci_search <pattern> [glob]` | Lokalisierung: Treffer mit Datei:Zeile + Kontextzeile |
| `aci_edit <file> <start:end> <replacement>` | Ersetzt den Bereich, **dann** Validierung (s. u.); Fail → auto-revert + Fehlertext zurück |
| `aci_test [subset]` | Führt die für die berührten Dateien relevanten Tests aus (`task test:changed`-nah) |

`aci_edit`-Validierung pro Dateityp (vorhandene Tools, kein neuer Sprachserver):
`.ts/.tsx` → `tsc --noEmit`/`vitest`-Syntaxstufe bzw. `node --check` für JS, `.sh` → `bash -n`
(+ `shellcheck` wenn vorhanden), `.yaml` → Kustomize/`yamllint`, `.json` → `jq` parse. Schlägt
die Prüfung fehl, wird der Edit **nicht** behalten und der Validator-Output geht als nächste
Beobachtung an den Agenten.

### Komponente 2 — Self-Repair-Loop (in `pipeline.js` Build-Phase)

Statt »Edit → weiter« ein bewachter Loop:

```
für jeden geplanten Change:
  ergebnis = aci_edit(...)
  while ergebnis.failed and iter < MAX_REPAIR (Default 3):
    beobachtung = ergebnis.validator_output      # Syntax-/Lint-/Test-Fehler
    ergebnis = aci_edit(agent_korrektur(beobachtung))
  if ergebnis.failed: markiere Change als BLOCKED (kein stiller Erfolg)
```

`MAX_REPAIR` konfigurierbar; Erschöpfung → harter, sichtbarer Block (kein Silent-Pass — vgl.
CLAUDE.md »No silent failures«), der in den Factory-Logs + `agent-msg` auftaucht.

### Komponente 3 — Verdrahtung & Sichtbarkeit

ACI wird in der Build-Phase von `pipeline.js` aktiviert (Feature-Flag `ACI_ENABLED`, damit der
alte Pfad als Fallback bleibt). Jeder ACI-Schritt (view/search/edit-Versuch/Validator-Ergebnis/
Repair-Iteration) wird strukturiert geloggt → speist die Eval-Harness (T000930) mit Telemetrie.

## Offene Entscheidungen (autonom gewählt, hier dokumentiert)

| # | Entscheidung | Gewählt | Alternative |
|---|---|---|---|
| 1 | Build vs. Adopt | **Dünnes Custom-ACI über vorhandene Tools** | aider/OpenHands-Runtime (verworfen: bricht DeepSeek-Harness) |
| 2 | Validierung | **Vorhandene CLI-Checks pro Dateityp** | LSP/Sprachserver pro Sprache (verworfen: Overkill v1) |
| 3 | Repair-Politik | **Max N=3, dann sichtbarer Block** | Unbegrenzt retry (verworfen: Endlosschleife/Kosten) |
| 4 | Rollout | **Feature-Flag `ACI_ENABLED`, alter Pfad als Fallback** | Hart ersetzen (verworfen: Regressionsrisiko) |

## Erfolgskriterien

- Der Build-Agent operiert in der Build-Phase ausschließlich über das ACI-Tool-Set; freie
  Datei-Ops sind in diesem Pfad deaktiviert.
- Ein Edit, der die Datei syntaktisch bricht, wird **automatisch zurückgerollt** und löst eine
  Repair-Iteration aus (per Unit-Test der ACI-Tools bewiesen).
- Auf dem Golden-Set der Eval-Harness (T000930) liefert `ACI_ENABLED=true` einen **messbar
  höheren** Aggregat-Score als der alte Pfad — das ist der eigentliche Abnahme-Beweis.
- ACI-Tools + Self-Repair-Loop als BATS/Unit-Tests, in `task test:factory` verdrahtet (offline).

## Verwandte Tickets

- **T000930 (Eval-Harness)** — Voraussetzung für die Abnahme: ohne reproduzierbaren Score lässt
  sich »ACI hebt die Qualität« nicht belegen. **Eval-Harness zuerst bauen**, dann ACI dagegen
  messen.
- T000911 (Scout-Quality-Detector) — komplementär: Scout-Detektor flaggt schwachen *Input*,
  ACI verbessert den *Build* daraus.
