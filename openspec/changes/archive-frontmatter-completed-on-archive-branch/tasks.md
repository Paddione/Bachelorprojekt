---
title: "archive-frontmatter-completed-on-archive-branch — Implementation Plan"
ticket_id: T015916
domains: [scripts, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# archive-frontmatter-completed-on-archive-branch — Implementation Plan

_Ticket: T015916 · Design-Entscheidungen: design.md (D1–D3) · Altlasten separat über T015920_

## File Structure

```
scripts/devflow-post-merge-finalize.sh        # modify — Frontmatter-sed + ticket.sh archive-plan aus Schritt 7 in die Archiv-Sektion verschieben (nach checkout -B, vor openspec.sh archive); DB-freies Unterkommando --apply-completed-frontmatter ergänzen
tests/spec/agent-skills/finalize-archive-frontmatter.bats  # new — Seam-Tests + Source-Grep-Wächter (S1-exempt)
```

Budgets (S1): `scripts/devflow-post-merge-finalize.sh` Ist 776 · nicht gebaselined · wirksame Schwelle 800 (`.sh`) → **Budget 24 Zeilen** — Verschiebung netto neutral/negativ halten. Neue BATS-Datei S1-exempt (`tests/**/*.bats`, gates.yaml ignore).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Neue Datei `tests/spec/agent-skills/finalize-archive-frontmatter.bats` anlegen (Fixture-Repo-Muster aus `finalize-archive-state.bats`: bare Remote + Klon, kein Netz/DB). Drei Tests:
      1. Seam-Test: `run bash "$FINALIZE" --apply-completed-frontmatter "$FIX/openspec/changes/demo-change/tasks.md"` auf einer Fixture mit `status: active` → Exit 0 und Datei trägt `status: completed`.
      2. Idempotenz: bereits `completed` bleibt byteidentisch; ein Wert wie `status: draft` wird nicht angetastet.
      3. Source-Grep-Wächter (dokumentierte Source-Grep-Ausnahme, Präzedenz `post-merge-finalize-guards.bats`): der `status:`-sed-Aufruf liegt im Quelltext NACH der `git checkout -B "$ARCHIVE_BRANCH"`-Zeile, und es gibt keinen Frontmatter-sed außerhalb der Archiv-Sektion.
      Der Test muss gegen den aktuellen Stand rot sein. Run:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-archive-frontmatter.bats
# expected: FAIL (red — Unterkommando existiert nicht, sed steht noch in Schritt 7 vor der Archiv-Sektion)
```

- [ ] **Fix-Step (GREEN).** Umsetzung in `scripts/devflow-post-merge-finalize.sh` gemäß design.md D1/D2:
      1. Neues Unterkommando `--apply-completed-frontmatter <plan-file>` kapselt exakt die heutige sed-Transition (`sed -E -i 's/^status: (active|plan_staged|in_progress|planning)$/status: completed/'`) inklusive Usage-/Offline-Konventionen des Skripts.
      2. Den kompletten Block aus Schritt 7 (Guards: PLAN_FILE-Leerprüfung, Branch-Commit-Fallback T004269/T013315-F2, `ticket.sh archive-plan`-Aufruf samt Fehlerpfaden) unverändert in die Archiv-Sektion verschieben — direkt nach `git checkout -B "$ARCHIVE_BRANCH" origin/main` (aktuell Zeile 575) und VOR dem Resume-Zweig/`openspec.sh archive`-Aufruf; der sed-Ersatz ruft das neue Unterkommando auf.
      3. Alten Schritt-7-Block entfernen; Kommentar dokumentiert den Umzug mit Ticket-Referenz T015916.
      4. Skip-Pfad („bereits archiviert") prüfen: damit die DB-Nachpersistierung eines halbfertigen Vorlaufs erreichbar bleibt, läuft der verschobene archive-plan-Aufruf auch dann, wenn `_archive_already_done` nur die Archiv-Sektion überspringt — Semantik laut design.md D2, kein neues Verhalten erfinden.
      Danach derselbe BATS-Lauf wie oben grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-archive-frontmatter.bats
# expected: PASS (green)
```

- [ ] **Regressionssicherung.** Bestehende Finalizer-Specs müssen grün bleiben (Skip/Resume/Restore-Semantik unangetastet):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
