#!/bin/sh
# docker/mcp-node/reap-postgres-children.sh
# Uebernommen aus dem Startkommando des postgres-Containers des
# claude-code-mcp-monolith (T002321/T002350). Der Defekt, gegen den er
# gebaut wurde, ist nicht mit dem Monolithen verschwunden: supergateway
# --stateless spawnt pro MCP-Request einen mcp-server-postgres-Kindprozess
# (~54Mi RSS) und reaped ihn nie. Im dev-pod teilt sich der postgres-Server
# das cgroup-Limit mit sechs weiteren Servern — der Leak trifft dort mehr,
# nicht weniger.
#
# Der Code liegt bewusst als Datei im Image statt als args[0] im Manifest:
# ein Startkommando im Manifest laesst sich nicht ohne Rollout korrigieren
# und ist nur ueber einen JSON-Extraktor testbar. Die Guards in
# tests/spec/mcp-gateway.bats lesen jetzt diese Datei.

PROC_ROOT="${PROC_ROOT:-/proc}"
MCP_PG_CHILD_MAX_AGE_SECONDS="${MCP_PG_CHILD_MAX_AGE_SECONDS:-300}"
MCP_PG_CHILD_MAX_COUNT="${MCP_PG_CHILD_MAX_COUNT:-12}"

# Gibt "starttime pid" je echtem Child aus, aeltester zuerst. Toetet nichts.
# Drei Guards, siehe design.md:
#   1. argv[1] endet auf /mcp-server-postgres  -> trennt Child vom Parent
#      (Parent: argv[1]=/usr/local/bin/supergateway, Name erst in argv[2];
#       Reaper-Subshell: argv[1]=-c, Name erst in argv[2])
#   2. ppid == 1                               -> Children haengen direkt an supergateway
#   3. pid != 1 und pid != SELF_PID            -> harte Absicherung
list_reap_candidates() {
  _root="${PROC_ROOT:-/proc}"
  # SELF_PID respektiert eine vorgesetzte Variable (Testbarkeit) und ermittelt sich
  # sonst selbst. Die Redirection wird von DIESER Shell ausgefuehrt, /proc/self loest
  # daher auf ihre eigene PID auf. `$$` waere falsch: es liefert in POSIX-sh auch in
  # einer Subshell die PID der Hauptshell (im Container: 1).
  # Verlaesslich: read -r SELF_PID _ < /proc/self/stat (hier ueber $_root
  # indirigiert, damit PROC_ROOT im Test ein Fixture unterschieben kann).
  if [ -z "${SELF_PID:-}" ]; then
    read -r SELF_PID _ < "$_root/self/stat" 2>/dev/null || SELF_PID=0
  fi
  for _d in "$_root"/[0-9]*; do
    [ -d "$_d" ] || continue
    _pid=${_d##*/}
    [ "$_pid" = 1 ] && continue
    [ "$_pid" = "$SELF_PID" ] && continue
    # KEIN groessenbasierter Guard ([ -s ... ]) auf cmdline: procfs meldet dort
    # st_size=0 trotz Inhalt, ein solcher Guard ueberspringt live ALLE Prozesse
    # und liefe im Fixture trotzdem gruen (Edge-Case E5).
    _a1=$(tr '\0' '\n' < "$_d/cmdline" 2>/dev/null | sed -n 2p)
    [ -n "$_a1" ] || continue
    case "$_a1" in
      */mcp-server-postgres) ;;
      *) continue ;;
    esac
    _ppid=$(awk '{print $4}' "$_d/stat" 2>/dev/null) || continue
    [ "$_ppid" = 1 ] || continue
    _start=$(awk '{print $22}' "$_d/stat" 2>/dev/null) || continue
    printf '%s %s\n' "$_start" "$_pid"
  done | sort -n
}

reap_stale_children() {
  hz=$(getconf CLK_TCK)
  while true; do
    sleep 60
    up=$(cut -d' ' -f1 "${PROC_ROOT:-/proc}/uptime" | cut -d. -f1)
    kids=$(list_reap_candidates)
    count=$(printf '%s' "$kids" | grep -c . || true)
    rss_sum=0
    for p in $(printf '%s\n' "$kids" | awk '{print $2}'); do
      r=$(awk '/VmRSS/{print $2}' "${PROC_ROOT:-/proc}/$p/status" 2>/dev/null)
      rss_sum=$((rss_sum + ${r:-0}))
    done
    # Stufe 1 — Alter. Schwelle liegt ueber dem statement_timeout (120s).
    survivors=""
    for line in $(printf '%s\n' "$kids" | tr ' ' ':'); do
      start=${line%%:*}; pid=${line##*:}
      [ -n "$pid" ] || continue
      age=$(( up - start / hz ))
      if [ "$age" -gt "$MCP_PG_CHILD_MAX_AGE_SECONDS" ]; then
        echo "reap: age pid=$pid age=${age}s"
        kill -TERM "$pid" 2>/dev/null
      else
        survivors="$survivors $pid"
      fi
    done
    # Stufe 2 — Menge. Faengt einen Request-Burst ab, der die Altersschwelle noch
    # nicht erreicht hat. list_reap_candidates liefert aelteste zuerst.
    n=$(printf '%s' "$survivors" | wc -w)
    if [ "$n" -gt "$MCP_PG_CHILD_MAX_COUNT" ]; then
      excess=$(( n - MCP_PG_CHILD_MAX_COUNT ))
      for pid in $survivors; do
        [ "$excess" -gt 0 ] || break
        echo "reap: count pid=$pid (over cap $MCP_PG_CHILD_MAX_COUNT)"
        kill -TERM "$pid" 2>/dev/null
        excess=$(( excess - 1 ))
      done
    fi
    echo "mcp-server-postgres children: count=$count rss_kb_sum=$rss_sum cap=$MCP_PG_CHILD_MAX_COUNT"
  done
}
