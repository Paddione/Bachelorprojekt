---
title: K3-Auto-Refresh periodisch
ticket_id: T900450
domains: [brain, mcp]
status: active
---

# k3-auto-refresh — Implementation Plan

## File Structure

- `scripts/mcp/cbm-single-flight.sh` (p1, neu)
- `docs/runbooks/cbm-index-stampede.md` (p1, neu)
- `Taskfile.yml` (p1, nur codebase:index/refresh-Targets)

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-singleflight.md | impl | scripts/mcp/cbm-single-flight.sh, docs/runbooks/cbm-index-stampede.md, Taskfile.yml | |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
