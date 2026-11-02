---
title: "walkytalky-vertrag — WalkyTalky-Profil für den Agent-Gesprächsvertrag (Goal walkytalky-vertrag)"
domains: [agents, docs]
status: active
goal: walkytalky-vertrag
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# walkytalky-vertrag — Implementation Plan

Zweck (Deutsch): Der Interaction Contract in `AGENTS.md` bekommt ein WalkyTalky-Profil für
Voice-Sessions — kompakte Footer-Karte mit 2 Aktions-Buttons statt Textblock, Fragen mit max.
3–4 Optionen (Empfehlung Option 1, `(Recommended)`-Präfix), Aktivierung per Hotkey oder
Signalwort. Eskalationsprotokoll, Agent-Koordination und Beitragsregeln werden für Voice
angepasst; der Vollvertrag für Heads-down-Sessions bleibt unverändert. Eigner-Entscheidungen
aus Brainstorming (2026-11-02): Aktivierung Hotkey ODER Signalwort; Footer-Buttons
„Weiter" + „Details", aufs Wesentliche reduziert; Hook-/Gate-Fehler als gesprochene
Kurzfrage mit Fix-Buttons.

## File Structure

| Datei | Ist-Zeilen | Status |
|---|---|---|
| `AGENTS.md` | 167 | ändern (Profil-Abschnitt neu, `.md` ungated) |
| `.claude/lib/behaviors/escalation-protocol.md` | 24 | ändern (Voice-Anpassung, `.md` ungated) |
| `.claude/lib/behaviors/commit-conventions.md` | 39 | ändern (Voice-Ansage von Hook-Fehlern, `.md` ungated) |
| `.claude/lib/behaviors/never-push-main.md` | 18 | ändern (Voice-Ansage von Push-Blockaden, `.md` ungated) |
| `tests/py/spec/native_ported/spec/agent-skills/test_interaction_contract.py` | 134 | erweitern (Rot→Grün-Test + Regression, `.py`-Limit 800, Budget groß) |
| `.agents/goals/walkytalky-vertrag/GOAL.md` | — | Eigner-Aktion: `plan_refs:` nachtragen (kein Plan-Artefakt, nicht in diesem Branch) |

Referenziert, nicht geändert: `docs/agent-guide/visual-accessibility.md`
(Modal-/`(Recommended)`-Konvention, progressives Disclosure — wird normativ referenziert).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-profil-kern.md | impl | `AGENTS.md` |  |
| p2 | tasks.d/p2-eskalation-koordination.md | impl | `.claude/lib/behaviors/escalation-protocol.md` | p1 |
| p3 | tasks.d/p3-beitragsregeln-voice.md | impl | `.claude/lib/behaviors/commit-conventions.md`, `.claude/lib/behaviors/never-push-main.md` | p2 |
| p4 | tasks.d/p4-rotgruen-verify.md | tests | `tests/py/spec/native_ported/spec/agent-skills/test_interaction_contract.py` | p3 |

## Rot-Test (STRUCT2)

Neuer Profil-Test in `test_interaction_contract.py` (assertet WalkyTalky-Anker in `AGENTS.md`):

```bash
python3 -m pytest tests/py/spec/native_ported/spec/agent-skills/test_interaction_contract.py -q
```

expected: FAIL (neue Profil-Tests rot, alle bestehenden Vertrags-Tests grün) — erst nach Umsetzung durch dev-flow-execute wird derselbe Lauf grün.

## Finaler Verify-Task (STRUCT3, letzter Task)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Entscheidungen (Brainstorming)

1. Profil-Umschaltung per Hotkey ODER Signalwort, jederzeit, explizites Opt-in (keine Heuristik).
2. Footer-Karte behält alle 4 Werte (STATUS/RUNNING/BLOCKED/NEXT), 2 Buttons: „Weiter" (empfohlene NEXT-Aktion ausführen), „Details" (Volltext aufklappen).
3. Fragen: max. 3–4 Optionen, Empfehlung Option 1 mit `(Recommended)`-Präfix (visual-accessibility.md §1), Auto-Run-Frist wie bisher.
4. Bestehende Tests in test_interaction_contract.py bleiben grün (Vollvertrag unangetastet); neue Tests sichern nur das Profil.
