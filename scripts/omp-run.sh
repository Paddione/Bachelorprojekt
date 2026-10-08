#!/usr/bin/env bash
# omp-run.sh — gestagten Plan mit dem omp-Harness abarbeiten (T900793).
#
# omp ist oh-my-pi (Upstream-Fork `@oh-my-pi/pi-coding-agent`, Repo
# can1357/oh-my-pi, Binary `omp`) und ersetzt pi-coding-agent (T900529).
# CLI-Referenz: Upstream docs/cli-reference.md — verifizierte Flags:
# --mode/--no-session/--no-skills/--no-extensions/--tools/--append-system-prompt/
# --provider/--model/-p. Abweichungen zu pi (T900529): `--no-context-files`
# heisst `--no-rules` (Kontextdatei-Discovery), `--skill <pfad>` (mehrfach)
# heisst `--skills <globs>` (Filter auf Discovery), `--no-prompt-templates`
# und `--no-themes` entfallen (in omp 18.x nicht vorhanden — unbekannte Flags
# brechen den Lauf fail-closed ab, daher weggelassen).
# models.json im Lauf-Verzeichnis migriert omp automatisch nach models.yml
# (docs/models.md); PI_CODING_AGENT_DIR als Agent-Verzeichnis und PI_*-Env
# ehrt omp weiter (docs/environment-variables.md).
#
# Aufruf:
#   scripts/omp-run.sh <target> [--level L0|L1|L2|L3] [--model <id>] [--dry-run]
#                     [--json] [--skip-tests]
#   scripts/omp-run.sh --list-models [--json]
#
# Modelle kommen aus dem Endpunkt-Verbund (Design D5): jede Basis-URL in
# OMP_ENDPOINTS (Default :1919 llama-server und :1234 LM Studio, das die
# LM-Link-Geraete durchreicht; Tailnet-Hosts sind gewoehnliche Eintraege).
# OMP_LOCAL_BASE_URL ersetzt den Verbund durch genau einen Endpunkt.
#
# Aufrufer-Vertrag (Design D6): Exit 0/1/2 wie unten, --json liefert den
# Bericht als ein JSON-Objekt, jeder Lauf hat sein eigenes Agent-Verzeichnis.
#   Exit 1  Bedienfehler (Argumente, Stufe)
#   Exit 2  Umgebung (Plan, omp, kein Endpunkt, unbekanntes Modell)
#   sonst   Exit-Code von omp
#
# <target> ist entweder ein Plan-Pfad (tasks.md) oder eine Ticket-ID (T######).
# Bei Ticket-ID wird der Plan-REF aus der Ticket-Datenbank geholt; ohne Plan-REF
# ist das ein Fehler — es wird nicht geraten.
#
# Stufen (Stufe = wie viel Kontext der Harness bekommt):
#   L0  nur der Plan, keine Werkzeuge ausser read/write/edit/bash, kein Kontext-MD
#   L1  L0 + .omp/context.md als System-Prompt-Anhang
#   L2  L1 + grep/find/ls
#   L3  L2 + Skill-Discovery gefiltert auf die fuer Rolle `omp` kuratierten Skills
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# Test seam (T901070): dirty snapshots default to the repo checkout; tests
# point OMP_WORKTREE at an isolated temp git repo to ignore parallel writers.
OMP_WORKTREE="${OMP_WORKTREE:-$REPO_ROOT}"

LEVEL="L1"
MODEL=""
DRY_RUN=0
TARGET=""
LIST_MODELS=0
JSON=0
SKIP_TESTS=0

usage() {
  echo "Usage: scripts/omp-run.sh <target> [--level L0|L1|L2|L3] [--model <id>] [--dry-run]" >&2
  echo "  <target>   Plan-Pfad (tasks.md) oder Ticket-ID (T######)" >&2
  echo "  --level    Kontextstufe, Default L1" >&2
  echo "  --model    Modell-ID, Default: erstes Modell des ersten erreichbaren Endpunkts" >&2
  echo "  --dry-run  Kommandozeile zeigen, nichts ausfuehren" >&2
  echo "  --json     Bericht bzw. Modellliste als JSON auf stdout" >&2
  echo "  --skip-tests  task test:changed auslassen (test_exit: null)" >&2
  echo "  --list-models Modelle des Endpunkt-Verbunds auflisten (ohne <target>)" >&2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --level)
      [ "$#" -ge 2 ] || { echo "FEHLER: --level braucht eine Angabe" >&2; exit 1; }
      LEVEL="$2"; shift 2 ;;
    --level=*) LEVEL="${1#--level=}"; shift ;;
    --model)
      [ "$#" -ge 2 ] || { echo "FEHLER: --model braucht eine Angabe" >&2; exit 1; }
      MODEL="$2"; shift 2 ;;
    --model=*) MODEL="${1#--model=}"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --list-models) LIST_MODELS=1; shift ;;
    --json) JSON=1; shift ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) echo "FEHLER: unbekannte Option '$1'" >&2; usage; exit 1 ;;
    *)
      if [ -n "$TARGET" ]; then
        echo "FEHLER: mehr als ein Ziel angegeben ('$TARGET' und '$1')" >&2; usage; exit 1
      fi
      TARGET="$1"; shift ;;
  esac
done

# ------------------------------------------------------------------- Umgebung
# PI_OFFLINE/PI_CODING_AGENT_DIR ehrt omp weiter (Upstream-Doku, s. Kopf).
export PI_OFFLINE=1
AGENT_BASE="${XDG_STATE_HOME:-$HOME/.local/state}/omp-harness/agent"
# Skill-Wurzel uebersteuerbar, damit Tests und abweichende Checkouts ihre
# eigenen Skills kuratieren koennen, ohne den Harness anzufassen.
SKILLS_DIR="${OMP_SKILLS_DIR:-$REPO_ROOT/.claude/skills}"

# Endpunkt-Verbund (D5). OMP_LOCAL_BASE_URL gewinnt, damit ein Aufrufer genau
# einen Endpunkt erzwingen kann.
if [ -n "${OMP_LOCAL_BASE_URL:-}" ]; then
  ENDPOINTS=("${OMP_LOCAL_BASE_URL%/}")
else
  read -r -a ENDPOINTS <<<"$(printf '%s' "${OMP_ENDPOINTS:-http://127.0.0.1:1919,http://127.0.0.1:1234}" | tr ',' ' ')"
fi

# Schreibt je Chat-Modell eine Zeile `id<TAB>endpunkt<TAB>provider<TAB>n_ctx<TAB>info`
# nach stdout. Stumme Endpunkte werden auf stderr genannt, nicht verschwiegen.
# LM Studio (auch fuer LM-Link-Geraete) liefert unter /api/v0/models Typ,
# Architektur und Ladezustand — die IDs der Remote-Geraete sind oft nur
# Snapshot-Hashes, ohne diese Spalte waere die Auswahl blind.
discover_models() {
  local ep body provider
  for ep in "${ENDPOINTS[@]}"; do
    ep="${ep%/}"
    [ -n "$ep" ] || continue
    provider="ep-$(printf '%s' "$ep" | sed -E 's#^[a-zA-Z]+://##; s#[^A-Za-z0-9]+#-#g; s#-+$##')"
    body="$(curl -fsS --max-time 5 "$ep/api/v0/models" 2>/dev/null || true)"
    if printf '%s' "$body" | jq -e '(.data // []) | length > 0 and all(has("type"))' >/dev/null 2>&1; then
      # Kontext nur, wenn geladen: ein JIT-Load nutzt nicht max_context_length.
      printf '%s' "$body" | jq -r --arg ep "$ep" --arg p "$provider" '
        .data[] | select(.type == "llm" or .type == "vlm")
        | [.id, $ep, $p, (.loaded_context_length // "" | tostring),
           ([.arch, .quantization, .state] | map(select(. != null)) | join(" "))] | @tsv' \
        | grep . || echo "WARNUNG: Endpunkt $ep liefert kein Chat-Modell" >&2
      continue
    fi
    body="$(curl -fsS --max-time 5 "$ep/v1/models" 2>/dev/null || true)"
    # llama.cpp liefert .data[] mit .id, aeltere Builds nur .models[] mit .model.
    if ! printf '%s' "$body" | jq -er --arg ep "$ep" --arg p "$provider" '
        ( if ((.data // []) | length) > 0
          then [.data[] | {id, n: (.meta.n_ctx // null), o: (.owned_by // "")}]
          else [(.models // [])[] | {id: .model, n: null, o: ""}] end )
        | map(select(.id != null and (.id | test("embed|rerank"; "i") | not)))
        | if length == 0 then error("leer") else . end
        | .[] | [.id, $ep, $p, (.n // "" | tostring), .o] | @tsv' 2>/dev/null; then
      echo "WARNUNG: Endpunkt $ep/v1/models antwortet nicht oder ohne Chat-Modell" >&2
    fi
  done
}

# `<hash> <pfad>` je geaenderter oder neuer Datei. Der Vergleich vorher/nachher
# zaehlt nur, was der Lauf selbst angefasst hat, nicht den Altbestand des Worktrees.
dirty_snapshot() {
  git -C "$OMP_WORKTREE" status --porcelain --untracked-files=all 2>/dev/null | cut -c4- \
    | while IFS= read -r f; do
        printf '%s %s\n' "$(git -C "$OMP_WORKTREE" hash-object "$f" 2>/dev/null || echo deleted)" "$f"
      done | sort
}

need_jq() {
  command -v jq >/dev/null 2>&1 || { echo "FEHLER: jq fehlt" >&2; exit 2; }
}

# ------------------------------------------------------------- --list-models
if [ "$LIST_MODELS" -eq 1 ]; then
  need_jq
  pool="$(discover_models)"
  if [ -z "$pool" ]; then
    echo "FEHLER: kein Endpunkt liefert ein Modell (${ENDPOINTS[*]})" >&2
    exit 2
  fi
  if [ "$JSON" -eq 1 ]; then
    printf '%s\n' "$pool" | jq -R -s -c 'split("\n") | map(select(length > 0) | split("\t")
      | {model: .[0], endpoint: .[1], provider: .[2],
         context: (.[3] | if . == "" then null else tonumber end), info: (.[4] // "")})'
  else
    printf '%s\n' "$pool" | cut -f1,2,5
  fi
  exit 0
fi

if [ -z "$TARGET" ]; then
  echo "FEHLER: kein Ziel angegeben" >&2
  usage
  exit 1
fi

case "$LEVEL" in
  L0|L1|L2|L3) ;;
  *) echo "FEHLER: unbekannte Stufe '$LEVEL' — gueltig: L0 L1 L2 L3" >&2; exit 1 ;;
esac

# ---------------------------------------------------------------- Plan aufloesen
TICKET_ID=""
PLAN=""
case "$TARGET" in
  T[0-9]*)
    TICKET_ID="$TARGET"
    need_jq
    plan_ref="$(bash scripts/ticket.sh get --id "$TICKET_ID" 2>/dev/null \
      | jq -r '.plan_ref // empty' \
      | sed -n 's/.*plan=\([^ ]*\).*/\1/p')" || true
    if [ -z "$plan_ref" ]; then
      echo "FEHLER: Ticket $TICKET_ID hat keinen FACTORY-PLAN-REF" >&2
      exit 2
    fi
    PLAN="$plan_ref"
    ;;
  *)
    PLAN="$TARGET"
    ;;
esac

if [ ! -f "$PLAN" ]; then
  echo "FEHLER: Plan-Datei nicht gefunden: $PLAN" >&2
  exit 2
fi

# ----------------------------------------------------------------- Argumente
# Kein Cloud-Ausweg: --provider wird aus dem Endpunkt abgeleitet, der das Modell
# serviert. Ein leerer Verbund ist ein Fehler, kein Anlass zum Wechsel.
# Flag-Stand omp 18.x (Upstream cli-reference, s. Kopf): --no-context-files zu
# --no-rules umbenannt; --no-prompt-templates/--no-themes ersatzlos entfallen.
args=(
  --mode json
  --no-session
  --no-rules
  --no-extensions
)

case "$LEVEL" in
  L0|L1) TOOLS="read,write,edit,bash" ;;
  L2|L3) TOOLS="read,write,edit,bash,grep,find,ls" ;;
esac
# Ein Argument mit Kommas — omp parst das selbst, wir also nicht zerlegen.
args+=(--tools "$TOOLS")

if [ "$LEVEL" != "L0" ]; then
  if [ ! -f "$REPO_ROOT/.omp/context.md" ]; then
    echo "FEHLER: .omp/context.md fehlt — Stufe $LEVEL braucht es" >&2
    exit 2
  fi
  args+=(--append-system-prompt "$(cat "$REPO_ROOT/.omp/context.md")")
fi

skills_added=0
if [ "$LEVEL" = "L3" ]; then
  # Nur was die Registry fuer die Rolle `omp` kuratiert — der Harness erfindet
  # keine Skills. `skill:`-Prefix ist Teil des Instanz-Keys im Registry-Schema.
  # omp kennt kein wiederholbares `--skill <pfad>` mehr, sondern filtert die
  # Discovery mit `--skills <globs>` — deshalb ein Flag mit Komma-Liste statt
  # N Pfad-Flags. `--no-skills` darf auf L3 NICHT stehen (wuerde den Filter
  # ins Leere laufen lassen); L0–L2 behalten es.
  skill_names=()
  while IFS= read -r skill_name; do
    [ -n "$skill_name" ] || continue
    skill_file="$SKILLS_DIR/$skill_name/SKILL.md"
    if [ -f "$skill_file" ]; then
      skill_names+=("$skill_name")
      skills_added=$((skills_added + 1))
    else
      echo "WARNUNG: kuratierter Skill '$skill_name' hat keine SKILL.md — uebersprungen" >&2
    fi
  done < <(bash "$REPO_ROOT/scripts/toolset-context.sh" omp --json 2>/dev/null \
    | jq -r '.[] | select(.instance | startswith("skill:")) | .instance | sub("^skill:"; "")' 2>/dev/null || true)
  if [ "${#skill_names[@]}" -gt 0 ]; then
    args+=(--skills "$(IFS=,; printf '%s' "${skill_names[*]}")")
  else
    args+=(--no-skills)
  fi
else
  args+=(--no-skills)
fi

if [ -n "$TICKET_ID" ]; then
  label="$TICKET_ID"
else
  label="$(basename "$(dirname "$PLAN")")"
  [ -n "$label" ] && [ "$label" != "." ] || label="plan"
fi

# ------------------------------------------------------------------ Dry-Run
if [ "$DRY_RUN" -eq 1 ]; then
  printf 'omp'
  for a in "${args[@]}"; do
    # printf %q escaped Kommata als read\,write\,... — das nimmt omp so nicht an,
    # also die Tool-Liste unveraendert zeigen.
    if [ "$a" = "$TOOLS" ]; then printf ' %s' "$a"; else printf ' %q' "$a"; fi
  done
  printf ' --provider %q' "<auto>"
  if [ -n "$MODEL" ]; then printf ' --model %q' "$MODEL"; else printf ' --model %q' "<auto>"; fi
  printf ' -p %q\n' "@$PLAN"
  echo "level: $LEVEL"
  echo "plan:  $PLAN"
  echo "skills: $skills_added (Stufe L3)"
  echo "endpunkte: ${ENDPOINTS[*]}"
  echo "trockenlauf — es wurde nichts ausgefuehrt und kein Endpunkt geprueft"
  exit 0
fi

# --------------------------------------------------------------- Echter Lauf
if ! command -v omp >/dev/null 2>&1; then
  echo "FEHLER: omp nicht installiert — task omp:install" >&2
  exit 2
fi
need_jq

pool="$(discover_models)"
if [ -z "$pool" ]; then
  echo "FEHLER: kein Endpunkt liefert ein Modell (${ENDPOINTS[*]}) — kein Ausweichen auf andere Provider" >&2
  exit 2
fi

if [ -n "$MODEL" ]; then
  # Exakte ID, erster Endpunkt in Listenreihenfolge gewinnt.
  hit="$(printf '%s\n' "$pool" | awk -F'\t' -v m="$MODEL" '$1 == m { print; exit }')"
  if [ -z "$hit" ]; then
    echo "FEHLER: Modell '$MODEL' wird von keinem Endpunkt serviert. Verfuegbar:" >&2
    printf '%s\n' "$pool" | cut -f1,2 | sed 's/^/  /' >&2
    exit 2
  fi
else
  hit="$(printf '%s\n' "$pool" | head -n 1)"
fi
IFS=$'\t' read -r selected_model selected_endpoint selected_provider _ <<<"$hit"

# Eigenes Agent-Verzeichnis je Lauf: parallele Aufrufer teilen sich sonst
# models.json und ueberschreiben sich gegenseitig den Katalog. omp migriert
# models.json automatisch nach models.yml (Upstream docs/models.md).
mkdir -p "$AGENT_BASE/runs"
PI_CODING_AGENT_DIR="$(mktemp -d "$AGENT_BASE/runs/${label}-XXXXXX")"
export PI_CODING_AGENT_DIR
trap 'rm -rf "$PI_CODING_AGENT_DIR"' EXIT

printf '%s\n' "$pool" | jq -R -s '
  split("\n") | map(select(length > 0) | split("\t"))
  | group_by(.[2])
  | map({ key: .[0][2], value: {
      baseUrl: (.[0][1] + "/v1"),
      api: "openai-completions",
      apiKey: "local",
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      models: map({ id: .[0] } + (if .[3] == "" then {} else { contextWindow: (.[3] | tonumber) } end))
    } })
  | { providers: from_entries }' > "$PI_CODING_AGENT_DIR/models.json"

mkdir -p "$REPO_ROOT/.omp/runs"
log="$REPO_ROOT/.omp/runs/${label}-${LEVEL}-$(date +%Y%m%dT%H%M%S).jsonl"

before="$(dirty_snapshot)"

set +e
omp "${args[@]}" --provider "$selected_provider" --model "$selected_model" -p "$(cat "$PLAN")" > "$log" 2>&1
omp_exit=$?
set -e

changed="$(comm -3 <(printf '%s\n' "$before") <(dirty_snapshot) | sed 's/^\t//' | cut -d' ' -f2- | sort -u | grep -c . || true)"

test_exit="null"
if [ "$SKIP_TESTS" -eq 0 ]; then
  set +e
  ( cd "$REPO_ROOT" && task test:changed ) >/dev/null 2>&1
  test_exit=$?
  set -e
fi

if [ "$JSON" -eq 1 ]; then
  jq -n -c --arg level "$LEVEL" --arg plan "$PLAN" --arg endpoint "$selected_endpoint" \
    --arg provider "$selected_provider" --arg model "$selected_model" --arg log "$log" \
    --argjson omp_exit "$omp_exit" --argjson changed "$changed" --argjson test_exit "$test_exit" \
    --argjson skills "$skills_added" \
    '{level: $level, plan: $plan, endpoint: $endpoint, provider: $provider, model: $model,
      skills: $skills, omp_exit: $omp_exit, changed_files: $changed, test_exit: $test_exit, log: $log}'
else
  echo "=== omp-run Bericht (T900793) ==="
  echo "stufe:         $LEVEL"
  echo "plan:          $PLAN"
  echo "endpunkt:      $selected_endpoint/v1 ($selected_provider)"
  echo "modell:        $selected_model"
  echo "skills:        $skills_added"
  echo "geaendert:     $changed Datei(en)"
  echo "omp-exit:      $omp_exit"
  echo "test:changed:  exit $test_exit"
  echo "log:           $log"
fi

if [ -n "$TICKET_ID" ]; then
  report="omp-run $LEVEL: Modell $selected_model @ $selected_endpoint, omp-Exit $omp_exit, $changed Datei(en), test:changed-Exit $test_exit, Log $log"
  bash scripts/ticket.sh add-comment --id "$TICKET_ID" --body "$report" >/dev/null 2>&1 \
    || echo "WARNUNG: Ticket-Kommentar fuer $TICKET_ID fehlgeschlagen" >&2
fi

exit "$omp_exit"
