# Proposal: ssot-truncation-restores

## Purpose (deutsch)

Der Discover-Schritt des Trunkierungs-Guards (T005310) meldete drei archivierte Deltas als
trunkierend. Die History-Rekonstruktion (2026-08-14, git-Log-Analyse, Belege im
T005676-Kommentar) korrigierte die Prämissen: **Fund 1** (ci-cd.md Offline-Tests) ist kein
Verlust — die Sektion ist byte-identisch, und die LOC-Budget-Entfernung war bewusst
(PR #2701). **Fund 2** (local-llm-proxy.md) war eine authored-Ersetzung („Cutover replaces
the legacy proxy in place") — legitime Spec-Evolution. Nur **Fund 3** ist ein echter
Trunkierungsschaden: Der 54-Batch-Archiv-Merge `9ca6710b0` (2026-08-09, Delta von
`devflow-flow-frictions-T002671`) ersetzte die 5-Szenario-Sektion
„Harness-Stable Session Identity for agent-lock" in `openspec/specs/active-sessions-hub.md`
durch 2 opencode-Szenarien — fünf Szenarien gingen verloren (CLAUDE_CODE_SESSION_ID wins,
CLAUDE_SESSION_ID accepted, Release across tool calls, AGENT_LOCK_SID authoritative,
Harness-owned not reaped).

Dieser Change stellt die vollständige Sektion wieder her: aktuelle Prosa (reifste Fassung,
enthält den opencode-Zusatz) + die 5 wiederhergestellten Szenarien aus dem Pre-Stand
`c5a740a47` + die 2 aktuellen opencode-Szenarien = 7 Szenarien. Ein BATS-Guard friert die
Vollständigkeit ein.

## Goals

- Harness-Stable-Sektion in `openspec/specs/active-sessions-hub.md` auf 7 Szenarien
  wiederherstellen (5 Pre-Szenarien im Wortlaut von `c5a740a47` + 2 opencode-Szenarien des
  aktuellen Stands; Prosa: aktueller Stand, er enthält die Pre-Aussagen bereits und ergänzt
  den opencode-Tool-Detection-Absatz).
- Guard `tests/spec/active-sessions-hub/ssot-harness-stable-session.bats`: alle 7
  Szenario-Titel + Prosa-Anker — rot vor dem Fix (5 Titel fehlen), grün danach.

## Non-Goals

- Kein Restore für ci-cd.md (Offline-Tests byte-identisch) und keine Wiederbelebung des
  bewusst entfernten LOC-Budget-Gates.
- Keine Änderung an local-llm-proxy.md (authored-Ersetzung ist akzeptierte Evolution).
- Keine Änderung an der agent-lock.sh-Logik selbst — reiner Spec-Restore.

## Symptom vs. Ursache (T002448-M5)

- **Symptom:** Guard-Titel der 5 Szenarien fehlen in der SSOT-Sektion (5 → 2 am 08-09).
- **Ursache (belegt):** Archiv-Merge `9ca6710b0` ersetzte die Sektion durch das MODIFIED-Delta
  des Changes `devflow-flow-frictions-T002671` (2 Szenarien) — full-replacement-Semantik,
  derselbe Mechanismus wie T005308. Pre-Stand `c5a740a47` trägt die 5 Szenarien im Volltext
  (Recon-Bericht). Der seit T005310 (PR #4454) aktive Trunkierungs-Guard verhindert die
  Wiederholung.

## Design-Entscheidungen

1. **Prosa = aktueller Stand:** Die aktuelle Prosa enthält alle Pre-Aussagen (Auflösungs-
   Reihenfolge, Non-numeric-Reap-Semantik, Variablen-Verifikation) und zusätzlich den
   opencode-Tool-Detection-Absatz — Fusion statt Rückschritt.
2. **7 Szenarien statt 5:** Die 2 opencode-Szenarien sind gültige neue Zusicherungen; ein
   Restore, der sie löscht, wäre selbst eine Trunkierung.
3. **Delta trägt den vollständigen Ersatztext** (MODIFIED = full replacement, T005308-Lektion)
   — wortgleich zur Zielsektion.
