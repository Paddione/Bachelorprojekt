# Progress: OD-2 VideoVault-Split

Prozent: 100 % (Split belegt, gemergt + gepusht; keine God-Funktion mehr)

## Erledigt
- B1: Card (141) + 4 Pages → 26 Module ≤182 LOC (−2851/+509), Props identisch.
- B2: 5 God-Files → 17 Module ≤134 LOC, Props identisch.
- Commits 6×`refactor(website)` + Split-Commit, Push 0b3fdc06a..2e57b2d93.
- Frischer Graph-Index (BP 2026-11-06T20:50:01Z), selbst abgefragt:
  Kanten dispers über neue Module (ActorField, SpriteStrip→categorize-queries,
  formatTime…); höchste Out-Degrees: VideoPlayerModal 18 (pre-existing,
  unangefasst), CategorizePage/Home 15 (Delegation an eigene Submodule, ≤15
  eingehalten). Kein angefasster God-Hub mehr.

## Erledigt
- B1: Card (141) + 4 Pages → 26 Module ≤182 LOC (−2851/+509), Props identisch.
- B2: 5 God-Files → 17 Module ≤134 LOC, Props identisch.
- Commits `cba8fdf6a` + 5×`refactor(website)` (Eigner-Entscheid 2026-11-06),
  Push 0b3fdc06a..2e57b2d93 enthalten.
- Verifikation: VideoVault-`tsc` exit 0 (selbst nachgelaufen, inkl. Retry-Fix
  der 4 strict-null-Fehler), Video-Suites 31 passed, Filter/Batch 7/7.
- Frischer Graph-Index (BP 2026-11-06T20:50:01Z): Split-Module belegt
  (z. B. `categorize-actor-field.ActorField`, `categorize-queries.formatTime`),
  Kanten dispers statt God-Hub.

## Nächste Schritte
Keine.
