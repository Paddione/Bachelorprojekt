---
title: Batch-Spec/Plan-Erstellung Implementation Plan
ticket_id: T000592
domains: [website, infra, db, ops, test]
status: active
pr_number: null
---

# Batch-Spec/Plan-Erstellung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neuer Skill `dev-flow-batch` der alle `status=planning` Tickets automatisch zu Specs+Plänen verarbeitet (Modus 1) oder ein großes Feature in parallele Sub-Pläne zerlegt (Modus 2) — orchestriert via Workflow-Tool mit Dreiphasen-Konfliktschutz.

**Architecture:** Ein dünner SKILL.md orchestriert: (1) Ticket-Fetch via `batch-gap-analysis.sh`, (2) parallele Gap-Analyse-Subagenten, (3) konsolidierte Q&A-Runde, (4) Workflow-Script-Generierung via `batch-workflow-gen.sh`, (5) `Workflow({scriptPath, args})` mit drei Phasen — Isolated (parallel, Worktree-isoliert), Shared (serialisiert, geteilte Dateien), Stage (parallel, DB-Updates). `plan-frontmatter-hook.sh` bekommt Batch-Felder (file_locks, shared_changes, batch_id, parent_feature, depends_on_plans).

**Tech Stack:** Bash, YAML-Frontmatter, Workflow-Tool (JavaScript/ESM), kubectl/psql via ticket.sh-Muster, BATS für offline Tests, jq für JSON-Verarbeitung.

---

## Dateistruktur

| Datei | Aktion | Verantwortung |
|---|---|---|
| `scripts/plan-frontmatter-hook.sh` | Modifizieren | Batch-Felder als Case-C-Erweiterung hinzufügen |
| `scripts/batch-gap-analysis.sh` | Neu erstellen | Alle `status=planning` Tickets als JSON-Array aus DB holen |
| `scripts/batch-workflow-gen.sh` | Neu erstellen | Workflow-Script (.mjs) nach `/tmp/batch-workflow-<id>.mjs` schreiben |
| `.claude/skills/dev-flow-batch/SKILL.md` | Neu erstellen | Entry-Point: Gap-Analyse, Q&A, Workflow starten, beide Modi |
| `.gitignore` | Modifizieren | `docs/superpowers/specs/.gaps/` hinzufügen |
| `tests/batch/frontmatter-batch.bats` | Neu erstellen | Hook setzt Batch-Felder korrekt |
| `tests/batch/batch-gap-analysis.bats` | Neu erstellen | Script produziert valides JSON (offline, gemocktes kubectl) |
| `tests/batch/batch-workflow-gen.bats` | Neu erstellen | Generiertes Script besteht `node --check` (FA-BATCH-01) |

---

## Task 1: plan-frontmatter-hook.sh — Batch-Felder ergänzen

**Files:**
- Modify: `scripts/plan-frontmatter-hook.sh:99-141`
- Test: `tests/batch/frontmatter-batch.bats`

Die Batch-Felder werden am Ende des Frontmatter-Blocks eingefügt wenn sie fehlen. Das betrifft sowohl Case A (neues Frontmatter) als auch Case C (reparieren). Ziel: idempotent, bestehende Pläne unverändert.

- [x] **Schritt 1: Failing-Test schreiben**

Erstelle `tests/batch/frontmatter-batch.bats`:

```bash
#!/usr/bin/env bats
# Tests: plan-frontmatter-hook.sh setzt Batch-Felder wenn sie fehlen

setup() {
  TMPDIR="$(mktemp -d)"
  HOOK="$BATS_TEST_DIRNAME/../../scripts/plan-frontmatter-hook.sh"
}

teardown() { rm -rf "$TMPDIR"; }

@test "Case A: neues Frontmatter bekommt Batch-Felder" {
  local f="$TMPDIR/plan.md"
  echo "# Mein Plan" > "$f"
  echo "Inhalt des Plans." >> "$f"
  CI=1 bash "$HOOK" "$f"
  grep -q "file_locks: \[\]"       "$f"
  grep -q "shared_changes: false"  "$f"
  grep -q "batch_id: null"         "$f"
  grep -q "parent_feature: null"   "$f"
  grep -q "depends_on_plans: \[\]" "$f"
}

@test "Case C: unvollstaendiges Frontmatter bekommt fehlende Batch-Felder" {
  local f="$TMPDIR/plan.md"
  printf '%s\n' "---" "title: Test" "ticket_id: null" "status: active" "pr_number: null" "---" "# Body" > "$f"
  CI=1 bash "$HOOK" "$f"
  grep -q "file_locks: \[\]"       "$f"
  grep -q "shared_changes: false"  "$f"
}

@test "Case B: vollstaendiges Frontmatter mit Batch-Feldern bleibt unveraendert" {
  local f="$TMPDIR/plan.md"
  printf '%s\n' \
    "---" "title: T" "ticket_id: null" "domains: [website]" "status: active" "pr_number: null" \
    "file_locks: [website/src/foo.svelte]" "shared_changes: true" "batch_id: batch-abc" \
    "parent_feature: null" "depends_on_plans: []" "---" "# Body" > "$f"
  CI=1 bash "$HOOK" "$f"
  grep -q "file_locks: \[website/src/foo.svelte\]" "$f"
  grep -q "shared_changes: true" "$f"
  grep -q "batch_id: batch-abc"  "$f"
}

@test "Idempotent: zweimaliger Aufruf veraendert Datei nicht" {
  local f="$TMPDIR/plan.md"
  echo "# Plan" > "$f"
  CI=1 bash "$HOOK" "$f"
  local hash1; hash1=$(md5sum "$f")
  CI=1 bash "$HOOK" "$f"
  local hash2; hash2=$(md5sum "$f")
  [[ "$hash1" == "$hash2" ]]
}
```

- [x] **Schritt 2: Test ausführen — erwartet FAIL**

```bash
cd /tmp/wt-batch-spec-plan
mkdir -p tests/batch
# (Datei noch nicht vorhanden, daher erstelle sie wie in Schritt 1)
bats tests/batch/frontmatter-batch.bats
```

Erwartet: FAIL — `file_locks` Zeile existiert noch nicht.

- [x] **Schritt 3: Batch-Felder in plan-frontmatter-hook.sh einbauen**

**Case A (ab Zeile 82):** Füge Batch-Felder in den `{`-Block ein, direkt nach `pr_number: null`:

```bash
# In scripts/plan-frontmatter-hook.sh, innerhalb des Case-A-Blocks (tmpfile-Generierung):
    {
        printf '%s\n' "---"
        printf 'title: %s\n' "$title"
        printf 'ticket_id: null\n'
        printf 'domains: %s\n' "$domains_yaml"
        printf 'status: active\n'
        printf 'pr_number: null\n'
        printf 'file_locks: []\n'
        printf 'shared_changes: false\n'
        printf 'batch_id: null\n'
        printf 'parent_feature: null\n'
        printf 'depends_on_plans: []\n'
        printf '%s\n\n' "---"
        cat "$FILE"
    } > "$tmpfile"
```

**Case C (Zeilen 108-141):** Füge eine Erkennung und In-place-Injektion der Batch-Felder hinzu. Erweitere die Check-Logik und den awk-Block:

Ersetze den Block ab Zeile 99 (`# ── Case B/C …`) bis zum Ende der Datei mit:

```bash
# ── Case B/C: frontmatter present → check the routing-critical fields ──
dom_raw="$(_fm_field domains | tr -d ' \t\r')"
st_raw="$(_fm_field status | tr -d ' \t\r')"
fl_raw="$(_fm_field file_locks | tr -d ' \t\r')"

needs_domains=0
case "$dom_raw" in ""|"[]"|"null") needs_domains=1 ;; esac
needs_status=0
case "$st_raw" in ""|"null") needs_status=1 ;; esac
needs_batch=0
[[ -z "$fl_raw" ]] && needs_batch=1

if [[ "$needs_domains" -eq 0 && "$needs_status" -eq 0 && "$needs_batch" -eq 0 ]]; then
    echo "Frontmatter already complete in $FILE — nothing to do."
    exit 0
fi

derived="$(_body | _derive_domains | tr '\n' ' ' | sed 's/ *$//')"
derived_yaml="$(_domains_to_yaml "$derived")"
[[ "$needs_domains" -eq 1 && "$derived_yaml" == "[]" ]] && \
    echo "WARNING: domains is empty and no signals found in $FILE — set domains manually." >&2

tmpfile="$(mktemp)"
awk -v derived="$derived_yaml" -v needs_dom="$needs_domains" \
    -v needs_st="$needs_status" -v needs_batch="$needs_batch" '
    BEGIN { infm=0; dom_seen=0; st_seen=0; batch_seen=0 }
    { sub(/\r$/,"") }
    NR==1 && $0=="---" { print; infm=1; next }
    infm==1 && $0=="---" {
        if (needs_dom==1   && dom_seen==0)   print "domains: " derived
        if (needs_st==1    && st_seen==0)    print "status: active"
        if (needs_batch==1 && batch_seen==0) {
            print "file_locks: []"
            print "shared_changes: false"
            print "batch_id: null"
            print "parent_feature: null"
            print "depends_on_plans: []"
        }
        print; infm=0; next
    }
    infm==1 && $0 ~ /^domains:/ {
        dom_seen=1
        if (needs_dom==1) { print "domains: " derived } else { print }
        next
    }
    infm==1 && $0 ~ /^status:/ {
        st_seen=1
        if (needs_st==1) { print "status: active" } else { print }
        next
    }
    infm==1 && $0 ~ /^file_locks:/ { batch_seen=1; print; next }
    { print }
' "$FILE" > "$tmpfile"
mv "$tmpfile" "$FILE"
echo "Repaired frontmatter in $FILE (domains=$derived_yaml needs_status=$needs_status needs_batch=$needs_batch)"
```

- [x] **Schritt 4: Tests ausführen — erwartet PASS**

```bash
bats tests/batch/frontmatter-batch.bats
```

Erwartet: 4/4 PASS.

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-batch-spec-plan
git add scripts/plan-frontmatter-hook.sh tests/batch/frontmatter-batch.bats
git commit -m "feat(batch): plan-frontmatter-hook adds batch fields [T000592]"
```

---

## Task 2: batch-gap-analysis.sh — Ticket-Fetch aus DB

**Files:**
- Create: `scripts/batch-gap-analysis.sh`
- Test: `tests/batch/batch-gap-analysis.bats`

Holt alle `status=planning` Tickets als JSON-Array. Nutzt dasselbe kubectl/psql-Muster wie `ticket.sh`.

- [x] **Schritt 1: Failing-Test schreiben**

Erstelle `tests/batch/batch-gap-analysis.bats`:

```bash
#!/usr/bin/env bats
# Tests: batch-gap-analysis.sh — offline mit gemocktem kubectl

setup() {
  # Mock kubectl: gibt ein Ticket als JSON zurück
  MOCK_DIR="$(mktemp -d)"
  cat > "$MOCK_DIR/kubectl" << 'MOCK'
#!/usr/bin/env bash
# Minimales Mock: gibt JSON für psql -qtA zurück
if [[ "$*" == *"psql"* ]]; then
  echo '[{"external_id":"T000601","title":"Test Ticket","description":"Baue eine Funktion","brand":"mentolder","priority":"mittel","severity":null}]'
fi
MOCK
  chmod +x "$MOCK_DIR/kubectl"
  export PATH="$MOCK_DIR:$PATH"
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/batch-gap-analysis.sh"
}

teardown() { rm -rf "$MOCK_DIR"; }

@test "gibt valides JSON-Array zurueck" {
  result=$(bash "$SCRIPT" 2>/dev/null)
  echo "$result" | jq -e '. | type == "array"'
}

@test "jedes Element hat external_id und description" {
  result=$(bash "$SCRIPT" 2>/dev/null)
  count=$(echo "$result" | jq '[.[] | select(.external_id and .description)] | length')
  [[ "$count" -gt 0 ]]
}

@test "leeres Ergebnis wenn keine planning-Tickets" {
  # Mock gibt leeres Array zurück
  cat > "$MOCK_DIR/kubectl" << 'MOCK'
#!/usr/bin/env bash
echo '[]'
MOCK
  result=$(bash "$SCRIPT" 2>/dev/null)
  [[ "$result" == "[]" ]] || [[ "$result" == "" ]]
}
```

- [x] **Schritt 2: Test ausführen — erwartet FAIL**

```bash
bats tests/batch/batch-gap-analysis.bats
```

Erwartet: FAIL — Script existiert noch nicht.

- [x] **Schritt 3: batch-gap-analysis.sh implementieren**

Erstelle `scripts/batch-gap-analysis.sh`:

```bash
#!/usr/bin/env bash
# Fetches all status=planning tickets as a JSON array.
# Usage: bash scripts/batch-gap-analysis.sh [ENV]
# Output: JSON array to stdout, e.g. [{"external_id":"T000601","title":"...","description":"..."}]
set -euo pipefail

ENV="${1:-${ENV:-dev}}"
CTX="${TICKET_CTX:-fleet}"
NS="${TICKET_NS:-workspace}"

pod=$(kubectl get pod -n "$NS" --context "$CTX" \
  -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)

if [[ -z "$pod" ]]; then
  echo "ERROR: no shared-db pod found (ns=$NS ctx=$CTX)" >&2
  exit 1
fi

kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
  psql -U website -d website -qtA -v ON_ERROR_STOP=1 <<'EOF'
SELECT COALESCE(
  json_agg(row_to_json(t) ORDER BY t.created_at),
  '[]'::json
)
FROM (
  SELECT external_id, uuid, title, description, brand, priority, severity
  FROM tickets.tickets
  WHERE status = 'planning'
) t;
EOF
```

- [x] **Schritt 4: Tests ausführen — erwartet PASS**

```bash
bats tests/batch/batch-gap-analysis.bats
```

Erwartet: 3/3 PASS.

- [x] **Schritt 5: Commit**

```bash
chmod +x scripts/batch-gap-analysis.sh
git add scripts/batch-gap-analysis.sh tests/batch/batch-gap-analysis.bats
git commit -m "feat(batch): batch-gap-analysis.sh fetches planning tickets [T000592]"
```

---

## Task 3: batch-workflow-gen.sh — Workflow-Script generieren

**Files:**
- Create: `scripts/batch-workflow-gen.sh`
- Test: `tests/batch/batch-workflow-gen.bats`

Schreibt ein valides Workflow-Script (`.mjs`) nach `/tmp/batch-workflow-<id>.mjs`. Die Ticket-Daten kommen zur Laufzeit via `args` — kein JSON-Embedding nötig.

- [x] **Schritt 1: Failing-Test schreiben**

Erstelle `tests/batch/batch-workflow-gen.bats`:

```bash
#!/usr/bin/env bats
# Tests: batch-workflow-gen.sh erzeugt valides Workflow-Script

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/batch-workflow-gen.sh"
  OUTFILE="/tmp/test-batch-workflow-$$.mjs"
}

teardown() { rm -f "$OUTFILE"; }

@test "FA-BATCH-01: generiertes Script besteht node --check" {
  bash "$SCRIPT" "$OUTFILE"
  node --check "$OUTFILE"
}

@test "Script enthaelt export const meta" {
  bash "$SCRIPT" "$OUTFILE"
  grep -q "export const meta" "$OUTFILE"
}

@test "Script enthaelt alle drei Phasen" {
  bash "$SCRIPT" "$OUTFILE"
  grep -q "Isolated" "$OUTFILE"
  grep -q "Shared"   "$OUTFILE"
  grep -q "Stage"    "$OUTFILE"
}

@test "Script referenziert args.tickets" {
  bash "$SCRIPT" "$OUTFILE"
  grep -q "args\.tickets" "$OUTFILE"
}
```

- [x] **Schritt 2: Test ausführen — erwartet FAIL**

```bash
bats tests/batch/batch-workflow-gen.bats
```

Erwartet: FAIL — Script existiert noch nicht.

- [x] **Schritt 3: batch-workflow-gen.sh implementieren**

Erstelle `scripts/batch-workflow-gen.sh`:

```bash
#!/usr/bin/env bash
# Generates a batch Workflow script for spec+plan creation.
# Usage: bash scripts/batch-workflow-gen.sh <output-path>
# The generated script expects args: { tickets: [...], gap_context: {...} }
set -euo pipefail

OUTPUT="${1:?Usage: batch-workflow-gen.sh <output-path>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cat > "$OUTPUT" << 'WORKFLOW_EOF'
export const meta = {
  name: 'batch-spec-plan-creation',
  description: 'Batch Spec+Plan creation for planning tickets',
  phases: [
    { title: 'Isolated', detail: 'Spec+Plan pro Ticket schreiben (parallel, Worktree-isoliert)' },
    { title: 'Shared',   detail: 'Geteilte Dateien serialisiert aktualisieren' },
    { title: 'Stage',    detail: 'DB-Updates: ticket.sh stage-plan' },
  ]
}

const RESULT_SCHEMA = {
  type: 'object',
  required: ['ticket_id', 'branch', 'spec_path', 'plan_path', 'shared_changes'],
  properties: {
    ticket_id:      { type: 'string' },
    branch:         { type: 'string' },
    spec_path:      { type: 'string' },
    plan_path:      { type: 'string' },
    shared_changes: { type: 'boolean' }
  }
}

const tickets    = args.tickets     || []
const gapContext = args.gap_context || {}
const repoRoot   = args.repo_root   || '/home/patrick/Bachelorprojekt'

if (!tickets.length) {
  log('Keine Tickets übergeben — Workflow beendet.')
  return { succeeded: 0, total: 0 }
}

log(`Starte Batch für ${tickets.length} Ticket(s)`)

// ── Phase 1: Isolated ─────────────────────────────────────────────────────
phase('Isolated')
const results = await pipeline(
  tickets,
  async (ticket) => {
    const ctx    = gapContext[ticket.external_id] || ''
    const slug   = ticket.external_id.toLowerCase()
    const branch = `feature/${slug}`
    const today  = args.today || '2026-01-01'

    return await agent(
      `Du bist ein Spec+Plan-Schreib-Agent im Bachelorprojekt-Repo. Arbeite ausschließlich im Worktree den du anlegst.

REPO: ${repoRoot}
TICKET: ${ticket.external_id} — ${ticket.title}
BESCHREIBUNG:
${ticket.description}
${ctx ? `\nZUSATZ-KONTEXT:\n${ctx}` : ''}

ABLAUF (führe jeden Schritt aus):
1. cd ${repoRoot}
2. Lege Worktree an:
   bash scripts/worktree-create.sh ${branch} /tmp/wt-batch-${slug}
3. cd /tmp/wt-batch-${slug}
4. Schreibe Spec nach docs/superpowers/specs/${today}-${slug}-design.md
   - Vollständige Markdown-Spec basierend auf Ticket-Beschreibung
   - Kein Brainstorming nötig — Ticket-Beschreibung ist die Quelle
5. Schreibe Plan nach docs/superpowers/plans/${today}-${slug}.md
   - Vollständiger Implementierungsplan mit Tasks und Checkboxen
   - Nutze writing-plans Konventionen (Ziel, Architektur, Tech-Stack, Tasks)
6. Führe aus: bash ${repoRoot}/scripts/plan-frontmatter-hook.sh docs/superpowers/plans/${today}-${slug}.md
7. Setze shared_changes im Frontmatter auf true wenn der Plan k3d/configmap-domains.yaml,
   environments/schema.yaml oder k3d/kustomization.yaml ändern muss — sonst false
8. git add docs/ && git commit -m "chore(batch): spec+plan for ${ticket.external_id}"
9. git push -u origin ${branch}

Gib zurück (JSON gemäß Schema):
- ticket_id: "${ticket.external_id}"
- branch: "${branch}"
- spec_path: "docs/superpowers/specs/${today}-${slug}-design.md"
- plan_path: "docs/superpowers/plans/${today}-${slug}.md"
- shared_changes: true/false (ob der Plan geteilte Dateien ändern muss)`,
      {
        phase:     'Isolated',
        label:     ticket.external_id,
        isolation: 'worktree',
        schema:    RESULT_SCHEMA
      }
    )
  }
)

const succeeded = results.filter(Boolean)
log(`${succeeded.length}/${tickets.length} Specs+Pläne erstellt`)

// ── Phase 2: Shared ───────────────────────────────────────────────────────
phase('Shared')
const needsShared = succeeded.filter(r => r.shared_changes)
if (needsShared.length === 0) {
  log('Keine Shared-File-Änderungen nötig — Phase Shared übersprungen')
} else {
  for (const r of needsShared) {
    await agent(
      `Trage Shared-File-Änderungen für Plan ${r.plan_path} ein.

REPO: ${repoRoot}
BRANCH: ${r.branch}
PLAN: ${r.plan_path}

1. cd ${repoRoot} && git fetch origin ${r.branch} && git checkout ${r.branch}
2. Lese den Plan (${r.plan_path}) und identifiziere welche Einträge in
   k3d/configmap-domains.yaml und/oder environments/schema.yaml nötig sind
3. Füge die Einträge idempotent hinzu (prüfe ob sie bereits existieren)
4. git add k3d/configmap-domains.yaml environments/schema.yaml
5. git commit -m "chore(batch): shared-file changes for ${r.ticket_id}"
6. git push origin ${r.branch}`,
      { phase: 'Shared', label: `shared:${r.ticket_id}` }
    )
  }
}

// ── Phase 3: Stage ────────────────────────────────────────────────────────
phase('Stage')
await parallel(succeeded.map(r => () =>
  agent(
    `Führe stage-plan für Ticket ${r.ticket_id} aus:

cd ${repoRoot}
bash scripts/ticket.sh stage-plan \\
  --id ${r.ticket_id} \\
  --branch ${r.branch} \\
  --plan ${r.plan_path}

Bestätige mit der Ausgabe des Befehls.`,
    { phase: 'Stage', label: `stage:${r.ticket_id}` }
  )
))

return { succeeded: succeeded.length, total: tickets.length, skipped: tickets.length - succeeded.length }
WORKFLOW_EOF

echo "$OUTPUT"
```

- [x] **Schritt 4: Tests ausführen — erwartet PASS**

```bash
bats tests/batch/batch-workflow-gen.bats
```

Erwartet: 4/4 PASS.

- [x] **Schritt 5: Commit**

```bash
chmod +x scripts/batch-workflow-gen.sh
git add scripts/batch-workflow-gen.sh tests/batch/batch-workflow-gen.bats
git commit -m "feat(batch): batch-workflow-gen.sh generates Workflow script [T000592]"
```

---

## Task 4: .gitignore — .gaps/ Verzeichnis ausschließen

**Files:**
- Modify: `.gitignore`

- [x] **Schritt 1: Eintrag prüfen und hinzufügen**

```bash
grep -q "specs/.gaps" /tmp/wt-batch-spec-plan/.gitignore \
  || echo "docs/superpowers/specs/.gaps/" >> /tmp/wt-batch-spec-plan/.gitignore
```

- [x] **Schritt 2: Commit**

```bash
git add .gitignore
git commit -m "chore(batch): gitignore gap-context files"
```

---

## Task 5: dev-flow-batch SKILL.md

**Files:**
- Create: `.claude/skills/dev-flow-batch/SKILL.md`

Der Skill ist der Entry-Point. Er orchestriert Gap-Analyse, Q&A-Bündelung und Workflow-Start. Beide Modi (Batch aus planning-Tickets / Feature splitten) werden hier gesteuert.

- [x] **Schritt 1: Verzeichnis anlegen und SKILL.md schreiben**

```bash
mkdir -p /tmp/wt-batch-spec-plan/.claude/skills/dev-flow-batch
```

Erstelle `.claude/skills/dev-flow-batch/SKILL.md`:

```markdown
---
name: dev-flow-batch
description: >
  Batch-Erstellung von Specs und Implementierungsplänen. Modus 1: alle
  status=planning Tickets parallel verarbeiten. Modus 2: ein großes Feature
  in parallele Sub-Pläne zerlegen. Verwende diesen Skill wenn der User
  mehrere Tickets auf einmal planen will oder ein Feature zu groß für einen
  einzelnen Plan ist.
---

# dev-flow-batch — Batch Spec+Plan-Erstellung

**Sage zu Beginn:** "Ich nutze dev-flow-batch für Batch-Plan-Erstellung."

## Modus-Erkennung

- **Kein Argument** → Modus 1: alle `status=planning` Tickets
- **Pfad zu Spec-Datei** (endet auf `.md`) → Modus 2: Spec splitten
- **Freier Text** (kein `.md`-Pfad) → Modus 2: Feature inline beschreiben

## Schritt −1: Pull-First + Reaper

```bash
git fetch origin main && git pull --rebase origin main
bash scripts/agent-lock.sh reap
```

## Modus 1: Batch aus planning-Tickets

### Schritt 1: Tickets holen

```bash
TICKETS_JSON=$(bash scripts/batch-gap-analysis.sh)
TICKET_COUNT=$(echo "$TICKETS_JSON" | jq 'length')
```

Wenn `TICKET_COUNT == 0`: informiere den User und STOPP.

### Schritt 2: Gap-Analyse (parallel via Agent-Tool)

Spawne für jedes Ticket einen Gap-Analyse-Subagenten parallel. Jeder Subagent bekommt:

**Prompt-Template:**
```
Analysiere dieses Ticket auf Vollständigkeit für das Schreiben einer Spec.

TICKET: <external_id> — <title>
BESCHREIBUNG: <description>

Prüfe ob folgende Informationen vorhanden sind:
1. Ziel klar genug für eine Spec? (ja/nein + was fehlt)
2. Domains erkennbar? (website/db/infra/ops/test/security)
3. Akzeptanzkriterien vorhanden?
4. Abhängigkeiten zu anderen Features?
5. Shared-Changes nötig? (neue Domain, neues Schema-Var, neues ConfigMap-Eintrag)

Gib zurück als JSON:
{
  "ticket_id": "<external_id>",
  "gaps": [{"field": "...", "question": "..."}],
  "can_proceed": true/false,
  "preliminary_domains": ["website"],
  "needs_shared_changes": false
}
```

Schema:
```json
{
  "type": "object",
  "required": ["ticket_id", "gaps", "can_proceed", "preliminary_domains", "needs_shared_changes"],
  "properties": {
    "ticket_id": { "type": "string" },
    "gaps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": { "field": { "type": "string" }, "question": { "type": "string" } }
      }
    },
    "can_proceed": { "type": "boolean" },
    "preliminary_domains": { "type": "array", "items": { "type": "string" } },
    "needs_shared_changes": { "type": "boolean" }
  }
}
```

### Schritt 3: Fragen bündeln und User fragen

Sammle alle Gaps aus allen Ergebnissen. Wenn Gaps vorhanden: präsentiere dem User eine konsolidierte Liste, gruppiert nach Ticket:

```
Ich habe X Tickets mit status=planning gefunden. Bevor ich die Pläne erstelle,
habe ich einige Fragen:

**T000601 — Login-Redesign:**
- Welches Brand ist betroffen? (mentolder / korczewski / beide)
- Wird eine neue Domain benötigt?

**T000602 — Export-Feature:**
- Welches Format: CSV, PDF oder beides?
```

Warte auf Antworten. Speichere Antworten als `docs/superpowers/specs/.gaps/<ticket_id>.md` pro Ticket (erstelle das Verzeichnis falls nötig).

Tickets mit `can_proceed: false` nach der Q&A-Runde (Beschreibung zu vage, keine Antwort gegeben): markiere als SKIPPED — schließe sie aus `TICKETS_JSON` aus.

### Schritt 4: Worktree für Batch anlegen

```bash
BATCH_DATE=$(date +%Y-%m-%d)
BATCH_BRANCH="feature/batch-${BATCH_DATE}-planning"
bash scripts/worktree-create.sh "$BATCH_BRANCH" "/tmp/wt-batch-${BATCH_DATE}"
bash scripts/agent-lock.sh claim branch "$BATCH_BRANCH" \
  --worktree "/tmp/wt-batch-${BATCH_DATE}" --label dev-flow-batch
```

### Schritt 5: Workflow-Script generieren und starten

```bash
SCRIPT_PATH="/tmp/batch-workflow-$(date +%s).mjs"
bash scripts/batch-workflow-gen.sh "$SCRIPT_PATH"
```

Dann starte via Workflow-Tool:
```
Workflow({
  scriptPath: SCRIPT_PATH,
  args: {
    tickets: <TICKETS_JSON als Objekt>,
    gap_context: <Map von ticket_id → Inhalt der .gaps-Datei>,
    repo_root: "/home/patrick/Bachelorprojekt",
    today: <BATCH_DATE>
  }
})
```

### Schritt 6: Ergebnis berichten

Nach Workflow-Abschluss: berichte dem User wie viele Specs+Pläne erfolgreich erstellt wurden, welche übersprungen wurden (SKIPPED), und dass alle fertigen Pläne in der Kommissionierung (`/dev-status`) unter `status=plan_staged` auf Freigabe warten.

---

## Modus 2: Großes Feature splitten

### Schritt 1: Input normalisieren

- Wenn Argument ein `.md`-Pfad: lese Datei ein als `SPEC_CONTENT`
- Wenn freier Text: nutze Text direkt als `FEATURE_DESCRIPTION`

### Schritt 2: Decompose-Subagent

Spawne einen Decompose-Subagenten mit Schema:

```json
{
  "type": "object",
  "required": ["parent_feature", "sub_features"],
  "properties": {
    "parent_feature": { "type": "string" },
    "sub_features": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["slug", "title", "description", "domains", "depends_on", "shared_changes"],
        "properties": {
          "slug":           { "type": "string" },
          "title":          { "type": "string" },
          "description":    { "type": "string" },
          "domains":        { "type": "array", "items": { "type": "string" } },
          "depends_on":     { "type": "array", "items": { "type": "string" } },
          "shared_changes": { "type": "boolean" }
        }
      }
    }
  }
}
```

**Prompt:**
```
Zerlege dieses Feature in unabhängige Sub-Features die parallel implementiert werden können.

FEATURE:
<SPEC_CONTENT oder FEATURE_DESCRIPTION>

Regeln:
- Jedes Sub-Feature muss für sich allein testbar und deploybar sein
- depends_on listet slugs von Sub-Features die zuerst fertig sein müssen
- shared_changes: true wenn das Sub-Feature k3d/configmap-domains.yaml oder
  environments/schema.yaml ändern muss
- Maximal 6 Sub-Features — wenn das Feature größer ist, fasse verwandte Teile zusammen
- Gib einen parent_feature slug (kebab-case, kurz) zurück
```

### Schritt 3: Sub-Features als Tickets-Array formatieren

Wandle die Sub-Features in das Ticket-Format um das der Workflow erwartet:
```json
[
  {
    "external_id": "sub-<parent>-<slug>",
    "title": "<title>",
    "description": "<description>",
    "brand": "mentolder",
    "priority": "mittel"
  }
]
```

Füge `depends_on` und `parent_feature` in den `gap_context` pro Sub-Feature ein.

### Schritt 4: Workflow starten

Identisch zu Modus 1 Schritt 5 — `batch-workflow-gen.sh` + `Workflow({scriptPath, args})`.

---

## Abgrenzung

- Dieser Skill **plant nur** (Spec + Plan) — keine Implementierung, kein Deploy
- Fertige Pläne landen in `status=plan_staged` in der Kommissionierung
- Factory-Übergabe: `/dev-status` → "→ Factory" Knopf, oder:
  `bash scripts/ticket.sh enqueue --id <ext-id> --branch <branch> --plan <plan>`
```

- [x] **Schritt 2: Commit**

```bash
git add .claude/skills/dev-flow-batch/SKILL.md
git commit -m "feat(batch): dev-flow-batch skill entry point [T000592]"
```

---

## Task 6: Ticket anlegen + Plan-Frontmatter setzen + Push

- [ ] **Schritt 1: Ticket erstellen**

```bash
cd /tmp/wt-batch-spec-plan
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type task \
  --brand mentolder \
  --title "Batch-Spec/Plan-Erstellung" \
  --priority mittel \
  --description "Branch: feature/batch-spec-plan-creation
Plan: docs/superpowers/plans/2026-06-10-batch-spec-plan-creation.md
Spec: docs/superpowers/specs/2026-06-10-batch-spec-plan-creation-design.md")
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
echo "Ticket: $TICKET_EXT_ID"
```

- [ ] **Schritt 2: ticket_id in Plan eintragen**

```bash
sed -i "s/^ticket_id: null$/ticket_id: $TICKET_EXT_ID/" \
  docs/superpowers/plans/2026-06-10-batch-spec-plan-creation.md
```

- [ ] **Schritt 3: Frontmatter-Hook ausführen**

```bash
bash scripts/plan-frontmatter-hook.sh \
  docs/superpowers/plans/2026-06-10-batch-spec-plan-creation.md
```

- [ ] **Schritt 4: T000592 Platzhalter in Plan ersetzen**

```bash
sed -i "s/T000592/$TICKET_EXT_ID/g" \
  docs/superpowers/plans/2026-06-10-batch-spec-plan-creation.md
```

- [ ] **Schritt 5: stage-plan ausführen**

```bash
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "feature/batch-spec-plan-creation" \
  --plan "docs/superpowers/plans/2026-06-10-batch-spec-plan-creation.md"
```

- [ ] **Schritt 6: Commit + Push**

```bash
git add docs/superpowers/plans/2026-06-10-batch-spec-plan-creation.md
git commit -m "chore(plans): stage batch-spec-plan-creation [$TICKET_EXT_ID]"
git push -u origin feature/batch-spec-plan-creation
```

---

## Selbst-Review Checkliste

- [x] **Spec-Coverage:** Gap-Analyse ✓, Fragen-Bündelung ✓, Dreiphasiger Workflow ✓, Konflikt-Prävention (Worktree-Isolation + Shared-Phase) ✓, Modus 2 Decompose ✓, Frontmatter-Schema ✓, Testing ✓
- [x] **Keine Platzhalter:** Alle Codeblöcke vollständig, keine TBD/TODO
- [x] **Typ-Konsistenz:** `RESULT_SCHEMA` Fields stimmen mit Workflow-Code überein (`ticket_id`, `branch`, `spec_path`, `plan_path`, `shared_changes`)
- [x] **T000592:** Platzhalter wird in Task 6 Schritt 4 ersetzt — kein permanenter Platzhalter im finalen Plan
