---
name: dev-flow-plan
description: 'Use to choose the development path for a work request in this repo — feature, fix, or chore. Triggers on work request, neue Funktion, feature request, bug fix, chore, dev-flow-plan, plan erstellen. Features/Fixes: brainstorming, spec, staged plan, then dev-flow-execute takes over. Chores route to dev-flow-chore.'
---
# dev-flow-plan — Pfad-Wahl, Brainstorming & Plan

> **cwd-Regel (PFLICHT, T006367/T002357):** Git-Aufrufe immer als `git -C "$WT"` bzw. mit
> explizitem cd+guard — **nie auf implizites cwd vertrauen**. Ab Phase B tragen **alle**
> Read/Write/Edit-Pfade den Worktree-Präfix. Gilt für das ganze Dokument.

Der Plan ist der behavior-change-Einstieg des gemeinsamen [Lifecycle-Vertrags](.agents/skills/references/dev-flow-lifecycle.md): Ausgang ist ein Request, Ausgang ein gestagter, gepushter Plan ohne PR; danach übernimmt `dev-flow-execute`. Proposal, Plan-Lint, staged-plan und No-Early-PR-Gates bleiben hier normativ.

## Wann diese Skill greift
Bei jeder Anfrage in diesem Repo, die etwas verändern will.
**Sage zu Beginn:** "Ich nutze dev-flow-plan für Pfad-Wahl und Planung."

## Position im Git-Kreislauf
```
    ┌──────────────────────────────────────────────────────────┐
    ▼                                                          │
[ main ]                                                       │
    │                                                          │
    ├─► [branch + spec + plan] ── DIESER SKILL ── AUSSTIEG ──►│
    │         (feature / fix)         pushed                   │
    │                                                          │
    └─► [chore direkt] ── dev-flow-chore ──────────────────────┘
```
**EINSTIEG:** `main` — synchronisiert, sauberer Stand
**AUSSTIEG:** Feature/Fix-Branch mit committiertem Plan `.agents/plans/<slug>/tasks.md` auf Remote gepusht
**Nächster Schritt:** `dev-flow-execute` — leitet den Plan-Pfad aus dem Branch-Namen ab und implementiert

## Schritt −3: Deep Grilling (optional)
Bei komplexem oder unklarem Feature den User nach einer Grilling-Session fragen. Fragenkatalog:
[dev-flow-gotchas](.agents/skills/references/dev-flow-gotchas.md). Q/A-Session über `lavish`
(`.lavish/<slug>-grilling.html`, Input-Playbook). Die Antworten gehören in die Design-Spec bzw. den Plan.

## Schritt −2: Main-Branch sync (Pull-First)
```bash
git fetch origin main
if git diff --quiet HEAD; then
  git pull --rebase origin main
else
  git stash && git pull --rebase origin main && git stash pop
fi
```

## Schritt −1: Reaper & Stale-Worktree-Audit
Tote Sessions/Zombies/stale Worktrees räumen und sehen, wer gerade was bearbeitet —
Lock-Lebenszyklus-SSOT: [session-coordination](.agents/skills/references/session-coordination.md) [T000510]:
```bash
bash scripts/agent-lock.sh reap            # cwd-tote Prozesse killen, Worktrees prunen, tote Locks räumen
bash scripts/agent-lock.sh list            # "Wer macht was": laufende Claims anderer Sessions
bash scripts/agent-msg.sh read --unread    # offene Nachrichten paralleler Sessions [T000882]
git worktree list && bash scripts/worktree-git-op-guard.sh
```
Stale Worktrees nur nach bestandenem Vorcheck löschen [T005115]:
`bash scripts/worktree-clean-check.sh <path>` lehnt dirty-Worktrees UND solche mit aktivem
fremden branch-Claim ab (`agent-lock.sh check branch <branch>` — laufende Lauf-/Batch-Session!).
Bei rc 1 den Worktree stehen lassen, sonst
`git worktree unlock <path> 2>/dev/null || true && git worktree remove <path> --force && git branch -D <branch>`.

## Schritt 0: Pfad bestimmen
Wähle einen Pfad und kläre ihn mit dem User ab:
- **feature**: Neue Funktionen oder UI-Elemente. → diese Skill (Feature-Pfad unten).
- **fix**: Fehlerbehebung (erfordert einen failing Test). → diese Skill (Fix-Pfad unten).
- **chore**: Wartung, Doku, Dependency-Bumps (keine Verhaltensänderung). → **`dev-flow-chore`
  aufrufen und STOPP** — Chores werden dort direkt ausgeführt und gemergt, nicht hier geplant.

Diese Skill plant nur (Feature/Fix) und stoppt vor der Umsetzung; die übernimmt `dev-flow-execute`.

**Artefakt-Ebene:** Die feature/fix/chore-Wahl ist die *Pfad*-Wahl; davor steht die *Artefakt*-Wahl
(PRD vs. ADR vs. Change-Proposal vs. Chore-Ticket). Entscheidungstabelle + PRD-Checkliste:
[plan-artifact-level](.agents/skills/references/plan-artifact-level.md).

## Schritt 0.7: Prior-Art-Suche vor der ersten Architekturfrage [T002829]
Bevor dem User eine **Architekturfrage** gestellt wird („gemeinsame Quelle oder duplizieren?",
„Bibliothek oder Inline?", „Hook oder Helper?"), MUSS geprüft sein, ob dieselbe Frage im Repo
schon einmal entschieden wurde. Gilt für **beide** Pfade, **vor** dem Brainstorming. Die Suche geht
über ADRs und Guards, nicht nur über den Code — eine verworfene Lösungsrichtung hinterlässt im
Code keine Spur:
```bash
grep -rn -e '<pfad/der/betroffenen/datei>' -e '<zweiter-pfad>' docs/adr/   # Architekturentscheidungen
grep -rln '<pfad/der/betroffenen/datei>' tests/spec/                      # absichernde Guards
```
Treffer werden zitiert (Datei + Zeilen); die Frage lautet dann „bestehende Entscheidung behalten
oder ersetzen?". Ersetzen geht über ein `RENAMED`/`MODIFIED`-Delta auf den SSOT-Spec. Begründung
und Fallbeispiel: T002817 in [dev-flow-gotchas](.agents/skills/references/dev-flow-gotchas.md).

## Feature-Pfad

### Ablauf in drei Phasen
Die Planphase startet auf `main`; danach entsteht der Worktree.

| Phase | Wo | Was |
|---|---|---|
| **A — Proposal** | `main` | Assets sammeln, Codebase erkunden, Plan Intel Bundle (`intel.json`) füllen, Design-Bundle co-lokalisieren, Lavish-Board, **Brainstorming**, Plan in `.agents/plans/<slug>/` anlegen — Design-Spec-Frontmatter per `scripts/vda.sh frontmatter` |
| **B — Branch live** | Worktree | `scripts/worktree-create.sh <branch> <path>`, agent-lock claimen, Artefakte verschieben, Scaffold-Commit + Push |
| **C — Partial-Pipeline** | Worktree | Decompose in Partials, pro Partial: Plan schreiben → committen; danach plan-lint, finaler Push |

Vollständige Schrittfolge samt Befehlen, Decompose-/Fan-out-Mechanik und Kontext-Injektion für
Plan-Subagenten: [dev-flow-plan-phases](.agents/skills/references/dev-flow-plan-phases.md).

**Intel-Quellen des Bundles** (Phase A.1.5) — jede Sektion ist an ihre Quelle gebunden: `symbols`/`signature`/`type_text`/`call_graph` aus **codebase-memory** + **LSP**-Hover; `db_tables` aus **mcp-postgres** (read-only); `external_types` aus **context7**; `impact_files`/`s1_*` aus `wc -l` + `docs/code-quality/baseline.json`. Unerreichbare Quelle → `risks[]`-Eintrag statt leerer Sektion. Format: [plan-intel-bundle](.agents/skills/references/plan-intel-bundle.md).

### Guards des Feature-Pfads
- Alle weiteren Guards (Kollisions-Check T002444, Brainstorming-Pflicht, disjunkte Partials, Plan-Mutation, Slot-Gating, Design-Asset-Qualität): [feature-path-guards](references/feature-path-guards.md).

### Schritt 3.7: Plan-Erstellung — Decompose, dann paralleler Fan-out (T002074)
Zweistufig aus `intel.json` (deterministisch via `scripts/plan-intel.sh`) in Partials mit disjunkten `target_files` decomposen (Tests separat, Obergrenze 9), dann schreiben **parallele Plan-Subagenten** je ihre `tasks.d/pX-<name>.md`; der Orchestrator schreibt den `tasks.md`-Index mit Partial-Manifest, `## File Structure` und finalem Verify-Task. Mechanik, Kontext-Injektion und Provisionierung: [dev-flow-plan-phases](.agents/skills/references/dev-flow-plan-phases.md).

**SID-Propagation (PFLICHT, T006365):** Ermittle deine Session-SID mit
`bash scripts/agent-lock.sh mine` und weise die Plan-Subagenten an, in jedem Bash-Call zuerst
`export AGENT_LOCK_SID=<deine-sid>` auszuführen — sonst blockiert der Worktree-Write-Guard ihre
Datei-Tools.

**Der Subagent-Prompt MUSS [plan-quality-gates](.agents/skills/references/plan-quality-gates.md) verbindlich einbinden** —
der Subagent liest die Datei und schreibt den Plan dagegen. Sie ist die kanonische Referenz für
alle plan-lint Hard Rules (Details dort, nicht hier dupliziert).

### Schritt 3.8: Plan-Qualitäts-Gate (deterministischer Linter + advisory LLM-QA)
Führe ZUERST den fail-closed Linter auf den vom Subagenten zurückgegebenen Plan-Pfad aus — das ist
das **harte Gate**:
```bash
bash scripts/plan-lint.sh .agents/plans/<slug>/tasks.md
```
- **PASS (Exit 0):** optional die advisory LLM-QA (bricht nie):
  `bash scripts/plan-qa-check.sh .agents/plans/<slug>/tasks.md || true` — dann Schritt 4.
- **FAIL (Exit 1):** der Linter listet die Hard-Fails (F1/F2/STRUCT/P1/B1a). Erneut an einen
  Plan-Subagenten delegieren (Schritt 3.7) mit den Hard-Fails als Korrektur-Hinweis, bis PASS.
  KEIN Weitergehen mit rotem Linter.
- **Retry-Cap (T901790):** nach dem **3. FAIL in Folge** für denselben Plan NICHT weiter
  delegieren, sondern an den Operator eskalieren (Meldung mit den Hard-Fails +
  `mishap-tracker`-Eintrag `plan-lint-retry-cap`). Unbegrenzte Rework-Schleifen ohne
  Telemetrie sind ein Throughput-Leck — die Eskalation macht sie sichtbar statt sie zu
  verbergen.

### Schritt 4: Plan prüfen & übernehmen
Du behältst deinen vollen Brainstorming-Kontext: lies den zurückgegebenen Plan und prüfe ihn gegen
die im Brainstorming getroffenen Entscheidungen. Zusätzlich die Gate-Konformität (Checkliste in
[plan-quality-gates](.agents/skills/references/plan-quality-gates.md)): S1-Budgets gegen die **wirksame Schwelle**
(Baseline-Wert falls gebaselined, sonst Limit) pro Datei notiert — und bei Budget≈0 ein echter
Verkleinerungs-/Split-Schritt statt kosmetischem Zusammenziehen? Finaler Verifikations-Task mit
`task test:changed` + `task freshness:regenerate` + `task freshness:check`? Keine
Brand-Domain-Literale in den Code-Snippets? Bei Lücken erneut delegieren (Schritt 3.7) mit
konkreten Korrektur-Hinweisen.

### Schritt 4.5: Branch claimen
Der Claim muss laufen, bevor der Pre-Commit-Guard aus Schritt 5 die Lock-Datei liest:
```bash
bash scripts/agent-lock.sh claim branch "$(git -C "$WT" branch --show-current)" \
  --worktree "$WT" --label dev-flow-plan
```

### Schritt 5: Commit & Push — dann STOPP
> **Ein Aufruf statt der Sequenz unten (T900985):** devflow-mcp `plan_stage(slug, branch_type,
> plan_markdown | plan_file, design_markdown?)` legt Worktree + Branch von `origin/main` an,
> claimt den Branch, schreibt Plan und Design, lässt `plan-lint` laufen (rot = Abbruch mit
> strukturierten Befunden, Worktree bleibt), dann Preflight, Commit und Push. Die Rückgabe listet
> jeden Schritt. Die Einzelschritte unten bleiben der Vertrag, den `plan_stage` umsetzt.

**Pre-Commit Guard (PFLICHT) [T001268]:** `plan-preflight.sh` bündelt drei Checks; hier steht der
Vertrag, den der Operator nachvollziehen können muss (Umsetzung: Skript +
`docs/agent-guide/registry/plan-guards.yaml`):

1. **Nicht auf main committen:** Plan-stage Commits auf `main` sind verboten, nur ein
   Worktree-Branch ist zulässig.
2. **Staged-Set-Pflicht [T005114]:** geprüft wird `git diff --cached --name-only`; erlaubt sind
   Pfade unter `tests/` und `.agents/plans/` sowie exakt
   `components/website/src/data/test-inventory.json`. Andere gestagte Dateien brechen den Guard ab
   (Abhilfe: `git restore --staged <pfad>`). Unstaged/untracked wird nicht geprüft.
3. **Branch stimmt mit dem agent-lock-Claim überein [T003102]:** geprüft wird
   `agent-locks/branch__${BRANCH_SLUG}.json` (`/` im Branch-Namen → `-`); fehlt die Datei oder
   trägt sie einen anderen `branch`, bricht der Guard ab.

```bash
bash scripts/plan-preflight.sh pre-commit
# rc=0 alle Checks grün · rc=1 Guard verletzt · rc=2 Umgebungsfehler

git -C "$WT" add .agents/plans/<slug>/
git -C "$WT" commit -m "chore(plans): stage <slug> for execution"
git -C "$WT" push -u origin "$(git -C "$WT" branch --show-current)"
```

### Schritt 6: Optionaler Plan-Review (interaktiv)
Der Plan lässt sich annotierbar rendern und im Browser reviewen
(`bash scripts/plan-review/plan-review.sh render .agents/plans/<slug>/tasks.md`). Details:
[plan-review-ui](.agents/skills/references/plan-review-ui.md).

**STOPP.** Branch, Spec und Plan sind committed und gepusht. Der gepushte Branch ohne PR ist der
Hold: erst `dev-flow-execute` öffnet den PR.

## Fix-Pfad

Ein Fix braucht **zwingend einen failing Test**, bevor der Plan geschrieben wird. Der Test ist
eine pytest-Funktion in `tests/py/spec/<bereich>/test_<kurz_slug>.py` (Bereich aus
Feature-Name), nicht in einem nummerierten Modul. Setzt er ein externes Binary oder
einen externen Dienst voraus, gehört
der Verfügbarkeits-Guard (`if shutil.which("<binary>") is None: pytest.skip("<binary> binary not installed")`)
schon in die **Rotphase**. Vorher prüfen: `grep -rn '<binary>' .github/workflows/`; **0 Treffer
heißt: in CI nicht vorhanden**. Begründung: T002820 in
[dev-flow-gotchas](.agents/skills/references/dev-flow-gotchas.md).

**Bug-Triage: Ursachen-Verifikation vor Brainstorming [T002448-M5]:** Beobachtetes Symptom (Fakt)
und angenommene Ursache (Hypothese) trennen. Die Ursache MUSS vor „Lösung entwerfen" mit einem
minimalen Reproducer oder Log-Evidenz belegt sein; die Trennung gehört ins Proposal.
English: verify the bug cause during triage — distinguish observed symptom from assumed root cause,
and validate the cause with evidence before designing the solution.

Schritte 1–5 im Detail (Worktree, Branch-Claim, Lavish-Board, Brainstorming mit
Root-Cause-Fokus, failing Test, Plan, Commit):
[dev-flow-plan-phases](.agents/skills/references/dev-flow-plan-phases.md) §Fix-Pfad. Der abschließende Stage-Commit:

```bash
git -C "$WT" add tests/ .agents/plans/<slug>/tasks.md
(cd "$WT" && git commit -m "chore(plans): add failing test + stage plan")
git -C "$WT" push -u origin "$(git -C "$WT" branch --show-current)"
```
Der Commit enthält nur RED-Test und Plan-Artefakte, deshalb `chore(plans):` — nie `fix(`/`feat(`
(T001434 in den Gotchas; Guard blockiert).

## Chore-Pfad
Ausgelagert nach `dev-flow-chore` — Chores brauchen keinen Plan und werden dort direkt ausgeführt
und gemergt. In Schritt 0 für Chores sofort `dev-flow-chore` aufrufen und hier stoppen.

## Übergabe an dev-flow-execute
**Zustand bei STOPP:**
- Branch `feature/<slug>` oder `fix/<slug>` auf Remote gepusht
- Plan `.agents/plans/<slug>/tasks.md` committed
- Branch-Lock aktiv (andere Sessions sehen diesen Branch als belegt)
- **Kein PR** — der Plan-Stand ist ein gepushter Branch, nichts weiter. Wird aus anderem Grund
  früh einer gebraucht: `--draft` + Titel-Präfix `[plan-only]` (T002816 in den Gotchas).

**Nächster Schritt:** `dev-flow-execute` im Worktree des Branches aufrufen. Es leitet den Plan-Pfad
aus dem Branch-Namen ab (`feature|fix/<slug>` → `.agents/plans/<slug>/tasks.md`) — keine manuelle
Pfad-Übergabe nötig.

## Verwandte Skills
| Skill | Beziehung |
|-------|-----------|
| `using-git-worktrees` | Hintergrund — ersetzt durch `scripts/worktree-create.sh` (git-crypt-safe) |
| `superpowers:brainstorming` | **IMMER** aufgerufen — Feature-Pfad Schritt 3, Fix-Pfad Schritt 2.8. Superpowers-Plugin; opencode: inlined in diesem Skill (Shared Source) |
| `superpowers:writing-plans` | Aufgerufen vom Plan-Subagenten (Schritt 3.7). Superpowers-Plugin; opencode: inlined in diesem Skill (Shared Source) |
| `dev-flow-execute` | **Nachfolger im Kreislauf** — implementiert den erstellten Plan |
| `dev-flow-chore` | Geschwister — Chores statt Features/Fixes (direkter Kurzschluss) |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report
Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende des Skills über `mishap-tracker`
(aufrufbar via `bash scripts/hooks/mishap-tracker.sh`).

## Framework mapping
| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — geladen als `dev-flow-plan` (Directory-Symlink auf diese Shared Source). Sub-Delegation über `background-agents.ts` (`delegate` für read-only, native write-capable Delegation sonst); alle CLI-/MCP-Aufrufe sind framework-agnostisch |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |
