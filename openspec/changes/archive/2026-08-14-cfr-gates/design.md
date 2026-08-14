# Design: CFR-Trend-Fenster + Fix-Commit-Ticket-Guard (T005307)

## Kontext

CFR-Drilldown (2026-08-14, Messung PRE=975b3295a): Die Change Failure Rate liegt
im 8-Wochen-Schnitt bei 19,3 % (Ziel ≤ 15 %). Der Wochentrend zeigt den eigentlichen
Befund: seit KW29 (~Mitte Juli) konstant 28–32 %, davor 8–17 %. Das 8-Wochen-Fenster
maskiert den Knick um ~5 Wochen. Zusätzlich: 82 von 740 fix()-Merges der letzten
8 Wochen sind ungetickt (78× Paddione, 3× Patrick, 1× Test) — laut CFR-Konvention
„verschleierte Bugs".

## Symptom vs. Ursache (T002448-M5)

| Symptom (beobachtet) | Ursache (verifiziert) |
|---|---|
| CFR-Schnitt 19,3 % über Ziel, Trend ab KW29 ~30 % | 8-Wochen-Fenster in `scripts/vda.sh cfr` glättet den Knick; keine Trend-Messung vorhanden (gelesen: `vda.sh` Z. 69–86) |
| 82 ungetickte fix()-Merges | Kein technischer Block: jeder fix()-Commit ohne Ticket-ID geht durch den bestehenden commit-msg-Hook (gelesen: `.githooks/commit-msg` prüft nur Subject-vs-Diff-Konsistenz) |

**Gestrichen während der Planung:** Der ursprüngliche dritte Punkt (Scout-Gate
blockiert bei `spec_too_short`) ist bereits umgesetzt — `blockTicket()` in
`scripts/factory/pipeline-runner.js` seit T002343 (a856cf2a3, 2026-07-27).
Die SCOUT_WEAK-Schleife vom 21./22.07. war das Symptom VOR diesem Fix; die
Pre-Gate-Logik ist in `tests/spec/scout-prediction-quality.bats` (5.5a-Reihe)
getestet. Kein weiterer Handlungsbedarf.

## Fix 1: CFR-Trend-Zeile in `vda.sh cfr`

- Die bestehende Messung bleibt unverändert („CFR breit", `CFR_WINDOW`-Respekt).
- Zusätzlich wird eine zweite Zeile ausgegeben: „CFR 4w (Trend)" mit einem fest
  internen Fenster `4 weeks ago` (unabhängig von `CFR_WINDOW`, damit die
  Trend-Messung immer vergleichbar ist).
- Gleicher Messalgorithmus (first-parent main, fix(…)-Proxy), nur anderes Fenster.
- `n/a`-Pfad bleibt: bei 0 Merges im 4-Wochen-Fenster wird „CFR 4w: n/a" ausgegeben.
- Konsumenten-Risiko geprüft: keine Maschine parst die cfr-Ausgabe
  (`/admin/dora` rechnet selbst; Referenzen in `ticket-system.bats` und
  `update-status.sh` sind Kommentare).

## Fix 2: Commit-Guard gegen ungetickte fix()-Commits

- Neues Skript `scripts/check-fix-ticket-guard.sh <commit-msg-file>`:
  - Kein `fix(`-Präfix im Subject → Exit 0 (nur fixes sind betroffen).
  - `fix(`-Präfix UND Ticket-ID (`T[0-9]{6}`) im Subject → Exit 0.
  - `fix(`-Präfix OHNE Ticket-ID → Exit 1 mit Hinweis auf
    `bash scripts/ticket.sh create --type fix …`.
  - Bypass (Notfall): `SKIP_FIX_TICKET_GUARD=1`.
- Aufruf aus dem bestehenden `.githooks/commit-msg` nach dem
  commit-vs-diff-Check (gleiches Muster wie `check-commit-vs-diff.sh`).
- Betroffen sind lokale Commits; CI-Bots (Renovate o. ä.) committen ohne lokale
  Hooks und sind nicht betroffen. 78 der 82 ungetickten fixes stammen vom User
  selbst — der Guard diszipliniert genau diese Quelle.

## Betroffene Dateien

- `scripts/vda.sh` (cfr-Fall um Trend-Zeile erweitern)
- `scripts/check-fix-ticket-guard.sh` (neu)
- `.githooks/commit-msg` (Aufruf ergänzen)
- Tests: `tests/spec/ci-cd/cfr-trend-window.bats`, `tests/spec/ci-cd/fix-ticket-commit-guard.bats`

## Testing-Strategie

- Beide Tests sind BATS-Output-Verifikation (T002448-M4): sie führen die
  Kommandos aus und prüfen Exit-Codes/Semantik der Ausgabe, nicht Quelltext.
- Fix 1: Guard prüft Exit 0 + beide Messzeilen (Positiv-Anker: bestehende
  „CFR breit"-Zeile muss weiterhin vorhanden sein) + ≥ 2 Prozentangaben.
- Fix 2: Guard ruft das Skript mit Beispiel-Messages auf: mit Ticket → 0
  (Positiv-Anker zuerst, T002356-M1), ohne Ticket → 1, Bypass → 0,
  feat()-Präfix → 0.
- Semantik statt Darstellung (T002716): keine Wortlaut-Anker auf
  Fehlermeldungen; geprüft werden Exit-Codes und Vorhandensein der Messzeilen.

## Edge-Cases

- `git log` in Repos ohne `main`-Branch oder ohne Historie: bestehender
  `cfr`-Fall behandelt das bereits (`|| true`, n/a-Pfad) — die Trend-Zeile
  erbt dieses Verhalten.
- Commit-Messages mit Ticket-ID in anderem Format (z. B. `[T005307]` vs
  `T005307`): Regex matcht `T[0-9]{6}` ohne Klammerpflicht.
- Merge-/Squash-Commits mit `fix(` im Titel aus CI: betreffen lokale Hooks
  nicht (kein lokaler Commit).
