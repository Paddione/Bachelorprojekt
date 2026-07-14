---
title: "G-SIZE02: Großdateien außerhalb Gate-Scope — Refactoring"
ticket_id: T001556
status: archived
created_at: 2026-07-08T14:30:00Z
---

# G-SIZE02: Großdateien außerhalb Gate-Scope — Refactoring

**Ticket:** T001556  
**Status:** `plan_staged` (bereit für Umsetzung)

## Purpose

Refactoring von Großdateien (>600 Zeilen) in VideoVault/ und .opencode/ zur Reduzierung der Code-Komplexität und Einhaltung von Code-Quality-Gates.

---

## Design

### Problem Statement
17 Dateien >600 Zeilen liegen außerhalb des Gate-Scope (S1-Zeilenbudgets):
- 15× in `VideoVault/src/lib/*.ts` — Upload, Storage, Transcription Module
- 2× in `.opencode/skills/**/*.md` — Skills-Dokumentation

### Architektur
**VideoVault:** Splitting nach Feature-Bereichen (core, validation, progress)  
**.opencode:** Grouping nach Domains (dev-flow, superpowers, references)

### Messung (Messbar, Beobachtbar, Testbar)

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| Dateien >600 Zeilen in VideoVault/ + .opencode/ | 17 | ≤ 8 |

---

## Scenarios

### GIVEN: Großdateien identifiziert sind
```bash
git ls-files VideoVault .opencode | grep -E "\.(ts|tsx|js|mjs|svelte)$" | xargs wc -l | awk "$1>600" | wc -l
# → 17 (vorher)
```

### WHEN: Refactoring Tasks abgeschlossen sind
- Module werden extrahiert und separat getestet
- Skills nach Domains gruppiert

### THEN: Messziel erreicht
```bash
git ls-files VideoVault .opencode | grep -E "\.(ts|tsx|js|mjs|svelte)$" | xargs wc -l | awk "$1>600" | wc -l
# → ≤ 8 (nachher)
```

---

## Requirements

### S1 — Zeilenbudgets pro Datei
- Alle neuen Module: Budget = Baseline − Ist-Zeilen
- Re-exports nutzen, um Duplikation zu vermeiden

### G-SIZE02 — Großdateien-Gate
- Maximal 8 Dateien >600 Zeilen in VideoVault/.opencode/
- Als S1-Frühwarnung aufnehmen

---

## Implementation Tasks
Siehe `tasks.md` für detaillierte Umsetzungsschritte.
