## p6 — BATS-Guards für die fünf Fixes

**Rolle:** tests · **depends_on:** p1–p5 · **target_files:**
`tests/spec/batch-worktree-guard-tooling-fixes/*.bats` (5 neue Dateien),
`website/src/data/test-inventory.json` (regeneriert)

### Ziel

Ein BATS-Guard pro Vorgang (T002416-Konvention: eigene Datei unter
`tests/spec/<spec-slug>/`, kein Ticket im Dateinamen), durchgehend Output-Verifikation
(T002448-M4 — Kommandos werden AUSGEFÜHRT, `$status`/`$output` geprüft) mit Positiv-Anker
(T002356-M1 — erst der gültige Fall, dann die Negativ-Aussage; ein Anker, der bei fehlender
Implementierung rot wird). Semantik statt Darstellung (T002716): zugesichert werden
Exit-Codes, Vorkommen von Pfaden und Inhalts-Marker, nie Satz-Wortlaut mit Zeilenanker.

Jede Testdatei trägt im Header-Kommentar den Prüfmodus (Output-Verifikation) und den
zugehörigen Fix. Runner in allen Rot-/Grün-Steps ist der vendored Runner
`tests/unit/lib/bats-core/bin/bats` (nicht `which bats`).

### S1-Budget (gates.yaml, Stand 2026-08-14)

| Datei (neu) | Ist (wc -l) | Budget (effektiv) |
|---|---|---|
| `tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats` | 0 | n/a — `.bats` hat keinen Eintrag in gates.yaml `s1.limits` → **nicht S1-gated** |
| `tests/spec/batch-worktree-guard-tooling-fixes/write-guard-suffix-normalization.bats` | 0 | n/a — `.bats` nicht S1-gated |
| `tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats` | 0 | n/a — `.bats` nicht S1-gated |
| `tests/spec/batch-worktree-guard-tooling-fixes/embed-connect-timeout.bats` | 0 | n/a — `.bats` nicht S1-gated |
| `tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats` | 0 | n/a — `.bats` nicht S1-gated |

Begründung (verifiziert 2026-08-14): `docs/code-quality/gates.yaml` `s1.limits` listet nur
`.astro/.ts/.svelte/.sh/.mjs/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php` — kein `.bats`-Limit,
`docs/code-quality/baseline.json` führt `tests/spec`-Dateien als „nicht-baselined" (Prüfpfad
`scripts/code-quality/gates/s1-filesize.mjs` gibt bei fehlendem Limit `null` zurück = kein
Gate). Reserve-Planung trotzdem: je Datei ~50–90 Zeilen, keine Sammeldatei. B1a prüft nur
Bestandsdateien; `website/src/data/test-inventory.json` wird per `task test:inventory`
(`scripts/build-test-inventory.sh`) **regeneriert**, nicht von Hand gewachsen.

---

### Task 1: `precommit-accepts-batch-branches.bats` (T004261 → p1, ≤ 1h)

**Testanordnung** — SUT: `.githooks/pre-commit` Z. 166
(`[[ "$_bn" =~ ^feature/|^fix/|^chore/|^docs/ ]]`). Der Hook läuft gegen ein Wegwerf-Git-Repo;
`repo_root` löst er per `git rev-parse --show-toplevel` aus dem cwd auf:

- **Fixture:** `git init -b feat/batch-demo-T003123` im BATS-TMPDIR, Initial-Commit
  (`chore: init` mit `sample.txt`), damit alle Git-Kommandos ein HEAD haben.
- **Symlinks ins Fixture** (die fail-closed aufgerufenen Skripte müssen existieren, sonst
  bricht der Hook schon vor der Branch-Prüfung ab): `.githooks/pre-commit` → realer Hook
  (Symlink hält die SUT „live": Rot vor p1, Grün nach p1 ohne Teständerung),
  `scripts/{agent-lock.sh,agent-collision.sh,git-crypt-guard.sh,openspec-half-archive-check.sh,openspec-main-staging-guard.sh,guard-bonsai-overwrite.sh}`,
  `scripts/lib/branch-allowlist.sh`, `.gitleaks.toml`.
- **PATH-Stub `bin/gitleaks`** (`echo "gitleaks stub"; exit 0`): deterministisch — CI hat
  gitleaks installiert und würde sonst den temp-Arbeitsbaum scannen; lokal fehlt das Binary.
- **Env beim Hook-Lauf:** `AGENT_LOCK_FORCE=1` (agent-lock-Mutex im Haupt-Checkout),
  `SKIP_FRESHNESS_REGEN=1`, `SKIP_BONSAI_GUARD=1`, `SKIP_MAIN_COMMIT_GUARD=1`
  (hermetischer temp-Repo-Zustand). **`SKIP_BRANCH_CHECK` bleibt UNSET** — er ist der
  Notausgang der SUT und würde den Test aushöhlen.
- **Lauf:** `cd "$FIXTURE" && env <bypasses> PATH="$STUB_BIN:$PATH" bash .githooks/pre-commit`.
- **Test 1 (Positiv-Anker):** Branch `experiment/foo` → `$status != 0` und `$output` enthält
  den Branch-Namen — beweist, dass Harness + Bypasses den Branch-Guard erreichen.
- **Test 2 (SUT):** Branch `feat/batch-demo-T003123` → `$status == 0`.

**Rot-Phase (RED):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats
# expected: FAIL — `^feature/|^fix/|^chore/|^docs/` matcht `feat/batch-*` nicht, der Hook
# beendet Test 2 mit exit 1 (Befund T004261)
```

**Grün-Phase (GREEN)** nach p1 (Regex um `^feat/batch-` erweitert):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats
# expected: PASS — beide Tests grün
```

### Task 2: `write-guard-suffix-normalization.bats` (T003991 → p2, ≤ 1h)

**Testanordnung** — SUT: `scripts/hooks/worktree-write-guard.sh` (Direktaufruf mit stdin-JSON,
Muster `tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats`; Guard läuft mit
`cd` im temp-Repo, damit `git rev-parse` dort auflöst):

- **Fixture:** temp-Repo `git init`; Verzeichnisse `wt-real` (existiert — der reale
  Batch-Worktree **ohne** Suffix) und `wt-other` (existiert — weiterer eigener Worktree der
  Session; Batch-Sessions halten mehrere Locks, das ist der T003991-Vorbefund).
- **Locks** in exportiertem `AGENT_LOCK_DIR` (Format wie Bestandstest: `owner_sid`,
  `owner_pid`, `worktree`, `branch`, `label`):
  - `batch__dead.json`: `owner_sid=$SID`, `worktree="$REPO/wt-real-T004295"` — **tot**
    (Verzeichnis existiert nicht, Suffix-Drift aus `worktree-create.sh`),
    `branch="feat/batch-demo-T004295"`.
  - `other__live.json`: `owner_sid=$SID`, `worktree="$REPO/wt-other"`,
    `branch="feature/other-T009999"`.
- **SID:** `export AGENT_LOCK_SID="sid-p6-test"` (Guard prüft `AGENT_LOCK_SID` zuerst —
  harness-stabil für Tests). `WORKTREE_GUARD_BYPASS` bleibt unset (Notausgang der SUT).
- **Lauf:** `cd "$REPO" && printf '{"tool_input":{"file_path":"%s"}}' "$TARGET" | bash "$GUARD"`.
- **Test 1 (Positiv-Anker):** Fremd-Claim (`owner_sid="fremde-sid"`) auf `wt-other`
  (existiert), Ziel `$REPO/wt-other/README.md` → `$status == 2` — der Fremd-Schutz
  (Regel 3) lebt und beweist die Harness.
- **Test 2 (SUT):** Ziel `$REPO/wt-real/README.md` (existiert), Locks wie oben →
  post-Fix `$status == 0`.

**Rot-Phase (RED):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/write-guard-suffix-normalization.bats
# expected: FAIL — der eigene Claim `wt-real-T004295` ist tot und wird übersprungen
# (T002412), aber `wt-other` lebt → MY_WTS nicht leer → Regel 2 blockt das Ziel im
# realen (unsuffixten) Worktree mit exit 2 (Befund T003991)
```

**Grün-Phase (GREEN)** nach p2 (Pfad-Normalisierung: existiert der Lock-Pfad nicht, gilt
derselbe Pfad ohne `-T\d+`-Suffix):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/write-guard-suffix-normalization.bats
# expected: PASS — wt-real-T004295 wird auf wt-real normalisiert → eigener Claim → exit 0
```

### Task 3: `archive-plan-gitshow-fallback.bats` (T004269 → p3, ≤ 1h)

**Testanordnung** — SUT: `cmd_archive_plan` in `scripts/ticket.sh` (Z. 237 liest die
Plandatei per `cat`; Existenz-Check Z. 209 bestätigt den Blob im Branch bereits). Der Test
läuft den **echten** `ticket.sh` mit **kubectl-PATH-Stub** — kein Cluster, keine DB
(TICKET_OFFLINE=1 ist unbrauchbar: `_ticket_offline_skip` greift VOR der Datei-Prüfung und
würde den git-show-Pfad nie ausführen — TICKET_OFFLINE bleibt unset):

- **Fixture:** temp-Repo `git init -b main`, Initial-Commit; dann Branch
  `feature/plan-only-T004269` mit `plans/demo.md` (Inhalt-Marker `NUR-IM-BRANCH-ARCHIV-TEST`),
  commit; zurück auf `main` → die Datei liegt **nicht** auf Disk, der Blob nur im Branch
  (Adapter-cwd-Fall aus T004269).
- **kubectl-Stub** (`$STUB_BIN/kubectl`, vor PATH): `get` → `echo pod/shared-db-0`;
  `exec` → stdin lesen, an `$KUBECTL_LOG` anhängen, Antwort je SQL-Inhalt:
  enthält `SELECT id FROM tickets.tickets` → UUID (`11111111-2222-3333-4444-555555555555`),
  enthält `SELECT count` → `1`, sonst `INSERT 0 1`. (Unter BATS erzwingt
  `_ticket-core.sh` ohnehin `CTX="bats-no-cluster-t002224"`; der Stub antwortet
  kontextunabhängig, NS/DB-Defaults `workspace`/`website` unkritisch.)
- **Lauf:** `cd "$FIXTURE" && PATH="$STUB_BIN:$PATH" bash "$REPO/scripts/ticket.sh" archive-plan
  --id T004269 --slug demo --branch feature/plan-only-T004269 --plan-file plans/demo.md`.
- **Assertions:** `$status == 0`; `$output` enthält
  `Plan successfully archived for ticket T004269` (Erfolgssemantik des Kommandos);
  **`$KUBECTL_LOG` enthält den Marker** `NUR-IM-BRANCH-ARCHIV-TEST` — der
  git-show-Fallback muss den Plan-Inhalt real in den INSERT-Stdin (Z. 242–243) liefern.

**Rot-Phase (RED):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats
# expected: FAIL — `cat "$plan_file"` scheitert unter `set -euo pipefail` (Datei nicht auf
# Disk), ticket.sh endet mit exit 1, Marker fehlt im KUBECTL_LOG (Befund T004269)
```

**Grün-Phase (GREEN)** nach p3 (`git show "${branch}:${plan_file}"` statt `cat`):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats
# expected: PASS — exit 0, Erfolgsmeldung, Marker im KUBECTL_LOG
```

### Task 4: `embed-connect-timeout.bats` (T003988 → p4, ≤ 1h)

**Testanordnung** — SUT: `scripts/openspec-embed.mjs` Z. 375 (`new pg.Pool({ connectionString })`
ohne `connectionTimeoutMillis`; pg-Default 0 = unbegrenzt → Hänger bei belegtem/offenem Port).
Der Test bleibt komplett offline (localhost), `node_modules/pg` ist im Repo vorhanden:

- **Fixture:** temp-Repo als `OPENSPEC_EMBED_REPO` mit
  `openspec/changes/demo-slug/proposal.md` (der `--slug demo-slug`-Lauf braucht den
  Change; Embed ist best-effort, Logs auf stderr via `console.error`).
- **Test 1 (Positiv-Anker):** `SESSIONS_DATABASE_URL="postgres://x:x@127.0.0.1:1/db"`
  (Port 1 → sofortiger ECONNREFUSED) → `$status == 0` und `$output` enthält
  `best-effort failure` — beweist, dass Harness + bestehende Kollisions-Diagnose
  (Z. 379–386) funktionieren.
- **Test 2 (SUT):** stiller TCP-Akzeptor (node `net`-Server, lauscht auf Port 0
  [dynamisch], schreibt den Port in eine Datei, antwortet **nie**); Teardown killt die PID.
  Zeitmessung mit `date +%s`:

  ```bash
  start=$(date +%s)
  run timeout 15 env SESSIONS_DATABASE_URL="$URL" OPENSPEC_EMBED_REPO="$TMP_REPO" \
    node "$REPO/scripts/openspec-embed.mjs" --slug demo-slug
  end=$(date +%s)
  ```

  Assertions: `$status == 0`; `$(( end - start )) < 12` (großzügige Obergrenze; der
  p4-Timeout ist 10 s, `timeout 15` gibt Puffer); `$output` enthält `best-effort failure`
  (bei Timeout ist `err.code` undefined, die Port-Kollisions-WARN feuert nicht — die
  klare Meldung post-Fix ist die best-effort-Meldung mit der pg-Timeout-Ursache).

**Rot-Phase (RED):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/embed-connect-timeout.bats
# expected: FAIL — pg verbindet ohne Timeout gegen den stillen Akzeptor und hängt;
# `timeout 15` killt den Lauf → status 124 (≈15 s) statt 0 (Befund T003988)
```

**Grün-Phase (GREEN)** nach p4 (`connectionTimeoutMillis` auf dem Pool):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/embed-connect-timeout.bats
# expected: PASS — „Connection terminated due to connection timeout“ nach ≤10 s,
# best-effort exit 0, Elapsed < 12 s
```

### Task 5: `deploy-route-sdlc-exclusion.bats` (T003982 → p5, ≤ 1h)

**Testanordnung** — vollständig spezifiziert in p5 („Testanordnung (Spezifikation für p6)");
hier die Essenz, ausgeführt **verbatim** (Muster `tests/spec/batch-repo-hygiene-ops-fixes.bats`):

- **Git-Fixture:** `git init`; pro Fall ein Commit mit Subject `[T004295] fixture` und den
  Fall-Dateien; danach `git update-ref refs/remotes/origin/main HEAD`. Der Lauf passiert mit
  `cwd = Fixture-Repo` (Z. 26/32/38 lösen real auf); die Stub-Dateien liegen **untracked**
  im Arbeitsbaum (`git diff-tree` liest nur den Commit).
- **Stubs untracked im Fixture (`scripts/`):** `filter-generated.sh` (`cat; exit 0`),
  `ticket.sh` (`echo "ticket.sh: $*"; exit 0`), `devflow-post-merge-ticket-closure.sh`
  (`exit 0`); die SUT `devflow-post-merge-deploy.sh` wird ins Fixture **kopiert** (live →
  Rot vor p5, Grün nach p5).
- **`task`-PATH-Stub (`bin/task`):** `echo "task called: $*"; exit 0` — einziger Indikator,
  ob Z. 80 `task feature:deploy` ausgelöst wurde. Lauf:
  `cd "$fixture" && PATH="$bin:$PATH" bash scripts/devflow-post-merge-deploy.sh T004295`.
- **Fall 1 (Positiv-Anker):** CHANGED = nur `k3d/websocket.yaml` → `$status == 0`,
  `$output` enthält `Deploye K8s-Manifeste` und `task called: feature:deploy`.
- **Fall 2 (Negativ):** CHANGED = nur `k3d/sdlc-stack/sdlc-console.yaml` +
  `k3d/sdlc-stack/kustomization.yaml` → `$status == 0`, `$output` enthält
  `Keine bekannten Deploy-Trigger`, **nicht** `task called:` und nicht `k3d/sdlc-stack`
  (die Geänderte-Dateien-Liste Z. 54 zeigt den gefilterten `$CHANGED`).
- **Fall 3 (Regression):** CHANGED = `k3d/websocket.yaml` + `k3d/sdlc-stack/sdlc-console.yaml`
  → `task called: feature:deploy` erscheint, aber `k3d/sdlc-stack` nicht in der Liste —
  der Filter entfernt nur sdlc-stack-Pfade, nie andere k3d-Pfade.
- Reihenfolge 1 → 2 → 3 (T002356-M1: Anker vor Negativ-Aussage), alles Output-Verifikation.

**Rot-Phase (RED):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats
# expected: FAIL — `^k3d/` matcht die sdlc-stack-Pfade → DEPLOY_K8S=true → task-Stub wird
# gerufen, Fall 2 scheitert an „Keine bekannten Deploy-Trigger“ und „task called:“
# (Befund T003982)
```

**Grün-Phase (GREEN)** nach p5 (vorgeschalteter `sed '/^k3d\/sdlc-stack\//d'`-Filter):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats
# expected: PASS — Fälle 1–3 grün
```

> Hinweis zur Partial-Reihenfolge (identisches Muster wie p5 Task 1): Ist der jeweilige Fix
> (p1–p5) zum p6-Ausführungszeitpunkt bereits gemergt, ist die Rot-Phase nicht mehr
> reproduzierbar — dann stützt sich das Rot-Dokument auf den im Step genannten
> Vorbefund/Fehlermodus, die Testdatei wird trotzdem einmalig gegen den ungefixten Stand
> validiert (oder per `git stash`-Probe am Einzelfix), und der Grün-Lauf ist das Gate.

### Task 6: Test-Inventar regenerieren und committen (≤ 0,5h)

- [ ] `task test:inventory` (→ `bash scripts/build-test-inventory.sh`) — regeneriert
      `website/src/data/test-inventory.json`; das CI-Inventar-Gate schlägt sonst bei jedem
      PR rot (CI re-run des Tasks und diff-Vergleich).
- [ ] Diff prüfen: genau die 5 neuen `.bats`-Einträge sind hinzugekommen, keine
      Bestandseinträge verloren.
- [ ] `website/src/data/test-inventory.json` im Batch-Commit mitcommitten.

### Finale Verifikation (Batch-Gates, laufen verbindlich in tasks.md Task 7)

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
