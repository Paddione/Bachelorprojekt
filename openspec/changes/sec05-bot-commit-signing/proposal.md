---
title: "G-SEC05: adjusted metric for unsigned bot commits"
ticket_id: T001283
domains: [quality, security, ci]
status: plan_staged
---

# Proposal: sec05-bot-commit-signing (G-SEC05)

## Why

`git log -50 --pretty='%G?' main | grep -c N` zeigt aktuell 33/50 (66 %) unsignierte Commits — eine scheinbare Regression gegenüber dem zuletzt gemessenen Target ≤ 5 %. Ursache: der CI-Workflow `freshness-regen.yml` committet nach jedem main-Push via `github-actions[bot]` (E-Mail `41898282+github-actions[bot]@users.noreply.github.com`) ohne GPG-Signierung. Der Bot **kann nicht signieren** — GitHub Actions unterstützt keine GPG-Schlüssel für Bot-Commits. Die von Menschen erstellten PR-Squash-Merges sind hingegen alle signiert (adjusted: 0/50 unsigned).

Die Metrik in `scripts/health-goals-check.sh` (G-SEC05) und `.claude/lib/goals.md` misst den rohen `%G? = N`-Count ohne Ausnahme für nicht-signierbare Bot-Accounts. Das führt dauerhaft zu Fehlalarm, solange `freshness-regen.yml` aktiv ist.

## What

1. `scripts/health-goals-check.sh` — G-SEC05-Messung auf **adjusted metric** umstellen: Bot-Commits (Autor-E-Mail enthält `github-actions[bot]`) werden aus der `%G? = N`-Zählung ausgeschlossen.
2. `.claude/lib/goals.md` — G-SEC05-Abschnitt: Mess-Befehl und Beschreibung auf adjusted metric aktualisieren, Begründung für den Ausschluss ergänzen.
3. `tests/spec/commit-signing.bats` (neu) — BATS-Gate: adjusted unsigned ≤ 5 % auf main (letzte 50 Commits ohne Bot-Author).

Keine Änderung an `freshness-regen.yml` oder am Signing-Setup — der Bot kann strukturell nicht signieren, deshalb ist der Ausschluss die korrekte Lösung.

_Ticket: T001283_
