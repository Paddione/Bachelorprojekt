#!/usr/bin/env bats
# SSOT: openspec/specs/active-sessions-hub.md
# Ticket: T900023 — `_lock_dir()` (scripts/agent-lock.sh) haelt Windows-Laufwerkspfade
# faelschlich fuer relativ.
#
# URSACHE: `case "$common" in /*)` erkennt nur POSIX-absolute Pfade. Git-for-Windows
# liefert `git rev-parse --git-common-dir` aus einem Worktree als `C:/…/.git` — ohne
# fuehrenden Slash. Das Muster greift nicht, der else-Zweig setzt `$toplevel/$common`
# zusammen, das `cd` scheitert und `$( … && pwd )` liefert den leeren String. Das
# Lock-Verzeichnis wird damit zu `/agent-locks` statt zum `.git/agent-locks` des Repos.
# `--path-format=absolute` behebt das NICHT — auch damit liefert Git `C:/…`.
#
# Der Shim macht den Test plattformunabhaengig: er zwingt die Windows-Form auch auf
# Linux-CI hervor, wo `--git-common-dir` sonst immer POSIX-absolut antwortet und der
# Fehler unsichtbar bliebe.
#
# Pruefmodus: command output verification (T002448-M4) — stderr/Exit-Code echter
# agent-lock.sh-Aufrufe, kein Quelltext-grep.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  REAL_GIT="$(command -v git)"
  export AGENT_LOCK_FETCH_TTL=99999
  export AGENT_LOCK_SID="sid-T900023"

  # AGENT_LOCK_DIR MUSS ungesetzt sein — es ist der Workaround, den dieses Ticket
  # ueberfluessig machen soll. Gesetzt kaeme _lock_dir nie bis zum Muster.
  unset AGENT_LOCK_DIR

  # Ein echtes Repo, damit rev-parse --show-toplevel real antwortet.
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO"
  "$REAL_GIT" -C "$REPO" init -q
  "$REAL_GIT" -C "$REPO" config user.email t@example.com
  "$REAL_GIT" -C "$REPO" config user.name test
  "$REAL_GIT" -C "$REPO" commit -q --allow-empty -m init

  # Shim: nur `rev-parse --git-common-dir` wird zur Windows-Laufwerksform verbogen,
  # alles andere geht unveraendert an das echte git.
  SHIM="$BATS_TEST_TMPDIR/shim"
  mkdir -p "$SHIM"
  cat > "$SHIM/git" <<SHIMEOF
#!/usr/bin/env bash
if [ "\$1" = "rev-parse" ]; then
  for a in "\$@"; do
    if [ "\$a" = "--git-common-dir" ]; then printf 'C:/fake/repo/.git\n'; exit 0; fi
  done
fi
exec "$REAL_GIT" "\$@"
SHIMEOF
  chmod +x "$SHIM/git"
  export PATH="$SHIM:$PATH"
}

@test "list does not fail to resolve the lock dir when git reports a Windows drive path" {
  cd "$REPO"
  run bash "$AGENT_LOCK" list
  # Der gemeldete Fehler: das zusammengesetzte toplevel + 'C:/…' existiert nicht.
  [[ "$output" != *"No such file or directory"* ]]
}

@test "list still completes its own logic under a Windows drive path" {
  # Positiv-Anker: der Befehl laeuft bis zu einer seiner beiden regulaeren Ausgaben
  # durch, statt in der Pfadaufloesung zu sterben. Welche der beiden es ist, haengt
  # davon ab, ob das Lock-Verzeichnis existiert (cmd_list, agent-lock.sh:655) — das
  # ist nicht Gegenstand dieses Tests.
  cd "$REPO"
  run bash "$AGENT_LOCK" list
  [ "$status" -eq 0 ]
  [[ "$output" == *"SCOPE"* || "$output" == *"keine aktiven Claims"* ]]
}
