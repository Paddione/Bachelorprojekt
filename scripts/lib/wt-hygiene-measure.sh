#!/usr/bin/env bash
# wt-hygiene-measure.sh — einzige Messquelle für die Zielfamilie G-WT01..G-WT06 [T002443]
#
# Worktree- und Session-Hygiene über alle Repositories (repos.txt + dotfiles).
# Jedes Subkommando gibt GENAU EINEN Wert auf stdout aus:
# eine nicht-negative Ganzzahl oder `n/a`. Exit 0 auch bei `n/a` — der Aufrufer
# unterscheidet über den WERT, nicht über den Status. Nur ein unbekanntes Subkommando
# beendet mit Exit 2.
#
#   main-checkout        G-WT01  Anzahl Hauptcheckouts nicht auf Default-Branch oder dirty
#   stale-worktrees      G-WT02  Worktrees mit gemergtem HEAD oder >14d altem Commit
#   orphan-locks         G-WT03  Locks mit toter owner_pid ODER heartbeat_at älter als 2×TTL
#   unsafe-worktrees     G-WT04  Worktrees, die gleichzeitig löschbereit UND dirty sind
#   main-divergence      G-WT05  Commits in Default-Branch..origin/Default-Branch
#   phantom-scope-locks  G-WT06  Locks mit leerem Scope oder Scope beginnend mit "-"
#
# POSITIV-ANKER (T002356-M1): Jedes Subkommando prüft ZUERST seine Messgrundlage und
# gibt `n/a` aus, wenn sie fehlt. Eine nicht durchgeführte Messung darf niemals als `0`
# erscheinen — `scripts/health-goals-check.sh` zählt `n/a` als übersprungen, nicht als
# erreicht. Genau dieser Fehler (leerer Glob ⇒ 0 ⇒ trivial grün) war der Anlass für T002443.
#
# Umgebungsvariablen — dieselben Überschreibungen, die scripts/agent-lock.sh kennt:
#   HG_REPO_ROOT          Hauptcheckout-Override   (wenn gesetzt: Einzel-Repo-Modus)
#   HG_REPOS              Kolon-getrennte Pfade    (Explizite Repo-Menge für Tests)
#   AGENT_LOCK_DIR        Lock-Verzeichnis         (Override für Lock-Tests)
#   AGENT_LOCK_TTL        Lock-TTL in Sekunden     (Vorgabe: 1800; angewandt mit Faktor 2)
#   HG_WORKTREE_STALE_DAYS  Inaktivitätsschwelle   (Vorgabe: 14)
#   HG_FETCH_MAX_AGE      max. Alter von FETCH_HEAD für G-WT05 (Vorgabe: 86400)

set -uo pipefail

TTL="${AGENT_LOCK_TTL:-1800}"
STALE_DAYS="${HG_WORKTREE_STALE_DAYS:-14}"
FETCH_MAX_AGE="${HG_FETCH_MAX_AGE:-86400}"

na() { printf 'n/a\n'; exit 0; }
now() { date +%s; }

# ── Gemeinsame Anker ──────────────────────────────────────────────────────────

# Ermittelt alle zu prüfenden Repositories.
_repos() {
  if [ -n "${HG_REPO_ROOT:-}" ]; then
    printf '%s\n' "$HG_REPO_ROOT"
    return 0
  fi
  if [ -n "${HG_REPOS:-}" ]; then
    local r
    IFS=':' read -ra repos <<< "$HG_REPOS"
    for r in "${repos[@]}"; do
      [ -n "$r" ] && printf '%s\n' "$r"
    done
    return 0
  fi

  local home="${HOME:-/home/patrick}"
  local repos_file="$home/repos.txt"
  local found=()

  # 1. $HOME (dotfiles repo, git-root ist $HOME)
  if git -C "$home" rev-parse --show-toplevel >/dev/null 2>&1; then
    found+=("$home")
  fi

  # 2. Deklarierte Klone aus repos.txt
  if [ -f "$repos_file" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      [[ -z "$line" || "$line" == \#* ]] && continue
      local rel
      rel="$(echo "$line" | awk '{print $1}')"
      local p="$home/$rel"
      if [ -d "$p" ] && git -C "$p" rev-parse --show-toplevel >/dev/null 2>&1; then
        found+=("$p")
      fi
    done < "$repos_file"
  else
    if [ -d "$home/Bachelorprojekt" ] && git -C "$home/Bachelorprojekt" rev-parse --show-toplevel >/dev/null 2>&1; then
      found+=("$home/Bachelorprojekt")
    fi
  fi

  if [ "${#found[@]}" -eq 0 ]; then
    return 1
  fi
  printf '%s\n' "${found[@]}" | sort -u
}

# Default-Branch eines Repositories ermitteln (main_branch in repo.yaml, origin/HEAD oder main/master).
_repo_default() {
  local repo="$1"
  local def=""
  if [ -f "$repo/repo.yaml" ]; then
    def="$(grep -E '^[[:space:]]*main_branch:' "$repo/repo.yaml" 2>/dev/null | awk '{print $2}' | tr -d '"'\''')"
  fi
  if [ -z "$def" ]; then
    def="$(git -C "$repo" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || true)"
  fi
  if [ -z "$def" ]; then
    if git -C "$repo" show-ref --verify --quiet refs/heads/main 2>/dev/null; then
      def="main"
    elif git -C "$repo" show-ref --verify --quiet refs/heads/master 2>/dev/null; then
      def="master"
    else
      def="main"
    fi
  fi
  printf '%s\n' "$def"
}

# Remote-Ref für den Default-Branch prüfen.
_origin_remote() {
  local repo="$1"
  local def="$2"
  git -C "$repo" rev-parse --verify --quiet "refs/remotes/origin/$def" 2>/dev/null
}

# Lock-Verzeichnisse auflösen — AGENT_LOCK_DIR hat Vorrang (Test-Override).
_lock_dirs() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return 0; fi
  local repo top common
  while IFS= read -r repo; do
    [ -n "$repo" ] || continue
    top="$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)" || continue
    common="$(cd "$top" && git rev-parse --git-common-dir 2>/dev/null)" || continue
    case "$common" in
      /*) : ;;
      *) common="$(cd "$top/$common" 2>/dev/null && pwd)" || continue ;;
    esac
    [ -d "$common/agent-locks" ] && printf '%s/agent-locks\n' "$common"
  done < <(_repos)
}

# Ein Feld aus einer Lock-JSON lesen.
_lock_field() { sed -n "s/.*\"$2\": *\"\\([^\"]*\\)\".*/\\1/p" "$1" 2>/dev/null | head -1; }

# Alle Lock-Dateien über alle Lock-Verzeichnisse auflisten.
_locks() {
  local d f found=0
  while IFS= read -r d; do
    [ -d "$d" ] || continue
    for f in "$d"/*.json; do
      [ -f "$f" ] || continue
      [ -n "$(_lock_field "$f" created_at)" ] || continue
      printf '%s\n' "$f"
      found=1
    done
  done < <(_lock_dirs)
  [ "$found" -eq 1 ] || return 1
}

# Alle Nebenworktrees über alle Repositories auflisten, je Zeile "<repo>\t<default>\t<pfad>\t<head-sha>".
# Rückgabe 1, wenn kein einziger Nebenworktree registriert ist.
_worktrees() {
  local repo top def out path head found=0
  while IFS= read -r repo; do
    [ -n "$repo" ] || continue
    top="$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)" || continue
    def="$(_repo_default "$repo")"
    out="$(git -C "$repo" worktree list --porcelain 2>/dev/null)" || continue
    path=""; head=""
    while IFS= read -r line; do
      case "$line" in
        "worktree "*) path="${line#worktree }"; head="" ;;
        "HEAD "*)     head="${line#HEAD }" ;;
        "")
          if [ -n "$path" ] && [ "$path" != "$top" ] && [ -n "$head" ]; then
            printf '%s\t%s\t%s\t%s\n' "$repo" "$def" "$path" "$head"; found=1
          fi
          path=""; head=""
          ;;
      esac
    done <<< "$out"$'\n'
    if [ -n "$path" ] && [ "$path" != "$top" ] && [ -n "$head" ]; then
      printf '%s\t%s\t%s\t%s\n' "$repo" "$def" "$path" "$head"; found=1
    fi
  done < <(_repos)
  [ "$found" -eq 1 ] || return 1
}

# Ist der HEAD eines Worktrees bereits im Remote-Default-Branch enthalten?
_is_merged() {
  local repo="$1" head="$2" def="$3"
  git -C "$repo" merge-base --is-ancestor "$head" "refs/remotes/origin/$def" 2>/dev/null
}

# ── G-WT01 — Hauptcheckout auf Default-Branch und sauber ──────────────────────
cmd_main_checkout() {
  local repos repo branch status_out def violations=0 valid_count=0
  repos="$(_repos)" || na
  while IFS= read -r repo; do
    [ -n "$repo" ] || continue
    branch="$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null)" || continue
    [ -n "$branch" ] || continue
    valid_count=$((valid_count + 1))
    def="$(_repo_default "$repo")"
    if [ "$branch" != "$def" ]; then
      violations=$((violations + 1))
      continue
    fi
    status_out="$(git -C "$repo" status --porcelain 2>/dev/null)" || continue
    if [ -n "$status_out" ]; then
      violations=$((violations + 1))
    fi
  done <<< "$repos"

  [ "$valid_count" -gt 0 ] || na
  echo "$violations"
}

# ── G-WT02 — Veraltete Worktrees ──────────────────────────────────────────────
cmd_stale_worktrees() {
  local wts n t repo def path head last age_days valid_origin_seen=0
  wts="$(_worktrees)" || na
  n=0; t="$(now)"
  while IFS=$'\t' read -r repo def path head; do
    [ -n "$head" ] || continue
    _origin_remote "$repo" "$def" >/dev/null && valid_origin_seen=1
    if _is_merged "$repo" "$head" "$def"; then n=$((n + 1)); continue; fi
    last="$(git -C "$repo" log -1 --format='%ct' "$head" 2>/dev/null)"
    [ -n "$last" ] || continue
    age_days=$(( (t - last) / 86400 ))
    [ "$age_days" -gt "$STALE_DAYS" ] && n=$((n + 1))
  done <<< "$wts"
  [ "$valid_origin_seen" -eq 1 ] || na
  echo "$n"
}

# ── G-WT03 — Verwaiste Agent-Locks ────────────────────────────────────────────
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
  local wts n repo def path head dirty valid_origin_seen=0
  wts="$(_worktrees)" || na
  n=0
  while IFS=$'\t' read -r repo def path head; do
    [ -n "$head" ] || continue
    [ -d "$path" ] || continue
    _origin_remote "$repo" "$def" >/dev/null && valid_origin_seen=1
    _is_merged "$repo" "$head" "$def" || continue
    dirty="$(git -C "$path" status --porcelain 2>/dev/null)" || continue
    [ -n "$dirty" ] && n=$((n + 1))
  done <<< "$wts"
  [ "$valid_origin_seen" -eq 1 ] || na
  echo "$n"
}

# ── G-WT05 — Lokaler Default-Branch hinter origin ────────────────────────────
cmd_main_divergence() {
  local repos repo def top fetch_head mtime count total=0 valid_repo_count=0
  repos="$(_repos)" || na
  while IFS= read -r repo; do
    [ -n "$repo" ] || continue
    def="$(_repo_default "$repo")"
    git -C "$repo" rev-parse --verify --quiet "refs/heads/$def" >/dev/null 2>&1 || continue
    _origin_remote "$repo" "$def" >/dev/null || continue
    top="$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)" || continue
    fetch_head="$(cd "$top" 2>/dev/null && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || continue
    [ -n "$fetch_head" ] || continue
    fetch_head="$fetch_head/FETCH_HEAD"
    [ -f "$fetch_head" ] || continue
    mtime="$(date -r "$fetch_head" +%s 2>/dev/null)" || continue
    [ -n "$mtime" ] || continue
    [ "$(( $(now) - mtime ))" -le "$FETCH_MAX_AGE" ] || continue
    count="$(git -C "$repo" rev-list --count "refs/heads/$def..refs/remotes/origin/$def" 2>/dev/null)" || continue
    [ -n "$count" ] || continue
    total=$((total + count))
    valid_repo_count=$((valid_repo_count + 1))
  done <<< "$repos"

  [ "$valid_repo_count" -gt 0 ] || na
  echo "$total"
}

# ── G-WT06 — Phantom-Scope-Locks ─────────────────────────────────────────────
cmd_phantom_scope_locks() {
  local locks n f scope
  locks="$(_locks)" || na
  n=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    scope="$(_lock_field "$f" scope)"
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
