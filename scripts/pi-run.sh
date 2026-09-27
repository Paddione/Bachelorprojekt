#!/usr/bin/env bash
# pi-run.sh — gestagten Plan mit dem Pi-Harness abarbeiten (T900529).
#
# Aufruf:
#   scripts/pi-run.sh <target> [--level L0|L1|L2|L3] [--model <id>] [--dry-run]
#
# <target> ist entweder ein Plan-Pfad (tasks.md) oder eine Ticket-ID (T######).
# Bei Ticket-ID wird der Plan-REF aus der Ticket-Datenbank geholt; ohne Plan-REF
# ist das ein Fehler — es wird nicht geraten.
#
# Stufen (Stufe = wie viel Kontext der Harness bekommt):
#   L0  nur der Plan, keine Werkzeuge ausser read/write/edit/bash, kein Kontext-MD
#   L1  L0 + .pi/context.md als System-Prompt-Anhang
#   L2  L1 + grep/find/ls
#   L3  L2 + die fuer Rolle `pi` kuratierten Skills aus der Toolset-Registry
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LEVEL="L1"
MODEL=""
DRY_RUN=0
TARGET=""

usage() {
  echo "Usage: scripts/pi-run.sh <target> [--level L0|L1|L2|L3] [--model <id>] [--dry-run]" >&2
  echo "  <target>   Plan-Pfad (tasks.md) oder Ticket-ID (T######)" >&2
  echo "  --level    Kontextstufe, Default L1" >&2
  echo "  --model    Modell-ID, Default: erstes Modell des lokalen Endpunkts" >&2
  echo "  --dry-run  Kommandozeile zeigen, nichts ausfuehren" >&2
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
    if ! command -v jq >/dev/null 2>&1; then
      echo "FEHLER: jq fehlt — Ticket-Ziel '$TICKET_ID' braucht jq" >&2
      exit 2
    fi
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

# ------------------------------------------------------------------- Umgebung
export PI_CODING_AGENT_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/pi-harness/agent"
export PI_OFFLINE=1
BASE="${PI_LOCAL_BASE_URL:-http://127.0.0.1:1919}"
# Skill-Wurzel uebersteuerbar, damit Tests und abweichende Checkouts ihre
# eigenen Skills kuratieren koennen, ohne den Harness anzufassen.
SKILLS_DIR="${PI_SKILLS_DIR:-$REPO_ROOT/.claude/skills}"

# ----------------------------------------------------------------- Argumente
# --provider local: es gibt keinen Cloud-Ausweg. Ein Endpunkt, der nicht
# antwortet, ist ein Fehler und kein Anlass, den Provider zu wechseln.
args=(
  --mode json
  --no-session
  --no-context-files
  --no-skills
  --no-extensions
  --no-prompt-templates
  --no-themes
  --provider local
)

case "$LEVEL" in
  L0|L1) TOOLS="read,write,edit,bash" ;;
  L2|L3) TOOLS="read,write,edit,bash,grep,find,ls" ;;
esac
# Ein Argument mit Kommas — Pi parst das selbst, wir also nicht zerlegen.
args+=(--tools "$TOOLS")

if [ "$LEVEL" != "L0" ]; then
  if [ ! -f "$REPO_ROOT/.pi/context.md" ]; then
    echo "FEHLER: .pi/context.md fehlt — Stufe $LEVEL braucht es" >&2
    exit 2
  fi
  args+=(--append-system-prompt "$(cat "$REPO_ROOT/.pi/context.md")")
fi

skills_added=0
if [ "$LEVEL" = "L3" ]; then
  # Nur was die Registry fuer die Rolle `pi` kuratiert — der Harness erfindet
  # keine Skills. `skill:`-Prefix ist Teil des Instanz-Keys im Registry-Schema.
  while IFS= read -r skill_name; do
    [ -n "$skill_name" ] || continue
    skill_file="$SKILLS_DIR/$skill_name/SKILL.md"
    if [ -f "$skill_file" ]; then
      args+=(--skill "$skill_file")
      skills_added=$((skills_added + 1))
    else
      echo "WARNUNG: kuratierter Skill '$skill_name' hat keine SKILL.md — uebersprungen" >&2
    fi
  done < <(bash "$REPO_ROOT/scripts/toolset-context.sh" pi --json 2>/dev/null \
    | jq -r '.[] | select(.instance | startswith("skill:")) | .instance | sub("^skill:"; "")' 2>/dev/null || true)
fi

if [ -n "$TICKET_ID" ]; then
  label="$TICKET_ID"
else
  label="$(basename "$(dirname "$PLAN")")"
  [ -n "$label" ] && [ "$label" != "." ] || label="plan"
fi

# ------------------------------------------------------------------ Dry-Run
if [ "$DRY_RUN" -eq 1 ]; then
  printf 'pi'
  for a in "${args[@]}"; do
    # printf %q escaped Kommata als read\\,write\\,... — das ist eine Kommandozeile,
    # die Pi so nicht annimmt, also die Tool-Liste unveraendert zeigen.
    if [ "$a" = "$TOOLS" ]; then
      printf -- ' --tools %s' "$a"
    else
      printf ' %q' "$a"
    fi
  done
  if [ -n "$MODEL" ]; then printf ' --model %q' "$MODEL"; else printf ' --model %q' "<auto>"; fi
  printf ' -p %q\n' "@$PLAN"
  echo "level: $LEVEL"
  echo "plan:  $PLAN"
  echo "skills: $skills_added (Stufe L3)"
  echo "base:  $BASE"
  echo "trockenlauf — es wurde nichts ausgefuehrt und kein Endpunkt geprueft"
  exit 0
fi

# --------------------------------------------------------------- Echter Lauf
if ! command -v pi >/dev/null 2>&1; then
  echo "FEHLER: pi nicht installiert — task pi:install" >&2
  exit 2
fi

models_json="$(curl -fsS --max-time 5 "$BASE/v1/models" 2>/dev/null || true)"
model_ids=""
if [ -n "$models_json" ]; then
  model_ids="$(printf '%s' "$models_json" | jq -r '.data[]?.id // empty' 2>/dev/null || true)"
  if [ -z "$model_ids" ]; then
    # llama.cpp liefert je nach Build .models[] mit .model statt .data[] mit .id
    model_ids="$(printf '%s' "$models_json" | jq -r '.models[]?.model // empty' 2>/dev/null || true)"
  fi
fi

if [ -z "$model_ids" ]; then
  echo "FEHLER: lokaler Endpunkt $BASE/v1/models nicht erreichbar oder ohne Modell" >&2
  exit 2
fi

selected_model="$MODEL"
if [ -z "$selected_model" ]; then
  selected_model="$(printf '%s' "$model_ids" | head -n 1)"
fi

mkdir -p "$PI_CODING_AGENT_DIR"
# Modellkatalog fuer Pi: Provider `local` ist derselbe Name wie --provider local.
cat > "$PI_CODING_AGENT_DIR/models.json" <<MODELS_JSON
{
  "providers": {
    "local": {
      "baseUrl": "$BASE/v1",
      "api": "openai-completions",
      "apiKey": "local",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
$(printf '%s' "$model_ids" | sed 's/.*/        { "id": "&" }/' | paste -sd, -)
      ]
    }
  }
}
MODELS_JSON

mkdir -p "$REPO_ROOT/.pi/runs"
log="$REPO_ROOT/.pi/runs/${label}-${LEVEL}-$(date +%Y%m%dT%H%M%S).jsonl"

set +e
pi "${args[@]}" --model "$selected_model" -p "$(cat "$PLAN")" > "$log" 2>&1
pi_exit=$?
set -e

changed="$(git -C "$REPO_ROOT" diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ')"
changed="${changed} Datei(en)"

set +e
( cd "$REPO_ROOT" && task test:changed ) >/dev/null 2>&1
test_exit=$?
set -e

echo "=== pi-run Bericht (T900529) ==="
echo "stufe:         $LEVEL"
echo "plan:          $PLAN"
echo "endpunkt:      $BASE/v1"
echo "modell:        $selected_model"
echo "skills:        $skills_added"
echo "geaendert:     $changed"
echo "pi-exit:       $pi_exit"
echo "test:changed:  exit $test_exit"
echo "log:           $log"

if [ -n "$TICKET_ID" ]; then
  report="pi-run $LEVEL: Modell $selected_model, pi-Exit $pi_exit, $changed, test:changed-Exit $test_exit, Log $log"
  bash scripts/ticket.sh add-comment --id "$TICKET_ID" --body "$report" >/dev/null 2>&1 \
    || echo "WARNUNG: Ticket-Kommentar fuer $TICKET_ID fehlgeschlagen" >&2
fi

exit "$pi_exit"
