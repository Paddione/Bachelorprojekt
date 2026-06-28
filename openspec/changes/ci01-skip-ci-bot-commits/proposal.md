---
title: "G-CI01: [skip ci] im freshness-regen Bot-Commit"
ticket_id: T001281
domains: [ci]
status: plan_staged
file_locks: [.github/workflows/freshness-regen.yml]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: ci01-skip-ci-bot-commits (G-CI01)

## Why

CI-Erfolgsrate lag bei 85% (Ziel: ≥90%). In den letzten 20 main-CI-Läufen wurden 2 Runs gecancelt:
- "chore: release main (#2226)"
- "fix(ci): remove GPG step and migrate Dockerfile to pnpm [T001279] (#2...)"

Root Cause: GitHub Actions Concurrency-Queuing. `ci.yml` verwendet
`concurrency.group: ci-${{ github.workflow }}-${{ github.ref }}` mit
`cancel-in-progress: false` für push-Events. GitHub erlaubt aber nur
**1 in-progress + 1 pending** Run pro Concurrency-Group. Kommen 3 schnelle
Pushes zu main (PR-Merge → freshness-regen-Bot-Commit → release-please-Push),
verdrängt Run #3 den wartenden Run #2 aus der Queue — Run #2 wird gecancelt.

Der freshness-regen-Bot committet `chore: auto-regenerate freshness artifacts`
direkt auf main. Dieser extra Push ist die Ursache des 3-Push-Musters.

## What

`[skip ci]` in die Bot-Commit-Message von `freshness-regen.yml` einfügen:

```yaml
git commit -m "chore: auto-regenerate freshness artifacts [skip ci]"
```

Der Bot-Commit ändert ausschließlich generierte Artefakte (freshness-Dateien),
für die keine CI-Validierung nötig ist. `[skip ci]` verhindert, dass dieser
Commit einen neuen CI-Lauf triggert, eliminiert das 3-Push-Muster und stoppt
die Queue-Verdrängung.

_Ticket: T001281_
