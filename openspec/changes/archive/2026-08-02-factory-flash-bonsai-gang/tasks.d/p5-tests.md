# p5-tests — RED-Failing-Tests für Stage-Wake, Executor-Zweig, Telemetrie & max_inflight

Rolle: `tests` · Ziel-Dateien: `tests/spec/software-factory.bats`,
`website/src/data/test-inventory.json` (generiert).

Dieses Partial ist der **STRUCT2-Partial** dieses Change (plan-lint prüft die Failing-Test-
Phrase gegen genau diese Datei). Es operationalisiert die Scenarios aus
`openspec/changes/factory-flash-bonsai-gang/specs/software-factory.md` und
`specs/local-llm-proxy.md` als BATS-`@test`-Blöcke. Die neuen Assertions sind **absichtlich
rot**, bis die Produktions-Partials p1–p4 landen. Es werden **ausschließlich** die BATS-Spec-
Datei und das regenerierte Test-Inventar angefasst — D1-disjunkt zu p1 (`stage-plan.sh`),
p2 (`dispatcher-bridge.sh` + `opencode-exec.sh`), p3 (opencode-Kanon) und p4 (llm-proxy).

**BATS-Konvention (CLAUDE.md):** Neue `@test`-Blöcke gehören in `tests/spec/software-factory.bats`
(eine Datei pro OpenSpec-SSOT-Spec) — **keine** ticket-nummerierten Dateien. Die vorhandene
`setup()`/`teardown()`/`_pt_capture_stub`-Scaffolding bleibt unangetastet; neue Mini-Helfer
werden auf Datei-Ebene ergänzt (kompakt, keine Duplikation bestehender Helfer — S1).

## File Structure

| Datei | Status | S1-Budget |
|---|---|---|
| `tests/spec/software-factory.bats` | erweitert (8 neue `@test` + 2 Helfer) | S1-ungated (`.bats` nicht im S1-Extension-Gate) |
| `website/src/data/test-inventory.json` | regeneriert via `task test:inventory` | S1-ungated (generiertes Artefakt) |

Beide Dateien sind vom S1-Ratchet nicht bewertet — Diffs trotzdem minimal-invasiv halten.
Keine Brand-Domain-Literale (S3): die Executor-Fixture nutzt den Brand-**Namen** `mentolder`
(kein `*.mentolder.de`-Domain-Literal, und `.bats` liegt ohnehin außerhalb der S3-Scopes).

## Test-ID-Vergabe

Höchste bestehende ID in dieser Worktree-Kopie ist `FA-SF-73`; dieses Partial belegt
**`FA-SF-74`…`FA-SF-81`** fortlaufend. Sollte der parallele Change `unified-llm-gateway`
(reserviert dort ebenfalls `FA-SF-74..76` für andere Tests) zuerst mergen, wird dieser Block
vor dem Merge auf den nächsten freien Bereich umnummeriert (rein mechanisch; das Inventar-Gate
in Task 5 erzwingt es).

### Abbildung Scenario → Test (Nachweispflicht)

| Spec-Scenario | Test |
|---|---|
| software-factory · *Staging a plan wakes the factory without waiting for the timer* | `FA-SF-74` (statische Guards) |
| software-factory · *Flag write failure degrades gracefully* | `FA-SF-75` (funktional, stderr-Warnung + Exit 0) |
| software-factory · *Opt-in opencode executor is used when requested* | `FA-SF-76` (statisch) + `FA-SF-77` (funktional, Zweig a) |
| software-factory · *Default behavior unchanged* | `FA-SF-77` (funktional, Zweig b/c) |
| software-factory · *Successful gang run leaves per-subagent telemetry* | `FA-SF-78` (Kontrakt-Guards) |
| software-factory · *Orchestrator failure is visible, not silently retried* | `FA-SF-79` (funktional, blocked-Event, kein claude-Fallback) |
| local-llm-proxy · *Default keeps today's serialization* | `FA-SF-80` (Plumbing) + `FA-SF-81` (Semaphor limit=1) |
| local-llm-proxy · *Raising max_inflight enables real concurrency* | `FA-SF-81` (Semaphor limit=2) |

## Cross-Partial-Kontrakte (test-first — von p1/p2/p4 zu erfüllen)

Diese Tests schreiben die zu implementierenden Seams fest (TDD: der Test definiert den
Kontrakt). Die Produktions-Partials implementieren gegen sie:

- **p2 · `dispatcher-bridge.sh`:** Zweigt auf `FACTORY_EXECUTOR` (`claude` = Default,
  `opencode` = neu). Der opencode-Zweig ruft `"${FACTORY_OPENCODE_EXEC:-scripts/factory/opencode-exec.sh}"`
  im Launch-Worktree auf — die Override-Variable spiegelt die bestehende `CLAUDE_BIN`-/
  `FACTORY_DISPATCHER_BRIDGE`-Konvention und macht den Zweig funktional testbar (`FA-SF-77`).
- **p2 · `opencode-exec.sh`:** akzeptiert `--id/--branch/--worktree/--plan`, ruft
  `opencode run --agent orchestrator` (via `PATH`), schreibt Phase-Events über
  `"${FACTORY_TICKET_BIN:-bash scripts/ticket.sh}" phase …` und fällt bei Nicht-Null-Exit
  **nicht** auf `claude -p` zurück (`FA-SF-78`/`FA-SF-79`).
- **p4 · Semaphor:** extrahiert die bounded-concurrency-Logik (heute `enqueue`/`queues` in
  `server.mjs`, Limit fest 1) in ein **reines, importierbares** Modul
  `scripts/llm-proxy/semaphore.mjs` mit `export function createSemaphore(limit)` →
  `{ run(fn) }` (bis zu `limit` gleichzeitig, Rest FIFO). Grund: `server.mjs` bindet beim
  Import sofort den Port (`server.listen` + `discovery.probeNow` auf Top-Level) und ist damit
  nicht unit-testbar. `server.mjs` konsumiert `createSemaphore(backend.max_inflight)` und
  meldet den `inflight`-Zähler in `/admin/state` (`FA-SF-80`/`FA-SF-81`). `scripts/llm-proxy/semaphore.mjs`
  ist damit eine zusätzliche p4-Ziel-Datei.

---

## Task 1: Stage-Auto-Tick-Tests (`FA-SF-74`/`FA-SF-75`) — RED-Anker (STRUCT2)

Zwei Tests für `scripts/vda/ticket/stage-plan.sh` (REQ-SF-AUTOTICK-001). `FA-SF-74` ist ein
statischer Guard; `FA-SF-75` fährt `stage-plan` funktional mit einem `kubectl`-Stub, der den
Force-Tick-Insert (und **nur** diesen) fehlschlagen lässt, und beweist die graziöse
Degradation. Der Stub folgt dem Muster von `_pt_capture_stub` (Pod auf `get`, Entscheidung
anhand des Heredoc-SQL auf `stdin`).

- [ ] Datei-Ebene: Helfer `_sp_stub_fail_forcetick` ergänzen (nahe der bestehenden
      `_pt_*`-Helfer).
- [ ] `FA-SF-74` + `FA-SF-75` als `@test`-Blöcke einfügen.

```bash
_sp_stub_fail_forcetick() {   # kubectl-Stub: Pod auf get; exec scheitert NUR beim force-tick-Insert
  local dir; dir="$(mktemp -d)"
  cat > "$dir/kubectl" <<'STUB'
#!/usr/bin/env bash
mode=""
for a in "$@"; do case "$a" in get) mode=get;; exec) mode=exec;; esac; done
if [[ "$mode" == get ]]; then echo "pod/shared-db-0"; exit 0; fi
sql="$(cat)"
if [[ "$sql" == *force-tick-requested* ]]; then exit 1; fi   # simulierter DB-Fehler beim Flag-Write
exit 0
STUB
  chmod +x "$dir/kubectl"; PATH="$dir:$PATH"
}

@test "FA-SF-74: stage-plan.sh writes the force-tick-requested control flag + kicks factory.service" {
  SP="scripts/vda/ticket/stage-plan.sh"
  run bash -n "$SP";                                           [ "$status" -eq 0 ]
  run grep -Fq "tickets.factory_control" "$SP";               [ "$status" -eq 0 ]
  run grep -Fq "force-tick-requested" "$SP";                  [ "$status" -eq 0 ]
  run grep -Fq "stage-plan" "$SP";                            [ "$status" -eq 0 ]   # set_by='stage-plan'
  run grep -Fq "systemctl --user start factory.service" "$SP"; [ "$status" -eq 0 ]
}

@test "FA-SF-75: stage-plan degrades gracefully when the force-tick write fails (exit 0 + stderr warn)" {
  _sp_stub_fail_forcetick
  mkdir -p openspec/changes/sp-red && touch openspec/changes/sp-red/tasks.md
  run bash scripts/ticket.sh stage-plan --id T000001 --branch feature/x --plan openspec/changes/sp-red/tasks.md
  rm -rf openspec/changes/sp-red
  [ "$status" -eq 0 ]                                                   # Stagen selbst darf NICHT scheitern
  [[ "$output" == *force-tick* || "$output" == *factory.timer* ]]      # Warnung sichtbar (bats merged stderr in $output)
}
```

**RED-Failing-Test-Step (STRUCT2).** Vor p1 enthält `stage-plan.sh` weder das Flag noch den
Service-Kick — `FA-SF-74` scheitert an den `grep`-Guards, `FA-SF-75` findet keine Warnung.
Suite gezielt mit dem echten Runner ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter 'FA-SF-74|FA-SF-75'
# expected: FAIL (RED — force-tick-Flag + factory.service-Kick fehlen in stage-plan.sh bis p1)
# äquivalent: ./tests/runner.sh local FA-SF-74 FA-SF-75
```

---

## Task 2: Executor-Zweig-Tests (`FA-SF-76`/`FA-SF-77`)

Statischer Guard + funktionaler Beweis, dass `FACTORY_EXECUTOR` den Executor umschaltet
(REQ-SF-EXECUTOR-001). Der funktionale Test übernimmt das Prep-JSON-/Stub-Muster aus dem
bestehenden `T001990`-Dispatcher-Test (`CLAUDE_BIN`-Override + `worktree_path`) und ergänzt
einen `FACTORY_OPENCODE_EXEC`-Recording-Stub.

- [ ] Datei-Ebene: Helfer `_dbridge_prep` ergänzen.
- [ ] `FA-SF-76` + `FA-SF-77` einfügen.

```bash
_dbridge_prep() {   # $1=prep.json-Pfad, $2=Worktree-Pfad → Ein-Ticket-Prep (Brand-NAME, kein Domain-Literal)
  cat > "$1" <<JSON
{"launch":[{"external_id":"T999777","brand":"mentolder","title":"executor stub","branch":"fix/exec-stub","plan_path":"openspec/changes/stub/tasks.md","worktree_path":"$2","dry_run":false}]}
JSON
}

@test "FA-SF-76: dispatcher-bridge.sh branches on FACTORY_EXECUTOR (claude default, opencode-exec.sh opt-in)" {
  DB="scripts/factory/dispatcher-bridge.sh"
  run bash -n "$DB";                        [ "$status" -eq 0 ]
  run grep -Fq "FACTORY_EXECUTOR" "$DB";    [ "$status" -eq 0 ]
  run grep -Fq "opencode-exec.sh" "$DB";    [ "$status" -eq 0 ]
}

@test "FA-SF-77: FACTORY_EXECUTOR routes opencode->opencode-exec.sh; unset/unknown->claude" {
  tmp="$(mktemp -d)"; wt="$tmp/wt"; mkdir -p "$wt"
  cmark="$tmp/claude.mark"; omark="$tmp/opencode.mark"
  cstub="$tmp/claude"; ostub="$tmp/opencode-exec"
  printf '#!/usr/bin/env bash\necho ran >> "%s"\n' "$cmark" > "$cstub"; chmod +x "$cstub"
  printf '#!/usr/bin/env bash\necho ran >> "%s"\n' "$omark" > "$ostub"; chmod +x "$ostub"
  prep="$tmp/prep.json"; _dbridge_prep "$prep" "$wt"

  # (a) opencode-Executor -> opencode-exec.sh, NICHT claude
  rm -f "$cmark" "$omark"
  FACTORY_EXECUTOR=opencode CLAUDE_BIN="$cstub" FACTORY_OPENCODE_EXEC="$ostub" \
    run bash scripts/factory/dispatcher-bridge.sh "$prep"
  if [ ! -f "$omark" ] && [ ! -f "$cmark" ]; then
    skip "budget-guard.sh blocked the launch before executor selection (no DB in test env)"
  fi
  [ -f "$omark" ]; [ ! -f "$cmark" ]

  # (b) Default (unset) -> claude, NICHT opencode-exec (byte-identisch zu heute)
  rm -f "$cmark" "$omark"
  CLAUDE_BIN="$cstub" FACTORY_OPENCODE_EXEC="$ostub" \
    run bash scripts/factory/dispatcher-bridge.sh "$prep"
  [ -f "$cmark" ]; [ ! -f "$omark" ]

  # (c) Unbekannter Wert -> Warnung + claude-Fallback
  rm -f "$cmark" "$omark"
  FACTORY_EXECUTOR=bogus CLAUDE_BIN="$cstub" FACTORY_OPENCODE_EXEC="$ostub" \
    run bash scripts/factory/dispatcher-bridge.sh "$prep"
  [ -f "$cmark" ]; [ ! -f "$omark" ]
  [[ "$output" == *bogus* || "$output" == *unknown* || "$output" == *WARN* ]]
  rm -rf "$tmp"
}
```

**RED-Nachweis:** Vor p2 kennt `dispatcher-bridge.sh` kein `FACTORY_EXECUTOR` — `FA-SF-76`
scheitert an den `grep`-Guards; in `FA-SF-77` (a) läuft weiterhin `claude` → `omark` fehlt,
`cmark` da → Assertion rot.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter 'FA-SF-76|FA-SF-77'
# expected: FAIL (RED — Executor-Verzweigung fehlt in dispatcher-bridge.sh bis p2)
```

---

## Task 3: `opencode-exec.sh`-Telemetrie-Tests (`FA-SF-78`/`FA-SF-79`)

Kontrakt-Guards + funktionaler Beweis für REQ-SF-EXECUTOR-002 (Phase-Event-Telemetrie, kein
stiller `claude`-Fallback). `FA-SF-79` stubbt `opencode` (Nicht-Null-Exit) und den
Phase-Writer (`FACTORY_TICKET_BIN`-Spy) und beweist ein `implement`/`blocked`-Event mit
Exit-Code im `detail` sowie die Abwesenheit eines `claude`-Aufrufs.

- [ ] `FA-SF-78` + `FA-SF-79` einfügen.

```bash
@test "FA-SF-78: opencode-exec.sh runs the orchestrator, writes implement telemetry, no claude fallback" {
  OE="scripts/factory/opencode-exec.sh"
  [ -f "$OE" ]
  run bash -n "$OE";                                       [ "$status" -eq 0 ]
  run grep -Eq "opencode run --agent orchestrator" "$OE"; [ "$status" -eq 0 ]
  run grep -Fq "implement" "$OE";                          [ "$status" -eq 0 ]
  run grep -Fq "blocked" "$OE";                            [ "$status" -eq 0 ]
  run grep -Eq "pr-ready" "$OE";                           [ "$status" -eq 0 ]   # Trial-Guardrail im Prompt
  # Beobachtbarkeit vor Bequemlichkeit: KEIN stiller Fallback auf claude -p
  run grep -Eq "claude[[:space:]]+-p|CLAUDE_BIN" "$OE";    [ "$status" -ne 0 ]
}

@test "FA-SF-79: opencode-exec.sh emits implement/blocked telemetry on non-zero opencode, no claude fallback" {
  tmp="$(mktemp -d)"; bin="$tmp/bin"; mkdir -p "$bin"
  phaselog="$tmp/phase.log"; : > "$phaselog"; cmark="$tmp/claude.mark"; wt="$tmp/wt"; mkdir -p "$wt"
  printf '#!/usr/bin/env bash\nexit 7\n' > "$bin/opencode"; chmod +x "$bin/opencode"          # gang failure
  printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >> "%s"\n' "$phaselog" > "$bin/ticket-spy"; chmod +x "$bin/ticket-spy"
  printf '#!/usr/bin/env bash\necho ran >> "%s"\n' "$cmark" > "$bin/claude"; chmod +x "$bin/claude"  # presence = illegal fallback

  PATH="$bin:$PATH" FACTORY_TICKET_BIN="$bin/ticket-spy" \
    run bash scripts/factory/opencode-exec.sh --id T999778 --branch fix/exec --worktree "$wt" --plan openspec/changes/stub/tasks.md
  [ "$status" -ne 0 ]                          # Fehlschlag wird durchgereicht, nicht geschluckt
  grep -Eq "implement" "$phaselog"             # implement-Phase-Event geschrieben
  grep -Eq "blocked" "$phaselog"               # state=blocked
  grep -Eq "7|exit" "$phaselog"                # Exit-Code im detail
  [ ! -f "$cmark" ]                            # KEIN claude -p Fallback
  rm -rf "$tmp"
}
```

**RED-Nachweis:** Vor p2 existiert `scripts/factory/opencode-exec.sh` nicht — `FA-SF-78`
scheitert an `[ -f "$OE" ]`; `FA-SF-79` läuft ins leere `phase.log` (Skript fehlt → Exit 127,
Grep auf leere Datei schlägt fehl) → rot.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter 'FA-SF-78|FA-SF-79'
# expected: FAIL (RED — opencode-exec.sh existiert noch nicht bis p2)
```

---

## Task 4: llm-proxy-`max_inflight`-Tests (`FA-SF-80`/`FA-SF-81`)

Statisches Plumbing-Gate + Semaphor-Unit-Test (REQ-LLMPROXY-INFLIGHT-001). `FA-SF-81` ist der
Semaphor-Unit-Test via `node --input-type=module -e` (bats-run von node, entsprechend der
Runner-Vorgabe) gegen das reine `scripts/llm-proxy/semaphore.mjs` (Cross-Partial-Kontrakt, p4).
Er beweist FIFO-Serialisierung bei `limit=1` (heutiges Verhalten) und echte Parallelität bei
`limit=2`.

- [ ] `FA-SF-80` + `FA-SF-81` einfügen.

```bash
@test "FA-SF-80: llm-proxy max_inflight -- migration + backends SELECT + server semaphore + /admin/state" {
  MIG="scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql"
  [ -f "$MIG" ]
  run grep -Eq "max_inflight" "$MIG";                          [ "$status" -eq 0 ]
  run grep -Eq "DEFAULT[[:space:]]+1" "$MIG";                  [ "$status" -eq 0 ]
  run grep -Eq "max_inflight" scripts/llm-proxy/backends.mjs;  [ "$status" -eq 0 ]
  run grep -Eq "max_inflight" scripts/llm-proxy/server.mjs;    [ "$status" -eq 0 ]
  # /admin/state weist einen eigenständigen inflight-Zähler aus (Wortgrenze schließt max_inflight aus)
  run grep -Eq "\binflight\b" scripts/llm-proxy/server.mjs;    [ "$status" -eq 0 ]
}

@test "FA-SF-81: server semaphore honors max_inflight -- serialize at 1, concurrent at 2 (node unit)" {
  SEM="$REPO_ROOT/scripts/llm-proxy/semaphore.mjs"
  run node --input-type=module -e "
    const mod = await import('file://$SEM');
    const createSemaphore = mod.createSemaphore || mod.default;
    // limit=1 -> strikte FIFO-Serialisierung (Verhalten bei max_inflight=1)
    { const s = createSemaphore(1); let active=0, maxA=0;
      const mk=(ms)=>s.run(()=>new Promise(function(r){active++;maxA=Math.max(maxA,active);setTimeout(function(){active--;r();},ms);}));
      await Promise.all([mk(30),mk(10),mk(10)]);
      if (maxA !== 1) throw new Error('limit1 concurrency=' + maxA); }
    // limit=2 -> bis zu zwei gleichzeitig in flight
    { const s = createSemaphore(2); let active=0, maxA=0;
      const mk=(ms)=>s.run(()=>new Promise(function(r){active++;maxA=Math.max(maxA,active);setTimeout(function(){active--;r();},ms);}));
      await Promise.all([mk(30),mk(30),mk(10),mk(10)]);
      if (maxA !== 2) throw new Error('limit2 concurrency=' + maxA); }
    console.log('semaphore-ok');
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *semaphore-ok* ]]
}
```

**RED-Nachweis:** Vor p4 fehlen Migration, `max_inflight`-Spalte und `scripts/llm-proxy/semaphore.mjs`
— `FA-SF-80` scheitert an `[ -f "$MIG" ]`; `FA-SF-81`s dynamischer Import wirft
`ERR_MODULE_NOT_FOUND` → node Exit ≠ 0 → rot.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter 'FA-SF-80|FA-SF-81'
# expected: FAIL (RED — max_inflight-Migration + semaphore.mjs fehlen bis p4)
```

---

## Task 5: Test-Inventar regenerieren (CI-Gate) + GREEN-Verweis

Nach dem Anlegen der acht neuen `FA-SF-74..81`-IDs failt der CI-Inventar-Check, bis
`website/src/data/test-inventory.json` neu generiert und mitcommittet ist.

- [ ] Inventar regenerieren und mitcommitten:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] **GREEN-Erwartung dokumentieren.** Nach p1 (Stage-Flag), p2 (Executor-Zweig +
      `opencode-exec.sh`), p3 (opencode-Kanon) und p4 (`max_inflight` + `semaphore.mjs`) laufen
      `FA-SF-74..81` grün. Verifikation der Gesamt-Suite:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter 'FA-SF-7[4-9]|FA-SF-8[01]'
# erwartet: alle GREEN nach p1-p4
```

Der zentrale `task test:changed` / `task freshness:regenerate` / `task freshness:check`-
Verify-Block (STRUCT3) läuft im Index-Plan (`tasks.md`, Sektion „Verify (final, nach allen
Partials)") und wird hier bewusst nicht dupliziert.
