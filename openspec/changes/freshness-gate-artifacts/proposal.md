# Proposal: freshness-gate-artifacts

## Why

Alle vier zum Zeitpunkt des T003075-Laufs offenen PRs (#4014, #4015, #4016, #4017) scheiterten
am selben Required Check "BATS Unit + Quality Gates" → "Ensure freshness artifacts are up to
date": `website/src/data/test-inventory.json regenerated but not staged`. Jeder PR hatte neue
`.bats`-Dateien hinzugefügt, ohne dass `website/src/data/test-inventory.json` im selben Commit
mitregeneriert wurde.

Das ist bemerkenswert, weil die Anforderung vollständig dokumentiert ist (CLAUDE.md →
"Test inventory check", `git-workflow`-Skill Schritt 1) UND bereits ein automatisierter
Durchsetzungsmechanismus existiert: `.githooks/pre-commit` läuft vor jedem Commit
`task freshness:regenerate` und stagt geänderte Artefakte automatisch (T001388/T001973). Eine
Regel, die vollständig dokumentiert UND automatisiert ist und trotzdem in 4 von 4 Fällen verletzt
wird, ist keine Wissenslücke der Ausführenden, sondern eine Lücke im bestehenden
Durchsetzungsmechanismus selbst.

## Root-Cause (verifiziert, siehe design.md)

Der Freshness-Block in `.githooks/pre-commit` (Zeilen 84–117) ist als **Best-effort** entworfen:
schlägt `task freshness:regenerate` fehl, gibt der Hook nur eine Warnung aus
(`⚠ freshness:regenerate failed — verify generated artifacts are current.`) und lässt den
Commit trotzdem durch — es gibt keinen `exit 1` im Fehlerzweig. Anhand eines konkreten Belegs
(Commit `68982b4c5` aus PR #4046/T002925, der zwei neue `.bats`-Dateien hinzufügt, aber KEINE
begleitende Änderung an `website/src/data/test-inventory.json` enthält, obwohl
`scripts/build-test-inventory.sh` neue Dateien im Arbeitsbaum unabhängig vom Git-Index findet)
ist belegt, dass der Regenerationsschritt beim Commit entweder nicht lief oder scheiterte — und
in beiden Fällen den Commit unbeanstandet durchließ.

## What

- `.githooks/pre-commit`: der Freshness-Block unterscheidet zwei Fehlerfälle klar:
  - **Werkzeug fehlt** (`task`/`node` nicht im PATH) — bleibt fail-open wie bisher (legitime
    Ausnahme für Umgebungen ohne Toolchain, z. B. bestimmte Bot-Commits).
  - **Werkzeug vorhanden, `task freshness:regenerate` schlägt fehl** (Timeout, `npm ci`-Fehler,
    Skriptfehler) — wird künftig **blockierend** (`exit 1`) statt nur zu warnen, mit einer
    Meldung, die den Fehler benennt und den manuellen Regen-Befehl vorschlägt.
  - Neuer Bypass `SKIP_FRESHNESS_REGEN=1` (Notfall), konsistent mit den bestehenden
    `SKIP_*`-Bypässen im selben Hook (`SKIP_BRANCH_CHECK`, `SKIP_BONSAI_GUARD`,
    `SKIP_MAIN_COMMIT_GUARD`).
- Test in `tests/spec/pre-commit-freshness.bats` (gleiche Datei wie die bestehenden
  T001388/T001973-Guards, Source-Verifikations-Konvention wie dort etabliert): der
  Fehlerzweig des Freshness-Blocks muss `exit 1` enthalten statt nur eine Warnung.

## Out of Scope / verwandte Tickets

- **T003105** (Konfliktfreier Rebase verliert mitcommittete Freshness-Artefakte durch den
  `merge=ours`-Treiber in `.gitattributes`) beschreibt einen **anderen Mechanismus** zu einem
  **anderen Zeitpunkt**: nicht Commit-Zeit (dieser Fix), sondern Rebase-Zeit, und nicht ein
  fehlertolerantes Hook-Design, sondern ein Git-Merge-Treiber, der bewusst und lautlos zugunsten
  einer Seite auflöst. Ein blockierender Pre-Commit-Hook verhindert nicht, dass ein späterer,
  bereits erfolgreicher Rebase die im Commit enthaltenen Artefakte wieder verwirft — die beiden
  Fixes liegen an unterschiedlichen Stellen (Hook-Fehlerbehandlung hier vs.
  Post-Rebase-Nachprüfung im `git-workflow`-Skill dort) und bleiben deshalb getrennte Tickets.
- **freshness-regen-rebase-guard/T002669** (bereits gemerged, PR #3985) behandelt einen dritten,
  bereits gelösten Fall: veraltete lokale Basis durch parallel weiterrückenden `main` zum
  Regenerationszeitpunkt. Nicht Gegenstand dieses Tickets.

_Ticket: T003075_
