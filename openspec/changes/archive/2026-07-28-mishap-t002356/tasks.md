---
title: "mishap-t002356 — Implementation Plan"
ticket_id: T002356
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002356 — Implementation Plan

_Ticket: T002356_

Mishap-Bundle: tests/spec, scripts/factory/reconcile-ticket-status.sh, scripts/openspec.sh (3 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
CLAUDE.md                                   — unveraendert (M1-Doku existierte bereits)
scripts/factory/reconcile-ticket-status.sh  — unveraendert (M2-Hypothese widerlegt, bereits durch T002375-p5 getestet)
scripts/openspec.sh                         — unveraendert (M3 bereits durch T002375 gefixt)
openspec/changes/mishap-t002356/proposal.md — Why/What ausgefuellt (Investigations-Ergebnis)
```

## Mishap-Eintraege

### Mishap 1: Negativtests ohne Positiv-Anker bestehen vakuos, wenn die Implementierung fehlt
**Typ:** degraded | **Komponente:** tests/spec

Beim Schreiben der RED-Tests fuer T002350 bestanden zwei Negativtests gruen, obwohl die zu pruefende Funktion list_reap_candidates gar nicht existierte: "never returns PID 1" und "never returns the reaper's own subshell". Bei fehlender Funktion ist die Kandidatenliste leer, und die Aussage "1 ist nicht in []" gilt trivial. Ein Negativtest ohne Positiv-Anker liest Abwesenheit als Erfolg.

Verschaerfend kam ein wirkungsloser Guard hinzu: `got="$(selected_pids "$fixture" 19)"; rc=$?` liest den Exit-Status des letzten Pipe-Glieds (sed), nicht den `return 127` der Ladefunktion. Der Guard `[ "$rc" -ne 127 ]` konnte deshalb nie greifen.

Behoben durch assert_selection_alive: die Fixture-Tests verlangen erst, dass das erwartete Child 4711 in der Liste steht, bevor sie die Negativ-Aussage pruefen. Danach 10 von 11 Tests rot statt 8 von 11.

Das ist genau die Fehlerklasse, die T002350 ueberhaupt erst noetig macht — die T002321-Tests prueften die Anwesenheit einer Zeichenkette statt der Wirkung. Die Konvention ist verallgemeinerbar und gehoert neben die bestehende "BATS $output matching"-Regel in CLAUDE.md: Jeder Negativtest ("X darf nicht vorkommen") braucht im selben Test einen Positiv-Anker, der bei fehlender Implementierung rot wird. Kandidat fuer einen Repo-weiten Scan nach `case " $x " in *" N "*)`- und `! grep`-Assertions ohne vorangehende Positiv-Assertion.

---

### Mishap 2: Ticketstatus nach stage-plan auf in_progress statt plan_staged
**Typ:** suspicious | **Komponente:** scripts/factory/reconcile-ticket-status.sh

Nach dem stage-plan fuer T002350 stand das Ticket auf status=in_progress statt plan_staged, obwohl keinerlei Implementierung stattgefunden hatte: k3d/default/claude-code-mcp-monolith-deploy.yaml war unveraendert, 10 von 11 T002350-Tests waren rot. plan_ref war korrekt gesetzt ("FACTORY-PLAN-REF branch=fix/reaper-child-selection-T002350 plan=openspec/changes/reaper-child-selection/tasks.md").

Der Ausstiegszustand von dev-flow-plan ist laut Skill-Kontrakt plan_staged; in_progress signalisiert der Factory und jedem Beobachter faelschlich, dass die Umsetzung laeuft. Manuell per transition_status zurueckgesetzt.

Moeglicher Verursacher: scripts/factory/reconcile-ticket-status.sh lief zum selben Zeitpunkt (PID 2523841, gestartet aus scripts/factory/wakeup.sh). Zu pruefen, ob dieses Skript ein Ticket mit gesetztem plan_ref und existierendem Branch automatisch auf in_progress hebt und dabei nicht unterscheidet, ob auf dem Branch bereits Production-Code liegt oder nur Plan- und RED-Test-Artefakte. Alternativ hat die parallel laufende zweite Session (siehe Worktree-Race-Mishap) den Status gesetzt.

[UNVERIFIED — der konkrete Verursacher wurde nicht nachgewiesen; belegt ist nur der falsche Endzustand.]

---

### Mishap 3: openspec.sh propose hat keinen Resume-Pfad fuer halbfertige Change-Ordner
**Typ:** degraded | **Komponente:** scripts/openspec.sh

`bash scripts/openspec.sh propose reaper-child-selection --ticket T002350 --target-spec mcp-gateway` bricht mit "ERROR: change 'reaper-child-selection' already exists at …" ab, sobald ein frueherer Lauf einen Change-Ordner hinterlassen hat — unabhaengig davon, ob dieser echten Inhalt oder nur ein Platzhalter-Skelett enthaelt.

Konkret lag hier ein gemischter Zustand vor: design.md war bereits mit Root-Cause und Live-Messung gefuellt (8390 Bytes), proposal.md hatte leere Why/What-Abschnitte, tasks.md war das reine Skelett mit "<author fills this in>" und dem vorgeseedeten expected-FAIL-Platzhalter. Ohne --force oder --resume muss man jede Datei von Hand inspizieren, um zu entscheiden, was uebernommen und was neu geschrieben werden darf.

Das ist besonders heikel, weil ein blindes Ueberschreiben genau die Arbeit vernichtet, die eine vorherige Session bereits geleistet hat — und weil der Abbruch keinerlei Hinweis darauf gibt, welche Dateien Substanz haben und welche nicht.

Loesungsrichtung: ein --resume-Pfad, der nur fehlende oder erkennbar unausgefuellte Dateien seedet (Platzhalter-Marker wie "<author fills this in>" sind maschinell erkennbar) und bestehenden Inhalt unangetastet laesst; alternativ eine Statusausgabe beim Abbruch, die je Datei "Skelett" vs. "befuellt" meldet.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED) — entfaellt begruendet.** Alle drei Eintraege
      erwiesen sich bei der Recon als bereits abgedeckt: M1 ist reine CLAUDE.md-
      Doku (kein Testgegenstand), M2s Hypothese ist bereits durch
      `tests/spec/openspec-workflow.bats::"T002375-p5: reconcile-ticket-status.sh
      setzt KEIN in_progress (Befund, kein Fix)"` widerlegt und getestet, M3 ist
      bereits durch T002375 (PR #3434) mit Tests in
      `tests/spec/openspec-workflow.bats` implementiert. Ein neuer Test haette
      einen bestehenden dupliziert (siehe verworfener Erstversuch
      `tests/spec/software-factory/reconcile-status-no-in-progress-T002356.bats`,
      wieder entfernt).

- [x] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
