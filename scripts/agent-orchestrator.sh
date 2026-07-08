#!/usr/bin/env bash
set -uo pipefail

# T001588 — Grilling: Lokale Agent-Orchestrierung mit Worktree Support

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "${SCRIPT_DIR}")" && pwd)"
WORKTREES_DIR="${PROJECT_ROOT}/.worktrees"

usage() {
  cat << 'USAGE'
Usage: agent-orchestrator.sh <command> [options]

Commands:
  start     Start orchestrator with specified subagents
  stop      Stop all running agent worktrees  
  status    Show status of active agents
  submit    Submit a task to the orchestrator queue

Options:
  -a, --agent <name>   Agent name (e.g., "explore", "general")
  -t, --task <text>    Task description for agent
  -p, --priority       Set priority level: low|medium|high

Examples:
  agent-orchestrator.sh start -a explore -t "Analyze codebase structure"
  agent-orchestrator.sh submit -a general -t "Research feature requirements" --priority high

Cleanup (optional):
  --cleanup   Remove empty worktree directories after stop
USAGE
}

CLEANUP=""

get_worktree_dir() {
  local agent="$1"
  echo "${WORKTREES_DIR}/${agent}"
}

start_agent() {
  local agent="$1"
  local task="$2"
  local priority="${3:-medium}"
  
  if [ "$priority" != "low" ] && [ "$priority" != "medium" ] && [ "$priority" != "high" ]; then
    echo "Error: Invalid priority. Use low|medium|high" >&2
    exit 1
  fi
  
  local worktree_dir
  worktree_dir=$(get_worktree_dir "${agent}")
  
  if [ -d "${worktree_dir}" ] && [ -f "${worktree_dir}/active" ]; then
    echo "Agent '${agent}' worktree already running at ${worktree_dir}"
    return 0
  fi
  
  mkdir -p "${worktree_dir}"
  touch "${worktree_dir}/active"
  
  cat > "${worktree_dir}/task.txt" << EOF
# Task for agent: ${agent}
Priority: ${priority}

${task}

Timestamp: $(date -Iseconds)
EOF
  
  echo "Started '${agent}' worktree at ${worktree_dir}"
  echo "Task written to ${worktree_dir}/task.txt"
}

stop_agents() {
  local agent="$1"
  
  if [ "$#" = 0 ]; then
    for dir in "${WORKTREES_DIR}"/*/; do
      if [ -d "${dir}" ] && [ -f "${dir}active" ]; then
        rm -f "${dir}active"
        echo "Stopped agent in ${dir}"
        
        # Cleanup empty directories (with --cleanup flag)
        if [ "$CLEANUP" = "1" ]; then
          local dirname="${dir%/}"  # Remove trailing slash
          rmdir "${dirname}" 2>/dev/null || true
          rm -f "${dirname}/task.txt" 2>/dev/null || true
        fi
      fi
    done
  else
    local worktree_dir
    worktree_dir=$(get_worktree_dir "$agent")
    if [ -d "${worktree_dir}" ] && [ -f "${worktree_dir}active" ]; then
      rm -f "${worktree_dir}active"
      echo "Stopped agent '${agent}'"
      
      # Cleanup empty directories (with --cleanup flag)
      if [ "$CLEANUP" = "1" ]; then
        rmdir "${worktree_dir}" 2>/dev/null || true
        rm -f "${worktree_dir}/task.txt" 2>/dev/null || true
      fi
    else
      echo "No active worktree for '${agent}'"
    fi
  fi
}

show_status() {
  echo "Active Agent Worktrees:"
  echo "========================"
  
  local count=0
  for dir in "${WORKTREES_DIR}"/*/; do
    if [ -d "${dir}" ]; then
      local agent_name
      agent_name=$(basename "$dir")
      
      if [ -f "${dir}/active" ]; then
        echo "[RUNNING] ${agent_name}"
        
        if [ -f "${dir}/task.txt" ]; then
          cat "${dir}/task.txt" 2>/dev/null || echo "  (no task file)"
        fi
        
        count=$((count + 1))
      else
        echo "[STANDBY] ${agent_name}"
      fi
    fi
  done
  
  if [ "$count" -eq 0 ]; then
    echo "(none)"
  fi
}

main() {
  local command="${1:-help}"
  shift || true
  
  # Parse --cleanup flag before main command
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cleanup) CLEANUP=1; shift ;;
      *) break ;;
    esac
  done
  
  if [ "$command" = "--help" ] || [ "$command" = "-h" ]; then
    usage
    exit 0
  fi
  
  case "${command}" in
    start)
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -a|--agent) agent="$2"; shift 2 ;;
          -t|--task) task="$2"; shift 2 ;;
          -p|--priority) priority="$2"; shift 2 ;;
          *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
      done
      
      if [ -z "$agent" ] || [ -z "$task" ]; then
        echo "Error: agent and task required for start" >&2
        usage
        exit 1
      fi
      
      start_agent "${agent}" "${task}" "${priority:-medium}"
      ;;
    
    stop)
      shift
      if [ $# -eq 0 ]; then
        rm -f "${WORKTREES_DIR}"/*/active 2>/dev/null || true
        echo "All agent worktrees stopped"
        
        # Cleanup empty directories (with --cleanup flag)
        if [ "$CLEANUP" = "1" ]; then
          for dir in "${WORKTREES_DIR}"/*/; do
            local dirname="${dir%/}"  # Remove trailing slash
            rmdir "${dirname}" 2>/dev/null || true
            rm -f "${dirname}/task.txt" 2>/dev/null || true
          done
        fi
      else
        for arg in "$@"; do
          stop_agents "$arg"
        done
      fi
      ;;
    
    status)
      show_status
      ;;
    
    submit|queue)
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -a|--agent) agent="$2"; shift 2 ;;
          -t|--task) task="$2"; shift 2 ;;
          -p|--priority) priority="$2"; shift 2 ;;
          *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
      done
      
      start_agent "${agent:-explore}" "${task}" "${priority:-medium}"
      ;;
    
    help|-h|--help)
      usage
      ;;
    
    cleanup)
      rm -f "${WORKTREES_DIR}"/*/active 2>/dev/null || true
      for dir in "${WORKTREES_DIR}"/*/; do
        local dirname="${dir%/}"  # Remove trailing slash
        rmdir "${dirname}" 2>/dev/null || true
        rm -f "${dirname}/task.txt" 2>/dev/null || true
      done
      echo "All agent worktrees cleaned up"
      ;;
    
    *)
      echo "Error: Unknown command '${command}'" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
