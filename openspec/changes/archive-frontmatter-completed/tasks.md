---
title: "archive-frontmatter-completed — Implementation Plan"
ticket_id: T015916
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# archive-frontmatter-completed — Implementation Plan

_Ticket: T015916_ · Fix-Pfad, Single-Plan. Root Cause und Entscheidungen:
`proposal.md` / `design.md` (Klärungsbeschluss „Fix forward only" vom 2026-08-24).

## File Structure

Bestehende Dateien (S1-Budget gegen die wirksame Schwelle; nicht gebaselined,
wirksame Schwelle = `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`):

| Datei | Ist-Zeilen | Restbudget | Plan-Delta |
|---|---|---|---|
| `scripts/devflow-post-merge-finalize.sh` | 776 | budget 24 | ca. +16 (Quelle des verstreuten Seds -1, Source-Zeile +1, Subshell-Aufrufe +4, `--frontmatter-state`-Parsing/Handler +12) — passt ins Budget |
| `tests/spec/agent-skills/finalize-archive-frontmatter.bats` | neu (RED liegt bereits vor) | — | wächst nur in der neuen Datei |

Neue Dateien:

| Datei | Zweck |
|---|---|
| `scripts/lib/finalize-frontmatter.sh` | Helper `_apply_plan_frontmatter_completed` + `_plan_frontmatter_state` (Fragment-Extraktion, damit das Hauptskript sein Budget hält) |

Budgetstrategie: Die Frontmatter-Logik (Helper + State-Abfrage + Status-Alternation)
wächst in das Fragment; im Hauptskript entstehen nur Aufruf-, Parsing- und
Source-Zeilen. Wird eine Änderung dort doch größer als budget 24: weitere Auslagerung
in das Fragment statt Zeilen zusammenschieben.

Delta-Spec: `specs/agent-skills.md` (Parent-SSOT-Slug, benannt nach
`openspec/specs/agent-skills.md`, MODIFIED „Post-Merge-Finalisierung als idempotente
Skript-Einheit").

## T1 — RED-Bestätigung dokumentieren

Der failing Test liegt bereits auf diesem Branch vor:
`tests/spec/agent-skills/finalize-archive-frontmatter.bats` (5 Tests, alle rot gegen
den Ist-Stand). Der rote Stand wurde vor dem Plan-Schreiben gemessen.

- [x] Testlauf notieren: `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-archive-frontmatter.bats`
      expected: FAIL (5 von 5 rot: `--frontmatter-state` unbekannt, Helper fehlt,
      Reihenfolge verletzt, verstreuter Sed vorhanden)

## T2 — Fragment scripts/lib/finalize-frontmatter.sh anlegen

- [x] Datei `scripts/lib/finalize-frontmatter.sh` mit drei Teilen:
      1. Konstante `_PLAN_STATUS_ACTIVE_RE='^(active|plan_staged|in_progress|planning)$'`
      2. `_apply_plan_frontmatter_completed <base_dir>` — sed auf
         `<base_dir>/"$PLAN_REL"` (nur wenn Datei existiert und nicht leer; fehlt sie,
         wie bisher der T004269-Fall behandeln, kein Fehler)
      3. `_plan_frontmatter_state <slug> <repo_dir>` — liest
         `<repo_dir>/openspec/changes/<slug>/tasks.md`, gibt `completed` oder `stale`
         nach stdout aus (Exit 0), bei fehlender Datei Exit 1 ohne Ausgabe
- [x] Keine neuen Abhängigkeiten; gleicher grep/sed-Stil wie das Hauptskript (kein jq)

## T3 — Hauptskript verdrahten

- [x] Fragment früh source-n (`source "$HERE/lib/finalize-frontmatter.sh"`)
- [x] Schritt 7: den verstreuten Sed (`sed -E -i 's/^status: …/' "$PLAN_FILE"`)
      ENTFERNEN — inklusive der Zeile, nicht nur auskommentiert
- [x] Archiv-Subshell nach `git checkout -B "$ARCHIVE_BRANCH" origin/main`, VOR dem
      Resume-Zweig bzw. `openspec.sh archive`: `_apply_plan_frontmatter_completed "$ARCHIVE_DIR"`
- [x] Resume-Zweig (`ARCHIVE_RESUME=1`): Helper zusätzlich auf die verschobene Datei
      unter `openspec/changes/archive/` anwenden (Pfad über denselben
      Datumspräfix-Slug-Vergleich wie `_archive_state` auflösen)
- [x] Neues Argument `--frontmatter-state <slug>`: Parsen neben `--archive-state`,
      Offline-Guard-Ausnahme ergänzen (wie Zeile 90-Muster), Handler ruft
      `_plan_frontmatter_state "$SLUG" "$REPO_DIR"` und endet mit deren Exit-Code
- [x] Usage-Text um den neuen Modus ergänzen

## T4 — Grün fahren

- [x] `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-archive-frontmatter.bats`
      expected: PASS (5 von 5 grün)
- [x] Bestehende Finalize-Tests bleiben grün:
      `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-archive-state.bats tests/spec/agent-skills/post-merge-finalize-guards.bats tests/spec/agent-skills/finalize-hardening.bats`
- [x] `bash -n scripts/devflow-post-merge-finalize.sh scripts/lib/finalize-frontmatter.sh`

## Finale Verifikation

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
- [ ] `bash scripts/plan-lint.sh openspec/changes/archive-frontmatter-completed/tasks.md`
