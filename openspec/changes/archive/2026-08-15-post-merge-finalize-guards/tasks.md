---
title: post-merge-finalize-guards — Merge-Status-Guard, Archiv-Idempotenz, cwd-Unabhängigkeit — Implementation Plan
ticket_id: T006348
domains: [devflow, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# post-merge-finalize-guards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die drei Review-Befunde aus PR #4539 (T006284, gemergt 1cab10192) an `scripts/devflow-post-merge-finalize.sh` schließen — (1) Merge-Status-Guard im `--pr`-Pfad (Closure nur für MERGED-PRs, T001149-M1), (2) Idempotenz-Lücke Schritt 8 (Archiv-Skip bei bereits existierendem Archiv-Branch + Branch-Restore des geteilten Arbeitsbaums), (3) cwd-Unabhängigkeit (`cd "$REPO_DIR"` zu Skriptbeginn, `--repo "$REPO_DIR"` im Reaper-Aufruf).

**Architecture:** Drei lokalisierte Eingriffe in das bestehende idempotente Finalize-Skript — keine neuen Skripte, keine neuen Abhängigkeiten:
1. **Merge-Status-Guard:** Nach der PR-Bestimmung (Schritt 3) prüft das Skript den PR-State per `gh pr view "$PR_NUM" --json state -q .state`; nur `MERGED` behält die PR-Nummer, sonst wird `PR_NUM` geleert und `mark_skip` ausgegeben (fail-safe: nicht erreichbares `gh` ⇒ kein Closure). Der bestehende Closure-Block (Schritte 4–6) bleibt unverändert und läuft damit auch im `--pr`-Pfad nur für bestätigt gemergte PRs.
2. **Archiv-Idempotenz + Branch-Restore:** `ARCHIVE_BRANCH` wird vor die Archiv-Sektion gehoben; existiert der Branch bereits auf origin (`git ls-remote --exit-code`), überspringt das Skript die Sektion idempotent. Zusätzlich merkt sich das Skript den vor dem `git checkout -B` aktiven Branch (`ARCHIVE_PREV_BRANCH`) und schaltet nach Push/PR-Erstellung zurück — der geteilte Arbeitsbaum (Haupt-Checkout oder Worktree paralleler Sessions) bleibt auf seinem Branch.
3. **cwd-Unabhängigkeit:** `cd "$REPO_DIR"` direkt nach den Usage-/Env-Prüfungen (vor Schritt 1) macht die relative Plan-Pfad-Prüfung (`[[ -s "$PLAN_FILE" ]]`) und den Reaper-Default-cwd korrekt; der `branch-reaper.sh`-Aufruf erhält zusätzlich explizit `--repo "$REPO_DIR"`.

**Tech Stack:** Bash (Bestandsskript, keine neuen Abhängigkeiten), `gh` (bereits genutzt), `git ls-remote`/`git checkout -C` (bereits genutzte Git-Operationen).

**Spec:** `openspec/changes/post-merge-finalize-guards/design.md` (Root-Cause-Verifikation mit Zeilen-Evidenz) und Delta-Spec `openspec/changes/post-merge-finalize-guards/specs/agent-skills.md` (MODIFIED: bestehende Requirement „Post-Merge-Finalisierung als idempotente Skript-Einheit" wird um die drei Schärfungen expliziert).

## Global Constraints

- `scripts/devflow-post-merge-finalize.sh` (Ist 294 Zeilen, nicht-baselined, `.sh`-Limit 800 → **S1-Budget 506**; der Fix addiert ca. 25 Zeilen — weit unter der wirksamen Schwelle).
- `tests/spec/agent-skills/post-merge-finalize-guards.bats` (neu, 95 Zeilen): `.bats` hat kein S1-Limit (`gates.yaml` → `s1.limits` kennt nur .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash) und ist nicht gebaselinet — kein S1-Budget.
- `openspec/changes/post-merge-finalize-guards/specs/agent-skills.md` (neu, 40 Zeilen): kein S1-Limit (keine gelistete Extension) — kein S1-Budget.
- Kein neuer Vitest-Test nötig: keine `.ts`/`.svelte`-Änderung — `<!-- vitest: kein neuer Test nötig, weil keine website/src-Änderung -->`.
- S4: keine neuen Skripte/Manifeste — das geänderte Skript ist bereits über den BATS-Guard und die Skill-Referenz erreichbar (kein Orphan-Risiko).
- S3: keine Brand-Domains in Code-Snippets (Skript arbeitet brand-agnostisch über `BRAND`/`TICKET_CTX`-Env).
- Rotphase ist bereits angelegt: `tests/spec/agent-skills/post-merge-finalize-guards.bats` schlägt am aktuellen Stand fehl (5/8 rot — die fünf Guard-Assertions; die drei Anker sind grün).
- Der Stage-Commit enthält NUR Test + Plan-Artefakte (chore(plans):), KEINEN Production-Code (Commit-Titel-Konvention, T001434/Guard `check-commit-vs-diff.sh`).

## File Structure

```
scripts/devflow-post-merge-finalize.sh                          # MODIFY: Guard (Befund 1), Archiv-Skip + Branch-Restore (Befund 2), cd + --repo (Befund 3) — Ist 294, Budget 506
tests/spec/agent-skills/post-merge-finalize-guards.bats         # EXISTS: failing Test (rot, liegt bereits im Arbeitsbaum) — 95 Zeilen
openspec/changes/post-merge-finalize-guards/specs/agent-skills.md  # EXISTS: Delta-Spec (MODIFIED Requirements)
openspec/changes/post-merge-finalize-guards/design.md           # EXISTS: Brainstorming/Root-Cause (vorhanden)
openspec/changes/post-merge-finalize-guards/proposal.md         # EXISTS: Proposal (vorhanden)
website/src/data/test-inventory.json                            # REGENERATE: task test:inventory (neuer Test)
```

---

### Task 1: Roten Zustand reproduzieren

**Files:**
- Test: `tests/spec/agent-skills/post-merge-finalize-guards.bats` (existiert, rot)

**Interfaces:**
- Produces: dokumentierter RED-Lauf (5/8 rot, drei Anker grün) als Task-Ergebnis.

**Steps:**
- [ ] Testrunner auf die neue Testdatei ausführen:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats
  ```
- [ ] Erwartetes Ergebnis prüfen und im Task-Ergebnis festhalten: `expected: FAIL` — genau die fünf Implementierungs-Guards sind rot (gh pr view, --json state, ls-remote --exit-code, ARCHIVE_PREV_BRANCH, cd "$REPO_DIR", --repo "$REPO_DIR"), die drei Positiv-Anker (Auto-Pfad --state merged, Archiv-Branch-Ref, branch-reaper-Aufruf) sind grün.
- [ ] Kein Fix in diesem Task — nur Reproduktion und Dokumentation.

### Task 2: Merge-Status-Guard im --pr-Pfad (Befund 1)

**Files:**
- Modify: `scripts/devflow-post-merge-finalize.sh` — S1: Ist 294 · nicht-baselined · `.sh`-Limit 800 → **Budget 506**

**Interfaces:**
- Consumes: `gh pr view "$PR_NUM" --json state -q .state` (Exit-Code wird bewusst nicht ausgewertet — `|| true`, fail-safe).
- Produces: `PR_NUM` bleibt nur bei `MERGED` gesetzt; sonst leer + `mark_skip`-Meldung (analog Auto-Pfad, Z. 132) → der Closure-Block (Z. 135–167, Schritte 4–6) läuft nicht.

**Steps:**
- [ ] Den Schritt-3-Block (Z. 129–133) so umbauen, dass nach der PR-Bestimmung (Auto- oder `--pr`-Pfad) der State geprüft wird:
  ```bash
  if [[ -n "$PR_NUM" ]]; then
    PR_STATE="$(gh pr view "$PR_NUM" --json state -q .state 2>/dev/null || true)"
    if [[ "$PR_STATE" == "MERGED" ]]; then
      mark_ok "Schritt 3: PR #$PR_NUM (merged)"
    else
      mark_skip "Schritt 3: PR #$PR_NUM ist ${PR_STATE:-unbekannt} — Closure-Schritte laufen nicht (T001149-M1)"
      PR_NUM=""
    fi
  else
    mark_skip "Schritt 3: kein merged PR auf $BRANCH gefunden — Closure-Schritte laufen nicht (T001149-M1)"
  fi
  ```
  Dabei die bisherige `mark_ok "Schritt 3: PR #$PR_NUM (merged)"`-Zeile (Z. 130) in den `MERGED`-Zweig übernehmen (kein Doppel-`[ok]`).
- [ ] Verhalten prüfen: `gh pr view` mit State `OPEN`/`CLOSED`/leer (gh nicht erreichbar) ⇒ `PR_NUM=""` und `mark_skip`; Schritt 4–6 werden übersprungen; Schritt 7 hängt `--pr` nur noch an, wenn `PR_NUM` nicht leer ist (bestehende Bedingung Z. 178 — unverändert korrekt).
- [ ] Kein Fix am Closure-Block selbst — nur der Guard davor (Minimal-Diff).

### Task 3: Archiv-Idempotenz + Branch-Restore (Befund 2)

**Files:**
- Modify: `scripts/devflow-post-merge-finalize.sh` — S1: Budget 506 (Gesamtbudget des Tasks 2–4, ca. 25 Zeilen)

**Interfaces:**
- Consumes: `git ls-remote --exit-code origin "refs/heads/$ARCHIVE_BRANCH"` (Skip-Prüfung), `git -C "$ARCHIVE_DIR" rev-parse --abbrev-ref HEAD` (Branch merken), `git -C "$ARCHIVE_DIR" checkout "$ARCHIVE_PREV_BRANCH"` (Restore).
- Produces: zweiter Lauf überspringt die Archiv-Sektion idempotent; der geteilte Arbeitsbaum bleibt nach der Sektion auf seinem vorherigen Branch.

**Steps:**
- [ ] Die Definition von `ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}-${TICKET_ID}"` (Z. 216) **vor** die Archiv-Sektion heben (in den `if [[ -n "${ARCHIVE_DIR:-}" ]]`-Block, direkt nach dem Resolver Z. 195–201) und die Definition in der Subshell entfernen (Subshell erbt die Variable).
- [ ] Idempotenz-Skip direkt nach dem Heben einfügen:
  ```bash
  if git ls-remote --exit-code origin "refs/heads/$ARCHIVE_BRANCH" >/dev/null 2>&1; then
    mark_skip "Schritt 8: Archiv-Branch $ARCHIVE_BRANCH existiert bereits — Archivierung bereits ausgefuehrt (idempotent)"
    ARCHIVE_DIR=""
  fi
  ```
  Der nachfolgende `if [[ -n "${ARCHIVE_DIR:-}" ]]` (Z. 203) überspringt dann die komplette Sektion inklusive Commit/checkout/push/PR. `git ls-remote` ohne Netz → `--exit-code` mit `|| true`-Semantik über das `if` (Sektion läuft, Fehlerbild bleibt wie heute).
- [ ] Branch-Restore: in der Subshell vor `git checkout -B "$ARCHIVE_BRANCH" origin/main` (Z. 218) den aktiven Branch merken:
  ```bash
  ARCHIVE_PREV_BRANCH="$(git -C "$ARCHIVE_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  ```
  und nach `gh pr merge --auto --squash --delete-branch "$ARCHIVE_PR_URL"` (Z. 232) restaurieren:
  ```bash
  if [[ -n "$ARCHIVE_PREV_BRANCH" ]]; then
    git -C "$ARCHIVE_DIR" checkout "$ARCHIVE_PREV_BRANCH" >/dev/null 2>&1 || true
  fi
  ```
- [ ] Randfälle bedenken: detachierter HEAD liefert "HEAD" — `checkout HEAD` ist dann ein No-Op-Fehler, durch `|| true` geschluckt; Restore-Fehler brechen das Skript nicht (Best-effort, wie der Rest der Sektion).

### Task 4: cwd-Unabhängigkeit (Befund 3)

**Files:**
- Modify: `scripts/devflow-post-merge-finalize.sh` — S1: Budget 506 (Gesamtbudget der Tasks 2–4)

**Interfaces:**
- Produces: relative Zugriffe (`[[ -s "$PLAN_FILE" ]]`, branch-reaper-Default-cwd) korrekt bei beliebigem Aufruf-cwd.

**Steps:**
- [ ] Direkt nach dem `TICKET_OFFLINE`-Guard (Z. 73–76), vor Schritt 1, einfügen:
  ```bash
  cd "$REPO_DIR"
  ```
  (Die Env-Override `REPO_DIR` aus Z. 35 wird respektiert; die Schritt-8-Subshell wechselt weiterhin selbst in `ARCHIVE_DIR`.)
- [ ] Den branch-reaper-Aufruf (Z. 286) um das explizite Repo-Flag ergänzen:
  ```bash
  bash "$REPO_DIR/scripts/branch-reaper.sh" --ticket "$TICKET_ID" --repo "$REPO_DIR"
  ```
  (Defense-in-Depth: `branch-reaper.sh` nimmt `--repo` als Pflichtparameter-Target, Default wäre `$PWD`.)

### Task 5: Delta-Spec und Plan-Artefakte verifizieren

**Files:**
- Exists: `openspec/changes/post-merge-finalize-guards/specs/agent-skills.md` (MODIFIED Requirements mit Before/After-Tabelle + 2 neue Scenarios)
- Exists: `openspec/changes/post-merge-finalize-guards/proposal.md`, `design.md`

**Interfaces:**
- Produces: validierter OpenSpec-Change (Status `plan_staged` nach stage-plan).

**Steps:**
- [ ] Delta-Spec auf Vollständigkeit prüfen: MODIFIED-Block trägt die drei Schärfungen (MERGED-Guard, Archiv-Skip, cwd) als Before/After und die zwei neuen Scenarios („Closure nur für gemergte PRs", „Zweiter Lauf überspringt Schritt 8").
- [ ] `bash scripts/openspec.sh validate` ausführen — muss Exit 0 liefern.
- [ ] `bash scripts/plan-lint.sh openspec/changes/post-merge-finalize-guards/tasks.md` ausführen — muss PASS (Exit 0) liefern.

### Task 6: Finale Verifikation (GREEN)

**Files:**
- Verify: `scripts/devflow-post-merge-finalize.sh`, `tests/spec/agent-skills/post-merge-finalize-guards.bats`, `website/src/data/test-inventory.json` (regeneriert)

**Interfaces:**
- Produces: alle fünf Guard-Tests grün, Anker weiterhin grün, Freshness-Artefakte aktuell.

**Steps:**
- [ ] Die fünf Guards gegengrünen: BATS-Lauf auf die Testdatei — alle 8 Tests grün:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats
  ```
- [ ] Bestehende Aufrufvertrag-Tests unversehrt (Regression): `tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills*`
- [ ] Test-Inventar regenerieren (neuer BATS-Test; CI failt sonst):
  ```bash
  task test:inventory
  git add website/src/data/test-inventory.json
  ```
- [ ] Mandatory Verify-Commands:
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
- [ ] Abschluss: alle Änderungen committen (eigener Implementierungs-Commit mit `fix(scripts):`-Präfix — NICHT im Stage-Commit dieses Plans), PR eröffnen und den Merge-Wait einleiten.
