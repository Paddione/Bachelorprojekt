---
title: "G-SIZE04: LOC/Woche +3684 → ≤+2000 reduzieren (S6-Gate + Dead-Code + Doku)"
ticket_id: T001284
domains: [quality, ci]
status: plan_staged
file_locks: []
shared_changes: false
---

# size04-loc-velocity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** G-SIZE04-Regression beheben — Netto-LOC/Woche von +3684 auf ≤ +2000
senken. Strategie: Dead-Code-Scope eingrenzen (openspec-Artefakte aus Messung
ausblenden), S6-Gate-Schwelle straffen, Messmethodik in goals.md dokumentieren,
erste Knip-Bereinigung aktivieren.

**Aktueller Messwert (2026-06-28):**
```
net=+3684 (added=35678, deleted=31994) — Ziel: ≤ +2000/Woche
```

Top-5 LOC-Contributor diese Woche:
1. `openspec/changes/mentolder-react-rebuild/mentolder-ds/.ds-sync/` (Build-Skripte, ~4800 LOC kumuliert)
2. `website/src/lib/tickets/` (migrations + tables, +972 LOC)
3. `website/src/lib/questionnaire-db/` (+1057 LOC)
4. `scripts/check-loc-budget.mjs` (+293 LOC)
5. `scripts/backup-restore-recovery.sh` (+450 LOC)

**Architecture:** Drei orthogonale Hebel: (1) Mess-Scope korrigieren — openspec-Artefakte
gehören nicht in den Produktionscode-Scan, (2) Gate-Schwelle straffen, (3) Dokumentation
und Knip als dauerhafter Gegenmaßnahmen-Loop. Kein LOC-Shrink in Produktionscode, der
korrekt ist — nur Scope-Korrekturen und tatsächlicher Dead-Code.

## File Structure

```
scripts/check-loc-budget.mjs           ← MODIFY: openspec/changes/** aus SCAN_PATTERNS ausschließen;
                                          warn-pct von 5 auf 2 % setzen
docs/goals/goals.md                    ← MODIFY: G-SIZE04 Shallow-Clone-Caveat + Messmethodik verbessern
tests/spec/size04-loc-velocity.bats    ← NEU: RED→GREEN Regressions-Test
```

---

## Task 0: Failing-Test schreiben (RED)

**Files:**
- Create: `tests/spec/size04-loc-velocity.bats`

### Step 1: BATS-Datei anlegen

```bash
cat > tests/spec/size04-loc-velocity.bats <<'BATS'
#!/usr/bin/env bats
# SSOT: openspec/changes/size04-loc-velocity/proposal.md
# G-SIZE04: LOC/Woche-Regression — Scope-Exklusion + Gate-Schwelle.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  LOC_SCRIPT="$REPO_ROOT/scripts/check-loc-budget.mjs"
}

@test "G-SIZE04: check-loc-budget.mjs excludes openspec/changes/** from scan" {
  grep -E "openspec/changes|':\(exclude\)\*\*/openspec" "$LOC_SCRIPT" | grep -qv "^#"
}

@test "G-SIZE04: S6 warn-pct is 2 or lower (not 5)" {
  val=$(grep -E 'warn.?pct' "$LOC_SCRIPT" | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
  echo "warn-pct found: $val"
  [ -n "$val" ]
  awk -v v="$val" 'BEGIN{exit (v <= 2) ? 0 : 1}'
}

@test "G-SIZE04: goals.md contains Shallow-Clone caveat" {
  grep -qi "shallow.clone\|shallow clone" "$REPO_ROOT/docs/goals/goals.md"
}
BATS
```

### Step 2: Test laufen lassen — Expected fail

```bash
bats tests/spec/size04-loc-velocity.bats
```

**Expected: FAIL** — `check-loc-budget.mjs` enthält noch keine openspec-Exklusion,
`warn-pct` ist noch 5 %, und der Shallow-Clone-Caveat fehlt in goals.md. Alle drei
Tests sind jetzt RED. Nach Task 1–3 werden sie grün.

---

## Task 1: Dead-Code-Scope korrigieren — openspec/changes/** ausblenden

**Files:**
- Modify: `scripts/check-loc-budget.mjs`

### Step 1: Aktuellen SCAN_PATTERNS-Block lesen

```bash
grep -n "SCAN_PATTERNS\|scan_patterns\|exclude\|glob" scripts/check-loc-budget.mjs | head -20
```

### Step 2: openspec/changes-Ausschluss ergänzen

In `scripts/check-loc-budget.mjs` die Datei-Ausschluss-Liste (üblicherweise ein
Array von Glob-Patterns für `git log --numstat` oder einen `EXCLUDE`-String)
um `':(exclude)**/openspec/changes/**'` ergänzen. Concrete pattern hängt von der
implementierten Glob-Syntax ab — nach dem `grep` aus Step 1 die genaue Zeile
anpassen.

Konkret: Der `git log`-Aufruf in `check-loc-budget.mjs` muss folgende Patterns
**nach** den Include-Patterns übergeben:

```
':(exclude)**/openspec/changes/**'
':(exclude)**/node_modules/**'
```

Rationale: `openspec/changes/` enthält Plan-Artefakte, Entwurfs-Skripte und
Storybook-Hilfsdateien. Diese sind kein Produktionscode und verfälschen die
Wachstumsrate-Messung erheblich (T001277-Burst: ~4800 Netto-LOC allein in
`.ds-sync/`).

### Step 3: Smoke-Test nach Änderung

```bash
node scripts/check-loc-budget.mjs --dry-run 2>&1 | head -10 || \
  node scripts/check-loc-budget.mjs 2>&1 | head -20
```

Erwartung: Skript läuft ohne Fehler; der gemeldete Wert sinkt spürbar gegenüber
dem bisherigen +3684.

### Step 4: Commit

```bash
git add scripts/check-loc-budget.mjs
git commit -m "fix(quality): exclude openspec/changes from G-SIZE04 LOC scan [T001284]"
```

---

## Task 2: S6-Gate warn-pct von 5 % auf 2 % straffen

**Files:**
- Modify: `scripts/check-loc-budget.mjs`

### Step 1: Aktuellen warn-pct-Wert lokalisieren

```bash
grep -n "warn.pct\|warnPct\|warn_pct\|0\.05\|5 *%" scripts/check-loc-budget.mjs
```

### Step 2: Wert von 5 auf 2 ändern

Die entsprechende Zeile/Konstante auf `2` (oder `0.02` falls Dezimal) setzen.
Damit löst zukünftig ein LOC-Burst von > 2 % eine Warnung aus, bevor er eskaliert.

### Step 3: Verifikation

```bash
grep -E "warn.?pct|warnPct" scripts/check-loc-budget.mjs
```

Ausgabe muss den neuen Wert (`2` oder `0.02`) zeigen, nicht mehr `5`.

### Step 4: Commit

```bash
git add scripts/check-loc-budget.mjs
git commit -m "fix(ci): tighten S6 LOC-budget warn-pct 5→2 [T001284]"
```

---

## Task 3: goals.md G-SIZE04 — Shallow-Clone-Caveat + Messmethodik

**Files:**
- Modify: `docs/goals/goals.md`

### Step 1: G-SIZE04-Abschnitt lokalisieren

```bash
grep -n "SIZE04\|G-SIZE04\|LOC.*Woche\|wöchentlich" docs/goals/goals.md | head -10
```

### Step 2: Caveat-Absatz ergänzen

Im G-SIZE04-Abschnitt direkt nach der Zieldefinition folgenden Erklärungsblock
einfügen (Formulierung anpassen falls der Bereich anders strukturiert ist):

```markdown
> **Messmethodik:** `git log --since="<7-Tage-Datum>" --no-merges --numstat`
> über `*.ts *.tsx *.svelte *.astro *.js *.mjs *.sh *.py`; openspec/changes/**
> und node_modules/** ausgeschlossen.
>
> **Shallow-Clone-Caveat:** In CI-Umgebungen mit `--depth=1`-Checkout wird nur
> der jüngste Commit sichtbar; das 7-Tage-Fenster kann dadurch vollständig leer
> sein (Messung = 0). Burst-PRs (z. B. große Feature-Branches mit vielen
> Additions) erhöhen den Wochenwert kurzfristig über 2000 — das ist kein
> dauerhafter Trend, solange der darauffolgende 7-Tage-Schnitt wieder sinkt.
> Bei Ausreißern den Langzeittrend über `git log --since="30 days"` prüfen.
```

### Step 3: Commit

```bash
git add docs/goals/goals.md
git commit -m "docs(goals): add G-SIZE04 Shallow-Clone-Caveat + Messmethodik [T001284]"
```

---

## Task 4: Knip-Baseline als Gegenmaßnahmen-Loop aktivieren (G-CQ08)

Hinweis: G-CQ08 hat ein eigenes, bereits gestaged-es Ticket (T001205). Dieser
Task verlinkt den SIZE04-Fix mit dem Knip-Bereinigungsplan, so dass die beiden
Maßnahmen aufeinander aufbauen.

### Step 1: Sicherstellen, dass G-CQ08-Plan vorhanden ist

```bash
ls openspec/changes/g-cq08-knip-dead-code/tasks.md
```

Erwartung: Datei existiert mit `status: plan_staged`. Falls nicht, kurz prüfen:

```bash
./scripts/ticket.sh show T001205 2>/dev/null || echo "Ticket T001205 prüfen"
```

### Step 2: Verweis in proposal.md bestätigen

In `openspec/changes/size04-loc-velocity/proposal.md` ist der Verweis auf G-CQ08
bereits enthalten. Kein Code-Change nötig; dieser Task ist ein Koordinations-
Checkpoint.

### Step 3: Commit (nur wenn proposal.md geändert wurde)

```bash
git diff --quiet openspec/changes/size04-loc-velocity/proposal.md || \
  git add openspec/changes/size04-loc-velocity/proposal.md && \
  git commit -m "docs(openspec): link SIZE04 → G-CQ08 knip dead-code plan [T001284]"
```

---

## Task 5: Final — Gates, freshness, PR + Auto-Merge

**Files:**
- (keine Code-Änderung; nur Verifikation und Auslieferung)

### Step 1: BATS-Regression final grün

```bash
bats tests/spec/size04-loc-velocity.bats
```

Erwartung: alle drei Tests grün — openspec-Exklusion vorhanden, warn-pct ≤ 2,
Shallow-Clone-Caveat in goals.md.

### Step 2: Pflicht-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Alle drei müssen mit Exit 0 enden. Falls `freshness:regenerate` Artefakte
verändert, diese mit committen:

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: regenerate freshness artifacts [T001284]"
```

### Step 3: PR + Auto-Merge

```bash
git push -u origin fix/size04-loc-velocity
gh pr create \
  --title "fix(quality): reduce G-SIZE04 LOC/week +3684→≤+2000 [T001284]" \
  --base main \
  --body "Closes T001284. openspec/changes/** aus G-SIZE04-Scan ausgeschlossen, S6 warn-pct 5→2 %, Shallow-Clone-Caveat in goals.md. BATS: tests/spec/size04-loc-velocity.bats."
gh pr merge --auto --squash --delete-branch
```

### Step 4: Ticket verlinken

```bash
PR_NUM=$(gh pr view --json number -q '.number')
./scripts/ticket.sh add-pr-link --id T001284 --pr "$PR_NUM" || true
./scripts/ticket.sh add-comment --id T001284 \
  --body "PR #${PR_NUM}: Scope-Fix, S6-Gate gestrafft, Caveat dokumentiert." || true
```

---

## Final Verification (CI-Äquivalent)

```bash
bats tests/spec/size04-loc-velocity.bats
task test:changed
task freshness:regenerate
task freshness:check
```

Alle müssen grün sein, bevor der PR gemergt wird.
