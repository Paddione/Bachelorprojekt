---
title: "G-CQ08: Dead-Code/unused exports in website/src via knip messen + −50%"
ticket_id: T001205
domains: [cq, dead-code, website, build]
status: plan_staged
file_locks: []
shared_changes: false
---

# Tasks: g-cq08-knip-dead-code (T001205)

- [ ] Task 0: Failing-Test schreiben — BATS `tests/spec/g-cq08-knip-dead-code.bats` (RED)
- [ ] Task 1: knip installieren + `website/knip.json` konfigurieren
- [ ] Task 2: Baseline messen — unused exports/files erfassen + `knip-baseline.json` schreiben
- [ ] Task 3: 50 % der Findings entfernen (unused exports zuerst, dann unused files)
- [ ] Task 4: Advisory-knip-Schritt in CI ergänzen (warn, nicht fail)
- [ ] Task 5: Final — alle Gates, freshness, PR + Auto-Merge

---

# G-CQ08 — Knip Dead-Code Measurement & −50% Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Dead Code (unused exports + unused files) in `website/src` mit
[knip](https://knip.dev) messen, eine reproduzierbare Baseline festhalten und
**50 %** der gefundenen Items entfernen. Der CI-Check bleibt **advisory**
(warn, nie fail), solange die zweite Hälfte in Folge-Tickets abgebaut wird.

**Architecture:** Vier Hebel in Reihenfolge: (1) knip als Mess-Werkzeug
installieren + konfigurieren, (2) Baseline messen und als JSON persistieren,
(3) die sicherste Tranche zuerst entfernen — unused exports in nicht-öffentlichen
`src/lib`-Modulen, danach echte unused files —, (4) advisory CI-Gate. Da wir Dead
Code **entfernen**, schrumpfen (shrink) die betroffenen Dateien — S1-Line-Budgets
werden dadurch nur besser, nie schlechter. Es werden keine Dateien aufgeteilt.

**Tech Stack:** Node.js ≥ 22, pnpm (website nutzt `pnpm-lock.yaml`), knip 5.x,
Astro 6, Svelte 5, TypeScript 6, BATS, `jq`.

## Global Constraints

- **Scope ist `website/src/`** — unused exports + unused files. Unused
  *dependencies* sind **nicht** Teil dieses Tickets.
- **Tests sind Verbraucher.** knip muss seinen vitest-Plugin nutzen, damit
  `*.test.ts` als Entry zählen — sonst werden test-only Exports fälschlich als
  unused gemeldet und ihr Entfernen bricht die Tests. test-Dateien NICHT aus dem
  Projekt-Graph ausschließen.
- **Generierte Dateien ausschließen** (`src/**/*.generated.*`) — die werden vom
  freshness-Generator erzeugt und sind kein Handarbeits-Dead-Code.
- **Nur sicher entfernbares anfassen.** Vor jedem Entfernen per `grep` bestätigen,
  dass das Symbol/die Datei wirklich keinen Importeur hat (knip-Fund verifizieren).
  Keine öffentlichen API-Routen, keine Astro-Pages, keine Svelte-Komponenten
  entfernen, die per String/Glob geladen werden.
- **Ziel:** `unused_before − unused_after ≥ ceil(unused_before / 2)`.
- Code-Änderungen müssen `task test:changed` und `pnpm exec astro check` bestehen.
- Der CI-knip-Schritt ist **advisory** (`continue-on-error: true` + `--no-exit-code`).

## File Structure

```
website/knip.json                                ← NEU: knip config (Astro/Svelte/vitest entry graph)
website/package.json                             ← MODIFY: knip devDependency + "knip" script
docs/code-quality/knip-baseline.json             ← NEU: unused_before / unused_after record
.github/workflows/ci.yml                         ← MODIFY: advisory knip step (continue-on-error)
tests/spec/g-cq08-knip-dead-code.bats            ← NEU: RED→GREEN regression
website/src/lib/*.ts (+ src/**)                  ← MODIFY/DELETE: remove ~50% unused exports/files
```

---

## Task 0: Failing-Test schreiben (RED)

**Files:**
- Create: `tests/spec/g-cq08-knip-dead-code.bats`

### Step 1: BATS-Datei anlegen

```bash
cat > /tmp/wt-knip-dead-code/tests/spec/g-cq08-knip-dead-code.bats <<'BATS'
#!/usr/bin/env bats
# SSOT: openspec/changes/g-cq08-knip-dead-code/proposal.md
# G-CQ08: knip konfiguriert für website + Dead-Code (unused exports/files) −50%.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  BASELINE="$REPO_ROOT/docs/code-quality/knip-baseline.json"
}

@test "G-CQ08: knip.json config exists for website" {
  [ -f "$REPO_ROOT/website/knip.json" ]
}

@test "G-CQ08: knip is a website devDependency" {
  jq -e '.devDependencies.knip // .dependencies.knip' \
    "$REPO_ROOT/website/package.json" >/dev/null
}

@test "G-CQ08: dead-code baseline recorded (before + after)" {
  [ -f "$BASELINE" ]
  jq -e '(.unused_before|type=="number") and (.unused_after|type=="number")' \
    "$BASELINE" >/dev/null
}

@test "G-CQ08: dead-code reduced by >= 50% vs baseline" {
  before=$(jq -r '.unused_before' "$BASELINE")
  after=$(jq -r '.unused_after' "$BASELINE")
  removed=$(( before - after ))
  half=$(( (before + 1) / 2 ))   # ceil(before/2)
  echo "before=$before after=$after removed=$removed need>=$half"
  [ "$removed" -ge "$half" ]
}
BATS
```

### Step 2: Test laufen lassen — Expected fail

```bash
cd /tmp/wt-knip-dead-code
bats tests/spec/g-cq08-knip-dead-code.bats
```

**Expected fail:** Alle vier Tests sind RED — `website/knip.json` fehlt, knip ist
keine devDependency und `docs/code-quality/knip-baseline.json` existiert noch
nicht. Erst nach Task 1–3 werden alle grün.

---

## Task 1: knip installieren + konfigurieren

**Files:**
- Modify: `website/package.json` (devDependency + Script)
- Create: `website/knip.json`

### Step 1: knip als devDependency installieren

```bash
cd /tmp/wt-knip-dead-code/website
pnpm add -D knip@^5
```

Erwartung: `knip` erscheint unter `devDependencies` in `package.json`, und
`pnpm-lock.yaml` wird aktualisiert.

### Step 2: knip-Script ergänzen

In `website/package.json` unter `"scripts"` ergänzen:

```json
"knip": "knip"
```

### Step 3: `website/knip.json` schreiben

```bash
cat > /tmp/wt-knip-dead-code/website/knip.json <<'JSON'
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "src/pages/**/*.{astro,ts,js}",
    "src/middleware.{ts,js}",
    "src/content/config.ts",
    "astro.config.{mjs,ts,js}"
  ],
  "project": [
    "src/**/*.{ts,tsx,js,mjs,svelte,astro}"
  ],
  "ignore": [
    "src/**/*.generated.*"
  ]
}
JSON
```

> knip erkennt die Plugins für `astro`, `svelte` und `vitest` automatisch anhand
> der `package.json`-Dependencies. Die `entry`-Globs verankern den Astro-Page-Graph
> als Wurzel; `*.test.ts` zählen über das vitest-Plugin als Entry und werden daher
> NICHT aus `project` entfernt.

### Step 4: Smoke-Test — knip läuft ohne Crash

```bash
cd /tmp/wt-knip-dead-code/website
pnpm exec knip --no-exit-code | head -40
```

Erwartung: knip listet "Unused exports" / "Unused files". Falls knip
Framework-Dateien (z. B. `astro.config`, eine Layout-`.astro`) fälschlich als
unused meldet, die `entry`-Globs in `knip.json` erweitern, bis nur echter
Dead-Code übrig bleibt. Kein Stacktrace/Crash.

### Step 5: Commit

```bash
cd /tmp/wt-knip-dead-code
git add website/package.json website/pnpm-lock.yaml website/knip.json
git commit -m "build(website): add knip dead-code analysis config [T001205]"
```

---

## Task 2: Baseline messen + persistieren

**Files:**
- Create: `docs/code-quality/knip-baseline.json`

### Step 1: knip JSON-Report erzeugen

```bash
cd /tmp/wt-knip-dead-code/website
pnpm exec knip --reporter json --no-exit-code > /tmp/knip-report.json || true
head -c 600 /tmp/knip-report.json; echo
```

### Step 2: Items zählen (files + exports + types)

```bash
files=$(jq '[.files[]?]            | length' /tmp/knip-report.json)
exports=$(jq '[.issues[]?.exports[]?] | length' /tmp/knip-report.json)
types=$(jq '[.issues[]?.types[]?]     | length' /tmp/knip-report.json)
total=$(( files + exports + types ))
echo "files=$files exports=$exports types=$types total=$total"
```

> Sollte sich das JSON-Schema der knip-Version unterscheiden, die Zähl-Pfade
> anhand von `jq 'keys'` / `jq '.issues[0]'` anpassen. Maßgeblich ist die Summe
> aus unused files + unused exports + unused exported types für `website/src`.

### Step 3: Baseline-Datei schreiben (`unused_after` zunächst gleich `unused_before`)

```bash
cd /tmp/wt-knip-dead-code
mkdir -p docs/code-quality
jq -n \
  --argjson b "$total" --argjson f "$files" --argjson e "$exports" --argjson t "$types" \
  '{tool:"knip", scope:"website/src",
    unused_before:$b, unused_after:$b,
    breakdown:{files:$f, exports:$e, types:$t}}' \
  > docs/code-quality/knip-baseline.json
cat docs/code-quality/knip-baseline.json
```

> `unused_after` wird in Task 3 nach dem Entfernen auf den neuen Messwert
> gesetzt. So bleibt der ≥ 50 %-BATS-Test bis dahin RED und dokumentiert die
> noch offene Arbeit.

### Step 4: Commit

```bash
cd /tmp/wt-knip-dead-code
git add docs/code-quality/knip-baseline.json
git commit -m "chore(quality): record knip dead-code baseline for website/src [T001205]"
```

---

## Task 3: 50 % der Findings entfernen

**Files:**
- Modify/Delete: `website/src/lib/*.ts` und weitere `src/**`-Module (konkret aus dem knip-Report)

### Step 1: Removal-Ziel bestimmen

```bash
before=$(jq -r '.unused_before' /tmp/wt-knip-dead-code/docs/code-quality/knip-baseline.json)
target=$(( (before + 1) / 2 ))   # ceil(before/2) Items entfernen
echo "Entferne mindestens $target von $before Items"
```

### Step 2: Sichere Kandidaten zuerst — unused exports in `src/lib`

Aus dem knip-Report die "Unused exports" filtern, die in nicht-öffentlichen
`src/lib`-Modulen liegen (keine Astro-Pages, keine API-Routen, keine
String-/Glob-geladenen Module). Pro Kandidat verifizieren, dann entfernen:

```bash
cd /tmp/wt-knip-dead-code/website
# Beispiel-Verifikation für ein Export-Symbol <name> aus <datei>:
grep -rn "<name>" src --include=*.ts --include=*.svelte --include=*.astro \
  | grep -v "export" | head
```

- Hat das Symbol **keinen** Importeur → die `export`-Deklaration entfernen.
  Wird das Symbol auch lokal nicht mehr genutzt → die ganze Funktion/Konstante
  löschen. (Das shrinkt die Datei und verbessert ihr S1-Budget.)
- Hat es doch Verbraucher (z. B. dynamischer Import) → überspringen und im
  knip.json bzw. per `knip-ignore`-Kommentar dokumentieren.

### Step 3: Danach echte unused files entfernen

Aus der "Unused files"-Liste die zweifelsfrei verwaisten Module löschen
(erneut per `grep` bestätigen, dass kein Import/kein dynamischer Pfad darauf
zeigt):

```bash
cd /tmp/wt-knip-dead-code/website
git rm src/<verwaister-pfad>
```

### Step 4: TypeScript- + Unit-Tests grün halten

```bash
cd /tmp/wt-knip-dead-code/website
pnpm exec astro check 2>&1 | tail -20
pnpm exec vitest run 2>&1 | tail -20
```

Erwartung: 0 neue Typfehler, alle Vitest grün. Falls ein Entfernen etwas bricht,
zurücknehmen und den nächsten Kandidaten wählen.

### Step 5: Neu messen + `unused_after` setzen

```bash
cd /tmp/wt-knip-dead-code/website
pnpm exec knip --reporter json --no-exit-code > /tmp/knip-after.json || true
files=$(jq '[.files[]?]            | length' /tmp/knip-after.json)
exports=$(jq '[.issues[]?.exports[]?] | length' /tmp/knip-after.json)
types=$(jq '[.issues[]?.types[]?]     | length' /tmp/knip-after.json)
after=$(( files + exports + types ))
echo "unused_after=$after"

cd /tmp/wt-knip-dead-code
tmp=$(mktemp)
jq --argjson a "$after" --argjson f "$files" --argjson e "$exports" --argjson t "$types" \
  '.unused_after=$a | .breakdown_after={files:$f,exports:$e,types:$t}' \
  docs/code-quality/knip-baseline.json > "$tmp" && mv "$tmp" docs/code-quality/knip-baseline.json
```

### Step 6: BATS muss jetzt GRÜN sein

```bash
cd /tmp/wt-knip-dead-code
bats tests/spec/g-cq08-knip-dead-code.bats
```

Erwartung: alle vier Tests grün — Config vorhanden, devDependency vorhanden,
Baseline aufgezeichnet, Reduktion ≥ 50 %. Falls Test 4 noch RED: weitere sichere
Kandidaten aus Step 2/3 entfernen, bis `removed ≥ ceil(before/2)`.

### Step 7: Commit

```bash
cd /tmp/wt-knip-dead-code
git add -A website/src docs/code-quality/knip-baseline.json
git commit -m "refactor(website): remove 50% of knip-detected dead code [T001205]"
```

---

## Task 4: Advisory-knip-Schritt in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

### Step 1: Schritt im "Vitest (website)"-Job ergänzen

Nach dem Schritt "Run website unit tests" (gleicher Job, deps via pnpm bereits
installiert) folgenden **advisory** Schritt einfügen:

```yaml
      - name: Knip dead-code report (advisory)
        continue-on-error: true
        run: |
          cd website
          pnpm exec knip --no-exit-code || true
```

> Doppelt entkoppelt: `--no-exit-code` lässt knip immer mit 0 enden,
> `continue-on-error: true` hält den Job auch sonst grün. Der Report ist nur
> informativ, bis die zweite Hälfte des Dead-Codes in Folge-Tickets fällt.

### Step 2: Workflow-Syntax validieren

```bash
cd /tmp/wt-knip-dead-code
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml: valid YAML')"
```

### Step 3: Commit

```bash
cd /tmp/wt-knip-dead-code
git add .github/workflows/ci.yml
git commit -m "ci: add advisory knip dead-code report to website job [T001205]"
```

---

## Task 5: Final — Gates, freshness, PR

**Files:**
- (keine Code-Änderung; nur Verifikation + Auslieferung)

### Step 1: Alle Pflicht-Gates

```bash
cd /tmp/wt-knip-dead-code
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartung: alle Exit 0. Falls `freshness:regenerate` Artefakte ändert, mit
committen.

### Step 2: BATS-Regression final grün

```bash
cd /tmp/wt-knip-dead-code
bats tests/spec/g-cq08-knip-dead-code.bats
```

Erwartung: vier Tests grün.

### Step 3: Freshness-Änderungen committen (falls vorhanden)

```bash
cd /tmp/wt-knip-dead-code
git add -A
git diff --cached --quiet || git commit -m "chore: regenerate freshness artifacts [T001205]"
```

### Step 4: PR-Titel Preflight

```bash
bash /tmp/wt-knip-dead-code/scripts/preflight-pr-scope.sh \
  "chore(quality): G-CQ08 — knip dead-code baseline + −50% in website/src [T001205]" \
  || { echo "preflight failed"; exit 1; }
```

### Step 5: Push + PR + Auto-Merge

```bash
cd /tmp/wt-knip-dead-code
git push -u origin feature/knip-dead-code
gh pr create \
  --title "chore(quality): G-CQ08 — knip dead-code baseline + −50% in website/src [T001205]" \
  --base main \
  --body "Closes T001205. knip eingeführt + konfiguriert, Baseline in docs/code-quality/knip-baseline.json, 50% der unused exports/files in website/src entfernt, advisory CI-Gate. BATS: tests/spec/g-cq08-knip-dead-code.bats."
gh pr merge --auto --squash --delete-branch
```

### Step 6: Ticket verlinken

```bash
cd /tmp/wt-knip-dead-code
PR_NUM=$(gh pr view --json number -q '.number')
./scripts/ticket.sh add-pr-link --id T001205 --pr "$PR_NUM" || true
./scripts/ticket.sh add-comment --id T001205 \
  --body "PR #${PR_NUM}: knip eingeführt, Baseline erfasst, Dead-Code −50% in website/src, advisory CI-Gate." || true
```

---

## Final Verification (CI-Äquivalent)

```bash
cd /tmp/wt-knip-dead-code
task test:changed
task freshness:regenerate
task freshness:check
bats tests/spec/g-cq08-knip-dead-code.bats
```

Alle müssen grün sein, bevor der PR gemergt wird.
