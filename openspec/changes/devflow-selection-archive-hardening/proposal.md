# Proposal: devflow-selection-archive-hardening

## Why

Fünf im T002251-Zyklus protokollierte Mishaps (T002255, T002256) gehen auf zwei
Wurzelursachen zurück und beschädigen beide den Entwicklungs-Kreislauf messbar.

**Generierte Artefakte sind für die Diff-Selektion von echten Änderungen nicht
unterscheidbar.** `task freshness:regenerate` schreibt 16 Artefakte, mehrere davon unter
`website/` und `docs/`. Jeder Change mit OpenSpec-Artefakt fasst mindestens
`website/src/data/openspec-status.json` an. Zwei Konsumenten leiten daraus Handlungen ab:
`task test:changed` startet Playwright (und bricht lokal an fehlendem `CRON_SECRET` ab —
das mandatorische Verify-Gate ist damit für solche Changes lokal nicht durchführbar), und
`scripts/devflow-post-merge-deploy.sh` startet einen Website-Image-Build, der ohne
GHCR-Login scheitert und ein falsches `deploy/blocked`-Phase-Event schreibt. Letzteres
verfälscht die DORA-Auswertung: bei T002251 / PR #3300 hatte `build-website.yml` denselben
SHA in CI grün gebaut.

**Die Archiv-Reference beschreibt einen Ablauf, der reproduzierbar scheitert.**
`.claude/skills/references/plan-archive-steps.md` gibt einen Branch-Namen ohne Ticket-ID
vor (vom Pre-Commit-Guard abgelehnt) und zweigt den Archiv-Branch vom Fix-Branch ab, der
nach squash-and-merge am Pre-Squash-Stand hängt — der Archiv-PR geht sofort auf `DIRTY`
und Auto-Merge greift nicht (PR #3302). Beides trifft jeden Agenten, der der Vorlage
wörtlich folgt.

## What

- **`scripts/filter-generated.sh` (neu)** — filtert generierte Pfade aus einer Pfadliste,
  gespeist aus dem bereits vorhandenen `linguist-generated`-Attribut in `.gitattributes`.
  Keine neue Liste, kein weiterer Ort, der driften kann.
- **`Taskfile.yml` `test:changed`** und **`scripts/devflow-post-merge-deploy.sh`** pipen
  ihre `CHANGED`-Liste durch den Filter. `freshness:check` bleibt bewusst ungefiltert —
  dort sind diese Pfade der Prüfgegenstand.
- **Post-Merge-Deploy baut keine Images mehr** — `feature:website`, `feature:brett` und
  `docs:deploy` entfallen zugunsten eines Verweises auf den zuständigen CI-Workflow. Prod
  läuft pull-based via Flux. `feature:deploy` bleibt als Break-Glass. Die
  fail-closed-Meldung aus T002242-M3 bleibt unangetastet.
- **`plan-archive-steps.md`** — Branch-Name mit Ticket-ID, Archiv-Branch von `origin/main`
  statt vom Fix-Branch, `archive_plan` auf den Skript-Fallback umgestellt, unterminierter
  Code-Block geschlossen.
- **`mcp-tool-guide.md`** — Worktree-Einschränkung für `stage_plan` und `archive_plan`
  dokumentiert.
- **`deploy-routing.md`** — generierte Pfade explizit als Nicht-Trigger festgehalten.

_Tickets: T002255, T002256_
