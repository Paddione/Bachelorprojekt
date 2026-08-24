# Proposal: automerge-gate-workflow-distinction

## Why

Der Workflow 'Auto-enable Auto-Merge' (`.github/workflows/auto-enable-automerge.yml`) setzt bei
jeder neuen Nicht-Draft-PR gegen main sofort das Auto-Merge-Flag — mit einem PAT (`secrets.GH_PAT`),
nicht mit GITHUB_TOKEN. Das Review-Gate aus dev-flow-execute (Schritt 3.8) läuft aber NACH der
PR-Erstellung. Zwischen beiden liegt ein Fenster, in dem GitHub den PR mergt, sobald die Required
Checks des ERSTEN Commits grün sind — unabhängig vom Review.

Beobachtet an PR #5197 (2026-08-24T00:25:19Z): gemergt bei `headRefOid=d999b383`, obwohl der
Review-Fix `fb3a823e3` bereits gepusht war. Beide Review-Befunde landeten ungeprüft auf main und
brauchten Nachzieh-PR #5200 (T015860). Das Gate (`scripts/check-pr-automerge.sh`) hat korrekt
`rc=1 BLOCK` gemeldet, konnte aber nichts ausrichten: sein Design (D2, T006282) behandelt jeden
aktivierten Auto-Merge als expliziten Operator-Akt und bricht fail-closed ab, ohne ihn zu
deaktivieren. Genau diese Annahme trifft nicht zu, wenn der Aktivierende ein Repo-Workflow ist.
Die Reihenfolge (PR anlegen → Workflow aktiviert → Review-Gate) ist der Normalpfad von
dev-flow-execute — jeder PR, dessen erster Stand grün läuft, wird ungeprüft gemergt.

## What

**Operator-Entscheidung (Klärungsrunde 2026-08-24), Zuschnitt (b) ONLY:** `check-pr-automerge.sh`
darf einen workflow-gesetzten Auto-Merge selbst deaktivieren; die Unterscheidung läuft über
`gh pr view --json autoMergeRequest` → `enabledBy.login`. Fail-closed für menschlich gesetzte
Auto-Merges bleibt. **Nicht im Scope:** (a) Review-Marker-Gating im Workflow, (c) Review-Gate vor
PR-Erstellung.

**Messbefund zur Unterscheidungsfähigkeit (2026-08-24, vor Plan-Erstellung verifiziert):**
Der Workflow nutzt `secrets.GH_PAT` (Workflow-Kommentar Zeile 53–54; GITHUB_TOKEN darf
enablePullRequestAutoMerge nicht ausführen). Die Identität dieses PATs ist messbar über die
Freshness-Regen-Bot-Commits auf main (dieselben Secrets-Nutzung, T002868):
`git log --grep='auto-regenerate' -1 origin/main --format='%an <%ae>'` → **`Paddione
<82854371+Paddione@users.noreply.github.com>`**. Ein workflow-gesetzter Auto-Merge trägt damit
denselben menschlich benannten Login wie eine manuelle Aktivierung des Operators — die reine
Login-Betrachtung kann maschinell vs. menschlich hier nicht allein trennen. Der Plan löst das mit
zwei Erkennungsregeln:

1. **Bot-Regel:** `enabledBy.__typename == "Bot"` oder Login endet auf `[bot]` → maschinell
   (zukunftssicher für einen GITHUB_TOKEN-/App-Umstieg).
2. **PAT-Regel:** Login ∈ Allowlist (`CHECK_PR_AUTOMERGE_PAT_ACTORS`, Default `Paddione`) UND
   Aktivierung innerhalb des Workflow-Fensters: `enabledAt − createdAt ≤
   CHECK_PR_AUTOMERGE_WORKFLOW_WINDOW_SECS` (Default 300 = `timeout-minutes: 5` des Jobs).
   Der Workflow feuert auf `opened/synchronize/ready_for_review/reopened`, Aktivierung erfolgt
   also Sekunden bis wenige Minuten nach PR-Anlage.

Ohne erkennbare Maschinen-Signatur gilt der Auto-Merge weiterhin als menschlich gesetzt →
fail-closed `rc=1` (unverändert). Erkennt das Skript Maschine, deaktiviert es per
`gh pr merge --disable-auto` und meldet Erfolg mit `rc=0`; scheitert die Deaktivierung technisch,
gilt `rc=2`.

_Betroffene Dateien:_ `scripts/check-pr-automerge.sh` (Kernfix), neue BATS-Testdatei unter
`tests/spec/agent-skills/`, Wording-Anpassung in dev-flow-execute SKILL.md/phases.md (der Text
„kein Auto-Merge wird still deaktiviert" widerspricht dem neuen Verhalten).

_Ticket: T015915_
