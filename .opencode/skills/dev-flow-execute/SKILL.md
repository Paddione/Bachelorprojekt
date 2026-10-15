---
name: dev-flow-execute
description: 'Use when implementing, executing, or delivering a staged plan on a feature/* or fix/* branch in .agents/plans/. Invoke after dev-flow-plan has committed and pushed the plan to the branch. Triggers on dev-flow-execute, execute plan, implement plan, resume plan, execute tasks, deliver feature, run plan runner.'
---

# dev-flow-execute — Plan-Ausführung & PR

Rollen- und Übergabevertrag: [dev-flow-lifecycle](.agents/skills/references/dev-flow-lifecycle.md). Diese Skill enthält nur die Execute-Gates, die Mechanik steht in den verlinkten Referenzen. Interaktive Ausführung über die OpenCode-Slash-Commands `dev-flow-exe.md` und `dev-flow-execute.md`.

> **cwd-Regel (PFLICHT, T006367):** Git-Aufrufe immer als `git -C <worktree>` bzw. mit
> explizitem cd+guard — **nie auf implizites cwd vertrauen**. `cd` wirkt nur auf den aktuellen
> Bash-Call (T002357), ein bare `git commit` landet sonst im Haupt-Checkout.

## Wann diese Skill greift

Gepushter Feature/Fix-Branch mit committiertem Plan `.agents/plans/<slug>/tasks.md` → PR gemergt zu `main`, Plan-Ordner im PR entfernt, Worktree und Branch aufgeräumt.

## Pre-Flight (Schritte −1 bis 1.7)

Befehlsfolgen: [dev-flow-execute-phases](.agents/skills/references/dev-flow-execute-phases.md). Hier nur Leistung und Abbruchbedingung:

| Schritt | Leistet | Bricht ab, wenn |
|---|---|---|
| **−1 Pre-Flight-Lock** | Branch claimen (`agent-lock claim branch` — T003102, kein ticket-Scope), Broadcast an andere Sessions | eine lebende Session den Branch schon hält |
| **0 Main-Sync** | Reaper, ungelesene Agent-Nachrichten, `git pull --rebase` im Haupt-Repo | — |
| **0 Worktree-Konsistenz** | Branch-Guard [T000321]: gültiger Branch ausgecheckt **und** unter `.worktrees/*` gearbeitet; legt sonst per `scripts/worktree-create.sh` einen an [T001363] | detached HEAD, oder Worktree-Erstellung schlägt fehl |
| **0.5 Rebase** | `git fetch origin main && git rebase origin/main` | Konflikt — dann manuell lösen |
| **1 Plan-Pfad laden** | leitet den Plan-Pfad aus dem Branch-Namen ab (`feature|fix/<slug>` → `.agents/plans/<slug>/tasks.md`), prüft die Plan-Datei **im Git-Tree** | kein `feature/`-/`fix/`-Branch, oder Datei nicht in `HEAD` |
| **1.4–1.7** | Doppelarbeit-Guard, `touched_files` aus der File Structure des Plans | Claim gehört nicht mehr dieser Session |

> **Der Plan-Pfad kommt aus dem Branch-Namen, nie aus einem Glob:**
> ```bash
> BRANCH=$(git -C "$WT" branch --show-current)
> case "$BRANCH" in feature/*|fix/*) ;; *) echo "kein Plan-Branch: '$BRANCH' — in den Worktree des Plan-Branches wechseln" >&2; exit 1;; esac
> SLUG=${BRANCH#*/}; PLAN_FILE=".agents/plans/$SLUG/tasks.md"
> git -C "$WT" cat-file -e "HEAD:$PLAN_FILE" || { echo "Plan fehlt in HEAD: $PLAN_FILE" >&2; exit 1; }
> ```

> **Worktree-Isolation ist Pflicht** [T001363]. Liegt auf dem Branch schon Arbeit oder hält ihn ein fremder Worktree (`branch in use`, Exit 3 aus `scripts/worktree-create.sh`), gilt der **Fortsetzungs-Kontrakt** [T002327] — fortsetzen statt neu beginnen, zurückstellen statt `blocked`: [resume-contract](.agents/skills/references/resume-contract.md).

### Schritt −1.1: Branch-Claim ist branch-scoped (T003102)

Der Pre-Flight-Lock claimt **branch-scoped**:
`bash scripts/agent-lock.sh claim branch "$BRANCH"`. Verifikation:
`bash scripts/agent-lock.sh check branch "$(git branch --show-current)"`. Der Release liegt im
Post-Merge-Cleanup (Schritt 3.9, `git-workflow` Schritt 7), ebenfalls branch-scoped (T003102).

## Schritt 2: Implementierung an frischen Implementer-Subagenten delegieren

> **Arbeitsteilung (T002365):** Implementer bis PR-Erstellung → **ENDE**, Bericht zurück, OHNE
> Auto-Merge-Anforderung. Orchestrator: Merge-Gate (3.8), CI-Watch (5.5); Exit 3/4 per
> `SendMessage` an den Implementer zurück, nicht neu spawnen [T001969].

Delegiere die **gesamte Implementierung an EINEN frischen Subagenten**. Du behältst den Plan-Kontext und verifizierst danach unabhängig — kein Per-Task-Fan-out (verschachtelte Delegation sprengt den Kontext, 162k-Prompt-Lehre). Spawn-Matrix je Harness (opencode: `background-agents.ts`-Delegation; Worktree-`cd`-Pflicht und Effort-Formulierungen dort), Kontext-Injektion (Plan-Datei, Branch, Plan-Intel-Bundle aus `intel.json`), Test-Pflicht (pytest) und Auftrag (Ein-Ebenen-Regel, SID-Propagation T006365, Freshness-Pflicht vor PR-Erstellung, ENDE T002365): [implementer-handoff](references/implementer-handoff.md) — den Auftrag wörtlich in den Subagenten-Prompt übernehmen.

### Wenn keine Delegation möglich ist [T002698]

Ohne Subagent (Session-Policy, Harness ohne Agent-Tool, Offline) **implementiert der Orchestrator
in-context** und führt die Schritte 3 bis 7.5 selbst aus. Die Ein-Ebenen-Regel entfällt. Rote
Checks und Rebase-Konflikte löst der Orchestrator selbst, weiter
ohne Hintergrund-Monitore [T001969]. Weil derselbe Kontext Implementierung und Prüfung trägt,
sorgfältiger verifizieren.

## Schritt 3: Lokale Verifikation

Rufe das Skill **`verification-before-completion`** auf (opencode: `references/verification-block.md`).
Verifikation: die vier Befehle + `./tests/runner.sh local <FA-XX oder SA-XX>` bei
Manifest-Änderungen. **SSOT:** [verification-block](.agents/skills/references/verification-block.md).

> **`freshness:check` wird erst NACH dem Commit der regenerierten Artefakte grün [T002523-M5]**,
> weil es auch prüft, ob sie committet sind. Reihenfolge: `regenerate` → Artefakte **committen** →
> `check`. Der Implementierungs-Commit bleibt in Schritt 5.

TypeScript/pnpm-Gotchas in Worktrees: [dev-flow-gotchas](.agents/skills/references/dev-flow-gotchas.md).

## Schritt 3.5: Admin-Menu Placement Gate

Falls neue Admin-Seiten hinzugefügt wurden:
```bash
bash scripts/admin-menu-gate.sh
```

## Schritt 3.8: Merge-Gate, Code-Review optional (Orchestrator)

**Orchestrator-Schritt, nicht Implementer** — Self-Attestation ist kein Review (T005307).

Merge-Kriterium: grüne Required Checks. Ein Code-Review ist **keine** Merge-Voraussetzung (D1).

1. Auto-Merge-Zustand des PRs prüfen (T006282). **Den Branch immer explizit übergeben** [T900040]:
   ohne `--branch` leitet `gh` den PR aus dem ausgecheckten Branch ab und meldet im Haupt-Checkout
   `OK: Kein PR gefunden` (rc=0), obwohl ein PR offen ist.
   ```bash
   bash scripts/check-pr-automerge.sh --branch "$BRANCH"
   ```
   Semantik:
   - `rc=0`: Auto-Merge noch nicht aktiv — weiter.
   - `rc=1`: Auto-Merge ist bereits aktiv (z. B. gesetzt durch den CI-Workflow „Enable Auto-Merge")
     — weder abbrechen noch deaktivieren; der Merge läuft bei grünen Required Checks.
   - `rc=2`: Abbruch als Umgebungsfehler (D3).
2. Optionales Review: nur wenn der Operator in der laufenden Session ausdrücklich ein Review
   verlangt (D2). Dann rufe das Skill **`requesting-code-review`** auf (opencode:
   `pr-review-toolkit:review-pr` oder ein Review-Subagent via `delegate()`). Findings vor dem
   Merge gehen per `SendMessage` an den **bereits gespawnten** Implementer (Muster Exit 3/4 aus
   T002365 — kein neuer Spawn, Doppel-Push-Risiko aus T001408); nach dessen Push erneut
   reviewen. Findings, die erst nach dem Merge eintreffen, gehen in einen eigenen Folge-PR (D4). Ohne ausdrücklichen Zuruf wird
   kein Review-Subagent gestartet.
3. Auto-Merge anfordern:

```bash
# GitHub merged selbstständig, sobald Required Checks grün sind.
# Die Anforderung ist idempotent, wenn Auto-Merge bereits aktiv ist.
(cd "$MAIN_REPO" && gh pr merge --auto --squash)
```

## Schritt 3.9: Finalisierung delegieren

> **Härtung T006284:** Nach dem Auto-Merge-Request endet der Orchestrator. Merge-Wait und Cleanup
> laufen in einem frischen Finalizer, weil ein Executor nach dem Merge an Kontext-Erschöpfung
> starb und der Cleanup liegen blieb.

Spawne einen **frischen Finalizer-Subagenten** (nativer Dispatch, `general-purpose`; Modell
`sonnet`, mechanisch `haiku`) und gib ihm alles explizit: PR-Nummer `$PR_NUM`, Branch `$BRANCH`,
Worktree-Pfad `$WT`.

Auftrag an den Finalizer (wörtlich Teil des Prompts):
- **Merge-Wait-Loop zuerst (T001149-M1):** [ci-fix-loop](.agents/skills/references/ci-fix-loop.md)
  §"PR-Merge-Wait-Loop" lesen und von dort ausführen. Bei Timeout nichts aufräumen, sondern
  strukturiert berichten.
- **Cleanup nach `git-workflow` Schritt 7** ([worktree-cleanup](../git-workflow/references/worktree-cleanup.md)):
  `bash scripts/agent-lock.sh release branch "$BRANCH"`, Worktree entfernen, lokalen und
  Remote-Branch löschen. Claims vor dem Worktree-Remove freigeben.
- **T001571-Standing-Direktive:** Bei Anzeichen von Kontext-Überlauf stoppen und einen
  strukturierten Handoff-Report liefern (erledigte Schritte, Git-Zustand, offene Schritte).
- **Positiven Endzustand prüfen (T901525/T901533):** Zum tatsächlichen PR-Head müssen
  die Required Checks `SUCCESS` belegen; `SKIPPED` genügt nicht. Danach unabhängig prüfen,
  dass der eigene Worktree sowie lokaler und Remote-Branch tatsächlich fehlen.
  Detailmechanik und Hook-Ausnahme:
  [repo-hygiene-ops §2](../references/repo-hygiene-ops.md#2-stale-branches).
- **Rückmeldung an den Auftraggeber (Pflicht):** Endzustand berichten — erledigt, offen.

**Der Orchestrator endet hier.** Er bleibt nur für die CI-Fix-Schleife (5.5) zuständig, solange
sie läuft.

## Schritt 4: Dev-Iteration (optional)

Iteratives Testen im Dev-Namespace `workspace-dev` auf Fleet ([deploy-routing.md](.agents/skills/references/deploy-routing.md)): `task dev:redeploy:website` bzw. `task dev:redeploy:brett` (setzt voraus, dass nach einem Push das `:dev`-Image per CI gebaut wurde).
> **⚠ Freshness-Guard (vor dem Commit):** `git diff --name-only` darf keine generierten Indexdateien zeigen. Sonst `task freshness:regenerate && git add` nachholen (Pre-commit-Hook nach `task secrets:install-hooks` automatisiert das).

## Schritt 5: PR erstellen

Commit → Push → PR läuft nach **`git-workflow` Schritt 2–4** (SSOT): Scope vorab gegen die
Allowlist prüfen [T001395], explizite Pathspecs statt `git add -A` (git-crypt-Guard [T001210]),
Commit-Verifikation `HEAD_SHA != BASE_SHA` [T000925], `preflight-pr-scope.sh` vor `gh pr create`,
REST-Fallback für Titel-Edits.
Execute-spezifisch: Der letzte Commit vor dem PR entfernt den Plan-Ordner
(`git -C "$WT" rm -r -q ".agents/plans/$SLUG"`, Commit `chore(plans): remove executed plan <slug>`).
Der Plan bleibt in den PR-Commits nachvollziehbar.
Rufe `commit-commands:commit-push-pr` auf oder führe `gh pr create` manuell aus.

> **⚠️ M1-Lesson (T001899):** Auto-Merge **nicht** vor dem ersten Implementierungs-Push aktivieren —
> Proposal-Commits würden sonst vorzeitig gemergt. Der Auto-Merge folgt erst im
> Merge-Gate (3.8).

## Schritt 5.5: CI/CD-Fix-Schleife (Orchestrator-Zuständigkeit, T002365)

**Orchestrator-Schritt, nie als Hintergrund-Monitor** [T001969 Mishap 1, T002351-M3]. Auto-Merge ist seit 3.8 angefordert und greift bei grünen Required Checks. Details/Required-Check-Liste: [ci-fix-loop](.agents/skills/references/ci-fix-loop.md).
```bash
PR_NUM=$(gh pr view "$BRANCH" --json number -q '.number')
gh pr checks "$PR_NUM" --watch
```
Bei roten Checks: Logs aus dem Skript-Output an einen `sonnet`-Subagenten (Fix-Routine: Freshness → TS → pytest → Kustomize → Commitlint), nach dem Push Loop wiederholen.
Meldet `gh pr view "$PR_NUM" --json mergeStateStatus` `DIRTY` oder `CONFLICTING`, rebased der Implementer gegen `origin/main` (T001408, T001415) — der **Orchestrator gibt den Konflikt per `SendMessage` an den bereits gespawnten Implementer zurück** (kein neuer Spawn — Doppel-Push-Risiko aus T001408) und startet die Schleife nach dessen Push erneut.

## Schritt 6: Merge-Wait & Cleanup

Zuständig ist der Finalizer aus Schritt 3.9. `gh pr merge --auto` kehrt sofort zurück; erst den
Merge abwarten ([ci-fix-loop](.agents/skills/references/ci-fix-loop.md) §"PR-Merge-Wait-Loop",
T001149-M1), dann aufräumen (`git-workflow` Schritt 7). `E2E PR` ist kein required check (T000722).
Befehlsfolgen: [dev-flow-execute-phases](.agents/skills/references/dev-flow-execute-phases.md).

> **Merge = Abschluss (T001092).** **Claims vor dem Worktree-Remove freigeben.**

## Schritt 8: Post-Merge Deploy & Verify

Prod-Deploy ist pull-basiert (FluxCD) und vom Merge entkoppelt; welche Pfade welchen Deploy
auslösen, steht im Mapping.
**Deploy-Mapping (Single Source of Truth):** [deploy-routing](.agents/skills/references/deploy-routing.md) — nur dort pflegen.
Danach `dev-flow-e2e` ausführen, um E2E-Tests gegen die Live-Umgebung zu schreiben.
> **Mitten in der Umsetzung blockiert?** Nutzer mit `lavish` grillen (`.lavish/<slug>-grilling.html`)
> und die Antworten in den Plan übernehmen (eigener `chore(plans):`-Commit).

## Übergabe — Kreislauf geschlossen

**Zustand nach Schritt 8:**
- `main` enthält die gemergten Änderungen (squash commit)
- Worktree `.worktrees/<slug>` gelöscht, Branch `feature/<slug>` gelöscht
- Branch-Lock freigegeben
**Kreislauf zurück zu `main`** — nächste Arbeit startet mit `dev-flow-plan` von einem frischen `git pull`.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | **Vorgänger im Kreislauf** — liefert Branch + committiertem Plan |
| `dev-flow-e2e` | Folge — schreibt E2E-Tests nach Deploy |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung

Melde alle aufgetretenen Fehler oder Prozess-Frictionen über `mishap-tracker`.

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full |
| **opencode** | Full |
| **agy** | Full |
