# dev-flow Gotchas

This section aggregates known operational issues, gotchas, and workarounds for the `dev-flow` pipeline. Refer to these when executing plans, creating tickets, or deploying components.

### [T000321] Main Branch Guard (Branch Protection)
**Context**: Never commit or push directly to `main`.
**Rule**: Always create a feature, fix, or chore worktree/branch. `dev-flow-plan` and `dev-flow-execute` verify that the active branch is not `main` before commiting/pushing changes.

### [T000343] Brainstorm Port Selection
**Context**: Visual Companion server port mismatch.
**Rule**: Always derive the `$PORT` dynamically from the return value of `start-server.sh`. Hardcoding or guessing a port from a prior session will result in 502 Bad Gateway.

### [T000298] Git Auto-Merge in Worktrees
**Context**: `gh pr merge --auto` inside `.worktrees/*` worktrees.
**Rule**: Running `--auto` inside a worktree can silently fail or skip because Git thinks `main` is already in use by the primary worktree. Always run the merge command either with explicit `--repo` from the primary repository directory, or poll the checks sequentially (without `--auto`) before merging.

### [T000346] K8s Object verification before Planning
**Context**: Mismatch between planned k8s object name and actual name.
**Rule**: Before detailing a step to patch a deployment (e.g. `talk-hpb`), run `kubectl kustomize` or `kubectl get` to verify its actual name (e.g. `spreed-signaling`) and active configurations/affinity rules. Do not assume names.

### [T000244] JSON Patch duplicate keys in Env variables
**Context**: Using `op: add` to append env variables in Kustomize patches.
**Rule**: If the variable already exists in the base deployment, use `op: replace` instead of `op: add`. Otherwise, the duplicate key causes Kubernetes API server validation failures at dry-run time.

<a id="t000218"></a>
### [T000218] task test:all exit 128
**Context**: Intermittent exit code 128 on first run in a fresh worktree.
**Rule**: This is a transient race condition between `npm install` and BATS submodule checks. Re-running the command a second time succeeds.

### [T000245] fresh worktree node_modules missing
**Context**: Node modules are not checked in, and worktrees are clean.
**Rule**: Run `npm ci --prefix components/brett` before running tests or compilation within a fresh worktree.



### [T000214] openclaw approvals get JSON parsing
**Context**: `openclaw approvals get` returns tab-delimited text, not JSON.
**Rule**: Avoid passing stdout to python/jq JSON parsers. If needed, parse the raw `.openclaw/exec-approvals.json` configuration file directly from disk.

### [T000335] Commitlint body-max-line-length
**Context**: Commit lint rejects body lines exceeding 100 characters.
**Rule**: Wrap all commit message body lines to under 100 characters. For raw output or log traces, truncate them or wrap them manually.

### [T000342] gh pr checks parsing
**Context**: Parsing `gh pr checks` status.
**Rule**: Do not use `gh pr view --json state` or check status enums because the values do not reliably map to build results. Use text-based parsing of the checks list columns. `gh pr checks` itself does **not** support `--json` on the installed CLI version (2.45.0) — `gh pr checks --json name,state,link` fails silently and, if the exit code isn't checked, can make a watch script report "all green" while checks are actually still pending (observed in T001378; fixed in `scripts/devflow-ci-watch.sh` via [T001408]/#2441, which dropped `--json` from the `gh pr checks` call and now cross-checks real conclusions via `gh pr view --json statusCheckRollup`, erroring out loud instead of defaulting to success on parse failure). Any new CI-watch tooling must follow the same pattern: never treat a failed/parse-errored `gh` call as an implicit pass.

### [T001395] Freshness-Auto-Regen race → PR flips to CONFLICTING mid-flow
**Context**: Scheduled freshness auto-regen (`docs/code-quality/repo-index.json` and other generated
artifacts) commits directly to `main` on its own cadence. If a feature/fix/chore PR stays open across
one of these auto-regen cycles, GitHub reports `mergeStateStatus=CONFLICTING` mid-flow even though no
human touched the file — this happened during T001378 and required a manual rebase + regenerate +
force-push to unstick.
**Rule**: Keep PRs short-lived to minimize the window for this race. If a PR does flip to
`CONFLICTING` and the diff is only in generated freshness artifacts (`docs/code-quality/*.json`,
`components/website/src/data/test-inventory.json`, etc.), don't debug it as a real conflict — immediately run
`git fetch origin main && git rebase origin/main && task freshness:regenerate && git add <regenerated files> && git rebase --continue && git push --force-with-lease`. `scripts/devflow-ci-watch.sh` already self-services a plain `DIRTY` rebase (see its preflight block); `CONFLICTING` from this specific race needs the regenerate step added in, since a bare rebase won't reproduce the artifact the auto-regen job would have produced.

### [T001395] Check the commit-scope SSOT allowlist BEFORE the first commit
**Context**: The `<type>(<scope>): <subject>` allowlist is curated on purpose (SSOT: `namedScopes` in
`commitlint.config.cjs`, printed by `scripts/validate-commit-msg.sh scopes` and enforced pre-push by
`.githooks/pre-push` / `scripts/preflight-pr-scope.sh`). Since T002328 the list holds 14 entries and a
consolidated old name is rejected with its target named in the diagnostic. Note that `ci.yml` is
**not** a source — it says so itself ("Scopes are NOT enforced here"); the claim that it loaded a
`scopes:` list survived here as stale documentation until T002328. Every
existing dev-flow skill only runs `preflight-pr-scope.sh` right before `gh pr create` — i.e. **after**
the implementation commit(s) already landed with whatever scope was guessed. During T001378 an
implementer subagent committed with `installer`/`rustdesk` (neither registered), which was only
caught at the PR-title preflight, forcing a soft-reset + recommit with `infra`/`ci`/`test`.
**Rule**: Before writing the first `git commit -m "<type>(<scope>): ..."` in a plan or chore, list the
current allowlist and pick a scope from it (or register a new one first):
```bash
bash scripts/validate-commit-msg.sh scopes   # prints the full SSOT scope list
# new scope needed? register it BEFORE committing:
bash scripts/register-scope.sh <new-scope>
```
This is advisory (the post-commit `preflight-pr-scope.sh` gate still exists as the hard backstop),
but doing it pre-commit avoids the soft-reset/recommit cycle entirely.

### [T001914] Health-goal commits use scope `goals`, not `health`
**Context**: During T001901 (health-goals-refresh, PR #2881) a commit was written with
`chore(health): ...`. `health` is not a registered scope in `commitlint.config.cjs`
`NAMED_SCOPES` — only `goals` is. The `pre-push` hook blocked the push and the commit had to be
amended to `chore(goals): ...` before it could land. The confusion is understandable: the repo
health dashboard section is literally named `#health` (see `.claude/lib/goals.md` header) and
`HEALTH_GOAL_SCOPE_RE` (`G-[A-Z][A-Z0-9]+`) matches individual goal IDs like `G-SIZE02` — neither
of those is the same thing as a free-standing `health` scope.
**Rule**: Commits touching `.claude/lib/goals.md`, health-goal baselines/measurements, or any
`G-<ID>` gate belong to scope `goals` (established, used in 15+ prior commits) — or, if the
commit is about one specific goal ID, use that goal ID itself as the scope (e.g.
`fix(G-SIZE02): ...`), which `HEALTH_GOAL_SCOPE_RE` already allows. Do not introduce a new
generic `health` scope for this — `goals` already owns the domain and splitting it would only
create ambiguity about which of the two to use for future health-goal work.

### [T000344] Database row check before file deletion
**Context**: Deleting plan markdown file before verifying database storage.
**Rule**: Always verify that the plan exists in `tickets.ticket_plans` by checking that the row count is greater than 0 before running `rm` on the plan file.

### [T000388] tickets.ticket_plans Query Timeout
**Context**: Querying the `tickets.ticket_plans` table over `kubectl exec`.
**Rule**: Never run `SELECT *` or query the `content` column on the entire `tickets.ticket_plans` table. The `content` column contains large markdown plan files which will cause connection timeouts over the `kubectl exec` tunnel. Always query metadata columns (such as `id`, `ticket_id`, `slug`, `branch`, `pr_number`, `archived_at`) or filter explicitly by a specific `ticket_id` or `slug`.

### [T000418] Playwright Project Assignment
**Context**: Assigning the correct Playwright project when writing E2E tests.
**Zuordnungstabelle**:
Use the correct project name in `playwright.config.ts` depending on the targeted service/brand:

| Projektname | Zweck / Ziel |
|-------------|--------------|
| `mentolder` | E2E-Tests für die Marke Mentolder |
| `korczewski` | E2E-Tests für die Marke Korczewski |
| `website` | Allgemeine Website E2E-Tests |
| `services` | Testen von Hintergrund-Diensten |
| `brett-mentolder` | Systembrett E2E-Tests auf Mentolder |
| `smoke` | Smoke-Tests für den Live-Cluster |
| `systemtest` | System-Integrationstests |

### [T001393] Lavish reload can discard in-flight form input
**Context**: Re-running `npx -y lavish-axi <html-file>` (e.g. to fix a layout warning) reloads the existing browser tab.
**Rule**: See `.claude/skills/lavish/SKILL.md#reload-safety` for the full lavish reload-safety protocol — never reload while a poll is outstanding, and check the last poll status before reloading.

### [T002637-M5] Massenverschiebung: Referenzliste zuerst erheben, nicht aus CI ernten
**Context**: Nach der sdlc/-Verschiebung (T002624) waren Testpfade in `tests/` nicht nachgezogen. Das kam über DREI CI-Runden einzeln hoch (dashboard.bats; dann G-CQ02 in zwei Kopien; dann pipeline-interface/openspec-pgvector/brain-link-derivation), weil jeweils nur der gemeldete Fehler behoben wurde — statt einmal die Gesamtliste zu erheben. Ein Teil zeigte sogar auf eine ZWISCHENFORM der Verschiebung (`components/website/src/sdlc/components/`), die nie existierte.
**Rule**: Bei einer Massenverschiebung VOR dem ersten Commit systematisch alle Referenzen auf die alten Pfade suchen (git grep über den ganzen Baum, inkl. tests/), NICHT CI-Runde für CI-Runde die gemeldeten Fehler abarbeiten. Erwartete Fehlerliste einmal vollständig erheben und abhaken.


### [T002673] stage-plan läuft NACH dem Commit, nicht davor
**Context**: `stage-plan` liest die Plandatei über `git cat-file -p "${branch}:${plan}"` aus dem **Branch-Commit**, nicht aus dem Arbeitsbaum (`scripts/vda/ticket/stage-plan.sh`). Wird es vor dem Commit aufgerufen, steht dort noch das `propose`-Skeleton; die `touched_files`-Ableitung meldet dann `keine Pfade ableitbar` und lässt die Spalte leer — ohne dass es auffällt, weil die Meldung nur auf stderr steht und der Stage trotzdem Erfolg meldet. Die Ableitung selbst funktioniert (`scripts/plan-touched-files.sh` liefert gegen die reale Datei die vollständige Liste).
**Rule**: In dev-flow-plan Schritt 4.5 nur Ticket anlegen und claimen (der Claim muss vor dem Pre-Commit-Guard liegen), `stage-plan` erst in Schritt 5 nach `git commit`/`git push`. `stage-plan` ist idempotent und vereinigt `touched_files` in SQL — ein späterer Zweitaufruf ist unschädlich, die richtige Reihenfolge erspart ihn nur.

### [T002820] Externe Abhängigkeiten schon in der Rotphase absichern
**Context**: Setzt ein failing Test ein externes Binary oder einen externen Dienst voraus (Drittanbieter-CLI, erreichbarer Cluster, laufende DB), ist er in CI ohne Guard dauerhaft rot und misst die Ausstattung des Runners statt den Zustand des Codes. Damit ist der Zweck der Rotphase zerstört: „rot, weil Implementierung fehlt" und „rot, weil das Binary fehlt" sind in der CI-Ausgabe nicht zu unterscheiden.
**Rule**: Der Verfügbarkeits-Guard gehört in die **Rotphase**, nicht erst in die Grünphase — `command -v <binary> >/dev/null 2>&1 || skip "<binary> binary not installed"`. Etabliertes Muster: `tests/spec/sealed-secret-cluster-drift.bats`. Vor dem Schreiben prüfen, ob CI die Abhängigkeit überhaupt einrichtet (`grep -rn '<binary>' .github/workflows/`; **0 Treffer heißt: in CI nicht vorhanden**). Beide Richtungen verifizieren — mit dem Binary im PATH läuft der Test, mit `PATH=/usr/bin:/bin` skippt er sauber.

### [T002816] Kein fertig aussehender PR aus dem Plan-Stand
**Context**: Ein offener PR, dessen Titel einen fertigen Fix ankündigt, während der Branch nur `chore: anchor branch` und `chore(plans): add failing test + stage plan` trägt, liest sich von außen als „kaputter Fix, Diagnose nötig" statt als „Plan gestagt, Implementierung ausstehend". Die roten Checks stammen dann aus der schlicht nicht committeten Implementierung — untracked `specs/`-Delta („missing specs/ delta dir") und uncommittete SSOT-Ergänzung, auf die ein BATS-Guard greppt. In einer Queue mit mehreren PRs kostet das gezielt Zeit an der falschen Stelle (beobachtet an PR #3918/T002719).
**Rule**: Der Plan-Stand ist ein gepushter Branch ohne PR. Wird aus anderem Grund dennoch früh ein PR gebraucht, dann als Draft (`gh pr create --draft`) mit Titel-Präfix `[plan-only]`, damit der Zustand aus der PR-Liste ablesbar ist. Den regulären PR eröffnet `dev-flow-execute` nach der Implementierung.

### [T002817] Prior-Art-Suche geht über die Requirements, nicht nur über den Code
**Context**: Die Frage „gemeinsame Quelle vs. Allowlist spiegeln" war in `openspec/specs/divergence-guard.md` (aus T002470) bereits zugunsten der Duplikation entschieden und mit drei Drift-Tests abgesichert. Gefunden wurde das erst beim Schreiben des failing Tests — also nach der Nutzerfrage, die daraufhin ein zweites Mal beantwortet werden musste. Eine bewusst verworfene Lösungsrichtung hinterlässt im Code definitionsgemäß keine Spur; sie steht nur im Spec.
**Rule**: dev-flow-plan Schritt 0.7 vor der ersten Architekturfrage. Liefert die Suche ein Requirement zum selben Gegenstand, wird es zitiert (Datei + Zeilen) und die Frage lautet nicht mehr „welche Richtung?", sondern „bestehende Entscheidung beibehalten oder ersetzen?". Ersetzen geht über ein `RENAMED`/`MODIFIED`-Delta auf den SSOT-Spec, nicht durch stilles Danebenschreiben. Verwandt, aber nicht dasselbe: T002448-M5 verlangt, dass die **Ursache** vor dem Lösungsdesign belegt ist — dieser Punkt verlangt zusätzlich, dass die **Lösungsrichtung** nicht schon einmal bewusst verworfen wurde.

### [T001434] Plan-Stage-Commits heißen `chore(plans):`, nie `fix(`/`feat(`
**Context**: Der Stage-Commit enthält nur den RED-Test und Plan-Artefakte, keinen Production-Code. Ein `fix(…)`/`feat(…)`/`refactor(…)`/`perf(…)`-Präfix wäre eine Lüge, und der nachfolgende `dev-flow-execute`-Implementer vertraut dem Titel und überspringt den eigentlichen Fix — exakt das ist bei T001434 passiert.
**Rule**: Immer `chore(plans):`. Guard: `scripts/check-commit-vs-diff.sh` + `.githooks/commit-msg` blockieren solche Commits; Notfall-Bypass `SKIP_COMMIT_VS_DIFF=1`.
