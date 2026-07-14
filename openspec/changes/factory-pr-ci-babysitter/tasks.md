---
title: "factory-pr-ci-babysitter — Implementation Plan"
ticket_id: T001805
domains: [factory, ci]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-pr-ci-babysitter — Implementation Plan

_Ticket: T001805 · Design-Spec: docs/superpowers/specs/2026-07-14-factory-pr-ci-babysitter-design.md_

## File Structure

```
scripts/factory/babysit-prs.sh            NEW  — ticket-loser PR-CI-Babysitter (bash, source lib.sh)
scripts/factory/wakeup.sh                 EDIT — best-effort Babysitter-Step im Tick (outside brand loop)
tests/spec/software-factory.bats          EDIT — neue @test-Blöcke (gh-Stub, Filter/Marker/Abort-Pfade)
openspec/changes/factory-pr-ci-babysitter/specs/software-factory.md  DONE — Delta bereits geschrieben
```

**S1-Budgets (wirksame Schwelle aus intel.json impact_files):**

- `scripts/factory/babysit-prs.sh` — neu, nicht-baselined, `.sh`-Limit 500 → **Budget 500**. Zielgröße ~150–250 Zeilen; deutlich unter der Schwelle mit Wachstumsreserve schneiden.
- `scripts/factory/wakeup.sh` — Ist 187 (main seit Plan-Erstellung um ~32 Zeilen gewachsen — Budget beim Rebase 2026-07-14 aktualisiert), nicht-baselined, `.sh`-Limit 500 → **Budget 313**. Einhängung fügt ~6–10 Zeilen hinzu (neuer Best-Effort-Block); bleibt weit unter der Schwelle.
- `tests/spec/software-factory.bats` — `.bats` ist S1-ausgenommen (`s1_limit 0` in intel.json) → **kein Zeilenbudget**; nur Anhänge-Konvention (neue `@test`-Blöcke ans Dateiende).

**Reuse-Kontrakt (G2, keine Logik-Duplikate):** `classify_failure` (Klasse), `build_loop_decide`/`build_loop_sig_hash` (Gates + No-Progress + Iterationslimit), `paths_are_escalate_class` (indirekt über `build_loop_decide` Gate 2), `guard_killswitch_on` (Kill-Switch), `factory_resolve` (Offline-Isolation via `FACTORY_DRY_RESOLVE`). Kein Nachbau dieser Funktionen.

**S3:** Keine Brand-Domain-Literale in Snippets. **S4:** `babysit-prs.sh` wird von `wakeup.sh` aus erreichbar gemacht (kein Orphan-Script).

---

## Task 1 — Skeleton + Guards + Scan (RED-Anteil vorbereiten)

Lege `scripts/factory/babysit-prs.sh` an. Muster wie `auto-close-merged.sh`: Shebang, Header-Kommentar, `set -euo pipefail`, `HERE="$(dirname "${BASH_SOURCE[0]}")"; source "$HERE/lib.sh"`, dann `source "$HERE/build-loop.sh"` und `source "$HERE/classify-failure.sh"` und `source "$HERE/guards.sh"`. Flag-Parsing (`--dry-run`, `--help`).

Steps:

- [x] Header-Block + `set -euo pipefail` + Sourcing der Reuse-Module (`lib.sh`, `build-loop.sh`, `classify-failure.sh`, `guards.sh`).
- [x] Flag-Parsing: `--dry-run` setzt `DRY_RUN=true`; `--help` gibt Usage aus und `exit 0`. Zusätzlich `DRY_RUN=true`, wenn `FACTORY_DRY_RUN=true`.
- [x] Guard: `if guard_killswitch_on "${BRAND:-mentolder}"; then echo "babysit-prs: kill-switch ON → skip" >&2; exit 0; fi`. (Kill-Switch ist global; `guard_killswitch_on` verlangt ein Brand-Argument, der globale NULL-Key entscheidet.)
- [x] Offline-Isolation: `if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then` — Scan über den gestubten `gh` läuft, aber kein realer Cluster/`factory_psql`-Zugriff. Analog `auto-close-merged.sh` Zeile 33–36.
- [x] Scan: `PRS_JSON=$(gh pr list --state open --json number,headRefName,isDraft,mergeStateStatus,statusCheckRollup,author,labels)`. Bei leerer Liste sauber beenden (`exit 0`).
- [x] `bash -n scripts/factory/babysit-prs.sh` muss clean sein.

Roter Test (STRUCT2) — schreibe zuerst diesen Failing-Test-Block ans Ende von `tests/spec/software-factory.bats` und führe ihn aus, BEVOR `babysit-prs.sh` existiert:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — babysit-prs.sh existiert noch nicht / Guard-Zeile fehlt)
```

BATS-Blöcke (ans Dateiende anhängen; File-Variable oben neben den anderen ergänzen: `BABYSIT="scripts/factory/babysit-prs.sh"`):

```bash
@test "T001805: babysit-prs.sh exists and is bash -n clean" {
  [ -f "$BABYSIT" ]
  run bash -n "$BABYSIT"
  [ "$status" -eq 0 ]
}

@test "T001805: babysit-prs.sh skips when kill-switch is ON" {
  run grep -E 'guard_killswitch_on' "$BABYSIT"
  [ "$status" -eq 0 ]
}

@test "T001805: babysit-prs.sh scans open PRs with the required json fields" {
  run grep -E 'gh pr list --state open --json[^"]*statusCheckRollup' "$BABYSIT"
  [ "$status" -eq 0 ]
}
```

## Task 2 — gh-Stub-Harness + Filter-Kette (Draft, gave-up, Renovate, CONFLICTING, Dedup)

Baue im BATS-Setup einen `gh`-Stub nach dem Muster aus `tests/unit/vda-release-notes-smoke.bats` Z. 18–37: `BIN_DIR` mit ausführbarem `gh`, per `PATH="$BIN_DIR:$PATH"` vorangestellt, argv wird in eine Logdatei geschrieben. Der Stub fällt je nach `$*` auf `pr list` / `pr view` / `pr comment` / `pr edit` / `run view` zurück und emittiert das jeweils benötigte JSON. **statusCheckRollup-Feldform (Risk):** jedes Element trägt `{"__typename":"CheckRun","conclusion":"FAILURE"|"SUCCESS"|null,"status":"COMPLETED"}` — der Stub bildet genau diese Form ab; nur `conclusion=="FAILURE"` zählt als rot.

Implementiere in `babysit-prs.sh` die Filter-Kette. Ein Kandidat wird via `jq` aus `PRS_JSON` selektiert (aufsteigende PR-Nummer, erster Treffer). Ausschluss, wenn: `isDraft==true`; `labels[].name` enthält `ci-babysitter-gave-up`; `author.login` ist Renovate-Bot (`renovate` / `renovate[bot]`) UND `FACTORY_BABYSIT_RENOVATE != true`; `statusCheckRollup` enthält **kein** Element mit `conclusion=="FAILURE"`. `mergeStateStatus=="CONFLICTING"` → separater Zweig (Task 3), kein Fix.

Steps:

- [x] Rot-Wertung: `is_red()` — `jq` prüft `any(.statusCheckRollup[]?; .conclusion=="FAILURE")`; pending (`null`) zählt nicht.
- [x] Filter: Draft, `ci-babysitter-gave-up`-Label, Renovate-Opt-in, Rot-Wertung — als `jq select(...)`-Kette über die PR-Liste, sortiert nach `.number`.
- [x] Dedup: für den gewählten Head-Branch prüfen, ob `.git/agent-locks/branch__<name>.json` existiert und lebendig ist (Muster: `bash scripts/agent-lock.sh list` grep auf den Branch-Namen) ODER ein `[TNNNNNN]`-Titel-Tag ein Ticket mit `in_progress` auflöst; falls ja → skip. Unter `FACTORY_DRY_RESOLVE` wird der Ticket-Status-Teil übersprungen (kein DB-Zugriff), der Branch-Claim-File-Check läuft.
- [x] `expected: FAIL` zuerst — die folgenden Filter-Tests rot laufen lassen, dann GREEN.

BATS-Blöcke (Filter-Kette; jeder Test stubt `gh` mit genau der Konstellation und prüft, dass **kein** `pr comment`/`pr edit` gegen einen ausgeschlossenen PR läuft — Argv-Log inspizieren):

```bash
@test "T001805: draft PRs are skipped" {
  _stub_gh_prs '[{"number":40,"isDraft":true,"mergeStateStatus":"BLOCKED","headRefName":"fix/x","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [ "$status" -eq 0 ]
  run grep -F 'pr comment' "$ARGV_LOG"
  [ "$status" -ne 0 ]   # kein Fix-Kommentar gegen den Draft
}

@test "T001805: PRs labelled ci-babysitter-gave-up are skipped" {
  _stub_gh_prs '[{"number":41,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/y","author":{"login":"paddione"},"labels":[{"name":"ci-babysitter-gave-up"}],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [ "$status" -eq 0 ]
  [[ "$output" != *"selected PR #41"* ]]
}

@test "T001805: Renovate PRs need FACTORY_BABYSIT_RENOVATE opt-in" {
  _stub_gh_prs '[{"number":42,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"renovate/dep","author":{"login":"renovate[bot]"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [[ "$output" != *"selected PR #42"* ]]
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true FACTORY_BABYSIT_RENOVATE=true run bash "$BABYSIT"
  [[ "$output" == *"selected PR #42"* ]]
}

@test "T001805: pending-only checks are not treated as red" {
  _stub_gh_prs '[{"number":43,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/z","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":null}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [[ "$output" != *"selected PR #43"* ]]
}
```

Der gewählte Kandidat wird mit der Log-Zeile `selected PR #<n>` markiert, damit die Tests deterministisch greifen; die Regex `selected PR #42` matcht diese Zeile.

## Task 3 — CONFLICTING-Zweig + Concurrency-1 + Marker-Zählung

- [x] CONFLICTING (D7): wenn der gewählte PR `mergeStateStatus=="CONFLICTING"` ist → einmalig `gh pr edit <n> --add-label ci-babysitter-conflict` (nur wenn Label fehlt), `emit_notify` (Task 5), KEIN Fix. Unter `--dry-run`/`FACTORY_DRY_RUN` nur loggen.
- [x] Concurrency-1 (D3): nach Filter genau EIN Kandidat (kleinste Nummer); Script verarbeitet höchstens einen PR und beendet danach.
- [x] Marker-Zählung (D1/D2): `attempts=$(gh pr view <n> --json comments --jq '[.comments[].body | select(test("<!-- ci-babysitter attempt="))] | length')`. Bei `attempts >= 2` → `gh pr edit <n> --add-label ci-babysitter-gave-up`, `emit_notify`, Ende (kein Fix).
- [x] `expected: FAIL` zuerst für die Concurrency- und Marker-Tests.

BATS-Blöcke:

```bash
@test "T001805: only the smallest-numbered red PR is selected (concurrency 1)" {
  _stub_gh_prs '[{"number":50,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/a","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]},{"number":48,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/b","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [[ "$output" == *"selected PR #48"* ]]
  [[ "$output" != *"selected PR #50"* ]]
}

@test "T001805: CONFLICTING PRs get labelled + notified, never fixed" {
  _stub_gh_prs '[{"number":51,"isDraft":false,"mergeStateStatus":"CONFLICTING","headRefName":"fix/c","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 run bash "$BABYSIT"
  [[ "$output" == *"QA_NOTIFY_PAYLOAD"* ]]
  run grep -E 'pr edit 51 --add-label ci-babysitter-conflict' "$ARGV_LOG"
  [ "$status" -eq 0 ]
  run grep -F 'run view' "$ARGV_LOG"
  [ "$status" -ne 0 ]   # kein CI-Log-Fetch → kein Fix-Versuch
}

@test "T001805: at 2 prior attempts the PR is given up + notified" {
  _stub_gh_prs '[{"number":52,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/d","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  _stub_gh_comments '[{"body":"<!-- ci-babysitter attempt=1 -->"},{"body":"<!-- ci-babysitter attempt=2 -->"}]'
  FACTORY_DRY_RESOLVE=1 run bash "$BABYSIT"
  [[ "$output" == *"QA_NOTIFY_PAYLOAD"* ]]
  run grep -E 'pr edit 52 --add-label ci-babysitter-gave-up' "$ARGV_LOG"
  [ "$status" -eq 0 ]
}
```

## Task 4 — Fix-Pfad: Log-Fetch, classify_failure, build_loop_decide, Hybrid-Fix

- [x] CI-Log holen: `gh run view --log-failed` (auf den Head-Branch bezogen), Fallback `gh run view --log`, in eine Tempdatei schreiben. `class=$(classify_failure "$logfile")`.
- [x] Entscheidung: `hash=$(build_loop_sig_hash "$logfile")`; `read -r decision _ < <(build_loop_decide "$attempts" 2 "" "$class" "" "$hash")`. (Iterationslimit 2 analog pipeline.js; `touched_csv` leer im Scan-Kontext, Gate 2 greift über die Klasse.) `abort:*` → `emit_notify` + Marker-Kommentar (Task 5), Ende.
- [x] `continue`-Fix, Klasse `freshness` (deterministisch): Temp-Worktree `git worktree add "$WT" "$head"`; darin `task freshness:regenerate`; `git commit -am "chore: refresh (ci-babysitter)"`; `git push`; `git worktree remove "$WT"`. Kein Merge, kein Force-Push, kein Rebase.
- [x] `continue`-Fix, Klassen `ci|test|lint` (Agent): Temp-Worktree; `"${CLAUDE_BIN:-claude}" -p "<eng gescopeter Fix-Prompt>" --allowedTools "Bash(task *),Bash(git *),Edit,Read" --permission-mode acceptEdits`; danach push durch den Agenten bzw. `git push` im Worktree; Worktree entfernen. Prompt bleibt minimal (nur den einen CI-Fehler beheben, keine Feature-Arbeit).
- [x] Unter `--dry-run`/`FACTORY_DRY_RUN`: Log-Fetch + classify + decide laufen (read-only), aber KEIN Worktree/commit/push/Agent-Dispatch — nur loggen.
- [x] `expected: FAIL` zuerst für die decide-Abbruch- und Klassen-Routing-Tests.

BATS-Blöcke (Log-Fetch stubt `gh run view` mit einer Log-Datei-Ausgabe; decide-Pfade prüfen, dass Escalate-Klassen KEIN Push auslösen):

```bash
@test "T001805: escalate-class failures abort without a fix (build_loop_decide gate)" {
  _stub_gh_prs '[{"number":60,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/e","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  _stub_gh_runlog $'SQLSTATE 42P01\nrelation "x" does not exist\n'
  FACTORY_DRY_RESOLVE=1 run bash "$BABYSIT"
  [[ "$output" == *"abort:escalate-gate"* ]] || [[ "$output" == *"QA_NOTIFY_PAYLOAD"* ]]
  run grep -F 'git push' "$ARGV_LOG"
  [ "$status" -ne 0 ]   # Escalate → kein Push
}

@test "T001805: freshness failures route to task freshness:regenerate (dry-run logs, no push)" {
  _stub_gh_prs '[{"number":61,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/f","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  _stub_gh_runlog $'generated artifact(s) are stale\nrun \x27task freshness:regenerate\x27\n'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [[ "$output" == *"freshness"* ]]
  run grep -F 'git worktree add' "$ARGV_LOG"
  [ "$status" -ne 0 ]   # dry-run → kein Worktree/Push
}
```

Die Regex `task freshness:regenerate` und `git worktree add` matchen die im Fix-Pfad oben gezeigten Kommandos; der Klassen-String `freshness` wird vom `classify_failure`-Aufruf geloggt.

## Task 5 — Notify-Payload + Marker-Kommentar + Wakeup-Einhängung

- [x] `emit_notify()`: gibt eine Zeile im `qa-notify.sh`-Format auf **stdout** aus: `QA_NOTIFY_PAYLOAD: title="..." body="..." event=ci-babysitter pr=<n>`. KEIN eigener PushNotification-Aufruf — der aufrufende Wakeup-Kontext leitet weiter.
- [x] `post_marker()`: `gh pr comment <n> --body "<!-- ci-babysitter attempt=<N> -->\n<class> / <decision>\n\`\`\`\n<log-tail ~20 Z.>\n\`\`\`"`. Marker-Zeile strikt maschinenlesbar (Task 3 zählt darauf). Log-Tail via `tail -n 20`.
- [x] Wakeup-Einhängung (D8) in `scripts/factory/wakeup.sh`: nach der `for _t_brand … auto-triage.sh`-Schleife (endet Z. 125) und VOR dem `"${CLAUDE_BIN}" -p`-Dispatch (Z. 126) einen best-effort-Block einfügen — **außerhalb** jeder Brand-Schleife, genau ein Aufruf pro Tick:

```bash
# T001805: PR-CI-Babysitter — repo-weit, brand-agnostisch, best-effort.
bash "${REPO}/scripts/factory/babysit-prs.sh" 2>&1 \
  | sed 's/^/[babysit] /' >&2 || true
```

- [x] `expected: FAIL` zuerst für den Wakeup-Einhäng-Test und den Notify-Format-Test.

BATS-Blöcke:

```bash
@test "T001805: wakeup.sh invokes babysit-prs.sh once outside the brand loop" {
  run grep -E 'scripts/factory/babysit-prs\.sh' "$WAKEUP"
  [ "$status" -eq 0 ]
  # genau EIN Aufruf (nicht in einer for-_x_brand-Schleife dupliziert)
  run bash -c "grep -c 'babysit-prs.sh' '$WAKEUP'"
  [ "$output" -eq 1 ]
}

@test "T001805: babysit-prs.sh emits QA_NOTIFY_PAYLOAD on stdout (no direct PushNotification)" {
  run grep -F 'QA_NOTIFY_PAYLOAD' "$BABYSIT"
  [ "$status" -eq 0 ]
  run grep -F 'PushNotification' "$BABYSIT"
  [ "$status" -ne 0 ]   # Notify läuft über den Wakeup-Kontext, nicht im Script
}
```

## Task 6 — Final Verification (RED → GREEN Abschluss)

- [x] **RED bestätigen:** vor der Implementierung liefen die neuen `@test`-Blöcke rot:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot vor Implementierung)
```

- [x] **GREEN bestätigen:** nach Implementierung von `babysit-prs.sh` + Wakeup-Einhängung laufen alle Blöcke grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
```

- [x] `bash -n scripts/factory/babysit-prs.sh` und `bash -n scripts/factory/wakeup.sh` clean.
- [x] Test-Inventar nach Test-Änderung regenerieren und mitcommitten:

```bash
task test:inventory
```

- [x] Die drei mandatory CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [x] `website/src/data/test-inventory.json` zusammen mit den Test-Änderungen committen.
