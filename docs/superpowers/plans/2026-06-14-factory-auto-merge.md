---
ticket_id: T000722
spec_ref: docs/superpowers/specs/2026-06-14-factory-auto-merge.md
status: active
date: 2026-06-14
domains: [website, infra, test, security]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Factory Auto-Merge (E2E aus Required Checks entfernen) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `E2E PR` aus den GitHub Branch-Protection required status checks für `main` entfernen, damit Auto-Merge nach grünen Offline-Tests funktioniert, auch wenn Live-Prod-E2E rot ist.

**Architecture:** Ein idempotentes Shell-Skript (`scripts/gh-branch-protection.sh`) setzt via `gh api` die Branch-Protection auf den gewünschten 5-Checks-Zustand. Das Skript wird via Taskfile erreichbar gemacht (S4-Gate). Drei Dokumentationsdateien erhalten Inline-Kommentare, die das neue Verhalten klarstellen.

**Tech Stack:** `gh` CLI (GitHub API), Bash, Taskfile (go-task), Markdown

---

## S1-Budget-Analyse

| Datei | Ist-Zeilen | Baseline | Wirksame Schwelle | Budget |
|-------|-----------|---------|-------------------|--------|
| `scripts/gh-branch-protection.sh` | NEU | nicht-baselined | 500 (`.sh` Limit) | 500 |
| `.claude/skills/dev-flow-execute/SKILL.md` | 446 | nicht-baselined | `.md` nicht in S1 | kein Limit |
| `CLAUDE.md` | 220 | nicht-baselined | `.md` nicht in S1 | kein Limit |
| `.github/workflows/auto-enable-automerge.yml` | 36 | nicht-baselined | `.yml` nicht in S1 | kein Limit |
| `Taskfile.yml` | >4000 | nicht-baselined | `.yml` nicht in S1 | kein Limit |

Das neue Skript hat ca. 80-100 Zeilen — weit unter dem 500-Zeilen-Limit.

---

## Dateistruktur

| Datei | Aktion | Verantwortlichkeit |
|-------|--------|-------------------|
| `scripts/gh-branch-protection.sh` | **NEU** | Idempotentes Skript: required checks setzen/anzeigen/E2E hinzufügen |
| `Taskfile.yml` | Modify | 3 neue Tasks: apply, status, emergency-add-e2e |
| `.claude/skills/dev-flow-execute/SKILL.md` | Modify | Kommentar im Auto-Merge-Schritt |
| `CLAUDE.md` | Modify | Gotcha-Eintrag unter "Operational" |
| `.github/workflows/auto-enable-automerge.yml` | Modify | Inline-Kommentar E2E-Hinweis |

---

### Task 1: Script `scripts/gh-branch-protection.sh` erstellen

**Files:**
- Create: `scripts/gh-branch-protection.sh`

Das Skript setzt die Branch Protection für `main` idempotent via GitHub API.
Es akzeptiert drei Flags: `--status`, `--dry-run`, `--add-e2e`.

- [ ] **Step 1: Script erstellen**

```bash
cat > /tmp/wt-factory-auto-merge/scripts/gh-branch-protection.sh << 'SCRIPT'
#!/usr/bin/env bash
# gh-branch-protection.sh — Idempotentes Branch-Protection-Setup für main
#
# Setzt die required status checks für Paddione/Bachelorprojekt:main
# auf: offline-tests, security-scan, brett-typescript, vitest, commit-lint
# (E2E PR ist NICHT enthalten — informativ, blockiert keinen Auto-Merge)
#
# Verwendung:
#   bash scripts/gh-branch-protection.sh            # Checks setzen (default)
#   bash scripts/gh-branch-protection.sh --dry-run  # Nur zeigen, was sich ändern würde
#   bash scripts/gh-branch-protection.sh --status   # Aktuelle required checks anzeigen
#   bash scripts/gh-branch-protection.sh --add-e2e  # Emergency: E2E wieder hinzufügen
#
# Voraussetzung: GH_PAT env-var mit repo + admin:repo Scope
# (gleiche Credentials wie in auto-enable-automerge.yml)

set -euo pipefail

REPO="Paddione/Bachelorprojekt"
BRANCH="main"
MANUAL_URL="https://github.com/${REPO}/settings/branches"

# Required checks ohne E2E (Normalzustand nach diesem Feature)
REQUIRED_CHECKS_BASE=(
  "offline-tests"
  "security-scan"
  "brett-typescript"
  "vitest"
  "commit-lint"
)

# Required checks inkl. E2E (Emergency-Stop-Zustand)
REQUIRED_CHECKS_WITH_E2E=(
  "offline-tests"
  "security-scan"
  "brett-typescript"
  "vitest"
  "commit-lint"
  "E2E PR"
)

if [[ -z "${GH_PAT:-}" ]]; then
  echo "ERROR: GH_PAT env-var ist nicht gesetzt." >&2
  echo "       Setze: export GH_PAT=<token-mit-admin:repo-scope>" >&2
  echo "       Alternativ manuell: ${MANUAL_URL}" >&2
  exit 1
fi

MODE="apply"
if [[ "${1:-}" == "--status" ]]; then
  MODE="status"
elif [[ "${1:-}" == "--dry-run" ]]; then
  MODE="dry-run"
elif [[ "${1:-}" == "--add-e2e" ]]; then
  MODE="add-e2e"
fi

# Aktuelle required checks abrufen
get_current_checks() {
  GH_TOKEN="$GH_PAT" gh api \
    "repos/${REPO}/branches/${BRANCH}/protection" \
    --jq '.required_status_checks.contexts // []' 2>/dev/null || echo "[]"
}

if [[ "$MODE" == "status" ]]; then
  echo "=== Aktuelle required checks für ${REPO}:${BRANCH} ==="
  get_current_checks | jq -r '.[]' | sort | sed 's/^/  - /'
  exit 0
fi

# Ziel-Checks bestimmen
if [[ "$MODE" == "add-e2e" ]]; then
  TARGET_CHECKS=("${REQUIRED_CHECKS_WITH_E2E[@]}")
  echo "=== Emergency-Stop: E2E PR wird zu required checks hinzugefügt ==="
else
  TARGET_CHECKS=("${REQUIRED_CHECKS_BASE[@]}")
  echo "=== Branch Protection Setup: E2E PR wird aus required checks entfernt ==="
fi

# JSON-Array für API bauen
CONTEXTS_JSON=$(printf '%s\n' "${TARGET_CHECKS[@]}" | jq -R . | jq -s .)

echo "Ziel-required-checks:"
echo "$CONTEXTS_JSON" | jq -r '.[]' | sort | sed 's/^/  - /'

if [[ "$MODE" == "dry-run" ]]; then
  echo ""
  echo "[dry-run] Keine Änderung vorgenommen."
  echo "Zum Anwenden: bash scripts/gh-branch-protection.sh"
  exit 0
fi

# Branch Protection PATCH — setzt NUR required_status_checks
# Alle anderen Protection-Einstellungen werden beibehalten (enforce_admins, restrictions, etc.)
# durch Übergabe der aktuellen Werte via separate API-Calls nicht nötig — PATCH merged.
#
# WICHTIG: Die GitHub API /branches/main/protection erfordert alle Felder auf einmal;
# fehlende Felder werden auf null gesetzt. Daher aktuelle Werte erst lesen und mergen.
CURRENT_PROTECTION=$(GH_TOKEN="$GH_PAT" gh api \
  "repos/${REPO}/branches/${BRANCH}/protection" 2>/dev/null || echo "{}")

ENFORCE_ADMINS=$(echo "$CURRENT_PROTECTION" | jq '.enforce_admins.enabled // false')
REQUIRED_REVIEWS=$(echo "$CURRENT_PROTECTION" | jq '.required_pull_request_reviews // null')
RESTRICTIONS=$(echo "$CURRENT_PROTECTION" | jq '.restrictions // null')
REQUIRED_LINEAR=$(echo "$CURRENT_PROTECTION" | jq '.required_linear_history.enabled // false')
ALLOW_FORCE=$(echo "$CURRENT_PROTECTION" | jq '.allow_force_pushes.enabled // false')
ALLOW_DELETIONS=$(echo "$CURRENT_PROTECTION" | jq '.allow_deletions.enabled // false')
REQUIRE_CONVERSATION=$(echo "$CURRENT_PROTECTION" | jq '.required_conversation_resolution.enabled // false')

PAYLOAD=$(jq -n \
  --argjson contexts "$CONTEXTS_JSON" \
  --argjson enforce_admins "$ENFORCE_ADMINS" \
  --argjson required_reviews "$REQUIRED_REVIEWS" \
  --argjson restrictions "$RESTRICTIONS" \
  --argjson required_linear "$REQUIRED_LINEAR" \
  --argjson allow_force "$ALLOW_FORCE" \
  --argjson allow_deletions "$ALLOW_DELETIONS" \
  --argjson require_conversation "$REQUIRE_CONVERSATION" \
  '{
    required_status_checks: {
      strict: false,
      contexts: $contexts
    },
    enforce_admins: $enforce_admins,
    required_pull_request_reviews: $required_reviews,
    restrictions: $restrictions,
    required_linear_history: $required_linear,
    allow_force_pushes: $allow_force,
    allow_deletions: $allow_deletions,
    required_conversation_resolution: $require_conversation
  }')

echo ""
echo "Setze Branch Protection via GitHub API ..."

RESULT=$(GH_TOKEN="$GH_PAT" gh api \
  --method PUT \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --input <(echo "$PAYLOAD") 2>&1) || {
  echo "ERROR: GitHub API-Aufruf fehlgeschlagen:" >&2
  echo "$RESULT" >&2
  echo "" >&2
  echo "Fallback: Manuelle Einstellung unter ${MANUAL_URL}" >&2
  exit 1
}

echo "Erfolgreich gesetzt. Aktuelle required checks:"
GH_TOKEN="$GH_PAT" gh api \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --jq '.required_status_checks.contexts[]' | sort | sed 's/^/  - /'
SCRIPT
chmod +x /tmp/wt-factory-auto-merge/scripts/gh-branch-protection.sh
```

- [ ] **Step 2: Syntax prüfen**

```bash
bash -n /tmp/wt-factory-auto-merge/scripts/gh-branch-protection.sh
```

Expected output: (kein Output = kein Syntaxfehler)

- [ ] **Step 3: Zeilenzahl prüfen (S1-Gate)**

```bash
wc -l /tmp/wt-factory-auto-merge/scripts/gh-branch-protection.sh
```

Expected: unter 120 Zeilen (Limit: 500)

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-factory-auto-merge
git add scripts/gh-branch-protection.sh
git commit -m "feat(ci): add gh-branch-protection.sh — remove E2E PR from required checks [T000722]"
```

---

### Task 2: Taskfile-Tasks hinzufügen

**Files:**
- Modify: `Taskfile.yml`

Drei neue Tasks unter dem Namespace `gh:branch-protection:` (S4-Gate: Skript wird von Taskfile referenziert).

- [ ] **Step 1: Tasks am Ende der `secrets:`-Gruppe (nach `secrets:lock:`) einfügen**

Finde die Zeile mit `secrets:lock:` in Taskfile.yml (aktuell Zeile 1236) und füge danach die drei neuen Tasks ein. Suche zunächst die genaue Position:

```bash
grep -n "secrets:lock:" /tmp/wt-factory-auto-merge/Taskfile.yml
```

Füge dann nach dem Ende des `secrets:lock:`-Blocks (nach der `- echo ...` Zeile) ein. Der neue Block sieht so aus:

```yaml
  gh:branch-protection:apply:
    desc: "Set required checks for main (removes E2E PR). Requires GH_PAT env-var with admin:repo scope."
    cmds:
      - bash scripts/gh-branch-protection.sh

  gh:branch-protection:status:
    desc: "Show current required status checks for main branch"
    cmds:
      - bash scripts/gh-branch-protection.sh --status

  gh:branch-protection:emergency-add-e2e:
    desc: "Emergency: add E2E PR back to required checks (re-enables the Henne-Ei block)"
    cmds:
      - bash scripts/gh-branch-protection.sh --add-e2e
```

Nutze das Edit-Tool mit `old_string` = die beiden letzten Zeilen des `secrets:lock:`-Blocks + ein Leerzeichen danach, und `new_string` = diese Zeilen + die neuen Tasks.

- [ ] **Step 2: Verifikation — Tasks sind listbar**

```bash
cd /tmp/wt-factory-auto-merge && task --list 2>/dev/null | grep "gh:branch"
```

Expected:
```
* gh:branch-protection:apply:              Set required checks for main ...
* gh:branch-protection:status:             Show current required status checks ...
* gh:branch-protection:emergency-add-e2e:  Emergency: add E2E PR back ...
```

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-factory-auto-merge
git add Taskfile.yml
git commit -m "chore(ci): add gh:branch-protection tasks to Taskfile [T000722]"
```

---

### Task 3: Branch Protection live anwenden

**Files:**
- (keine Dateiänderung — API-Aufruf gegen GitHub)

- [ ] **Step 1: Aktuellen Zustand dokumentieren (vor Änderung)**

```bash
cd /tmp/wt-factory-auto-merge
bash scripts/gh-branch-protection.sh --status
```

Expected output enthält `E2E PR` in der Liste (Ist-Zustand vor dem Feature).

- [ ] **Step 2: Dry-Run prüfen**

```bash
bash scripts/gh-branch-protection.sh --dry-run
```

Expected: Zeigt die 5 Ziel-Checks ohne `E2E PR`, macht keine Änderung.

- [ ] **Step 3: Branch Protection anwenden**

```bash
bash scripts/gh-branch-protection.sh
```

Expected: "Erfolgreich gesetzt. Aktuelle required checks:" gefolgt von 5 Einträgen (ohne `E2E PR`).

Falls Fehler `"Resource not accessible by integration"`: Der `GH_PAT` fehlt oder hat keinen `admin:repo`-Scope. Token in GitHub Settings → Developer settings → Personal access tokens prüfen.

- [ ] **Step 4: Verifikation via gh api**

```bash
gh api repos/Paddione/Bachelorprojekt/branches/main/protection \
  --jq '.required_status_checks.contexts | sort'
```

Expected:
```json
[
  "brett-typescript",
  "commit-lint",
  "offline-tests",
  "security-scan",
  "vitest"
]
```

`E2E PR` darf NICHT in dieser Liste erscheinen.

---

### Task 4: `dev-flow-execute/SKILL.md` — Auto-Merge-Kommentar ergänzen

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md:296-302`

- [ ] **Step 1: Aktuellen Schritt 6 lesen**

```bash
grep -n "Auto-Merge\|gh pr merge\|--auto" /tmp/wt-factory-auto-merge/.claude/skills/dev-flow-execute/SKILL.md
```

Schritt 6 liegt um Zeile 296-301 und enthält:
```
## Schritt 6: Auto-Merge wenn CI grün
```

- [ ] **Step 2: Kommentar hinzufügen**

Ersetze den Block:

```markdown
## Schritt 6: Auto-Merge wenn CI grün

```bash
# Merge PR aus dem Haupt-Repo, um Konflikte zu vermeiden
(cd "$MAIN_REPO" && gh pr merge --auto --squash --delete-branch)
```
```

durch:

```markdown
## Schritt 6: Auto-Merge wenn CI grün

> **Hinweis:** `E2E PR` ist kein required check (T000722). Auto-Merge wartet nur auf:
> `offline-tests`, `security-scan`, `brett-typescript`, `vitest`, `commit-lint`.
> Ein roter E2E-Check blockiert den Merge NICHT — er erscheint als informativer
> gelber Status im PR. PR-Autor prüft E2E-Ergebnis manuell bei Bedarf.

```bash
# Merge PR aus dem Haupt-Repo, um Konflikte zu vermeiden
(cd "$MAIN_REPO" && gh pr merge --auto --squash --delete-branch)
```
```

- [ ] **Step 3: Zeilenzahl nach Änderung prüfen**

```bash
wc -l /tmp/wt-factory-auto-merge/.claude/skills/dev-flow-execute/SKILL.md
```

Expected: ~451 Zeilen (war 446; `.md` nicht in S1 → kein Problem)

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-factory-auto-merge
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "docs(dev-flow): annotate auto-merge step — E2E PR is informational only [T000722]"
```

---

### Task 5: `CLAUDE.md` — Gotcha-Eintrag hinzufügen

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Einfügeposition bestimmen**

```bash
grep -n "CONFLICTING PR status\|No yamllint\|LiveKit needs" /tmp/wt-factory-auto-merge/CLAUDE.md
```

Der neue Gotcha kommt als letzter Bullet in der `### Operational`-Sektion, NACH dem LiveKit-Bullet (aktuell letzte Zeile der Sektion, ca. Zeile 188).

- [ ] **Step 2: Gotcha-Bullet einfügen**

Füge nach dem LiveKit-Bullet (der mit `- **LiveKit needs node-pinning...`), direkt vor der Leerzeile + `### Korczewski` Überschrift, folgenden Eintrag ein:

```markdown
- **E2E PR ist kein required check — Auto-Merge wird nicht blockiert.** `E2E PR` wurde mit T000722 aus den Branch-Protection required checks entfernt. Der E2E-Workflow (`e2e-pr.yml`) läuft weiterhin bei jedem PR und zeigt sein Ergebnis informativ an (gelb wenn rot, kein Merge-Block). Auto-Merge wartet nur auf: `offline-tests`, `security-scan`, `brett-typescript`, `vitest`, `commit-lint`. Emergency-Wiederherstellung: `task gh:branch-protection:emergency-add-e2e` oder GitHub Settings UI unter `Settings → Branches → main`. Skript-Status anzeigen: `task gh:branch-protection:status`.
```

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-factory-auto-merge
git add CLAUDE.md
git commit -m "docs(claude): add gotcha — E2E PR is informational, not a required check [T000722]"
```

---

### Task 6: `auto-enable-automerge.yml` — Inline-Kommentar ergänzen

**Files:**
- Modify: `.github/workflows/auto-enable-automerge.yml`

- [ ] **Step 1: Kommentar im Header ergänzen**

Der bestehende Header-Kommentar endet nach Zeile 7 (`# Repo-Voraussetzung: allow_auto_merge ist aktiviert.`). Füge direkt darunter (nach dieser Zeile, vor dem leeren Block) ein:

```yaml
# E2E PR is intentionally not a required check — see scripts/gh-branch-protection.sh
# and task gh:branch-protection:status. Required checks: offline-tests, security-scan,
# brett-typescript, vitest, commit-lint. Emergency: task gh:branch-protection:emergency-add-e2e
```

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-factory-auto-merge
git add .github/workflows/auto-enable-automerge.yml
git commit -m "docs(ci): note E2E PR intentionally not required in auto-enable-automerge [T000722]"
```

---

### Task 7: Verifikation — CI-Gates und Gesamtzustand prüfen

**Files:**
- (keine Dateiänderung)

- [ ] **Step 1: Offline-Testsuite**

```bash
cd /tmp/wt-factory-auto-merge
task test:all
```

Expected: alle Tests grün (keine BATS-Fehler, keine kustomize-Fehler, kein code-quality-Fehler)

- [ ] **Step 2: Freshness-Artefakte regenerieren**

```bash
task freshness:regenerate
```

Expected: `docs/generated/api-map.json`, `website/src/data/test-inventory.json`, `docs/code-quality/repo-index.json` aktuell (falls Änderungen, committen):

```bash
git diff --name-only
# Falls Artefakte geändert:
git add docs/generated/ website/src/data/test-inventory.json docs/code-quality/repo-index.json
git commit -m "chore: regenerate freshness artifacts [ci skip]"
```

- [ ] **Step 3: Freshness-Check (CI-Äquivalent)**

```bash
task freshness:check
```

Expected: kein Fehler (S1-S4-Ratchet grün, Baseline nicht gewachsen, alle Artefakte frisch)

- [ ] **Step 4: Branch Protection Endzustand verifikation**

```bash
bash /tmp/wt-factory-auto-merge/scripts/gh-branch-protection.sh --status
```

Expected: 5 Checks — `offline-tests`, `security-scan`, `brett-typescript`, `vitest`, `commit-lint` — aber KEIN `E2E PR`.

- [ ] **Step 5: S4-Gate verifikation (Skript ist via Taskfile erreichbar)**

```bash
task --list 2>/dev/null | grep "gh:branch-protection"
```

Expected: 3 Tasks gelistet (`apply`, `status`, `emergency-add-e2e`)

- [ ] **Step 6: Skript-Idempotenz prüfen (nochmals apply)**

```bash
bash /tmp/wt-factory-auto-merge/scripts/gh-branch-protection.sh
```

Expected: Erfolgreich gesetzt — bei wiederholtem Aufruf kein Fehler, gleiche 5 Checks.

---

## Self-Review Spec-Abgleich

| Akzeptanzkriterium | Task |
|---------------------|------|
| `gh api` entfernt `E2E PR` aus required checks | Task 1 (Skript) + Task 3 (live apply) |
| PRs mit grünen 5 Checks auto-gemerged, auch wenn E2E rot | Task 3 + Task 7 Step 4 |
| PRs mit rotem offline-test NICHT auto-gemerged | Branch Protection mit `offline-tests` als required (Task 3) |
| E2E-Workflow läuft weiterhin | `e2e-pr.yml` unverändert (Nicht-Scope, kein Task) |
| `scripts/gh-branch-protection.sh` existiert, idempotent | Task 1 |
| Emergency-Stop via `--add-e2e` | Task 1 + Task 2 (`emergency-add-e2e`-Task) |
| `dev-flow-execute/SKILL.md` dokumentiert E2E-Verhalten | Task 4 |
| `CLAUDE.md` dokumentiert E2E-Verhalten | Task 5 |

Kein Akzeptanzkriterium ohne Task. Keine Platzhalter in den Tasks.
