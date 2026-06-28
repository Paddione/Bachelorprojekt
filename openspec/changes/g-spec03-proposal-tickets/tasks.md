---
title: "G-SPEC03: Proposals ohne .ticket-Datei verknüpfen (12→0)"
ticket_id: T001301
domains: ["quality","process"]
status: plan_staged
---

# g-spec03-proposal-tickets — Implementation Plan

## File Structure

| Datei | Aktion |
|---|---|
| `openspec/changes/agent-push-notifications/.ticket` | Neu |
| `openspec/changes/ai-ticket-auto-triage/.ticket` | Neu |
| `openspec/changes/bats-coverage-batch1/.ticket` | Neu |
| `openspec/changes/cockpit-bulk-status/.ticket` | Neu |
| `openspec/changes/cockpit-filter-presets/.ticket` | Neu |
| `openspec/changes/cockpit-mobile-view/.ticket` | Neu |
| `openspec/changes/dev-flow-chore-ticket-ops-mishaps/.ticket` | Neu |
| `openspec/changes/mentolder-react-rebuild/.ticket` | Neu |
| `openspec/changes/openspec-ssot-quality/.ticket` | Neu |
| `openspec/changes/s1-violations-batch1/.ticket` | Neu |
| `openspec/changes/ticket-mcp-go/.ticket` | Neu |
| `openspec/changes/g-dep01-npm-vuln/specs/g-dep01-npm-vuln.md` | Gelöscht |
| `openspec/changes/g-dep01-npm-vuln/specs/` | Gelöscht |
| `openspec/changes/g-dep01-npm-vuln/` | Gelöscht |

## Task 0: Baseline messen (RED)

- [ ] Measure-Command ausführen:
  ```bash
  m=0; for d in openspec/changes/*/; do b=$(basename "$d"); [ "$b" = archive ] && continue; [ -f "$d/.ticket" ] || m=$((m+1)); done; echo "no-ticket=$m"
  ```
  expected: FAIL (aktueller Wert: `no-ticket=12` — over target: 0 Changes ohne .ticket)

## Task 1: .ticket-Dateien für die elf echten Proposals anlegen

Jede `.ticket`-Datei enthält ausschließlich die Ticket-ID als einzeiligen String ohne führende oder nachfolgende Leerzeichen.

- [ ] 1.1 `echo T000991 > openspec/changes/agent-push-notifications/.ticket`
- [ ] 1.2 `echo T000992 > openspec/changes/ai-ticket-auto-triage/.ticket`
- [ ] 1.3 `echo T001117 > openspec/changes/bats-coverage-batch1/.ticket`
- [ ] 1.4 `echo T000989 > openspec/changes/cockpit-bulk-status/.ticket`
- [ ] 1.5 `echo T000988 > openspec/changes/cockpit-filter-presets/.ticket`
- [ ] 1.6 `echo T000987 > openspec/changes/cockpit-mobile-view/.ticket`
- [ ] 1.7 `echo T001210 > openspec/changes/dev-flow-chore-ticket-ops-mishaps/.ticket`
- [ ] 1.8 `echo T001026 > openspec/changes/mentolder-react-rebuild/.ticket`
- [ ] 1.9 `echo T001266 > openspec/changes/openspec-ssot-quality/.ticket`
- [ ] 1.10 `echo T001108 > openspec/changes/s1-violations-batch1/.ticket`
- [ ] 1.11 `echo T001043 > openspec/changes/ticket-mcp-go/.ticket`

## Task 2: Skelett-Verzeichnis g-dep01-npm-vuln bereinigen

Das Verzeichnis `openspec/changes/g-dep01-npm-vuln/` enthält ausschließlich ein `specs/`-Unterverzeichnis mit einem einzelnen Stub ohne `proposal.md` oder `tasks.md`. Die eigentliche Arbeit liegt bereits archiviert unter `openspec/changes/archive/2026-06-28-g-dep01-npm-vuln/`. Das Skelett wird vollständig entfernt.

- [ ] 2.1 `rm -rf openspec/changes/g-dep01-npm-vuln/`
- [ ] 2.2 Sicherstellen, dass `openspec/changes/archive/2026-06-28-g-dep01-npm-vuln/` nach wie vor vorhanden ist (kein Datenverlust):
  ```bash
  ls openspec/changes/archive/2026-06-28-g-dep01-npm-vuln/
  ```

## Task 3: Measure-Command erneut ausführen (GREEN)

- [ ] 3.1 Measure-Command ausführen:
  ```bash
  m=0; for d in openspec/changes/*/; do b=$(basename "$d"); [ "$b" = archive ] && continue; [ -f "$d/.ticket" ] || m=$((m+1)); done; echo "no-ticket=$m"
  ```
  Erwartetes Ergebnis: `no-ticket=0`

## Task 4 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-SPEC03` → Ziel-Status grün
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
