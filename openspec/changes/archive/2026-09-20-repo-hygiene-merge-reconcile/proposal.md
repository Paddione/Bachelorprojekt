# Proposal: repo-hygiene-merge-reconcile

## Why

Messung vom 2026-09-10 (T900103): von den letzten 60 gemergten PRs trugen
34 eine Ticket-ID, 10 davon standen zum Messzeitpunkt trotz gemergtem PR
noch offen. Nachmessung vom 2026-09-20 zu den verbliebenen sieben Faellen:
weder `gh`-Metadaten (`mergedBy`, `auto_merge_enabled`-Timeline-Event) noch
die Phasen-Kette unterscheiden Auto-Merge von Hand-Merge — der Kontroll-PR
#5767 (regulaerer dev-flow-execute-Lauf) sieht identisch aus wie die sieben
Verdachtsfaelle. Punkt 1/2 der urspruenglichen ZU-KLAEREN-Liste sind damit
rueckwirkend unbeantwortbar und werden nicht erneut untersucht.

Das Netz `scripts/factory/auto-close-merged.sh` existiert bereits, ist in
`scripts/factory/wakeup.sh:248` fuer beide Brands eingehaengt und lief im
Dry-Run vom 2026-09-20 sauber durch. Es greift aber nur, waehrend die
Factory tickt — die sieben Faelle vom 2026-09-04 sind mit einem
nicht laufenden Poll-Fenster vereinbar.

## What

Nutzerentscheidung 2026-09-20: der Abgleich gemergter PRs gegen offene
Tickets wird **verbindlicher Schritt des repo-hygiene-Laufs** (§3 in
`.opencode/skills/references/repo-hygiene-ops.md`, kanonische Quelle —
`.claude/skills/references` ist ein Symlink darauf und spiegelt automatisch).
`auto-close-merged.sh` selbst und seine Einhaengung in `wakeup.sh:248`
bleiben unveraendert. Kein neuer Cron, kein neuer GitHub-Workflow.

_Ticket: T900103_
