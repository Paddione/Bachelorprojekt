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

const parsedArgs = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const tickets    = parsedArgs.tickets     || []
const gapContext = parsedArgs.gap_context || {}
const repoRoot   = parsedArgs.repo_root   || '/home/patrick/Bachelorprojekt'

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
    const today  = parsedArgs.today || '2026-01-01'

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
   bash scripts/worktree-create.sh ${branch} ${repoRoot}/.worktrees/batch-${slug}
3. cd ${repoRoot}/.worktrees/batch-${slug}
4. Schreibe Spec nach docs/superpowers/specs/${today}-${slug}-design.md
   - Vollständige Markdown-Spec basierend auf Ticket-Beschreibung
   - Kein Brainstorming nötig — Ticket-Beschreibung ist die Quelle
5. Schreibe Plan/Tasks nach openspec/changes/${slug}/tasks.md
   - Vollständiger Implementierungsplan mit Tasks und Checkboxen
   - Nutze writing-plans Konventionen (Ziel, Architektur, Tech-Stack, Tasks)
   - PFLICHT-STRUKTUR (scripts/plan-lint.sh ist ein hartes, fail-closed Gate — diese
     Strings müssen WÖRTLICH und auf ENGLISCH im Plan stehen, sonst exit 1):
     * STRUCT1: Eine Überschrift die "Implementation Plan" enthält (z.B. "# <Titel> Implementation Plan")
       UND eine Sektion-Überschrift "## File Structure" (NICHT "Dateistruktur").
     * STRUCT2: Mindestens ein Task mit einem expliziten Failing-Test-Step — die wörtliche
       Phrase "expected: fail" (TDD: Test zuerst schreiben, laufen lassen, Fehlschlag erwarten).
     * STRUCT3: Der finale Verifikations-Task MUSS exakt diese drei Befehle enthalten:
       task test:changed (NICHT test:all), task freshness:regenerate, task freshness:check.
   - Lies VORHER .claude/skills/references/plan-quality-gates.md und halte den Plan daran:
     wc -l auf jede zu ändernde Datei (S1-Zeilenbudget notieren, bei >~80% des Limits Modul-Split
     einplanen), keine Brand-Domain-Literale in Snippets (S3), pure Helper ohne Import-Zyklen (S2),
     neue Manifeste/Skripte referenzieren (S4).
6. Erstelle Verzeichnis: mkdir -p ${repoRoot}/openspec/changes/${slug}
6b. HARTES GATE — bash ${repoRoot}/scripts/plan-lint.sh openspec/changes/${slug}/tasks.md
    MUSS exit 0 liefern. Bei FAIL: Plan gemäß PFLICHT-STRUKTUR oben nachbessern und erneut linten,
    BIS grün (0 hard). Erst danach committen — ein roter Plan darf NICHT gepusht werden.
7. Setze shared_changes auf true wenn der Plan k3d/configmap-domains.yaml,
   environments/schema.yaml oder k3d/kustomization.yaml ändern muss — sonst false
8. git add docs/ openspec/ && git commit -m "chore(batch): spec+plan for ${ticket.external_id}"
9. git push -u origin ${branch}

Gib zurück (JSON gemäß Schema):
- ticket_id: "${ticket.external_id}"
- branch: "${branch}"
- spec_path: "docs/superpowers/specs/${today}-${slug}-design.md"
- plan_path: "openspec/changes/${slug}/tasks.md"
- shared_changes: true/false (ob der Plan geteilte Dateien ändern muss)`,
      {
        phase:  'Isolated',
        label:  ticket.external_id,
        // KEIN isolation:'worktree' — bricht mit git-crypt (smudge-filter); der Prompt
        // legt selbst via scripts/worktree-create.sh einen git-crypt-sicheren Worktree an.
        schema: RESULT_SCHEMA
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
