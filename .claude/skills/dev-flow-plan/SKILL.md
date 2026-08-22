---
name: dev-flow-plan
description: 'Use to choose the development path (feature/fix/chore), run brainstorming, and generate a design spec and implementation plan.'
---
# dev-flow-plan — Pfad-Wahl, Brainstorming & Plan

> **cwd-Regel (PFLICHT, T006367/T002357):** Bash-Aufrufe in dev-flow-Phasen immer mit
> `git -C <worktree>` bzw. explizitem cd+guard — **nie auf implizites cwd vertrauen**.
> `cd` wirkt nur auf den aktuellen Bash-Call, nicht auf
> die Datei-Tools. Git-Aufrufe deshalb immer als `git -C "$WT"` (sonst landet ein bare
> `git commit` im Haupt-Checkout), und ab Phase B tragen **alle** Read/Write/Edit-Pfade den
> Worktree-Präfix. Gilt für dieses ganze Dokument und wird unten nicht wiederholt.

Der Plan ist der behavior-change-Einstieg des gemeinsamen [Lifecycle-Vertrags](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-lifecycle.md): Ausgang ist ein Request, Ausgang ein gestagter, gepushter Plan ohne PR; danach übernimmt `dev-flow-execute`. Proposal, Plan-Lint, staged-plan und No-Early-PR-Gates bleiben hier normativ.

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
**AUSSTIEG:** Feature/Fix-Branch mit committiertem Plan auf Remote gepusht, Ticket `plan_staged`
**Nächster Schritt:** `dev-flow-execute` — liest Plan aus DB und implementiert

## Schritt −3: Deep Grilling (optional)
Bei komplexem oder unklarem Feature den User nach einer Grilling-Session fragen. Fragenkatalog:
[dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md). Q/A-Session über `lavish`
(`.lavish/<slug>-grilling.html`, Input-Playbook). Ticket-Anlage, Attachments und das
Persistieren der Antworten (`ticket.sh grill`): [grilling-to-ticket](file:///home/patrick/Bachelorprojekt/.claude/skills/references/grilling-to-ticket.md).

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
Lock-Lebenszyklus-SSOT: [session-coordination](file:///home/patrick/Bachelorprojekt/.claude/skills/references/session-coordination.md) [T000510]:
```bash
bash scripts/agent-lock.sh reap            # cwd-tote Prozesse killen, Worktrees prunen, tote Locks räumen
bash scripts/agent-lock.sh list            # "Wer macht was": laufende Claims anderer Sessions
bash scripts/agent-msg.sh read --unread    # offene Nachrichten paralleler Sessions [T000882]
git worktree list && bash scripts/worktree-git-op-guard.sh
```
Stale Worktrees nur nach bestandenem Vorcheck löschen [T005115]:
`bash scripts/worktree-clean-check.sh <path>` lehnt dirty-Worktrees UND solche mit aktivem
fremden branch-Claim ab (`agent-lock.sh check branch <branch>` — laufende Lauf-/Rollup-Session!).
Bei rc 1 den Worktree stehen lassen, sonst
`git worktree remove <path> --force && git branch -D <branch>`.

## Schritt 0: Pfad bestimmen
Wähle einen Pfad und kläre ihn mit dem User ab:
- **feature**: Neue Funktionen oder UI-Elemente. → diese Skill (Feature-Pfad unten).
- **fix**: Fehlerbehebung (erfordert Ticket-ID). → diese Skill (Fix-Pfad unten).
- **chore**: Wartung, Doku, Dependency-Bumps (keine Verhaltensänderung). → **`dev-flow-chore`
  aufrufen und STOPP** — Chores werden dort direkt ausgeführt und gemergt, nicht hier geplant.

Diese Skill plant nur (Feature/Fix) und stoppt vor der Umsetzung; die übernimmt `dev-flow-execute`.

**Artefakt-Ebene:** Die feature/fix/chore-Wahl ist die *Pfad*-Wahl; davor steht die *Artefakt*-Wahl
(PRD vs. ADR vs. Change-Proposal vs. Chore-Ticket). Entscheidungstabelle + PRD-Checkliste:
[plan-artifact-level](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-artifact-level.md).

## Schritt 0.7: Prior-Art-Suche vor der ersten Architekturfrage [T002829]
Bevor dem User eine **Architekturfrage** gestellt wird („gemeinsame Quelle oder duplizieren?",
„Bibliothek oder Inline?", „Hook oder Helper?"), MUSS geprüft sein, ob dieselbe Frage im Repo
schon einmal entschieden wurde. Gilt für **beide** Pfade, **vor** dem Brainstorming. Die Suche geht
über die Requirements, nicht nur über den Code — eine verworfene Lösungsrichtung hinterlässt im
Code keine Spur:
```bash
grep -rn -e '<pfad/der/betroffenen/datei>' -e '<zweiter-pfad>' openspec/specs/   # Requirements
grep -rln '<pfad/der/betroffenen/datei>' tests/spec/                            # absichernde Guards
```
Treffer werden zitiert (Datei + Zeilen); die Frage lautet dann „bestehende Entscheidung behalten
oder ersetzen?". Ersetzen geht über ein `RENAMED`/`MODIFIED`-Delta auf den SSOT-Spec. Begründung
und Fallbeispiel: T002817 in [dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md).

## Feature-Pfad

### Ablauf in drei Phasen
Die Proposal-Phase läuft bewusst **auf `main`** — so sieht OpenSpec beim Propose alle SSOT-Specs
und committed Proposals, nicht nur das eigene Branch-Delta. Erst danach entsteht der Worktree.

| Phase | Wo | Was |
|---|---|---|
| **A — Proposal** | `main` | Assets sammeln, Codebase erkunden, Plan Intel Bundle (`intel.json`) füllen, Design-Bundle co-lokalisieren, Lavish-Board, **Brainstorming**, `/opsx:propose <slug>` — Design-Spec-Frontmatter per `scripts/vda.sh frontmatter` |
| **B — Branch live** | Worktree | `scripts/worktree-create.sh`, agent-lock claimen, Artefakte verschieben, Scaffold-Commit + Push |
| **C — Partial-Pipeline** | Worktree | Decompose in Partials, pro Partial: Plan schreiben → committen → stagen → enqueuen; danach plan-lint, Embedding, finaler Push |

Vollständige Schrittfolge samt Befehlen, Decompose-/Fan-out-Mechanik und Kontext-Injektion für
Plan-Subagenten: [dev-flow-plan-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-plan-phases.md).

**Intel-Quellen des Bundles** (Phase A.1.5) — jede Sektion ist an ihre Quelle gebunden, damit der
Plan reale Signaturen statt erfundener Typen referenziert: `symbols`/`signature`/`type_text` und
`call_graph` aus **codebase-memory** plus **LSP**-Hover; `db_tables` aus **mcp-postgres**
(read-only); `external_types` aus **context7**; `impact_files`/`s1_*` aus `wc -l` +
`docs/code-quality/baseline.json`. Ist eine Quelle samt Fallback nicht erreichbar, wird ein
`risks[]`-Eintrag gesetzt statt die Sektion still leer zu lassen. Format:
[plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md).

### Guards des Feature-Pfads
- **Preflight: Check merged ticket** (T002279) — beide Pfade, vor der Worktree-Anlage:
  `bash scripts/agent-lock.sh check-merged "$TICKET_EXT_ID"` (`rc=1` = auf `main` schon gefixt →
  Ticket `done`, abbrechen). Exit-Codes: [dev-flow-plan-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-plan-phases.md) §Preflight.
- **Kollisions-Check vor der Worktree-Anlage** (T002444): `bash scripts/agent-collision.sh check --branch "$BRANCH"` —
  meldet von anderen Sessions belegte Branches/Worktrees, bevor `scripts/worktree-create.sh` läuft.
- **Brainstorming ist nicht optional** — in keinem der beiden Pfade. Es entscheidet, was überhaupt
  gebaut wird; ein Plan ohne vorherige Klärung plant die falsche Sache sorgfältig.
- **Ticket vor Branch** (T001917, T002050): Steht die `TICKET_EXT_ID` fest, trägt der Branch sie als
  Suffix (`feature/<slug>-T002050`). Existiert noch kein Ticket, wird es **vor** der Worktree-Anlage
  erstellt — sonst schlägt `preflight-pr-scope.sh` beim PR fehl (PR-Titel-Ticket-ID ≠ Branch-Name).
- **Disjunkte Partials (D1):** Keine Datei darf in zwei Partials liegen — `scripts/plan-lint.sh`
  erzwingt das. Das letzte Partial ist **immer** die Tests-Rolle und trägt den
  STRUCT2-Failing-Test-Step. Obergrenze 9.
- **Plan-Mutation:** Sobald ein Partial enqueued ist, darf der Planner es nicht mehr ändern.
- **Slot-Gating:** `stage-plan --partials N` setzt `slot_count`; die Factory dispatcht nur bis zu
  dieser Grenze. Ist die Factory schneller als der Planner, pausiert der Dispatcher, bis das nächste
  Partial enqueued ist.
- **Qualitäts-Gate vor Design-Assets:** Jedes synchronisierte SVG vor dem Ablegen prüfen —
  `currentColor` statt `<img>`-Einbettung, keine Stray-Hex-Werte, kein Root-`width/height`,
  Export-Vollständigkeit. Unpassende Assets werden **verworfen**, nicht mitkopiert (T000756).

### Schritt 3.7: Plan-Erstellung — Decompose, dann paralleler Fan-out (T002074)
Zweistufig: Der Orchestrator **decomposed** aus `intel.json` (deterministisch erzeugt von
`scripts/plan-intel.sh`, nicht von Hand) in Partials mit disjunkten
`target_files` (Tests immer separat, Obergrenze 9), dann schreiben **parallele Plan-Subagenten**
je ihre `tasks.d/pX-<name>.md`. Der Orchestrator schreibt den `tasks.md`-Index mit
Partial-Manifest, `## File Structure` und finalem Verify-Task. Mechanik, Kontext-Injektion und
Provisionierung: [dev-flow-plan-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-plan-phases.md).

**SID-Propagation (PFLICHT, T006365):** Ermittle deine Session-SID mit
`bash scripts/agent-lock.sh mine` und weise die Plan-Subagenten an, in jedem Bash-Call zuerst
`export AGENT_LOCK_SID=<deine-sid>` auszuführen — sonst blockiert der Worktree-Write-Guard ihre
Datei-Tools.

**Der Subagent-Prompt MUSS [plan-quality-gates](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md) verbindlich einbinden** —
der Subagent liest die Datei und schreibt den Plan dagegen. Sie ist SSOT für die plan-lint Hard
Rules: Frontmatter mit `title`, `ticket_id`, `domains`, `status` (F1), `## File Structure` nach der
H1 (STRUCT1), ein Failing-Test-Step mit der wörtlichen Phrase `expected: FAIL` **plus** echtem
Testrunner-Aufruf (STRUCT2), der finale Verify-Task mit `task test:changed` /
`task freshness:regenerate` / `task freshness:check` (STRUCT3), das Verbot offener Platzhalter wie
`TBD`/`TODO`/`FIXME` in der Prosa (P1) und die Budget-Integrität (B1a/B1b).

### Schritt 3.8: Plan-Qualitäts-Gate (deterministischer Linter + advisory LLM-QA)
Führe ZUERST den fail-closed Linter auf den vom Subagenten zurückgegebenen Plan-Pfad aus — das ist
das **harte Gate**:
```bash
bash scripts/plan-lint.sh openspec/changes/<slug>/tasks.md
```
- **PASS (Exit 0):** optional die advisory LLM-QA (bricht nie):
  `bash scripts/plan-qa-check.sh openspec/changes/<slug>/tasks.md || true` — dann Schritt 4.
- **FAIL (Exit 1):** der Linter listet die Hard-Fails (F1/F2/STRUCT/P1/B1a). Erneut an einen
  Plan-Subagenten delegieren (Schritt 3.7) mit den Hard-Fails als Korrektur-Hinweis, bis PASS.
  KEIN Weitergehen mit rotem Linter.

### Schritt 4: Plan prüfen & übernehmen
Du behältst deinen vollen Brainstorming-Kontext: lies den zurückgegebenen Plan und prüfe ihn gegen
die im Brainstorming getroffenen Entscheidungen. Zusätzlich die Gate-Konformität (Checkliste in
[plan-quality-gates](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md)): S1-Budgets gegen die **wirksame Schwelle**
(Baseline-Wert falls gebaselined, sonst Limit) pro Datei notiert — und bei Budget≈0 ein echter
Verkleinerungs-/Split-Schritt statt kosmetischem Zusammenziehen? Finaler Verifikations-Task mit
`task test:changed` + `task freshness:regenerate` + `task freshness:check`? Keine
Brand-Domain-Literale in den Code-Snippets? Bei Lücken erneut delegieren (Schritt 3.7) mit
konkreten Korrektur-Hinweisen.

### Schritt 4.5: Ticket anlegen oder wiederverwenden
SSOT für Ticket-Anlage, Claim, Stage und Embedding: [ticket-stage-procedure](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-stage-procedure.md).

Hier werden **nur Ticket angelegt und geclaimt** — der Claim muss laufen, bevor der
Pre-Commit-Guard aus Schritt 5 die Lock-Datei liest:
```bash
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "$(git -C "$WT" branch --show-current)" --worktree "$WT" --label dev-flow-plan
```
`stage-plan` läuft dagegen **erst nach dem Commit** (Grund: T002673 in
[dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md)).

### Schritt 5: Commit & Push, dann stagen — dann STOPP
**Pre-Commit Guard (PFLICHT) [T001268]:** `plan-preflight.sh` bündelt drei Checks; hier steht der
Vertrag, den der Operator nachvollziehen können muss (Umsetzung: Skript +
`docs/agent-guide/registry/plan-guards.yaml`):

1. **Nicht auf main committen:** Plan-stage Commits auf `main` sind verboten, nur ein
   Worktree-Branch ist zulässig.
2. **Staged-Set-Pflicht [T005114]:** geprüft wird `git diff --cached --name-only`; erlaubt sind
   Pfade unter `tests/` und `openspec/changes/` sowie exakt
   `components/website/src/data/openspec-status.json` und
   `components/website/src/data/test-inventory.json`. Andere gestagte Dateien brechen den Guard ab
   (Abhilfe: `git restore --staged <pfad>`). Unstaged/untracked wird nicht geprüft.
3. **Branch stimmt mit dem agent-lock-Claim überein [T003102 — akzeptiert ticket- UND
   branch-scoped Claims]:** geprüft wird `agent-locks/ticket__${TICKET_EXT_ID}.json`, Fallback
   `agent-locks/branch__${BRANCH_SLUG}.json`; fehlt auch der (`[ -f "$LOCK_FILE" ]` schlägt fehl —
   kein ticket-scoped agent-lock), bricht der Guard ab.

```bash
bash scripts/plan-preflight.sh pre-commit --ticket "$TICKET_EXT_ID"
# rc=0 alle Checks grün · rc=1 Guard verletzt · rc=2 Umgebungsfehler

git -C "$WT" add openspec/changes/<slug>/
git -C "$WT" commit -m "chore(plans): stage <slug> for execution [$TICKET_EXT_ID]"
git -C "$WT" push -u origin "$(git -C "$WT" branch --show-current)"

# ERST JETZT stagen — Flag-Semantik (--hold/--partials/--allow-empty-touched):
# references/ticket-stage-procedure.md §Flag-Semantik
bash scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "$(git -C "$WT" branch --show-current)" \
  --plan "openspec/changes/<slug>/tasks.md" \
  --partials <N> --hold
```

### Schritt 6: Optionaler Plan-Review (interaktiv)
Der Plan lässt sich annotierbar rendern und im Browser reviewen
(`bash scripts/plan-review/plan-review.sh render openspec/changes/<slug>/tasks.md`). Details:
[plan-review-ui](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-review-ui.md).

**STOPP.** Branch, Spec und Plan sind committed und gepusht. Ticket ist per
`execution_released=false` vom Factory-Dispatch zurückgehalten, bis `dev-flow-execute` es mit
`release-hold` freigibt.

## Fix-Pfad

Ein Fix braucht **zwingend einen failing Test**, bevor der Plan geschrieben wird — Rot-Grün ist
hier harte Voraussetzung, nicht Stilfrage. Der Test gehört nach `tests/spec/<spec-slug>.bats`
(die Spec aus `openspec/specs/`), nicht in eine neue ticket-nummerierte Datei. Setzt er ein
externes Binary oder einen externen Dienst voraus, gehört der Verfügbarkeits-Guard
(`command -v <binary> >/dev/null 2>&1 || skip "<binary> binary not installed"`) schon in die
**Rotphase**. Vorher prüfen, ob CI die Abhängigkeit überhaupt einrichtet —
`grep -rn '<binary>' .github/workflows/`; **0 Treffer heißt: in CI nicht vorhanden**, und ohne
Guard misst der Test dann die Ausstattung des Runners statt den Zustand des Codes.
Vollständige Begründung: T002820 in
[dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md).

**Bug-Triage: Ursachen-Verifikation vor Brainstorming [T002448-M5]:** Eine Bug-Beschreibung
enthält oft Symptom und Ursachen-Hypothese in einem Satz. Vor dem Brainstorming MUSS unterschieden
werden: was ist beobachtetes Symptom (Fakt, reproduzierbar) und was ist Annahme über die Ursache
(Hypothese, zu verifizieren). Die Ursache MUSS vor dem Schritt „Lösung entwerfen" mit einem
minimalen Reproducer oder Log-Evidenz belegt sein; die Trennung gehört ins Proposal.
English: verify the bug cause during triage — distinguish observed symptom from assumed root cause,
and validate the cause with evidence before designing the solution.

Schritte 1–5 im Detail (Ticket, Worktree, Claims, Lavish-Board, Brainstorming mit
Root-Cause-Fokus, failing Test, Plan, `stage-plan`, Commit):
[dev-flow-plan-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-plan-phases.md) §Fix-Pfad. Der abschließende Stage-Commit:

```bash
git -C "$WT" add tests/ openspec/changes/<slug>/tasks.md
(cd "$WT" && git commit -m "chore(plans): add failing test + stage plan [$TICKET_EXT_ID]")
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
- Plan `openspec/changes/<slug>/tasks.md` committed
- Ticket status = `plan_staged`
- Branch-Lock aktiv (andere Sessions sehen diesen Branch als belegt)
- **Kein PR** — der Plan-Stand ist ein gepushter Branch, nichts weiter. Wird aus anderem Grund
  früh einer gebraucht: `--draft` + Titel-Präfix `[plan-only]` (T002816 in den Gotchas).

**Nächster Schritt:** `dev-flow-execute` aufrufen. Es liest den Plan automatisch aus der DB
(`FACTORY-PLAN-REF`-Kommentar) — keine manuelle Pfad-Übergabe nötig.

## Verwandte Skills
| Skill | Beziehung |
|-------|-----------|
| `openspec-explore` (`/opsx:explore`) | **Vorgelagert** — Denkpartner ohne Artefakt; übergibt verdichtet an diese Skill, sobald Code entstehen soll |
| `using-git-worktrees` | Hintergrund — ersetzt durch `scripts/worktree-create.sh` (git-crypt-safe) |
| `superpowers:brainstorming` | **IMMER** aufgerufen — Feature-Pfad Schritt 3, Fix-Pfad Schritt 2.8. Claude Code built-in; opencode: inlined in diesem Skill (Shared Source) |
| `superpowers:writing-plans` | Aufgerufen vom Plan-Subagenten (Schritt 3.7). Claude Code built-in; opencode: inlined in diesem Skill (Shared Source) |
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
| **opencode** | Full — geladen als `opencode-flow-plan` (Directory-Symlink auf diese Shared Source). Sub-Delegation über `background-agents.ts` (`delegate` für read-only, native write-capable Delegation sonst); alle CLI-/MCP-Aufrufe sind framework-agnostisch |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |
