# Tasks: Factory-Watchdog RED-GREEN Gap

## Overview
- **Ticket:** T003487
- **Slug:** factory-watchdog-red-green
- **Complexity:** simple (1 Datei + 1 Spec + 1 Test)

## Manifest

| # | Partial | Target Files | Role |
|---|---------|-------------|------|
| p1 | watchdog-progress-filter | `scripts/factory/watchdog.sh`, `openspec/specs/software-factory.md` | implement |
| p2 | tests | `tests/spec/factory/watchdog-red-green.bats` | tests |

## File Structure
```
openspec/changes/factory-watchdog-red-green/
├── .ticket
├── proposal.md
├── design.md
├── specs/
│   └── software-factory.md
├── intel.json
├── tasks.md
└── tasks.d/
    ├── p1-watchdog-progress-filter.md
    └── p2-tests.md
```
