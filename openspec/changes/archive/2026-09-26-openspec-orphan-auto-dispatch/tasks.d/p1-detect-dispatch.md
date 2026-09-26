---
title: "p1 — Orphan detection script and scheduled dispatch"
ticket_id: T900503
domains: [ci, openspec]
status: active
---

# p1 — Orphan detection script and scheduled dispatch

Files: `scripts/openspec-orphan-detect.sh`, `.github/workflows/openspec-orphan-archive.yml` (target_files dieses Partials; disjunkt zu p-tests).

## Task 1.1: Detection-Skript anlegen

1. `scripts/openspec-orphan-detect.sh` neu anlegen (`set -euo pipefail`,
   Usage-Funktion, `--dry-run`, `--min-age-hours N` mit Default 24,
   `-h|--help`). Richtwert unter 150 Zeilen (neue `.sh`-Datei, Limit 800).
2. Ablauf: Offene Slugs per `gh api
   'repos/{owner}/{repo}/contents/openspec/changes?ref=main'` listen (Typ
   dir, ohne `archive`; `{owner}/{repo}` ersetzt `gh` aus dem Repo).
   Je Slug in Reihenfolge prüfen, beim ersten Treffer `skip <slug>:
   <grund>` nach stderr und weiter: `.ticket` per
   `gh api .../contents/openspec/changes/<slug>/.ticket?ref=main` lesen
   (leer/Fehler → `no .ticket`); gemergten PR per `gh pr list --state
   merged --search '"[Tid]" in:title'` suchen (kein Treffer → `no merged
   fix pull request`); Erstcommit per `gh api
   '.../commits?sha=main&path=openspec/changes/<slug>&per_page=100'` und
   `.[-1].commit.committer.date` gegen Mindestalter prüfen (zu jung →
   `too young (<h>h)`); offene PRs per `gh pr list --state open --search
   '<slug> in:title'` suchen (Treffer → `open pull request`). Sonst
   `select <slug> (<Tid>)` nach stderr und Slug nach stdout.
3. Das Klammer-Quoting der `[Tid]`-Suche am echten `gh` gegen einen
   bekannten gemergten PR verifizieren (z. B. `[T900479]` muss #5979
   finden, `[T000000]` nichts); erst danach als final betrachten.
4. `--dry-run` gibt nur die select/skip-Zeilen aus (Exit 0); ohne Flag
   zusätzlich Exit 0 bei leerer Auswahl (nichts zu tun ist kein Fehler).
5. Bekannte Grenze im Skriptkopf als Kommentar festhalten: Ein revertierter
   Fix hinterlässt einen gemergten PR — der Change würde archiviert (nur
   dokumentarisch, kein Code-Verlust).

## Task 1.2: Workflow um Schedule und Detect-Job erweitern

1. In `.github/workflows/openspec-orphan-archive.yml` einen
   `schedule`-Trigger (nächtlicher Cron, Minute nicht :00/:30) ergänzen;
   `workflow_dispatch` bleibt unverändert.
2. Neuen Job `detect` (vor dem Executor-Job): Slug-Liste per
   `scripts/openspec-orphan-detect.sh` bestimmen (mit `--dry-run`-Echo im
   Log), als Output `slugs` bereitstellen; bei manuellen
   `inputs.slugs` den Detect-Job überspringen (`if:`-Bedingung) und die
   Inputs direkt verwenden. Nur bei nicht-leeren Slugs den Executor-Job
   starten (Bedingung am bestehenden Job, kein Duplikat des Jobs).
3. YAML-Syntax prüfen (`python3 -c` mit yaml.safe_load oder
   `actionlint`, falls vorhanden); kein neuer Secret-Bedarf (`GH_PAT` und
   `GITHUB_TOKEN` sind bereits verdrahtet).

## Verify (Partial)

```bash
bash -n scripts/openspec-orphan-detect.sh
bash scripts/openspec-orphan-detect.sh --dry-run --min-age-hours 100000
task test:changed
task freshness:regenerate
task freshness:check
```
