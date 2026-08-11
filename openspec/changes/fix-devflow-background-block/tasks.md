# T003003: dev-flow-execute blockiert auf Hintergrund-Verifikation

## Ziel
dev-flow-execute-Subagents blockieren nicht mehr auf Hintergrund-Verifikation, die einen Sessionwechsel nicht überlebt.

## Tasks

### 1. Verifikation in den Vordergrund holen
- [ ] `task test:changed` / `task freshness:check` NICHT als Hintergrund-Task starten
- [ ] Synchron auf Abschluss warten (blockierend, aber zuverlässig)
- [ ] Timeout (5 min) mit klarer Fehlermeldung bei Überschreitung

### 2. Zielgerichtete Verifikation
- [ ] Statt `test:changed` die vom Plan berührten Test-Suiten direkt aufrufen
- [ ] `bats -r tests/spec/<domain>` als Default-Fallback

### 3. Commit + Push + PR erst nach bestandener Verifikation
- [ ] Kein "waiting for background task"-Pattern mehr
- [ ] Agent meldet sich erst nach vollständigem Durchlauf zurück

### Verify
- [ ] `task test:changed` besteht lokal
- [ ] Kein Hintergrund-Warte-Pattern im dev-flow-execute Skill
