---
ticket_id: T002255
plan_ref: openspec/changes/devflow-selection-archive-hardening/tasks.md
status: active
date: 2026-07-27
---

# Design: devflow-selection-archive-hardening

_Tickets: T002255, T002256 — Mishap-Bundles aus dem T002251-Zyklus._

## Problem

Fünf protokollierte Mishaps, die auf zwei Wurzelursachen zurückgehen.

### Ursache A — generierte Artefakte sind von echten Änderungen nicht unterscheidbar

`task freshness:regenerate` schreibt 16 generierte Artefakte, von denen mehrere unter
`website/` und `docs/` liegen. Jeder Change mit einem OpenSpec-Artefakt fasst mindestens
`website/src/data/openspec-status.json` an (Generator: `scripts/openspec-status-map.sh`).
Zwei Konsumenten leiten aus einem Datei-Diff eine Handlung ab und behandeln diese
Artefakte wie Quelltext:

- **`Taskfile.yml` `test:changed`** — `^website/(src|pages|components|layouts|lib)/`
  setzt `RUN_E2E_WEBSITE=true`. Folge: `task test:changed` startet Playwright und bricht
  lokal ab mit `CRON_SECRET not set — cannot bracket Playwright run with prod DB purge`.
  Beobachtet bei T002251, dessen Change ausschließlich `flux/clusters/fleet/bootstrap/*.yaml`
  und `tests/spec/*.bats` berührte. Das mandatorische Verify-Gate aus `plan-quality-gates`
  ist damit für jeden solchen Change lokal nicht durchführbar.
- **`scripts/devflow-post-merge-deploy.sh`** — `^website/` setzt `DEPLOY_WEBSITE=true` und
  ruft `task feature:website` (Image-Build + Push), `^docs/` analog `task docs:deploy`.
  Beobachtet bei T002251 / PR #3300: der lokale Build scheiterte an
  `error getting credentials` (kein GHCR-Login), das Skript schrieb `deploy/blocked` —
  obwohl `build-website.yml` denselben SHA in CI grün gebaut hatte. Das Ticket hätte
  fälschlich als deploy-blockiert in der DORA-Auswertung gestanden.

### Ursache B — die Archiv-Reference beschreibt einen Ablauf, der reproduzierbar scheitert

`.claude/skills/references/plan-archive-steps.md` ist die Vorlage, der Agenten beim
Archivieren wörtlich folgen. Sie enthält drei Defekte:

1. `ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}"` verletzt den Branch-Naming-Guard
   in `.githooks/pre-commit:117` (`[[ "$_bn" =~ T[0-9]{6,} ]]`) — der Commit wird abgelehnt.
2. `git checkout -b "$ARCHIVE_BRANCH"` zweigt vom Fix-Branch ab, **nachdem** dort committet
   wurde. Das Repo nutzt squash-and-merge; nach dem Merge des Fix-PRs hängt der Fix-Branch
   am Pre-Squash-Stand. Der Archiv-PR geht sofort auf `mergeStateStatus=DIRTY`, Auto-Merge
   greift nicht (beobachtet: PR #3302).
3. Die Code-Fences sind zwar paarweise balanciert (5/12, 17/24, 27/67), aber der Block
   27–67 schließt den Blockquote ab Zeile 31 und den restlichen Fließtext mit ein — beides
   rendert als Shell-Code. Der Block muss nach dem `openspec.sh archive`-Aufruf geschlossen
   und für Schritt 4 neu geöffnet werden.

Dazu kommt eine Werkzeug-Einschränkung: `mcp__ticket-mcp__archive_plan` scheitert aus
Worktrees mit `plan file does not exist or is empty`, obwohl die Datei vorhanden ist —
der MCP-Server löst relativ zum Haupt-Checkout auf, wo der Change-Ordner nur auf dem
Branch existiert. Dieselbe Klasse wie die bereits bekannte `stage_plan`-Einschränkung.

## Lösung

### A — ein Filter, gespeist aus der vorhandenen SSOT

Die Liste der generierten Pfade existiert bereits zweimal: als `merge=ours
linguist-generated=true`-Einträge in `.gitattributes` (21 Zeilen) und als Heredoc in
`Taskfile.yml` `freshness:check`. Der Kommentar bei `freshness:regenerate` benennt den
manuellen Sync-Zwang explizit. Eine dritte und vierte Kopie in den beiden Selektoren
würde die Driftfläche verdoppeln.

Stattdessen liest ein gemeinsamer Helper das vorhandene Git-Attribut:

```bash
# scripts/filter-generated.sh
git check-attr --stdin linguist-generated | ... # behält nur Pfade ohne den Wert 'true'
```

Der Attributwert ist verifiziert `true`, nicht `set` — `.gitattributes` setzt das Attribut
**mit Wert** (`linguist-generated=true`). Ein Filter auf `: set$` würde still nichts
entfernen. Zweite Falle: `grep -v` liefert Exit 1, wenn es alle Zeilen verwirft — der Fall
bei einem Diff aus ausschließlich generierten Dateien. Unter `set -o pipefail` reißt das den
aufrufenden Task mit, deshalb erzwingt der Helper `exit 0`.

Damit wirkt ein neues generiertes Artefakt automatisch, sobald es seinen ohnehin
vorgeschriebenen `.gitattributes`-Eintrag bekommt. Beide Konsumenten pipen ihre
`CHANGED`-Liste durch den Helper; die nachgelagerten `grep`-Selektoren bleiben unverändert.

**`freshness:check` bleibt bewusst ungefiltert.** Dort sind genau diese Pfade der
Prüfgegenstand — derselbe Pfad ist in einem Kontext Signal und im anderen Störung.
Diese Asymmetrie ist beabsichtigt und muss im Helper-Kommentar stehen.

### B — Post-Merge-Deploy baut keine Images mehr

Prod wird laut `CLAUDE.md` pull-based via Flux ausgerollt; die Images baut CI
(`build-website.yml`, `build-brett.yml`, `build-docs.yml`). Der lokale Build im
Post-Merge-Skript ist damit redundant und setzt einen Registry-Login voraus, den ein
Agent nicht hat. `feature:website`, `feature:brett` und `docs:deploy` entfallen; das
Skript nennt stattdessen den zuständigen CI-Workflow. `task feature:deploy` bleibt als
Break-Glass-Pfad, weil `kubectl apply` keinen Registry-Login braucht.

**Verhältnis zu T002242-M3:** Die Exit-Code-Sammlung und das fail-closed-`deploy/blocked`
stammen aus `openspec/specs/mishap-t002242.md` und werden von `tests/spec/ci-cd.bats:1209`
bewacht. Dieser Change baut das nicht zurück — er verfeinert die Menge dessen, was
gemeldet wird: fail-closed bleibt richtig für Tasks, die der Agent überhaupt ausführen
kann. Ein Build, der strukturell an fehlendem GHCR-Login scheitert, war nie ein
Deploy-Fehler, sondern ein falsch platzierter Schritt.

### C — Archiv-Reference korrigieren

- Branch-Name mit `-${TICKET_ID}`; die Ticket-ID unverändert mit großem `T` einsetzen,
  nicht aus einem lowercase-Slug ableiten (dieselbe Falle ist in `mishap-tracker`
  Schritt 3.5 bereits dokumentiert).
- `git fetch origin main && git checkout -B "$ARCHIVE_BRANCH" origin/main`, dann dort
  committen. Nebeneffekt: der Archiv-PR zeigt garantiert nur die Archiv-Änderungen im Diff.
- `archive_plan` von MCP-first auf `bash scripts/ticket.sh archive-plan` umstellen. Beide
  Wege stehen bereits in der Datei (MCP-first Zeile 15, Skript-Fallback Zeile 18) — der Fix
  kehrt ihre Reihenfolge um, statt etwas zu ergänzen.
- Den Blockquote aus dem Code-Block herauslösen (Fence nach Zeile 29 schließen, für
  Schritt 4 neu öffnen).

### D — Werkzeug-Einschränkung dokumentieren

`mcp-tool-guide.md` hält fest, dass `stage_plan` **und** `archive_plan` aus Worktrees
fehlschlagen und der Skript-Fallback der Primärweg ist. Der MCP-Bug selbst wird nicht
behoben — das ist ein Follow-up-Ticket in fremdem Subsystem.

## Abgrenzung

Nicht in diesem Change:

- Der `ticket-mcp`-Worktree-Bug selbst (nur dokumentiert; Follow-up-Ticket).
- `freshness:check` und die Heredoc-Liste darin — die Konsolidierung von `.gitattributes`
  und Heredoc zu einer einzigen Quelle wäre ein eigener Change.
- Der stale Worktree `freshness-gate-T002252`.

## Test-Strategie

Alle Tests zuerst RED, in `tests/spec/devflow-selection-archive-hardening.bats`:

| Test | Prüft |
|------|-------|
| Filter entfernt generierte Pfade | `website/src/data/openspec-status.json` fällt raus, `scripts/foo.sh` bleibt |
| Filter ist idempotent bei leerer Eingabe | kein Fehler, keine Ausgabe |
| `test:changed` verdrahtet den Filter | `Taskfile.yml` pipet `CHANGED` durch `filter-generated.sh` |
| Post-Merge verdrahtet den Filter | dito in `devflow-post-merge-deploy.sh` |
| Keine Image-Builds im Post-Merge | `feature:website`/`feature:brett`/`docs:deploy` kommen nicht mehr vor |
| Archiv-Branch trägt Ticket-ID | `plan-archive-steps.md` enthält `-${TICKET_ID}` im Branch-Namen |
| Archiv-Branch kommt von origin/main | `checkout -B` gegen `origin/main` statt `checkout -b` |
| Worktree-Limit dokumentiert | `mcp-tool-guide.md` nennt `archive_plan` neben `stage_plan` |

Der bestehende Test `tests/spec/ci-cd.bats:1209` (T002242-M3) muss weiterhin grün bleiben —
das `FAILED_TASKS`-Muster wird nicht angefasst.

## Gate-Notizen

`gates.yaml` definiert S1-Limits nur für Code-Endungen unter `scan.code_roots`. `.yml`,
`.md` und `.bats` stehen in keiner der beiden Listen, `.claude/` ist kein Code-Root — S1
ist für diesen Change gegenstandslos bis auf `scripts/filter-generated.sh` (.sh, Limit 500,
Zielgröße ~15 Zeilen) und `scripts/devflow-post-merge-deploy.sh` (56 Zeilen, schrumpft).
Keine der beiden Dateien ist gebaselined.

S4 (Orphan-Gate) ist die relevantere Regel: `scripts/filter-generated.sh` wird von
`Taskfile.yml` und `devflow-post-merge-deploy.sh` referenziert und ist damit kein Waise.
