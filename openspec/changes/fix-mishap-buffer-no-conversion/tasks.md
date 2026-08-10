---
title: "Mishap-Buffer aggregiert statt zu konvertieren — Einzelticket-Erzeugung entfernen"
ticket_id: T003553
domains: [scripts, test]
status: plan_staged
---

# Mishap-Buffer aggregiert statt zu konvertieren — Implementation Plan

Der Buffer legt beim Abfließen für **jeden** Eintrag zusätzlich ein Factory-Fix-Ticket an. Die
SSOT-Spec `openspec/specs/mishap-tracking.md:39-70` verlangt seit T003120 das Gegenteil: genau
ein Rollup-Container-Append, null Einzeltickets. Der Code wurde nie nachgezogen — T003120 Task 3
wartete auf den Merge von T002931, beide sind seit dem 2026-08-10 gemergt und `done`, die Aufgabe
blieb liegen. Für die Szenarien existiert kein Test.

## File Structure

| Datei | Rolle |
|---|---|
| `scripts/ticket-mcp/go/internal/runner/run_ticket.go` | Repo-Wurzel zur Laufzeit auflösen (macht den Stub-Mechanismus überhaupt wirksam) |
| `scripts/ticket-mcp/go/internal/tools/mishap.go` | Beide Abflusspfade: Konversionsschleifen entfernen, Rückgabetexte anpassen |
| `scripts/ticket-mcp/go/internal/tools/mishap_no_conversion_test.go` | Verhaltenstest gegen protokollierenden `ticket.sh`-Stub |
| `.claude/skills/mishap-tracker/SKILL.md` | Beschreibung korrigieren — behauptet weiterhin Einzelticket-Erzeugung |
| `openspec/changes/fix-mishap-buffer-no-conversion/specs/mishap-tracking.md` | Delta: Laufzeit-Auflösung der Repo-Wurzel |

## Partials

| # | Rolle | target_files |
|---|---|---|
| p1 | Implementierung | `scripts/ticket-mcp/go/internal/runner/run_ticket.go`, `scripts/ticket-mcp/go/internal/tools/mishap.go`, `.claude/skills/mishap-tracker/SKILL.md` |
| p2 | Tests | `scripts/ticket-mcp/go/internal/tools/mishap_no_conversion_test.go` |

## Tasks

### 1. Failing Test — Buffer konvertiert statt zu aggregieren

Der Test steht bereits in `scripts/ticket-mcp/go/internal/tools/mishap_no_conversion_test.go` und
prüft das Laufzeitverhalten über einen protokollierenden Stub (Aufruflog), nicht den Quelltext.

```bash
cd scripts/ticket-mcp/go && go test ./internal/tools/ -run 'TestFlushStaleBuffer_' -v
```

expected: FAIL — `TestFlushStaleBuffer_AppendsOnceAndCreatesNoTickets` meldet 10 statt 0 Aufrufe
mit `create --type fix`. Der Positiv-Anker (genau ein `rollup-container`- und ein
`add-comment`-Aufruf) läuft dabei grün durch, und
`TestFlushStaleBuffer_LeavesIncidentPathUntouched` besteht bereits — der rote Test misst also die
fehlende Änderung, nicht eine fehlende Umgebung.

### 2. Konversionsschleife im Schwellwert-Pfad entfernen

In `scripts/ticket-mcp/go/internal/tools/mishap.go` die Schleife über `buffer[:MISHAP_TRIGGER]`
samt `createFactoryFixTicket`-Aufruf und der Zählvariable `converted` entfernen (aktuell Zeilen
317–326). Der Rückgabetext darf keine Ticket-Anzahl mehr nennen, weil keine mehr entsteht:

```go
writeBuffer(buffer[MISHAP_TRIGGER:])
remaining := len(buffer) - MISHAP_TRIGGER
return mcp.NewToolResultText(fmt.Sprintf(
    "Rollup-Container-Append: %d Mishaps an den Container angehaengt. Verbleibend: %d.",
    MISHAP_TRIGGER, remaining)), nil
```

Die Werkzeugbeschreibung in `mcp.NewTool("report_mishap", …)` nennt weiterhin nur den
Rollup-Append — sie ist bereits korrekt und bleibt unverändert.

### 3. Konversionsschleife im Watchdog-Pfad entfernen

Dieselbe Schleife existiert ein zweites Mal in `FlushStaleBuffer` (aktuell Zeilen 393–397). Sie
wird ersatzlos entfernt, damit alle drei Abflusspfade (Schwelle, Watchdog, manueller
`flush_mishap_buffer`) identisch aggregieren — so verlangt es die SSOT-Spec ausdrücklich.

`createFactoryFixTicket`, `buildFactoryFixTicketArgs` und `mishapSeverity` **bleiben bestehen**,
obwohl sie danach ungenutzt sind: Das Requirement „Factory-Fix-Tickets verwenden nicht
plan_staged ohne Plan" (`openspec/specs/mishap-tracking.md:9-21`) beschreibt ihr Verhalten und ist
über `TestFactoryFixTicketArgs_NotPlanStaged` und `TestFactoryFixTicketArgs_NeverUsesPlanStaged`
abgesichert. Ihr Entfernen wäre ein eigener Vorgang mit eigener Spec-Änderung; Go bricht bei
ungenutzten Funktionen nicht ab.

### 4. Repo-Wurzel zur Laufzeit auflösen

In `scripts/ticket-mcp/go/internal/runner/run_ticket.go` ersetzt `currentRepoRoot()` die
Paketvariable `repoRoot` an allen Nutzungsstellen (`ticketShPath`, `RunTicket`, `RepoRoot`). Die
Auflösung vom Programmstart bleibt als `initialRepoRoot` erhalten und dient als Fallback.

Ohne diesen Schritt ist der Test aus Task 1 nicht schreibbar: `TICKET_MCP_REPO_ROOT` wurde nur
beim Init gelesen, der Stub aus dem Testverzeichnis lag damit außerhalb der Prefix-Prüfung und
`RunTicket` fiel auf das reale `scripts/ticket.sh` zurück. Keine neue Angriffsfläche — die
Variable konnte die Wurzel schon immer setzen (`findRepoRoot`, Zeile 15), sie wird jetzt nur
konsistent ausgewertet.

### 5. SKILL.md-Beschreibung korrigieren

`.claude/skills/mishap-tracker/SKILL.md` behauptet in der `description:`-Frontmatter und in
Zeile 8 weiterhin, oberhalb der Schwelle würden Einzeltickets entstehen („still creates individual
factory-fix tickets above the threshold", „individual ticket creation still active — T003120
Task 3 awaits T002931 merge"). Beide Stellen auf den tatsächlichen Zustand umschreiben: der
Buffer hängt ausschließlich an den Rollup-Container an; Incident-Typen legen weiterhin je ein
Ticket an.

Die `description:`-Frontmatter steuert das Auto-Invoke des Skills — sie muss den Zustand
beschreiben, nicht die Historie.

### 6. Verifikation

```bash
cd scripts/ticket-mcp/go && go test ./... && cd -
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartung: `TestFlushStaleBuffer_AppendsOnceAndCreatesNoTickets` grün (null `create --type fix`),
`TestFlushStaleBuffer_LeavesIncidentPathUntouched` weiterhin grün, und die bestehenden
`TestFactoryFixTicketArgs_*` unverändert grün — sie prüfen die beibehaltenen Builder.
