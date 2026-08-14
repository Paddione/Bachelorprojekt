# Proposal: Modell-Registry + Training Grounds

**Ticket:** T002629 | **Typ:** feat | **Aufwand:** mittel | **ADR-006 Etappe 6**

## Problem

Trainierte LoRA-Adapter entstehen aus dem Unsloth-Training (T002587, T002606), aber es gibt
keine systematische Registry, die ihre Eigenschaften dokumentiert. Die Auswahl eines Modells
für eine Factory-Rolle ist Bauchgefühl statt messbar.

## Ziel

Eine Modell-Registry, die jeden trainierten Adapter in vier Dimensionen beschreibt:
1. **Eignung:** Messreihe pro Factory-Rolle gegen den Eval-Harness (T002606)
2. **Stat-Requirements:** VRAM, Kontextlänge, Durchsatz (tok/s), Ladezeit
3. **Provenienz:** Basismodell, Korpus, LoRA-Konfiguration, Commit
4. **Einsatz-Anleitung:** Chat-Template, Stop-Tokens, Sampling-Parameter, loadouts.json-Block

## Abhängigkeiten

- PR #3745 (T002587) — GEMERGT 2026-08-04 ✅
- E5 (GPU-Arbitrierung) — umgesetzt ✅
- T002606 (Eval-Harness) — plan_staged, liefert die Scoring-Grundlage

## Scope

- **Im Scope:** Registry-DB-Schema, Eval-Runner (Adapter gegen Harness messen), Stat-Collector,
  CLI-Tool zur Abfrage, loadouts.json-Generator
- **Nicht im Scope:** Das Training selbst (T002587), der Eval-Harness (T002606)
