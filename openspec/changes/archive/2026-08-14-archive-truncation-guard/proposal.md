# Proposal: archive-truncation-guard

## Purpose (deutsch)

Der MODIFIED-Delta von `sf-scheduling-test-drift` interpretierte die OpenSpec-Semantik
additiv („Die bestehenden Szenarien bleiben unverändert") und trug nur ein Szenario — beim
Archiv (PR #4440) ersetzte der Merger die Sektion vollständig und löschte sechs Szenarien
aus `openspec/specs/software-factory.md` (591 → 586, comm-verifiziert; Restore: T005308).
Der Merger (`scripts/openspec-merge.mjs`, `applyDelta`) prüft heute nur, ob das
MODIFIED-Ziel existiert — nicht, ob der Delta-Text die Sektion ungewollt schrumpft.

Dieser Change ergänzt den **Trunkierungs-Guard am Merge-Punkt**: Trägt ein MODIFIED-Delta
weniger Szenarien als das SSOT-Requirement, warnt der Merger auf stderr und bricht den Merge
ab — außer der Caller setzt ein explizites `allowShrink`-Flag (für bewusste
Konsolidierungen, dann weiterhin mit Warnung). Der Restore-Aufwand von T005308 hätte damit
am Archiv-Zeitpunkt gestoppt werden können, bevor der Schaden auf `main` kam.

## Goals

- `applyDelta` erkennt trunkierende MODIFIED-Deltas (Szenario-Count-Vergleich) und bricht
  ohne `allowShrink` ab — SSOT bleibt unverändert.
- Vitest-Cases in der bestehenden Merge-Suite (`scripts/openspec-merge.test.ts`, TMPDIR-
  Fixtures, kein Repo-Mutation) decken alle drei Szenarien ab: trunkierend (rot vor dem
  Fix), vollständig (grün), allowShrink (grün mit Warnung).
- `scripts/openspec.sh archive` reicht das Flag NICHT standardmäßig durch — bewusste
  Konsolidierungen laufen über eine explizite CLI-Option (`--allow-shrink`).
- Discover-Schritt: einmalige Prüfung aller archivierten Changes auf weitere
  Trunkierungs-Schäden (Ergebnis dokumentiert im Ticket-Kommentar; Funde werden zu
  eigenen Tickets).

## Non-Goals

- Keine Retro-Fixierung weiterer Trunkierungs-Fälle in dieser Runde (Funde → eigene
  Tickets).
- Keine Änderung der ADDED/REMOVED/RENAMED-Semantik.
- Kein Prompt-/Linter-Guard auf Delta-Dateien (die Konventions-Doku in `config.yaml`
  kam bereits mit T005308).

## Symptom vs. Ursache (T002448-M5)

- **Symptom:** SSOT-Verlust (591 → 586 Szenarien) nach Archiv-PR #4440.
- **Ursache (belegt):** MODIFIED = full replacement (Merge-Implementierung), während das
  Delta additiv formuliert war. Der Merger hatte keinen Abgleich von Szenario-Zahlen —
  der Ersetzungs-Schritt lief ohne Gegenprüfung durch. Der Guard setzt genau dort an:
  Count-Vergleich im MODIFIED-Pfad von `applyDelta` (Z. 125-126 in
  `scripts/openspec-merge.mjs`).

## Design-Entscheidungen

1. **Warn + Fail statt nur Warn:** Ein stiller Warn-Text wäre im Archiv-Lauf untergegangen
   (das Archiv läuft nicht-interaktiv). Fail-closed mit explizitem `allowShrink`-Ausweg
   hält bewusste Konsolidierungen möglich.
2. **Count-Vergleich auf Szenario-Ebene** (nicht Prosa-Diff): billig, deterministisch,
   trifft genau die beobachtete Fehlerklasse. Requirement-Zählung (ein Delta ersetzt
   mehrere Requirements) wird als zusätzliche Plausibilitäts-Warnung mitgeführt.
3. **Guard in `applyDelta`** statt im Shell-Wrapper: alle Aufrufer (openspec.sh, Tests,
   künftige Tools) profitieren; die Vitest-Suite testet ihn ohne Repo-Mutation.
