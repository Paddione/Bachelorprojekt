# p2-opencode-executor — Umschaltbarer Factory-Executor + opencode-Orchestrator-Wrapper

Rolle: `impl`. Implementiert **REQ-SF-EXECUTOR-001** (Executor-Verzweigung in
`dispatcher-bridge.sh` via `FACTORY_EXECUTOR`) und **REQ-SF-EXECUTOR-002**
(`scripts/factory/opencode-exec.sh` — neu: Orchestrator-Prompt, `opencode run`, Gang-Telemetrie
als `implement`-Phase-Events). Deckt design.md §p2 + §Fehlerbehandlung + D3 (Opt-in, kein
Default-Flip in dieser Partial).

**Kein** `task test:*`-Final-Verify (lebt im `tasks.md`-Index), **kein** RED-Failing-Test-Step
(lebt in `p5-tests`). Jeder Task endet mit einem konkreten lokalen Prüf-Step. Der `claude`-Zweig
in `dispatcher-bridge.sh` bleibt **byte-identisch** zum heutigen Spawn (Z.121–123) — nur ein
`case`/`if`-Vorschalter kommt hinzu. Keine Änderung an Scheduling, Slots, Gang-Claims oder
`wakeup.sh`. **Disjunkt** zu p1 (`stage-plan.sh`), p3 (opencode-Kanon), p4 (llm-proxy), p5 (Tests).

## S1-Zeilenbudgets (wirksame Schwelle je Datei, unbaselined ⇒ Extension-Limit `.sh`=500)

| `path` | Ist | Budget |
| --- | --- | --- |
| `scripts/factory/dispatcher-bridge.sh` | 135 | 365 |
| `scripts/factory/opencode-exec.sh` | 0 | 500 |

`opencode-exec.sh` ist neu, Ziel ~150 Z. mit großer Reserve unter dem 500er-`.sh`-Limit. Der
Einschub in `dispatcher-bridge.sh` fügt < 20 Zeilen hinzu (135 → ~150), Budget 365 ist reichlich.

## Verifizierte Ist-Fakten (nicht raten)

- `scripts/ticket.sh phase` nimmt **positionale** Argumente
  `phase <ext_id> <phase> <state> [--detail "…"] [--driver factory|devflow]`
  (`ticket.sh:495-519`, belegt durch 8 Call-Sites, z. B. `pr-babysit-ticket.sh:49`:
  `ticket.sh phase "$TICKET_ID" verify done --driver factory --detail "…"`). **`--id`/`--phase`/
  `--state` gibt es NICHT** — sie liefen in den `*) Unknown phase option`-Zweig (exit 2). Diese
  Partial nutzt daher ausschließlich die positionale Form.
- Erlaubte `state`-Werte: **NUR** `entered|done|blocked` (`ticket.sh:509`). `partial`/`loop` o. ä.
  sind ungültig (T002130-Bug wird hier NICHT wiederholt — der Partial-Bezug lebt im
  `detail`-JSON-Feld `partial`, nicht im `state`).
- Erlaubte `phase`-Werte: `scout|design|plan|implement|verify|deploy` (`ticket.sh:508`) — wir
  schreiben ausschließlich `implement`.
- `opencode run --agent <name> --format json "<prompt>"` ist die verifizierte Aufrufform
  (`oracle.sh:443`, `pr-babysit-ticket.sh:83`).
- `orchestrator`-Agent + `bonsai-8b-1..4` + `deepseek-helper` existieren erst nach **p3**
  (`.opencode/agent-models.jsonc`) und deren Sync — der Smoke-Run (Task 3) hängt an p3.

---

## Task 1: `dispatcher-bridge.sh` — `FACTORY_EXECUTOR`-Verzweigung des Ticket-Spawns

`dispatcher-bridge.sh:121-123` spawnt heute unbedingt `claude -p`. Diesen Spawn in einen
`if [[ "$executor" == "opencode" ]]`-Zweig setzen; der `else`-Zweig bleibt **byte-identisch**
(gleiche Flags, gleiches `sed`-Prefix, gleiches `&`-Backgrounding — das `wait` in Z.127 gilt
weiter für beide). `FACTORY_EXECUTOR` default `claude`; unbekannter Wert ⇒ Warnung auf stderr +
Fallback auf `claude` (safe default). Der `opencode`-Zweig ruft `opencode-exec.sh` mit
`<ext_id> <LAUNCH_DIR> <branch> <plan_path>` im Hintergrund auf, mit demselben
`[pipeline:${ext_id}]`-`sed`-Prefix. Einfügepunkt: unmittelbar nach dem bestehenden
`LAUNCH_DIR`-Block (Z.117–120), der `PIPELINE_PROMPT`-Aufbau (Z.83–110) bleibt unangetastet
(im `claude`-Zweig weiterverwendet; im `opencode`-Zweig schlicht ungenutzt — kein Diff dort).

- [ ] Nach dem `LAUNCH_DIR`-Block (Z.120) einen `executor`-Resolver + `case`-Validierung einfügen.
- [ ] Den bestehenden Spawn (Z.121–123) in den `else`-Zweig eines `if [[ "$executor" == "opencode" ]]`
      verschieben — **wortwörtlich unverändert**.
- [ ] `opencode`-Zweig: `opencode-exec.sh` mit vier Positionsargumenten im Hintergrund starten,
      selbes `sed`-Prefix + `&`.
- [ ] Kommentar: Opt-in (D3); unbekannter Wert ⇒ claude-Fallback; Backgrounding bleibt für beide.

```bash
  LAUNCH_DIR="${wt_path:-$REPO}"
  if [[ "$LAUNCH_DIR" == "null" || ! -d "$LAUNCH_DIR" ]]; then
    LAUNCH_DIR="$REPO"
  fi

  # Executor branch (T002128, D3): opt-in opencode orchestrator vs. default claude -p.
  # Unknown value warns and falls back to claude (safe default). Both branches keep the
  # same [pipeline:${ext_id}] sed prefix and the trailing & so the outer `wait` (below)
  # still joins them. The claude branch is byte-identical to the pre-T002128 spawn.
  executor="${FACTORY_EXECUTOR:-claude}"
  case "$executor" in
    claude|opencode) ;;
    *) echo "dispatcher-bridge: unknown FACTORY_EXECUTOR='$executor' — falling back to claude" >&2
       executor=claude ;;
  esac

  if [[ "$executor" == "opencode" ]]; then
    ( bash "$HERE/opencode-exec.sh" "$ext_id" "$LAUNCH_DIR" "$branch" "$plan_path" 2>&1 ) \
      | sed "s/^/[pipeline:${ext_id}] /" >&2 &
  else
    (cd "$LAUNCH_DIR" && "${CLAUDE_BIN:-claude}" -p "$PIPELINE_PROMPT" \
      --allowedTools "Workflow,Bash(bash scripts/factory/*),Bash(bash scripts/ticket.sh*),Bash(bash scripts/vda.sh*),ToolSearch,PushNotification" \
      --dangerously-skip-permissions 2>&1) | sed "s/^/[pipeline:${ext_id}] /" >&2 &
  fi
```

**Akzeptanz:** Default (`FACTORY_EXECUTOR` unset) ⇒ identischer `claude -p`-Spawn wie vor der
Änderung; `FACTORY_EXECUTOR=opencode` ⇒ `opencode-exec.sh`-Spawn; `FACTORY_EXECUTOR=quatsch` ⇒
Warnzeile + claude-Spawn.

**Verify:**

```bash
bash -n scripts/factory/dispatcher-bridge.sh
# erwartet: exit 0 (keine Syntaxfehler)
grep -n 'FACTORY_EXECUTOR\|opencode-exec.sh' scripts/factory/dispatcher-bridge.sh
# erwartet: Resolver-Zeile + der opencode-exec.sh-Aufruf im opencode-Zweig
grep -c -- '--dangerously-skip-permissions' scripts/factory/dispatcher-bridge.sh
# erwartet: 1 (der claude-Spawn ist genau einmal vorhanden und unverändert)
```

---

## Task 2: `scripts/factory/opencode-exec.sh` (neu) — Orchestrator-Prompt, `opencode run`, Gang-Telemetrie

Neues, eigenständiges Skript (kein Sourcing anderer Repo-Module ⇒ kein Import-Zyklus, S2). Args:
`<ticket_ext_id> <launch_dir> <branch> <plan_path>`. Ablauf:

1. `REPO`/`HERE` aus `BASH_SOURCE` ableiten (Muster `dispatcher-bridge.sh:11-12`); `LAUNCH_DIR`
   validieren (Fallback `$REPO`).
2. Plan-Body laden (`$LAUNCH_DIR/$plan_path`, sonst `git show origin/<branch>:<plan_path>`) und die
   `## Partials`-Sektion **verbatim** via `awk` extrahieren; Partial-IDs (`pN`) für die Telemetrie
   herausgreppen. Fehlt die Sektion ⇒ Fallback-Text, keine IDs (⇒ ein Summary-Event).
3. `implement`/`entered`-Phase-Event schreiben (positionale `ticket.sh phase`-Form, non-fatal).
4. Orchestrator-Prompt bauen — **`printf '%s\n'` mit dem Manifest als eigenem Argument**, NICHT in
   einem expandierenden Heredoc: sonst würden `$(…)`/Backticks aus dem Plan bei der Prompt-
   Konstruktion ausgeführt (Command-Injection). Enthält Ticket-ID, Branch, Worktree-cwd,
   Plan-Pfad, `## Partials`-Manifest und die Trial-Guardrails (kein Auto-Merge, `pr-ready`-Gate
   respektieren, nach 2 Fehlversuchen pro Partial an `deepseek-helper` eskalieren).
5. `opencode run --agent orchestrator --format json "$PROMPT"` **im `LAUNCH_DIR`** ausführen,
   Dauer messen, Exit-Code fangen (`set -uo pipefail`, **kein** `-e`).
6. `state=done` (exit 0) bzw. `state=blocked` (exit ≠ 0). Terminal-Events: pro Partial-ID **ein**
   `implement`/`<state>`-Event mit `detail`-JSON
   `{executor:"opencode", subagent:"bonsai-8b-<slot>", partial:"pN", duration_s, exit}`
   (`slot` = Manifest-Reihenfolge `i%4+1`, deterministische Gang-Zuordnung). Ohne IDs: ein
   `subagent:"orchestrator", partial:"all"`-Summary-Event.
7. Exit ≠ 0 ⇒ zusätzlich stderr-Log der letzten Run-Zeilen; **KEIN** Fallback auf `claude -p`
   (Beobachtbarkeit vor Bequemlichkeit — Watchdog greift). Skript endet mit `exit "$ex"`.

- [ ] Datei `scripts/factory/opencode-exec.sh` neu anlegen, `#!/usr/bin/env bash`,
      `set -uo pipefail`, ausführbar (`chmod +x`).
- [ ] `## Partials`-Extraktion (awk) + Partial-ID-Grep (dedup, Reihenfolge erhalten).
- [ ] `phase_event()`-Helper: `jq -cn` baut das `detail`-JSON, `ticket.sh phase "$EXT_ID" implement
      <state> --driver factory --detail "$detail"` (positional, non-fatal `|| true`).
- [ ] Prompt via `printf '%s\n'` (Manifest als eigenes Arg — keine Expansion des Plan-Inhalts).
- [ ] `opencode run --agent orchestrator --format json` im `LAUNCH_DIR`; Dauer + Exit erfassen.
- [ ] Terminal-Events pro Partial (bzw. ein Summary); Exit ≠ 0 ⇒ stderr-Log, kein claude-Fallback.

```bash
#!/usr/bin/env bash
# scripts/factory/opencode-exec.sh — opencode orchestrator executor (opt-in, T002128).
# Called by dispatcher-bridge.sh when FACTORY_EXECUTOR=opencode. Builds an orchestrator
# prompt (ticket, branch, worktree, plan, ## Partials manifest, trial guardrails), runs
# `opencode run --agent orchestrator --format json` in the launch worktree, and records
# `implement` phase-events (entered/done/blocked) with structured detail JSON. Exit != 0
# => a blocked event and NO fallback to claude -p (observability over convenience).
#
# Usage: opencode-exec.sh <ticket_ext_id> <launch_dir> <branch> <plan_path>
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

EXT_ID="${1:-}"; LAUNCH_DIR="${2:-}"; BRANCH="${3:-}"; PLAN_PATH="${4:-}"
[[ -z "$EXT_ID" ]] && { echo "opencode-exec: missing ticket ext_id" >&2; exit 2; }
[[ -n "$LAUNCH_DIR" && -d "$LAUNCH_DIR" ]] || LAUNCH_DIR="$REPO"

# --- load plan body + extract the ## Partials manifest (best-effort) -----------------
plan_body=""
if [[ -n "$PLAN_PATH" && -f "$LAUNCH_DIR/$PLAN_PATH" ]]; then
  plan_body="$(cat "$LAUNCH_DIR/$PLAN_PATH")"
elif [[ -n "$BRANCH" && -n "$PLAN_PATH" ]]; then
  plan_body="$(git -C "$REPO" show "origin/${BRANCH}:${PLAN_PATH}" 2>/dev/null || true)"
fi
partials_manifest="$(printf '%s\n' "$plan_body" \
  | awk '/^##[[:space:]]+Partials/{f=1;print;next} f&&/^##[[:space:]]/{f=0} f{print}')"
[[ -z "${partials_manifest//[[:space:]]/}" ]] \
  && partials_manifest="(no ## Partials section — orchestrator partitions the plan itself)"
mapfile -t partial_ids < <(printf '%s\n' "$partials_manifest" \
  | grep -oiE '\bp[0-9]+\b' | tr 'P' 'p' | awk '!seen[$0]++')

# --- helper: record one implement phase-event (positional ticket.sh phase form) ------
phase_event() { # <state> <subagent> <partial> <duration_s> <exit>
  local detail
  detail="$(jq -cn --arg s "$2" --arg p "$3" --argjson d "${4:-0}" --argjson e "${5:-0}" \
    '{executor:"opencode",subagent:$s,partial:$p,duration_s:$d,exit:$e}')"
  bash "$REPO/scripts/ticket.sh" phase "$EXT_ID" implement "$1" \
    --driver factory --detail "$detail" 2>/dev/null || true
}

phase_event entered orchestrator all 0 0

# --- build the orchestrator prompt (manifest as a data arg — NO shell expansion) -----
PROMPT="$(printf '%s\n' \
  "You are the Software Factory orchestrator. Implement ticket ${EXT_ID} from its staged plan." \
  "Feature branch (origin): ${BRANCH:-<none>}" \
  "Worktree (your cwd): ${LAUNCH_DIR}" \
  "Plan file: ${PLAN_PATH:-<none>}" \
  "" \
  "Dispatch up to 4 bonsai-8b subagents onto the DISJOINT partials below; each owns" \
  "its partial end-to-end (edit, test) inside this worktree." \
  "" \
  "## Partials" \
  "${partials_manifest}" \
  "" \
  "Guardrails (opt-in trial, D3):" \
  "- Do NOT merge the PR and do NOT enable auto-merge — stop at the pr-ready gate." \
  "- Respect the existing pr-ready / CI gate; never bypass it." \
  "- After 2 failed attempts on a single partial, escalate THAT partial to the" \
  "  deepseek-helper subagent (do not loop the same bonsai-8b agent)." \
  "- Report only the final JSON result.")"

# --- run opencode in the launch worktree, measure duration ---------------------------
start=$(date +%s)
run_log="$(mktemp)"
( cd "$LAUNCH_DIR" && opencode run --agent orchestrator --format json "$PROMPT" ) \
  >"$run_log" 2>&1
ex=$?
dur=$(( $(date +%s) - start ))
state=done; [[ $ex -ne 0 ]] && state=blocked

# --- terminal telemetry: one event per partial (deterministic gang-slot mapping) -----
if [[ ${#partial_ids[@]} -eq 0 ]]; then
  phase_event "$state" orchestrator all "$dur" "$ex"
else
  i=0
  for pid in "${partial_ids[@]}"; do
    phase_event "$state" "bonsai-8b-$(( i % 4 + 1 ))" "$pid" "$dur" "$ex"
    i=$(( i + 1 ))
  done
fi

if [[ $ex -ne 0 ]]; then
  echo "opencode-exec: orchestrator run for $EXT_ID exited $ex (blocked; NO claude fallback)" >&2
  tail -n 40 "$run_log" | sed "s/^/[opencode-exec:${EXT_ID}] /" >&2
fi
rm -f "$run_log"
exit "$ex"
```

**Akzeptanz:** Bei erfolgreichem Lauf entstehen ein `implement`/`entered`-Event plus je Partial ein
`implement`/`done`-Event, dessen `detail`-JSON `executor`, `subagent`, `partial` benennt
(REQ-SF-EXECUTOR-002, Szenario 1). Bei `opencode run`-Exit ≠ 0 entsteht ein `implement`/`blocked`-
Event mit `exit`-Code im `detail` und **kein** `claude -p`-Spawn (Szenario 2). Alle `state`-Werte
liegen in `entered|done|blocked`.

**Verify:**

```bash
bash -n scripts/factory/opencode-exec.sh
# erwartet: exit 0 (keine Syntaxfehler)
test -x scripts/factory/opencode-exec.sh && echo executable
# erwartet: "executable"
grep -n 'phase "\$EXT_ID" implement' scripts/factory/opencode-exec.sh
# erwartet: positionale Aufrufform (kein --id/--phase/--state)
# Stub-Trockenlauf: `opencode` via PATH gemockt (exit 3), Plan mit ## Partials p1/p2.
# ticket.sh wird per absolutem $REPO-Pfad aufgerufen und läuft offline in den
# _ticket_offline_skip-Zweig (kein DB-Zugriff nötig); Event-Persistenz deckt p5-BATS
# (mit DB-Fixture) ab. Hier zählt: Exit-Code-Durchreichung + KEIN claude-Fallback.
stub="$(mktemp -d)"; printf '#!/usr/bin/env bash\nexit 3\n' >"$stub/opencode"; chmod +x "$stub/opencode"
plan="$(mktemp -d)"; mkdir -p "$plan/p"; printf '## Partials\n- p1\n- p2\n## X\n' >"$plan/p/tasks.md"
PATH="$stub:$PATH" bash scripts/factory/opencode-exec.sh T000000 "$plan/p" main p/tasks.md; echo "exit=$?"
# erwartet: stderr-Zeile "... exited 3 (blocked; NO claude fallback)" und "exit=3"
rm -rf "$stub" "$plan"
```

---

## Task 3: Manueller Smoke-Run (Host-Runbook) — headless `opencode` im Factory-Env verifizieren

`opencode run` headless im Factory-Kontext (systemd-User-Service-Env, Verfügbarkeit der
`opencode-go`-Subscription-Creds aus `autopilot.env`) ist **ungetestet** (Risk aus `intel.json`).
Dieser Smoke-Run läuft **vor** dem Verweis auf p5-GREEN und vor jeder Erwägung des D3-Default-Flips
(der NICHT Teil dieser Change ist). **Prerequisite:** p3 ist gemergt und `opencode-sync-agents.sh`
gelaufen, sodass der `orchestrator`-Agent + `bonsai-8b-1..4` in der globalen opencode-Config
existieren — sonst schlägt `--agent orchestrator` mit „unknown agent" fehl.

- [ ] Sync sicherstellen: `bash scripts/opencode-sync-agents.sh` (verteilt den p3-Kanon).
- [ ] Headless-Reachability des Orchestrators im Factory-Env prüfen (der genuin untestbare Teil:
      Env + Subscription-Creds), **ohne** Tool-Nutzung/Dispatch.
- [ ] Beobachten, dass valides JSON zurückkommt und Exit 0 ist; Ergebnis im Beobachtungslog
      (`project_sdlc-agent-observation-goal.md`) notieren.
- [ ] Erst wenn dieser Smoke sauber ist, gilt der BATS-GREEN aus `p5-tests` als aussagekräftig für
      den opencode-Pfad; der Default-Flip bleibt Opt-in bis ≥ 3 saubere beobachtete Zyklen (D3).

```bash
# Prereq: p3 merged + synced, orchestrator agent live.
bash scripts/opencode-sync-agents.sh
# Headless orchestrator reachability in the factory env (no tools, no dispatch):
FACTORY_EXECUTOR=opencode opencode run --agent orchestrator --format json \
  "Reply with the single word: pong. Do not use any tools." | tee /tmp/oc-smoke.json
echo "run exit=${PIPESTATUS[0]}"
# erwartet: valides JSON in /tmp/oc-smoke.json, nicht-leerer Assistant-Text, run exit=0
jq -e '.' /tmp/oc-smoke.json >/dev/null && echo "valid JSON"
# erwartet: "valid JSON" — bestätigt Env + opencode-go-Creds im Factory-Kontext
```

**Akzeptanz:** `opencode run --agent orchestrator --format json` liefert im Factory-/systemd-User-
Env valides JSON mit Exit 0 (Auth + Env bestätigt). Fehlschlag ⇒ p2 ist NICHT für den
opencode-Pfad einsatzbereit; Ursache (fehlende Creds / Agent nicht gesynct) im Beobachtungslog
festhalten, bevor p5-GREEN als Freigabe gewertet wird.
