---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-15
---

# Design: Auto-Merge-Zustandscheck in dev-flow-execute (T006366)

## Goals

- Der Auto-Merge-Zustand eines PRs ist deterministisch prüfbar (ein Skript, definierte
  Exit-Codes, ohne LLM-Interpretation).
- Das Review-Gate (Schritt 3.8) ist fail-closed: extern aktiviertes Auto-Merge führt zum
  Abbruch mit klarer Meldung (PR-Nummer), nicht zu einem wertlosen Review.
- Der Pre-Flight erkennt die Doppel-Execution-Situation früh: existiert für den Branch
  bereits ein PR mit aktivem Auto-Merge, bricht die Session ab und koordiniert sich.
- Der Fix ist testbar ohne Live-GitHub: gh-Stub im BATS-Test (Muster
  `babysit-prs-live-lock-guard-T003137.bats`).

## Non-Goals

- **Keine automatische Deaktivierung** von extern aktiviertem Auto-Merge
  (`gh pr merge --disable-auto`): stilles Deaktivieren kehrt einen expliziten User-Akt um
  und verbirgt die Ownership-Kollision, die den Mishap verursacht hat. Der Abbruch bringt
  die Situation an die Oberfläche; der Operator entscheidet.
- Kein GitHub Branch-Protection (Infra-Entscheidung, außerhalb des Skill-Fixes).
- Keine Änderung der Request-Seite (T005565 bereits gemergt: Auto-Merge fordert nur der
  Orchestrator nach bestandenem Gate an).
- Kein opencode-Runtime-Äquivalent (`opencode-flow-execute`) in diesem Fix — gleiche
  Fehlerklasse, eigener Vorgang.

## Decisions

### D1 — Eigenes Skript statt Inline-gh-Befehl

`scripts/check-pr-automerge.sh` wird an zwei Stellen referenziert (Pre-Flight + Review-
Gate) und ist in beiden Kontexten identisch testbar. Ein Inline-`gh pr view --json`-Befehl
in der SKILL.md wäre nicht Output-verifizierbar (T002448-M4) und driftete an zwei Stellen.
S4-Orphan-Schutz: Das Skript ist aus SKILL.md, phases.md und dem BATS-Test erreichbar.

### D2 — Fail-closed Abbruch statt Deaktivierung

Exit-Code-Semantik:
- `rc=0`: kein PR für den Branch **oder** `autoMergeRequest=null` → fortfahren
- `rc=1`: Auto-Merge aktiv → BLOCK, Meldung nennt die PR-Nummer
- `rc=2`: Umgebungsfehler (gh fehlt, Usage-Fehler, technischer gh-Fehler) — fail-closed in
  beide Richtungen: ein technischer Fehler darf nicht als "kein Auto-Merge" gelesen werden.

### D3 — "Kein PR" ist kein Fehler, technischer gh-Fehler schon

Der Normalfall im Pre-Flight ist "kein PR" (execute startet vor PR-Erstellung). Das Skript
unterscheidet den echten Zustand ("no pull requests found" in gh-stderr → rc=0) von einem
technischen gh-Fehler (jede andere Abbruchursache → rc=2).

### D4 — Integration an beiden Stellen

1. **Pre-Flight** (nach Schritt 1.4 Doppelarbeit-Guard): erkennt früh die
   Doppel-Execution — eine andere Session/der User hat bereits einen PR mit Auto-Merge.
   Ohne diesen Check liefe die Session in die Duplikation hinein.
2. **Review-Gate Schritt 3.8** (erster Schritt vor dem Review): schließt die enge Lücke
   aus T006282 — Auto-Merge-Aktivierung zwischen PR-Erstellung (Schritt 5) und Gate.

## Edge Cases

- **Draft-PR:** Auto-Merge ist auch auf Draft-PRs prüfbar; der Check gilt für jeden
  PR-Zustand (gh meldet `autoMergeRequest` unabhängig vom Draft-Flag).
- **Mehrere PRs für einen Branch:** `gh pr view` ohne `--pr` wählt den zuletzt
  aktualisierten PR — akzeptiert; der Check nutzt dieselbe Auflösung wie die übrigen
  dev-flow-Schritte.
- **Kein gh-Binary / kein Auth:** `command -v gh` bzw. technischer gh-Fehler → rc=2,
  der Aufrufer bricht ab (kein stilles Fortfahren).
- **CI-Umgebung:** Der BATS-Test setzt `PATH` auf den gh-Stub (kein Ambient-gh-Muster,
  T002448-M4/Muster T003137).
