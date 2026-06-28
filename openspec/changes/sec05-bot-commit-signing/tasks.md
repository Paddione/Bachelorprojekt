---
title: "G-SEC05: adjusted metric for unsigned bot commits"
ticket_id: T001283
domains: [quality, security, ci]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sec05-bot-commit-signing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** G-SEC05-Metrik in `health-goals-check.sh` und `goals.md` auf adjusted metric umstellen (Bot-Commits ausschließen), BATS-Gate hinzufügen.

**Architecture:** `scripts/health-goals-check.sh` ersetzt die G-SEC05-Zeile durch einen zweistufigen `git log`-Aufruf, der Commits mit `%ae` = `41898282+github-actions[bot]@users.noreply.github.com` herausfiltert. `goals.md` erhält den aktualisierten Mess-Befehl. `tests/spec/commit-signing.bats` prüft die adjusted metric offline (liest aus `git log` des lokalen Repos, kein Cluster nötig).

**Tech Stack:** bash, git, BATS.

## Global Constraints

- Worktree: `/tmp/wt-sec05` — alle Befehle laufen dort
- Kein Cluster-Zugriff erforderlich — alle Änderungen sind offline-testbar
- BATS-Datei unter `tests/spec/commit-signing.bats` (Convention: eine Datei pro OpenSpec-SSOT-Spec)
- Nach jeder Dateiänderung sofort `bash scripts/health-goals-check.sh --fast` ausführen

## File Structure

```
scripts/health-goals-check.sh           ← MODIFY (G-SEC05-Zeile, ~Zeile 108)
.claude/lib/goals.md                    ← MODIFY (G-SEC05-Abschnitt, ~Zeile 590-600)
tests/spec/commit-signing.bats          ← NEU (BATS-Gate)
```

---

## Task 0: Failing-Test schreiben (RED) — adjusted-metric Lücke nachweisen

**Files:**
- Create: `tests/spec/commit-signing.bats` (nur der Gate-Test, noch ohne angepasste Metrik)

### Step 1: BATS-Datei anlegen

```bash
cat > /tmp/wt-sec05/tests/spec/commit-signing.bats <<'BATS'
#!/usr/bin/env bats
# tests/spec/commit-signing.bats
# SSOT: openspec/changes/sec05-bot-commit-signing/proposal.md
# G-SEC05: adjusted metric — Bot-Commits (github-actions[bot]) von unsigned-Zählung ausschliessen

load 'test_helper'

BOT_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"

@test "G-SEC05: adjusted unsigned-Anteil auf main (ohne Bot) ist <= 5%" {
  # Holt letzte 50 Commits mit Autor-Email und GPG-Status
  unsigned=$(git -C "$PROJECT_DIR" log -50 --pretty="%G? %ae" origin/main 2>/dev/null \
    | grep -v "$BOT_EMAIL" \
    | awk '{print $1}' \
    | grep -c N || true)
  total=$(git -C "$PROJECT_DIR" log -50 --pretty="%G? %ae" origin/main 2>/dev/null \
    | grep -v "$BOT_EMAIL" \
    | wc -l | tr -d ' ')
  if [ "$total" -eq 0 ]; then
    skip "keine non-bot Commits in den letzten 50 gefunden"
  fi
  threshold=$(( total * 5 / 100 ))
  [ "$unsigned" -le "$threshold" ]
}

@test "G-SEC05: health-goals-check.sh verwendet adjusted metric (kein raw grep -c N)" {
  # Prueft, dass die G-SEC05-Zeile in health-goals-check.sh den Bot ausschliesst
  run grep "G-SEC05" "$PROJECT_DIR/scripts/health-goals-check.sh"
  assert_success
  # Muss github-actions[bot] oder %ae-Filter enthalten
  [[ "$output" == *"github-actions"* ]] || [[ "$output" == *"%ae"* ]]
}
BATS
```

### Step 2: Test laufen lassen — Expected fail

```bash
cd /tmp/wt-sec05
bats tests/spec/commit-signing.bats
```

**Expected:** `G-SEC05: health-goals-check.sh verwendet adjusted metric` schlägt fehl, weil `health-goals-check.sh` noch den rohen `grep -c N` nutzt.

```
expected: FAIL
```

---

## Task 1: `scripts/health-goals-check.sh` — adjusted metric

**Files:**
- Modify: `scripts/health-goals-check.sh` (Zeile ~108, G-SEC05-Zeile)

### Step 1: Aktuelle G-SEC05-Zeile prüfen

```bash
grep -n "G-SEC05" /tmp/wt-sec05/scripts/health-goals-check.sh
```

### Step 2: Zeile ersetzen

Die aktuelle Zeile lautet:

```bash
row target G-SEC05 "$(git log -50 --pretty='%G?' main 2>/dev/null | grep -c N)" le 9 "unsignierte Commits (letzte 50; Zielpfad 0)"
```

Ersetzen durch (adjusted: Bot-Commits ausschliessen):

```bash
row target G-SEC05 "$(git log -50 --pretty='%G? %ae' main 2>/dev/null | grep -v '41898282+github-actions\[bot\]@users.noreply.github.com' | awk '{print $1}' | grep -c N || echo 0)" le 2 "unsignierte Commits (letzte 50; adjusted: ohne freshness-Bot)"
```

Verwende dazu `sed -i` oder den Edit-Tool-Workflow.

### Step 3: Verifikation

```bash
cd /tmp/wt-sec05
bash scripts/health-goals-check.sh --fast 2>&1 | grep G-SEC05
```

Erwartung: G-SEC05 zeigt `0` unsigned und ist grün.

### Step 4: Commit

```bash
cd /tmp/wt-sec05
git add scripts/health-goals-check.sh
git commit -m "fix(goals): G-SEC05 adjusted metric — exclude github-actions[bot] commits [T001283]"
```

---

## Task 2: `.claude/lib/goals.md` — G-SEC05-Abschnitt aktualisieren

**Files:**
- Modify: `.claude/lib/goals.md` (G-SEC05-Abschnitt, Zeilen ~590-600)

### Step 1: Abschnitt lokalisieren

```bash
grep -n "G-SEC05" /tmp/wt-sec05/.claude/lib/goals.md
```

### Step 2: Mess-Befehl und Beschreibung ersetzen

Den Code-Block ersetzen durch:

```bash
# adjusted: Bot-Commits (freshness-regen) aus unsigned-Zaehlung ausschliessen
git log -50 --pretty='%G? %ae' main \
  | grep -v '41898282+github-actions\[bot\]@users.noreply.github.com' \
  | awk '{print $1}' \
  | grep -c N
```

Den Erklärungstext ergänzen: `github-actions[bot]`-Commits (von `freshness-regen.yml`) können strukturell nicht GPG-signiert werden und werden aus der Zählung ausgeschlossen. Rohe Messung: 33/50 (66 %) — adjusted: 0/50 (0 %).

Die Priorität-Zeile aktualisieren auf: `**Priorität:** C · **Baseline:** 0/50 adjusted (0 %; TARGET ERREICHT) · ...`

### Step 3: Commit

```bash
cd /tmp/wt-sec05
git add .claude/lib/goals.md
git commit -m "docs(goals): G-SEC05 adjusted-metric Erlaeuterung — Bot-Commits ausschliessen [T001283]"
```

---

## Task 3: BATS-Gate grün machen und verifizieren

### Step 1: BATS-Test laufen lassen

```bash
cd /tmp/wt-sec05
bats tests/spec/commit-signing.bats
```

Erwartung: beide Tests grün (oder skipped wenn kein `origin/main` erreichbar).

### Step 2: health-goals-check.sh vollständig

```bash
cd /tmp/wt-sec05
bash scripts/health-goals-check.sh --fast
```

Alle Gate-Ziele müssen grün sein — kein roter G-SEC05-Eintrag.

### Step 3: test-inventory.json regenerieren

```bash
cd /tmp/wt-sec05
task test:inventory
git diff website/src/data/test-inventory.json | head -20
git add website/src/data/test-inventory.json
git diff --cached --quiet || git commit -m "chore(tests): regenerate test-inventory after commit-signing BATS [T001283]"
```

### Step 4: Commit der BATS-Datei

```bash
cd /tmp/wt-sec05
git add tests/spec/commit-signing.bats
git commit -m "test(security): BATS gate fuer G-SEC05 adjusted unsigned-metric [T001283]"
```

---

## Task 4: Quality-Gates, PR, Merge

### Step 1: Finale Verifikation

```bash
cd /tmp/wt-sec05
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```

### Step 2: PR erstellen

```bash
cd /tmp/wt-sec05
gh pr create \
  --title "fix(goals): G-SEC05 adjusted metric — exclude github-actions[bot] unsigned commits [T001283]" \
  --base main \
  --body "Closes T001283. Fixes false-positive G-SEC05 regression (33/50=66% raw → 0/50 adjusted). Bot-Commits von freshness-regen nicht signierbar; adjusted metric schließt sie aus. Adds BATS gate tests/spec/commit-signing.bats."
gh pr merge --auto --squash --delete-branch
```

### Step 3: Ticket abschließen

```bash
PR_NUM=$(gh pr view --json number -q '.number')
cd /tmp/wt-sec05
./scripts/ticket.sh add-pr-link --id T001283 --pr "$PR_NUM"
./scripts/ticket.sh add-comment --id T001283 --body "PR #${PR_NUM} submitted. G-SEC05 adjusted: 0/50 unsigned. BATS gate gruen."
```

---

## Final Verification

```bash
cd /tmp/wt-sec05
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
bats tests/spec/commit-signing.bats
bash scripts/health-goals-check.sh --fast 2>&1 | grep -E "G-SEC05|Gate"
```

Alle Ausgaben müssen grün sein, bevor der PR erstellt wird.
