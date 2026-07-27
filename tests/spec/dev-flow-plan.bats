#!/usr/bin/env bats
# tests/spec/dev-flow-plan.bats
# SSOT: openspec/specs/dev-flow-plan.md (delta: openspec/changes/plan-intel-bundle/specs/dev-flow-plan.md)
# T001323 — Plan Intel Bundle: schema contract + .d.ts mirror + fixture + skill wiring.
#
# One .bats file per SSOT spec (slug convention). Hermetic: only reads repo files
# (schema, .d.ts, fixture, both dev-flow-* SKILL.md via the .agents/skills symlink).
# No cluster, no network.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCHEMA="$REPO/.claude/skills/references/schemas/plan-intel-bundle.schema.json"
  DTS="$REPO/.claude/skills/references/schemas/plan-intel-bundle.d.ts"
  EXAMPLE="$REPO/.claude/skills/references/schemas/plan-intel-bundle.example.json"
  PLAN_SKILL="$REPO/.agents/skills/dev-flow-plan/SKILL.md"
  EXEC_SKILL="$REPO/.agents/skills/dev-flow-execute/SKILL.md"
}

# ── (1) schema is valid JSON declaring draft 2020-12 + required sections ──
@test "PIB: schema file is valid JSON" {
  [ -f "$SCHEMA" ] || { echo "MISSING schema: $SCHEMA"; return 1; }
  jq . "$SCHEMA" >/dev/null
}

@test "PIB: schema declares JSON-Schema draft 2020-12" {
  grep -q '2020-12' "$SCHEMA"
}

@test "PIB: schema marks meta/impact_files/symbols required" {
  jq -e '.required | index("meta") and index("impact_files") and index("symbols")' "$SCHEMA" >/dev/null
}

@test "PIB: schema declares all eight top-level sections" {
  for s in meta impact_files symbols call_graph db_tables api_contracts external_types risks; do
    jq -e --arg s "$s" '.properties | has($s)' "$SCHEMA" >/dev/null \
      || { echo "MISSING schema section: $s"; return 1; }
  done
}

# ── (2) fixture conforms: required top-level keys + element required fields ──
@test "PIB: example.json is valid JSON with required top-level keys" {
  [ -f "$EXAMPLE" ] || { echo "MISSING example: $EXAMPLE"; return 1; }
  jq . "$EXAMPLE" >/dev/null
  for k in meta impact_files symbols; do
    jq -e --arg k "$k" 'has($k)' "$EXAMPLE" >/dev/null \
      || { echo "MISSING top-level key: $k"; return 1; }
  done
}

@test "PIB: example.json meta.slug and meta.ticket_id are strings" {
  [ "$(jq -r '.meta.slug | type' "$EXAMPLE")" = "string" ]
  [ "$(jq -r '.meta.ticket_id | type' "$EXAMPLE")" = "string" ]
}

@test "PIB: example.json impact_files is a non-empty array with required element fields" {
  [ "$(jq -r '.impact_files | type' "$EXAMPLE")" = "array" ]
  [ "$(jq -r '.impact_files | length' "$EXAMPLE")" -gt 0 ]
  jq -e '.impact_files | all(has("path") and has("language") and has("loc") and has("s1_limit") and has("s1_baseline") and has("s1_budget"))' "$EXAMPLE" >/dev/null
}

@test "PIB: example.json symbols is a non-empty array with required element fields" {
  [ "$(jq -r '.symbols | type' "$EXAMPLE")" = "array" ]
  [ "$(jq -r '.symbols | length' "$EXAMPLE")" -gt 0 ]
  jq -e '.symbols | all(has("qualified_name") and has("kind") and has("file") and has("signature") and has("type_text") and has("source"))' "$EXAMPLE" >/dev/null
}

# ── (3) schema ↔ .d.ts top-level key parity (cheap drift guard) ──
@test "PIB: schema and .d.ts top-level keys are in parity" {
  [ -f "$DTS" ] || { echo "MISSING .d.ts: $DTS"; return 1; }
  schema_keys="$(jq -r '.properties | keys[]' "$SCHEMA" | sort | tr '\n' ' ')"
  dts_keys="$(awk '/^export interface PlanIntelBundle \{/{c=1;next} c&&/^\}/{c=0} c' "$DTS" \
    | grep -oE '^[[:space:]]+[a-zA-Z_]+\??:' | sed -E 's/[[:space:]]//g; s/\??:$//' \
    | sort | tr '\n' ' ')"
  [ "$schema_keys" = "$dts_keys" ] \
    || { echo "DRIFT: schema=[$schema_keys] dts=[$dts_keys]"; return 1; }
}

# ── (4) dev-flow-plan wiring: Intel-Gathering step + intel.json + four sources ──
@test "PIB: dev-flow-plan SKILL.md adds the Intel-Gathering step" {
  grep -Eq 'A\.1\.5|Intel-Gathering|Plan Intel Bundle' "$PLAN_SKILL"
}

@test "PIB: dev-flow-plan SKILL.md references intel.json" {
  grep -q 'intel\.json' "$PLAN_SKILL"
}

@test "PIB: dev-flow-plan SKILL.md names the four intel sources" {
  grep -q 'codebase-memory' "$PLAN_SKILL" || { echo "MISSING codebase-memory"; return 1; }
  grep -q 'mcp-postgres'    "$PLAN_SKILL" || { echo "MISSING mcp-postgres";    return 1; }
  grep -q 'context7'        "$PLAN_SKILL" || { echo "MISSING context7";        return 1; }
  grep -Eq '\bLSP\b'        "$PLAN_SKILL" || { echo "MISSING LSP";             return 1; }
}

# ── (5) dev-flow-execute wiring: Step 2 references intel.json ──
_exec_step2_block() {
  awk '/^## Schritt 2:/{c=1;print;next} c&&/^## /{exit} c' "$EXEC_SKILL"
}

@test "PIB: dev-flow-execute SKILL.md Step 2 references intel.json" {
  _exec_step2_block | grep -q 'intel\.json' \
    || { echo "MISSING intel.json in dev-flow-execute Step 2 block"; return 1; }
}

# ── T002137: Alt-Worktrees nach T002135 — cleanup documented ──
@test "mishap-t002137: gotchas-footguns.md enthält Alt-Worktrees-Abschnitt" {
  FOOTGUNS="$REPO/docs/superpowers/references/gotchas-footguns.md"
  grep -q "Alt-Worktrees nach T002135" "$FOOTGUNS" \
    || { echo "MISSING section title: Alt-Worktrees nach T002135"; return 1; }
  grep -q "\.git/worktrees/<name>/modules" "$FOOTGUNS" \
    || { echo "MISSING path pattern: .git/worktrees/<name>/modules"; return 1; }
}

# ── Migrated from superpowers-writing-plans.bats (T002302) ──────────────

@test "dev-flow-plan SKILL.md exists" {
  [ -f "$REPO/.claude/skills/dev-flow-plan/SKILL.md" ]
}

@test "dev-flow-plan mentions plan-lint rules" {
  run grep -q "plan-lint" "$REPO/.claude/skills/dev-flow-plan/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "dev-flow-plan references Step 3.7" {
  run grep -q "3.7" "$REPO/.claude/skills/dev-flow-plan/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "dev-flow-plan mentions frontmatter keys" {
  run grep -q "frontmatter" "$REPO/.claude/skills/dev-flow-plan/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "T002272-M1: stage-plan accepts --hold" {
  run grep -n -- "--hold" "$REPO/scripts/vda/ticket/stage-plan.sh"
  [ "$status" -eq 0 ]
}

@test "T002272-M1: ticket.sh has a release-hold subcommand" {
  run bash -c "grep -c '^  release-hold)' '$REPO/scripts/ticket.sh'"
  [ "$output" != "0" ]
}

@test "T002272-M1: dev-flow-plan SKILL.md and ticket-stage-procedure.md reference stage-plan --hold" {
  run grep -n -- "stage-plan.*--hold" "$PLAN_SKILL" "$REPO/.claude/skills/references/ticket-stage-procedure.md"
  [ "$status" -eq 0 ]
}

@test "T002272-M1: dev-flow-execute SKILL.md calls release-hold" {
  run grep -n "release-hold" "$EXEC_SKILL"
  [ "$status" -eq 0 ]
}

# ── [T002375-p2] Worktree-Schreibschutz als blockierender PreToolUse-Hook ──#
#
# agent-lock.sh ist kooperativ. Eine Session ohne Claim sah bisher keinerlei
# Widerstand; der pre-commit-Mutex greift erst beim Commit. T002355-M3 belegt eine
# fremde Session, die im geclaimten Worktree schrieb UND pushte — entdeckt nur
# zufaellig ueber einen "File has been modified since read"-Fehler.
#
# Die Fixtures schreiben ausschliesslich nach $BATS_TEST_TMPDIR und setzen
# AGENT_LOCK_DIR. Niemals ins echte agent-locks/ — das ist genau der Fehler aus
# T002347-M1: ein Test, der ins echte Arbeitsverzeichnis schreibt, macht parallele
# Laeufe rot und hinterlaesst Muell, wenn er abbricht.

_wg_guard() { echo "$REPO/scripts/hooks/worktree-write-guard.sh"; }

_wg_lock() {  # $1=lockdir $2=name $3=owner_sid $4=worktree
  cat > "$1/$2.json" <<JSON
{
  "scope": "branch",
  "id": "probe",
  "owner_sid": "$3",
  "owner_pid": $$,
  "label": "probe",
  "branch": "probe",
  "worktree": "$4",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "heartbeat_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
}

_wg_run() {  # $1=lockdir $2=sid $3=zielpfad  -> setzt status/output
  run env AGENT_LOCK_DIR="$1" CLAUDE_CODE_SESSION_ID="$2" \
    bash -c "cd '$REPO' && printf '%s' '{\"tool_input\":{\"file_path\":\"$3\"}}' | bash '$(_wg_guard)'"
}

@test "T002375-p2: der Guard existiert und ist ausfuehrbar" {
  # Positiv-Anker fuer alle Negativtests unten: fehlt das Skript, passiert dort
  # gar nichts und sie bestuenden vakuos.
  [ -f "$(_wg_guard)" ] || { echo "scripts/hooks/worktree-write-guard.sh fehlt"; false; }
  [ -x "$(_wg_guard)" ] || { echo "Guard ist nicht ausfuehrbar"; false; }
}

@test "T002375-p2: Schreiben ausserhalb des eigenen Worktrees wird abgelehnt" {
  local ld; ld="$BATS_TEST_TMPDIR/locks-a"; mkdir -p "$ld"
  # Der Worktree muss UNTER dem Repo-Root liegen — reale Worktrees tun das
  # (.worktrees/<slug>), und Regel 1 laesst alles ausserhalb bewusst durch.
  # Das Verzeichnis muss nicht existieren, verglichen werden Praefixe.
  local mywt="$REPO/.worktrees/t002375-p2-mine"
  _wg_lock "$ld" branch__probe "sid-mine" "$mywt"

  # Positiv-Anker: innerhalb des eigenen Worktrees MUSS es durchgehen.
  _wg_run "$ld" "sid-mine" "$mywt/datei.txt"
  [ "$status" -eq 0 ] || { echo "eigener Worktree wurde faelschlich abgelehnt: $output"; false; }

  # Der eigentliche Fall: Hauptcheckout statt eigenem Worktree.
  _wg_run "$ld" "sid-mine" "$REPO/scripts/irgendwas.sh"
  [ "$status" -ne 0 ] || { echo "Schreibzugriff ausserhalb des Worktrees wurde NICHT abgelehnt"; false; }
  [[ "$output" == *"$mywt"* ]] || { echo "Meldung nennt den eigenen Worktree nicht: $output"; false; }
  [[ "$output" == *"WORKTREE_GUARD_BYPASS"* ]] || { echo "Meldung nennt den Notausgang nicht: $output"; false; }
}

@test "T002375-p2: ein fremder lebender Claim schuetzt seinen Worktree" {
  local ld; ld="$BATS_TEST_TMPDIR/locks-b"; mkdir -p "$ld"
  local otherwt="$REPO/.worktrees/t002375-p2-fremd"
  _wg_lock "$ld" branch__fremd "sid-other" "$otherwt"

  # Positiv-Anker: ohne eigenen Claim bleibt alles ausserhalb des fremden erlaubt.
  _wg_run "$ld" "sid-mine" "$REPO/scripts/irgendwas.sh"
  [ "$status" -eq 0 ] || { echo "ohne Claim wurde faelschlich abgelehnt: $output"; false; }

  _wg_run "$ld" "sid-mine" "$otherwt/design.md"
  [ "$status" -ne 0 ] || { echo "Schreiben in fremden geclaimten Worktree wurde NICHT abgelehnt"; false; }
  [[ "$output" == *"sid-other"* ]] || { echo "Meldung nennt die besitzende Session nicht: $output"; false; }
}

@test "T002375-p2: Pfade ausserhalb des Repos sind nicht Sache des Guards" {
  local ld; ld="$BATS_TEST_TMPDIR/locks-c"; mkdir -p "$ld"
  _wg_lock "$ld" branch__probe "sid-mine" "$REPO/.worktrees/t002375-p2-mine"
  # /etc/hosts liegt ausserhalb des Repo-Roots — der Guard ist keine allgemeine
  # Dateisystem-Policy und muss durchlassen.
  _wg_run "$ld" "sid-mine" "/etc/hosts"
  [ "$status" -eq 0 ] || { echo "Pfad ausserhalb des Repos wurde abgelehnt: $output"; false; }
}

@test "T002375-p2: WORKTREE_GUARD_BYPASS=1 laesst den Schreibzugriff durch" {
  local ld; ld="$BATS_TEST_TMPDIR/locks-d"; mkdir -p "$ld"
  local mywt="$REPO/.worktrees/t002375-p2-mine"
  _wg_lock "$ld" branch__probe "sid-mine" "$mywt"

  # Positiv-Anker: ohne Bypass wird derselbe Aufruf abgelehnt.
  _wg_run "$ld" "sid-mine" "$REPO/scripts/irgendwas.sh"
  [ "$status" -ne 0 ] || { echo "Vorbedingung: der Zugriff haette abgelehnt werden muessen"; false; }

  run env AGENT_LOCK_DIR="$ld" CLAUDE_CODE_SESSION_ID="sid-mine" WORKTREE_GUARD_BYPASS=1 \
    bash -c "cd '$REPO' && printf '%s' '{\"tool_input\":{\"file_path\":\"$REPO/scripts/irgendwas.sh\"}}' | bash '$(_wg_guard)'"
  [ "$status" -eq 0 ] || { echo "Bypass wirkt nicht: $output"; false; }
}

@test "T002375-p2: der Guard ist in .claude/settings.json auf die Schreib-Tools registriert" {
  run bash -c "cd '$REPO' && python3 -c \"
import json
d = json.load(open('.claude/settings.json'))
pre = d.get('hooks', {}).get('PreToolUse', [])
hits = [h for h in pre if 'worktree-write-guard' in json.dumps(h)]
assert hits, 'kein PreToolUse-Eintrag fuer worktree-write-guard'
m = hits[0].get('matcher', '')
for tool in ('Write', 'Edit'):
    assert tool in m, f'{tool} fehlt im matcher: {m}'
print('ok')
\""
  [ "$status" -eq 0 ] || { echo "$output"; false; }
}
