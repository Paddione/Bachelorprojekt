#!/usr/bin/env bash
# scripts/hooks/worktree-write-guard.sh — PreToolUse-Guard gegen Schreibzugriffe
# außerhalb des geclaimten Worktrees. [T002375-p2]
#
# WARUM BLOCKIEREND UND NICHT WARNEND:
# `agent-lock.sh` ist kooperativ, kein Mandatory Locking. Eine Session, die nicht
# claimt, sieht keinerlei Widerstand — weder beim Betreten eines fremd geclaimten
# Worktrees noch beim Schreiben. Der `.githooks/pre-commit`-Mutex greift erst beim
# Commit; bis dahin überschreiben sich zwei Sessions frei.
#
# T002355-M3 belegt es: während `dev-flow-plan` für T002350 lief, schrieb eine zweite
# Session im selben Worktree ohne Claim dieselben Dateien und pushte. Entdeckt wurde
# das nur zufällig über einen "File has been modified since read"-Fehler des
# Write-Tools; `tasks.md` war zwischen Read und Write von 45 auf 260 Zeilen gewachsen.
# Verloren ging nichts, weil die fremde Session die Artefakte der ersten zufällig
# aufgriff statt sie zu ersetzen — Glück, keine Absicherung.
#
# T002357-M1 nennt die strukturelle Wurzel: der Wechsel in den Worktree passiert per
# `cd` und wirkt NUR auf Bash. Edit und Write nehmen absolute Pfade und haben keinerlei
# Bezug zum Bash-Arbeitsverzeichnis — ein Pfad, der zu Sessionbeginn korrekt war, bleibt
# danach syntaktisch gültig und trifft still die falsche Arbeitskopie.
#
# Die warnende Variante existierte de facto bereits als Regel in `dev-flow-plan` und
# `CLAUDE.local.md` und hat genau diese Vorfälle nicht verhindert. Deshalb blockierend.
#
# ENTSCHEIDUNGSREIHENFOLGE (stdin = Tool-Eingabe als JSON):
#   1. Zielpfad außerhalb des Repo-Roots        -> erlauben (keine Dateisystem-Policy)
#   2. Eigener Branch-Claim mit `worktree`      -> nur darunter erlauben
#   3. Fremder LEBENDER Claim deckt den Pfad    -> ablehnen, Besitzer nennen
#   4. sonst                                    -> erlauben (ohne Claim ändert sich nichts)
#
# Der Hook prüft bewusst NICHT, ob überhaupt geclaimt wurde. Eine Session ohne Claim
# wird nicht zum Claimen gezwungen — das wäre eine eigene Entscheidung mit deutlich
# breiterer Wirkung.
#
# Notausgang: WORKTREE_GUARD_BYPASS=1. Vorbild sind SKIP_BRANCH_CHECK und
# SKIP_COMMIT_VS_DIFF in diesem Repo — ein Guard ohne benannten Notausgang wird
# umgangen statt verstanden.
set -uo pipefail

_allow() { exit 0; }

[ "${WORKTREE_GUARD_BYPASS:-0}" = "1" ] && _allow

INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || _allow

# Zielpfad aus der Tool-Eingabe ziehen. Write/Edit/NotebookEdit nutzen file_path,
# NotebookEdit zusätzlich notebook_path. Kein jq-Zwang: der Hook läuft vor JEDEM
# Schreibzugriff und darf nicht an einer fehlenden Abhängigkeit scheitern.
TARGET="$(printf '%s' "$INPUT" | python3 -c '
import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = d.get("tool_input") or d
for k in ("file_path", "notebook_path", "path"):
    v = ti.get(k)
    if isinstance(v, str) and v:
        print(v); break
' 2>/dev/null || true)"
[ -n "$TARGET" ] || _allow

# Absolut machen; relative Pfade beziehen sich auf das Arbeitsverzeichnis des Hooks.
case "$TARGET" in /*) ;; *) TARGET="$PWD/$TARGET";; esac

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$REPO_ROOT" ] || _allow
# Der main-Checkout ist der gemeinsame Nenner aller Worktrees.
COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
[ -n "$COMMON_DIR" ] || _allow
COMMON_DIR="$(cd "$COMMON_DIR" && pwd)"
MAIN_ROOT="$(dirname "$COMMON_DIR")"

# 1) Außerhalb des Repos -> nicht unsere Zuständigkeit.
case "$TARGET" in
  "$MAIN_ROOT"/*) ;;
  *) _allow ;;
esac

LOCK_DIR="${AGENT_LOCK_DIR:-$COMMON_DIR/agent-locks}"
[ -d "$LOCK_DIR" ] || _allow

_field() {  # $1=datei $2=key
  sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" "$1" | head -1
}

_my_sid() {
  # Spiegel von scripts/agent-lock.sh _my_sid (T003131) — die Prüfreihenfolge MUSS
  # mit agent-lock.sh übereinstimmen, sonst driftet die SID im Guard gegen die
  # SID der Claims und EIGENE Claims gelten als fremd (genau die T003131-Falle:
  # der Guard kannte OPENCODE_SESSION_ID nicht und fiel auf den Unix-SID-Fallback
  # zurück, der pro Bash-Call driftet).
  # Harness-stable env wins (Claude Code / opencode expose a session id surviving
  # bash tool calls); AGENT_LOCK_SID override stays as second layer (CI/unit tests);
  # per-call Unix-SID is the fallback and the source of the drift bug. [T001268]
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local _v
  for _v in CLAUDE_CODE_SESSION_ID CLAUDE_SESSION_ID OPENCODE_SESSION_ID; do
    if [ -n "${!_v:-}" ]; then printf '%s\n' "${!_v}"; return; fi
  done
  # [T002381-M1] Weder Harness-Env noch AGENT_LOCK_SID gesetzt — der Unix-SID-Fallback
  # driftet pro Bash-Call. Warnung ausgeben, damit der Operator die Ursache erkennt
  # und AGENT_LOCK_SID setzen oder die Harness-Variable bereitstellen kann.
  echo "WARNUNG: worktree-write-guard _my_sid — weder CLAUDE_CODE_SESSION_ID/CLAUDE_SESSION_ID/OPENCODE_SESSION_ID noch AGENT_LOCK_SID gesetzt. SID driftet pro Bash-Call (siehe T001268/T002381/T003131)." >&2
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  if [ -n "$s" ]; then printf '%s\n' "$s"; return; fi
  # fallback: 4th field after the ')' in /proc/self/stat is the session id
  local stat rest; stat="$(cat /proc/self/stat 2>/dev/null)"; rest="${stat##*) }"
  set -- $rest; printf '%s\n' "${4:-0}"
}
SID="$(_my_sid)"

# Worktree-Pfade aus den Lock-Dateien gegen den main-Checkout absolut machen.
# `agent-lock.sh` speichert den `--worktree`-Wert so, wie der Aufrufer ihn uebergibt —
# und die uebliche Schreibweise ist relativ (`.worktrees/<slug>`). TARGET ist ab
# Zeile 66 dagegen IMMER absolut. Ohne diese Normalisierung matcht ein relativ
# gespeicherter Pfad nie, und weil ein gesetztes MY_WT jeden Pfad ausserhalb
# ablehnt, blockiert der Guard dann JEDEN Schreibzugriff der Session — der Notausgang
# bleibt die einzige Möglichkeit weiterzuarbeiten. [T002412]
# T003991: Lock-Pfad kann -T<id>-Suffix tragen, realer Worktree liegt ohne.
# Drift-Quelle: worktree-create.sh
_abs_wt() {
  local wt
  case "$1" in
    /*) wt="$1" ;;
    *)  wt="$MAIN_ROOT/${1#./}" ;;
  esac
  if [ ! -d "$wt" ] && [[ "$wt" =~ -T[0-9]{6,}$ ]]; then
    local stripped="${wt%-T*}"
    [ -d "$stripped" ] && wt="$stripped"
  fi
  printf '%s\n' "$wt"
}

MY_WTS=()
FOREIGN_WT=""
FOREIGN_SID=""
for f in "$LOCK_DIR"/*.json; do
  [ -f "$f" ] || continue
  wt="$(_field "$f" worktree)"
  [ -n "$wt" ] || continue
  [ "$wt" = "-" ] && continue
  wt="$(_abs_wt "$wt")"
  owner="$(_field "$f" owner_sid)"
  if [ "$owner" = "$SID" ]; then
    # Ein eigener Claim auf einen nicht mehr existierenden Worktree darf die Session
    # nicht lähmen. Sonst gilt: MY_WTS ist nicht leer, also wird jeder Pfad ausserhalb
    # abgelehnt — aber der einzige erlaubte Pfad existiert nicht. Die Session kann dann
    # NIRGENDS mehr schreiben und kommt nur noch über den Notausgang weiter. Genau das
    # trat am 2026-07-28 ein, als der Worktree zu T002408 während des Laufs entfernt
    # wurde. Bleibt nach dem Filtern kein eigener Worktree übrig, greift Regel 4
    # ("ohne Claim ändert sich nichts"); der Schutz gegen FREMDE Claims bleibt
    # davon unberührt. [T002412]
    [ -d "$wt" ] || continue
    # ALLE eigenen Claims sammeln, nicht nur den ersten: eine Session darf legitim
    # mehrere Worktrees halten (z. B. wenn ticket-ops zwei Tickets parallel
    # dispatcht). Der frühere `[ -z "$MY_WT" ] && MY_WT="$wt"` sperrte sie aus allen
    # ausser dem zuerst gefundenen aus — und welcher das ist, entscheidet die
    # Glob-Reihenfolge, also der Ticketname. [T002412]
    # Dedup: ein Worktree, auf den mehrere Locks (unterschiedlichen Scopes)
    # zeigen, erscheint nur einmal in der Liste. Reine Bash-Prüfung über
    # das Array — keine neue Abhängigkeit.
    _dedup_found=0
    for _existing in "${MY_WTS[@]}"; do
      [ "$_existing" = "$wt" ] && { _dedup_found=1; break; }
    done
    [ "$_dedup_found" -eq 0 ] && MY_WTS+=("$wt")
  else
    case "$TARGET" in
      "$wt"/*|"$wt") FOREIGN_WT="$wt"; FOREIGN_SID="$owner";;
    esac
  fi
done

# 2) Eigener Claim gewinnt: nur unterhalb der eigenen Worktrees darf geschrieben werden.
#     Die Zusicherung ist session-bezogen (SID-Match), nicht akteur-bezogen — ein
#     Subagent derselben Session schreibt unter derselben SID und passiert den Guard
#     legitimerweise. Eine Verengung auf Akteur-Kennung (Parent-SID) würde T002412
#     umkehren und ist bewusste Gegenentscheidung (T003131).
#     Grenzziehung [T003102]: eine Session = eine SID. Der Guard unterscheidet
#     bewusst NICHT zwischen Hauptagent und Subagenten — ein eigener Claim gilt
#     auch fuer Subagenten der Session, und umgekehrt blockiert ein fremder Claim
#     auch deren Schreibzugriffe. Wer seine Subagenten abgrenzen will, gibt ihnen
#     eine eigene SID (AGENT_LOCK_SID).
if [ "${#MY_WTS[@]}" -gt 0 ]; then
  for mw in "${MY_WTS[@]}"; do
    case "$TARGET" in
      "$mw"/*|"$mw") _allow ;;
    esac
  done
  # [T005559] Phase-A-Proposal-Pfade im Hauptcheckout (openspec/changes/*, .lavish/*)
  # duerfen auch geschrieben werden, wenn Schwester-Agenten derselben Session
  # bereits eigene Worktrees halten.
  case "$TARGET" in
    "$MAIN_ROOT"/openspec/changes/*|"$MAIN_ROOT"/.lavish/*) _allow ;;
  esac
  {
    echo "WORKTREE-GUARD: Schreibzugriff abgelehnt."
    echo "  Pfad:            $TARGET"
    echo "  Claims mit SID $SID (eigene Session UND deren Subagenten) — Besitz aus agent-locks/*.json (owner_sid):"
    for mw in "${MY_WTS[@]}"; do echo "    - $mw"; done
    echo "  Der Pfad liegt ausserhalb — vermutlich im Hauptcheckout oder in einem"
    echo "  fremden Worktree. Ruf denselben Pfad mit einem der Praefixe oben erneut auf."
    echo "  Grund: 'cd' wirkt nur auf Bash; Edit/Write nehmen absolute Pfade und"
    echo "  treffen sonst still die falsche Arbeitskopie [T002357-M1]."
    echo "  Notausgang (bewusst): WORKTREE_GUARD_BYPASS=1"
  } >&2
  exit 2
fi

# 3) Kein eigener Claim, aber ein fremder LEBENDER deckt den Pfad.
if [ -n "$FOREIGN_WT" ]; then
  {
    echo "WORKTREE-GUARD: Schreibzugriff abgelehnt."
    echo "  Pfad:            $TARGET"
    echo "  Geclaimt von:    Session $FOREIGN_SID (Worktree $FOREIGN_WT)"
    echo "  Eine andere Session arbeitet dort. Leg einen eigenen Worktree an"
    echo "  (scripts/worktree-create.sh) statt in ihren hineinzuschreiben."
    echo "  Notausgang (bewusst): WORKTREE_GUARD_BYPASS=1"
  } >&2
  exit 2
fi

# 4) Ohne Claim aendert sich am bisherigen Ablauf nichts.
_allow
