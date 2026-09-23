## p3 — Workflow `.github/workflows/openspec-orphan-archive.yml`

Target files: `.github/workflows/openspec-orphan-archive.yml`

Requirement: openspec-workflow „A dispatch-only workflow turns executor results into a pull
request and issues". Vorlage fuer Checkout, Toolchain und PR-Erzeugung:
`.github/workflows/freshness-regen.yml` (nutzt `secrets.GH_PAT`, damit der erzeugte PR CI ausloest).

- [ ] **Trigger und Rechte.**
  Nur `workflow_dispatch` mit Input `slugs` (string, required). `concurrency:
  group: openspec-orphan-archive, cancel-in-progress: false`. `permissions: contents: write,
  pull-requests: write, issues: write`.

- [ ] **Executor ausfuehren.**
  Checkout mit `token: ${{ secrets.GH_PAT }}` und `fetch-depth: 0`; Node, pnpm und `task` wie in
  `freshness-regen.yml` einrichten. Dann
  `bash scripts/openspec-orphan-archive.sh --slugs "${{ inputs.slugs }}" --out "$RUNNER_TEMP/orphan"`.
  Den Input nur ueber `env:` an das Skript geben, nicht direkt in `run:` interpolieren
  (Script-Injection ueber Workflow-Inputs).

- [ ] **Erfolge als ein Auto-Merge-PR.**
  Nur wenn `archived.txt` nicht leer ist:
  - `task openspec:validate`. Rot: keinen PR anlegen, sondern ein Issue mit Label
    `openspec-orphan`, Titel `openspec-orphan: validate failed after auto-archive (run <run_id>)`,
    Body mit allen Slugs aus `archived.txt` und dem Link zum Run; Job danach rot beenden.
  - Gruen: `task freshness:regenerate`, Branch `chore/openspec-auto-archive-<run_id>`,
    `git add openspec/ docs/spec-atlas.md components/website/src/data/openspec-status.json`
    (explizite Pfade, kein `git add -A`), Commit und PR-Titel
    `chore(plans): auto-archive orphaned openspec changes [<Ticket-IDs aus .ticket, leerzeichen-getrennt>]`,
    Body mit der Slug-Liste; danach `gh pr merge --auto --squash <pr>`.

- [ ] **Fehlschlaege als Issues.**
  `gh label create openspec-orphan --color B60205 --force` einmal pro Lauf. Je Zeile aus
  `failed.tsv` (`slug`, `ticket`, `reason`):
  - offenes Issue suchen: `gh issue list --label openspec-orphan --state open
    --search '<slug> in:title' --json number --jq '.[0].number'`;
  - vorhanden: `gh issue comment <nr>` mit Grund und Run-Link;
  - sonst `gh issue create --label openspec-orphan --title 'openspec-orphan: <slug> [<ticket>]'`
    mit Grund, Run-Link und dem Hinweis, dass `openspec.sh archive <slug>` eine Entscheidung
    braucht (`--create-new`, `--allow-shrink`, `--no-merge` oder ein korrigiertes Delta).

- [ ] **Syntax pruefen.**

```bash
python3 -c 'import yaml,sys; yaml.safe_load(open(".github/workflows/openspec-orphan-archive.yml"))'
command -v actionlint >/dev/null && actionlint .github/workflows/openspec-orphan-archive.yml || true
```
