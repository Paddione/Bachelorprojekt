# Proposal: mishap-agent-lock

## Why

Das Ticket T002454 fasst drei separate Betriebsprobleme (Mishaps) zusammen:
1. `agent-lock.sh`: Ein toter oder verwaister Ticket-Lock kann nicht sauber übernommen werden, da `claim` kein `--force` unterstützt und `reap` unzuverlässig ist.
2. `dev-flow-plan`: Das Plan Intel Bundle (`intel.json`) fehlt in den meisten OpenSpec-Änderungen, obwohl es in `dev-flow-execute` als Pflicht-Kontext dokumentiert ist.
3. `repo-hygiene`: Ein Ausfall der GitHub-API führt dazu, dass der Post-Merge-Guard aufgrund einer leeren Zeitmarke fälschlicherweise annimmt, dass keine weiteren Commits auf dem Branch existieren (Fail-Open).

## What Changes

1. **scripts/agent-lock.sh**:
   - `claim` wird um das Flag `--force` erweitert.
   - Wenn `--force` übergeben wird, prüft das Skript, ob die `owner_pid` im Lock-File noch am Leben ist (`ps -p`). Wenn der Prozess tot ist, wird der Lock übernommen und der Vorgang in `.reap.log` dokumentiert. Alternativ oder ergänzend wird `_reapable()` so angepasst, dass verwaiste Prozesse automatisch aufgeräumt werden.
2. **skills/dev-flow-plan**:
   - Entweder wird die Erzeugung von `intel.json` in der Plan-Phase verlässlich implementiert, oder die Dokumentation im Skill wird angepasst (z.B. indem es als optional gekennzeichnet wird oder entfernt wird, wenn es nicht generiert wird).
3. **skills/repo-hygiene**:
   - Jede von der GitHub CLI (`gh`) bezogene Zeitmarke wird vor der Verwendung auf Nicht-Leere geprüft (`[ -n "$m" ]`). Falls sie leer ist, bricht der Guard ab (Fail-Closed). Der Offline-Anker (Squash-Commit-Suche in `origin/main` via `git log --grep`) wird dokumentiert und als primärer, netzwerkunabhängiger Weg empfohlen.

## Capabilities

### Modified Capabilities
- `agent-skills`: Anpassung der Anforderungen an agent-lock, dev-flow-plan und repo-hygiene.

## Impact

Betroffen sind das Lock-System, der Planungsprozess sowie die repo-hygiene Skripte im Monorepo.
