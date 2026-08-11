# T003136: Archive PR #4083 failed freshness gate

## Ziel
Der Freshness-Gate schlägt nach openspec-Archivierung nicht mehr fehl, weil openspec-status.json nicht committed wurde.

## Tasks

### 1. Ursache
- [x] `scripts/openspec.sh archive` — wird `openspec-status.json` nach dem Archiv-Move regeneriert?
      **JA** — cmd_archive ruft openspec-status-map.sh nach dem `mv "$dir" "$dest"` (Zeile ~290, nur bei TICKET_OFFLINE!=1).
- [x] `scripts/openspec-status-map.sh` — wird es automatisch aufgerufen?
      **JA** — aus cmd_archive und cmd_apply sowie `task freshness:regenerate` (openspec:status-map).
      **Fehlschlags-Modus (PR #4083):** Die Regeneration lief, aber der Archiv-Commit des Aufrufers
      staged nur `openspec/changes/` — die regenerierte `website/src/data/openspec-status.json` blieb
      unstaged, der Freshness-Gate meldete sie als stale. Heilung erst durch den nachgeschobenen
      "chore: regenerate freshness artifacts"-Commit (6f74b77e). Der pre-commit-Auto-Stage (T001388)
      ist umgehbar (SKIP_FRESHNESS_REGEN, --no-verify) und deckt den Pfad nicht garantiert ab.

### 2. Fix
- [x] Nach jedem `openspec archive`: `openspec-status-map.sh` ausführen und Ergebnis committen
      — cmd_archive staged das Regenerat jetzt selbst (`git add website/src/data/openspec-status.json`,
      best-effort), sodass jeder nachfolgende Archiv-Commit es trägt; zusätzlich staged
      opencode-flow-execute Step 7 die Datei explizit (Defense-in-Depth, konsistent mit
      plan-archive-steps.md). Regressionstest: archive-terminal-ticket-status.bats T003136.
- [ ] ODER: Freshness-Gate erkennt archivierte Changes und ignoriert sie
      — **verworfen:** würde den Gate für eine ganze Artefakt-Klasse schwächen; das Staging ist die
      gezielte, verlustfreie Korrektur.

### Verify
- [x] Nach `openspec archive`: `task freshness:check` besteht
- [x] `openspec-status.json` ist aktuell
