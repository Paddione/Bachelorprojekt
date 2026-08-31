# Proposal: agent-lock-windows-drive-path

## Why

`scripts/agent-lock.sh` ist unter Windows aus jedem Worktree heraus unbenutzbar, solange
`AGENT_LOCK_DIR` nicht von Hand gesetzt wird. Damit faellt die gesamte Session-Koordination
auf Windows auf einen Workaround zurueck, den jede Session einzeln kennen muss.

Ursache (verifiziert, Stand 8e54c8695): `_lock_dir()` in scripts/agent-lock.sh:126 prueft
mit `case "$common" in /*)` auf absolute Pfade. Aus einem Worktree liefert
Git-for-Windows aber:

```bash
cd "$(git rev-parse --show-toplevel)/.worktrees/mcp-cleanup2"
git rev-parse --git-common-dir
# C:/Users/PatrickKorczewski/Bachelorprojekt/.git
env -u AGENT_LOCK_DIR bash ../../scripts/agent-lock.sh list
# scripts/agent-lock.sh: line 126: cd: C:/…/.worktrees/mcp-cleanup2/C:/…/.git: No such file or directory
```

Der Laufwerkspfad hat keinen fuehrenden Slash, das Muster greift nicht, und der
else-Zweig haengt ihn an `$toplevel`. Das `cd` scheitert, `$( … && pwd )` liefert den
leeren String, und das Lock-Verzeichnis wird zu `/agent-locks`.

Im Haupt-Checkout antwortet Git mit `.git` (relativ) und der else-Zweig trifft zufaellig
das Richtige — deshalb faellt der Fehler nur in Worktrees auf.

Verworfen: `git rev-parse --path-format=absolute --git-common-dir`. Gemessen mit
git 2.55.0.windows.5 liefert auch diese Form `C:/…` ohne fuehrenden Slash — die
Git-Invocation zu tauschen loest das Muster-Problem nicht.

## What

1. `_lock_dir()` erkennt Windows-Laufwerkspfade (`C:/…`, `C:\…`) als absolut.
2. BATS-Guard, der die Windows-Form ueber einen `git`-Shim auch auf Linux-CI erzwingt —
   ohne ihn waere der Test dort dauerhaft gruen und wuerde nichts schuetzen.
3. `worktree-create.sh`: Die main-Guard-Diagnose nennt `--unattended` als Ausweg, statt
   nur zu blockieren.
4. opencode-Startton: Ursache belegen, bevor etwas geaendert wird. Drei Kandidaten aus
   dem Log; der Fix folgt erst dem Reproducer.

_Ticket: T900023_
