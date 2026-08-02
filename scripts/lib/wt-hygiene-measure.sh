#!/usr/bin/env bash
# wt-hygiene-measure.sh — einzige Messquelle für die Zielfamilie G-WT01..G-WT06 [T002443]
#
# Worktree- und Session-Hygiene. Jedes Subkommando gibt GENAU EINEN Wert auf stdout aus:
# eine nicht-negative Ganzzahl oder `n/a`. Exit 0 auch bei `n/a` — der Aufrufer
# unterscheidet über den WERT, nicht über den Status. Nur ein unbekanntes Subkommando
# beendet mit Exit 2.
#
#   main-checkout        G-WT01  1 wenn Hauptcheckout nicht auf main oder dirty, sonst 0
#   stale-worktrees      G-WT02  Worktrees mit nach main gemergtem HEAD oder >14d altem Commit
#   orphan-locks         G-WT03  Locks mit toter owner_pid ODER heartbeat_at älter als 2×TTL
#   unsafe-worktrees     G-WT04  Worktrees, die gleichzeitig löschbereit UND dirty sind
#   main-divergence      G-WT05  Commits in main..origin/main
#   phantom-scope-locks  G-WT06  Locks mit leerem Scope oder Scope beginnend mit "-"
#
# POSITIV-ANKER (T002356-M1): Jedes Subkommando prüft ZUERST seine Messgrundlage und
# gibt `n/a` aus, wenn sie fehlt. Eine nicht durchgeführte Messung darf niemals als `0`
# erscheinen — `scripts/health-goals-check.sh` zählt `n/a` als übersprungen, nicht als
# erreicht. Genau dieser Fehler (leerer Glob ⇒ 0 ⇒ trivial grün) war der Anlass für T002443.
#
# Umgebungsvariablen — dieselben Überschreibungen, die scripts/agent-lock.sh kennt:
#   HG_REPO_ROOT          Hauptcheckout            (Vorgabe: $HOME/Bachelorprojekt)
#   AGENT_LOCK_DIR        Lock-Verzeichnis         (Vorgabe: <git-common-dir>/agent-locks)
#   AGENT_LOCK_TTL        Lock-TTL in Sekunden     (Vorgabe: 1800; angewandt mit Faktor 2)
#   HG_WORKTREE_STALE_DAYS  Inaktivitätsschwelle   (Vorgabe: 14)
#   HG_FETCH_MAX_AGE      max. Alter von FETCH_HEAD für G-WT05 (Vorgabe: 86400)

set -uo pipefail

REPO="${HG_REPO_ROOT:-$HOME/Bachelorprojekt}"
TTL="${AGENT_LOCK_TTL:-1800}"
STALE_DAYS="${HG_WORKTREE_STALE_DAYS:-14}"
FETCH_MAX_AGE="${HG_FETCH_MAX_AGE:-86400}"

na() { printf 'n/a\n'; exit 0; }
now() { date +%s; }

# ── Gemeinsame Anker ──────────────────────────────────────────────────────────

# Gibt den Toplevel des Hauptcheckouts aus, oder schlägt fehl.
_repo_toplevel() {
  git -C "$REPO" rev-parse --show-toplevel 2>/dev/null
}

# Lock-Verzeichnis auflösen — AGENT_LOCK_DIR hat Vorrang (Test-Override).
_lock_dir() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return 0; fi
  local top common
  top="$(_repo_toplevel)" || return 1
  common="$(cd "$top" && git rev-parse --git-common-dir 2>/dev/null)" || return 1
  case "$common" in /*) : ;; *) common="$(cd "$top/$common" 2>/dev/null && pwd)" || return 1 ;; esac
  printf '%s/agent-locks\n' "$common"
}

# Ein Feld aus einer Lock-JSON lesen — identische Extraktion wie agent-lock.sh::_lock_field,
# damit beide Seiten dieselbe Datei gleich lesen (und keine jq-Abhängigkeit entsteht).
_lock_field() { sed -n "s/.*\"$2\": *\"\\([^\"]*\\)\".*/\\1/p" "$1" 2>/dev/null | head -1; }

# Alle Lock-Dateien auflisten. Rückgabe 1, wenn die Messgrundlage fehlt:
# kein Verzeichnis, keine *.json, oder keine einzige wohlgeformte Datei (created_at lesbar).
_locks() {
  local d f found=0
  d="$(_lock_dir)" || return 1
  [ -d "$d" ] || return 1
  for f in "$d"/*.json; do
    [ -f "$f" ] || continue
    [ -n "$(_lock_field "$f" created_at)" ] || continue
    printf '%s\n' "$f"
    found=1
  done
  [ "$found" = 1 ] || return 1
}

# origin/main muss auflösbar sein — ohne die Referenz ist "gemergt" nicht entscheidbar.
_origin_main() {
  git -C "$REPO" rev-parse --verify --quiet refs/remotes/origin/main 2>/dev/null
}

# Alle Worktrees AUSSER dem Hauptcheckout, je Zeile "<pfad>\t<head-sha>".
# Rückgabe 1, wenn kein einziger Nebenworktree registriert ist.
_worktrees() {
  local top out path head found=0
  top="$(_repo_toplevel)" || return 1
  out="$(git -C "$REPO" worktree list --porcelain 2>/dev/null)" || return 1
  path=""; head=""
  while IFS= read -r line; do
    case "$line" in
      "worktree "*) path="${line#worktree }"; head="" ;;
      "HEAD "*)     head="${line#HEAD }" ;;
      "")
        if [ -n "$path" ] && [ "$path" != "$top" ] && [ -n "$head" ]; then
          printf '%s\t%s\n' "$path" "$head"; found=1
        fi
        path=""; head=""
        ;;
    esac
  done <<< "$out"$'\n'
  # Letzter Block ohne abschließende Leerzeile.
  if [ -n "$path" ] && [ "$path" != "$top" ] && [ -n "$head" ]; then
    printf '%s\t%s\n' "$path" "$head"; found=1
  fi
  [ "$found" = 1 ] || return 1
}

# Ist der HEAD eines Worktrees bereits in origin/main enthalten?
# merge-base --is-ancestor auf den COMMIT, nicht `branch -r --contains <name>`:
# ein detached-HEAD-Worktree hat keinen Branchnamen, und der Commit ist die Aussage.
_is_merged() {
  git -C "$REPO" merge-base --is-ancestor "$1" refs/remotes/origin/main 2>/dev/null
}

# ── G-WT01 — Hauptcheckout auf main und sauber ────────────────────────────────
cmd_main_checkout() {
  local branch status_out
  branch="$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null)" || na
  [ -n "$branch" ] || na
  [ "$branch" = "main" ] || { echo 1; return 0; }
  # status separat auswerten: ein FEHLGESCHLAGENES status darf nicht als "sauber"
  # durchgehen — sonst meldet eine kaputte Messung 0 statt n/a.
  status_out="$(git -C "$REPO" status --porcelain 2>/dev/null)" || na
  [ -z "$status_out" ] && echo 0 || echo 1
}

# ── G-WT02 — Veraltete Worktrees ──────────────────────────────────────────────
cmd_stale_worktrees() {
  local wts n t path head last age_days
  _origin_main >/dev/null || na
  wts="$(_worktrees)" || na
  n=0; t="$(now)"
  while IFS=$'\t' read -r path head; do
    [ -n "$head" ] || continue
    if _is_merged "$head"; then n=$((n + 1)); continue; fi
    last="$(git -C "$REPO" log -1 --format='%ct' "$head" 2>/dev/null)"
    [ -n "$last" ] || continue
    age_days=$(( (t - last) / 86400 ))
    [ "$age_days" -gt "$STALE_DAYS" ] && n=$((n + 1))
  done <<< "$wts"
  echo "$n"
}

# ── G-WT03 — Verwaiste Agent-Locks ────────────────────────────────────────────
#
# ACHTUNG — `owner_pid` ist KEIN Lebendigkeits-Signal [T002443, belegt 2026-08-02].
# `agent-lock.sh::_write_lock` schreibt `"owner_pid": "$$"` — die PID des kurzlebigen
# `agent-lock.sh`-Bash-Prozesses, der Sekunden später beendet ist. Auf dem Hauptcheckout
# meldeten deshalb ALLE fünf Locks eine tote `owner_pid`, darunter der Lock der gerade
# laufenden Session. Eine Regel "tote PID ⇒ verwaist" stuft also jeden Lock als verwaist
# ein und ist damit wertlos. `agent-lock.sh::_reapable` behandelt eine tote PID aus
# demselben Grund nie allein als entscheidend: eine LEBENDE PID ist ein Positiv-Signal,
# eine tote sagt nichts.
#
# Gemessen wird deshalb in dieser Reihenfolge:
#   1. Heartbeat älter als 2×TTL  ⇒ verwaist. Eindeutig, und der einzige Indikator, der
#      auch eine WIEDERVERWENDETE PID erwischt (der Anlassfall aus dem Proposal).
#   2. Heartbeat frisch ⇒ lebendig, wenn der eingetragene Worktree noch existiert und
#      auf dem eingetragenen Branch steht (agent-lock.sh::_reapable Pfad 0b) ODER die
#      `owner_pid` tatsächlich läuft (Pfad 0c). Sonst verwaist.
cmd_orphan_locks() {
  local locks n t f pid hb ct age wt br wt_branch
  locks="$(_locks)" || na
  n=0; t="$(now)"
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    hb="$(_lock_field "$f" heartbeat_at)"
    ct="$(_lock_field "$f" created_at)"
    age=$(( t - ${hb:-${ct:-0}} ))
    if [ "$age" -ge "$(( TTL * 2 ))" ]; then n=$((n + 1)); continue; fi

    wt="$(_lock_field "$f" worktree)"
    br="$(_lock_field "$f" branch)"
    if [ -n "$wt" ] && [ "$wt" != "-" ] && [ -d "$wt" ] && [ -n "$br" ]; then
      wt_branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)"
      [ "$wt_branch" = "$br" ] && continue
    fi
    pid="$(_lock_field "$f" owner_pid)"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && continue
    n=$((n + 1))
  done <<< "$locks"
  echo "$n"
}

# ── G-WT04 — Löschbereite Worktrees mit ungesicherter Arbeit ──────────────────
cmd_unsafe_worktrees() {
  local wts n path head dirty
  _origin_main >/dev/null || na
  wts="$(_worktrees)" || na
  n=0
  while IFS=$'\t' read -r path head; do
    [ -n "$head" ] || continue
    [ -d "$path" ] || continue
    # Schnittmenge, nicht Vereinigung: ungesicherte Arbeit ist im laufenden Betrieb
    # normal. Akuter Datenverlust droht nur, wo repo-hygiene löschen WÜRDE (gemergt)
    # und gleichzeitig ungesicherte Arbeit liegt (T002379).
    _is_merged "$head" || continue
    dirty="$(git -C "$path" status --porcelain 2>/dev/null)" || continue
    [ -n "$dirty" ] && n=$((n + 1))
  done <<< "$wts"
  echo "$n"
}

# ── G-WT05 — Lokaler main hinter origin/main ─────────────────────────────────
cmd_main_divergence() {
  local top fetch_head mtime count
  git -C "$REPO" rev-parse --verify --quiet refs/heads/main >/dev/null 2>&1 || na
  _origin_main >/dev/null || na
  # Ein origin/main, das seit über 24 h nicht aktualisiert wurde, misst nicht die
  # Divergenz, sondern das Alter des letzten Fetch. Dann lieber n/a als eine 0.
  top="$(_repo_toplevel)" || na
  # --git-common-dir liefert oft einen RELATIVEN Pfad; er ist gegen $top aufzulösen,
  # nicht gegen das aktuelle Arbeitsverzeichnis des Aufrufers.
  fetch_head="$(cd "$top" 2>/dev/null && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || na
  [ -n "$fetch_head" ] || na
  fetch_head="$fetch_head/FETCH_HEAD"
  [ -f "$fetch_head" ] || na
  mtime="$(date -r "$fetch_head" +%s 2>/dev/null)" || na
  [ -n "$mtime" ] || na
  [ "$(( $(now) - mtime ))" -le "$FETCH_MAX_AGE" ] || na
  count="$(git -C "$REPO" rev-list --count refs/heads/main..refs/remotes/origin/main 2>/dev/null)" || na
  [ -n "$count" ] || na
  echo "$count"
}

# ── G-WT06 — Phantom-Scope-Locks ─────────────────────────────────────────────
cmd_phantom_scope_locks() {
  local locks n f scope
  locks="$(_locks)" || na
  n=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    scope="$(_lock_field "$f" scope)"
    # Keine Allowlist: Scope-Namen sind offen. Gemessen wird die Formfehler-Signatur —
    # leer oder mit "-" beginnend kann nur aus einem als Positionsargument gelesenen
    # Flag stammen (Vorfall 2026-08-02: `--label` stand als SCOPE in der Lock-Datei).
    case "$scope" in
      "" | -*) n=$((n + 1)) ;;
    esac
  done <<< "$locks"
  echo "$n"
}

case "${1:-}" in
  main-checkout)        cmd_main_checkout ;;
  stale-worktrees)      cmd_stale_worktrees ;;
  orphan-locks)         cmd_orphan_locks ;;
  unsafe-worktrees)     cmd_unsafe_worktrees ;;
  main-divergence)      cmd_main_divergence ;;
  phantom-scope-locks)  cmd_phantom_scope_locks ;;
  -h|--help)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "wt-hygiene-measure.sh: unbekanntes Subkommando '${1:-}'" >&2
    echo "erwartet: main-checkout|stale-worktrees|orphan-locks|unsafe-worktrees|main-divergence|phantom-scope-locks" >&2
    exit 2
    ;;
esac
