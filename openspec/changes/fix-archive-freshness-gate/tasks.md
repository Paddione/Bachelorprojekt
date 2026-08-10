# T003136: Archive PR #4083 failed freshness gate

## Ziel
Der Freshness-Gate schlägt nach openspec-Archivierung nicht mehr fehl, weil openspec-status.json nicht committed wurde.

## Tasks

### 1. Ursache
- [ ] `scripts/openspec.sh archive` — wird `openspec-status.json` nach dem Archiv-Move regeneriert?
- [ ] `scripts/openspec-status-map.sh` — wird es automatisch aufgerufen?

### 2. Fix
- [ ] Nach jedem `openspec archive`: `openspec-status-map.sh` ausführen und Ergebnis committen
- [ ] ODER: Freshness-Gate erkennt archivierte Changes und ignoriert sie

### Verify
- [ ] Nach `openspec archive`: `task freshness:check` besteht
- [ ] `openspec-status.json` ist aktuell
