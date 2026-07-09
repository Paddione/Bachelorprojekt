---
title: agent-model-slots
ticket_id: TBD
plan_ref: TBD
status: draft
---

# Agent-Model-Slots — Design Spec

## Warum

Die Software Factory und opencode routen Modelle heute an zwei Stellen mit
unterschiedlicher Reife:

- `~/.config/opencode/opencode.jsonc` (User-Home, **nicht versioniert**) definiert
  fünf opencode-Subagenten, darunter zwei Qwythos-Varianten (`qwythos`,
  `qwythos-hq`). Qwythos injiziert laut `subagent-provisioning.md` §5 eine feste
  Identitäts-Direktive in jede System-Message und ist nur für
  Brainstorming/Kreativtext geeignet — nicht für Tool-Calling-lastige
  Implementation/Planning-Arbeit, für die er aktuell aber mitgenutzt wird.
- `scripts/factory/pipeline.js` (`routeProviderSync`) routet Modelle pro
  Pipeline-Tier (haiku/sonnet/opus) über `route-provider.sh`, aber ohne
  Persistenz oder UI — die Zuordnung Phase → Modell ist nur im Skript sichtbar
  und nicht ohne Codeänderung/Deploy anpassbar.

Beide Stellen sind für den User nicht bequem editierbar und Qwythos ist für den
aktuellen Nutzungszweck (Tool-Calling in Plan/Implement-Subagenten) ungeeignet.

## Was

### 1. Modellwahl bereinigen
- Qwythos (`qwythos`, `qwythos-hq`) wird aus der opencode-Agent-Config vollständig
  entfernt — kein Fallback, keine Restreferenz.
- Neuer Single-Session-Slot für Implementation/Planning: **Qwen3-14B**
  (`lmstudio-community/Qwen3-14B-GGUF`, Quant `Q4_K_M`, ~9 GB VRAM), offizielles
  Qwen-Modell ohne Identitäts-Fine-Tune, native Tool-Calling/Thinking-Mode-
  Unterstützung. Läuft neben dem bereits aktiven `qwen3.5-9b` auf der RTX 5070 Ti
  (16 GB VRAM, siehe `REFERENCE-LLM-CONFIG`).
- Das bisher für Multiagent-/Workflow-Fan-out genutzte Modell (`qwen35-iq4`,
  4x parallelfähig) bleibt unverändert der Default für Parallel-Subagenten.

### 2. Config-Ort: Repo-Vorlage + Sync statt reiner User-Home-Datei
- Neue Datei **`.opencode/agent-models.jsonc`** im Repo wird die versionierte
  Source of Truth für den `agent`-Block (Name, Modell, Permission, Color je
  Subagent).
- Ein Sync-Script (`scripts/opencode-sync-agents.sh`) merged/schreibt diesen Block
  nach `~/.config/opencode/opencode.jsonc` auf dem Host, auf dem opencode läuft
  (perspektivisch der Agentic-Terminal-Sidekick-Host aus T001565,
  `10.20.0.10` — siehe `project_agentic-terminal-sidekick` Memory). Damit ist die
  Modellwahl PR-review-bar, bleibt aber an der Stelle wirksam, die opencode
  tatsächlich liest — **kein zusätzliches, separates Settings-Menü**.

### 3. opencode-TUI-Modellwahl
- Neues interaktives Wrapper-Script `scripts/agent-model-select.sh` (fzf-basierter
  Picker über die in `.opencode/agent-models.jsonc` verfügbaren Modelle je Agent),
  schreibt die Auswahl zurück in `.opencode/agent-models.jsonc` und triggert den
  Sync aus Punkt 2.

### 4. Factory-Phase-Modell-Slots
- Neue Postgres-Tabelle (Schema `tickets`, Migration in
  `scripts/db/migrations/`), eine Zeile pro Pipeline-Phase
  (`scout|plan|implement|verify|deploy`) mit gewähltem Provider/Modell — Analogon
  zu `tickets.factory_phase_events`.
- `route-provider.sh` / `routeProviderSync` liest die Slot-Wahl aus dieser
  Tabelle statt (nur) aus dem Tier-Hardcoding; Fallback auf bestehende
  Tier-Logik bleibt für Notfälle (`emergency`-Flag) erhalten.
- Neue UI in `website/src/components/factory/` (z. B.
  `FactoryModelSlots.svelte`), eingebunden in `admin/pipeline.astro` bzw. neben
  `FactoryFloor.svelte`: ein Dropdown pro Phase, gespeist aus dem Modellkatalog
  (Analogie zu `KiProviderDrawer.svelte`/`ki-catalog.ts`, aber eigenständige
  Komponente im Factory-Namespace).
- Visuelles Design orientiert sich an `website/src/styles/factory-tokens.css`
  und der bestehenden Kore-Designsprache — kein Website-Admin-Wiederverwendung,
  sondern eigene, „claude-artige" Aufwertung (klare Typo-Hierarchie, ruhige
  Flächen, dezente Akzentfarbe) innerhalb des Factory-Namespace.

## Nicht im Scope
- Website-Admin-UI (`KiProviderDrawer`) wird nicht verändert — dient nur als
  Stilreferenz.
- Kein neuer eigenständiger Sidecar-*Service*; „Sidecar" war eine Fehlhörung von
  „Sidekick" (T001565, `plan_staged`) und bezeichnet keinen neuen Prozess.
- T001565 (Agentic-Terminal-Sidekick) selbst wird nicht implementiert — dieser
  Change nimmt nur Rücksicht auf dessen künftigen Host als Sync-Ziel.
