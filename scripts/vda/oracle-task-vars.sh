# scripts/vda/oracle-task-vars.sh — resolve which Taskfile var (ENV vs BRAND)
# a given task expects, so callers can materialize a runnable `task <name> …`
# command instead of blindly appending `ENV=<token>` to every task. [T001583]
#
# Some fleet-oriented tasks (e.g. `fleet:deploy:brand`) declare
# `requires: { vars: [BRAND] }` in Taskfile.yml instead of `ENV`. Before this
# fix, task-oracle always emitted `ENV=<token>`, which is a no-op/unknown var
# for BRAND-only tasks — the printed `cmd` looked plausible but wasn't
# runnable (see T001583 mishap 3).

# task_required_var <task_name> [<repo_root>]
# Prints "BRAND", "ENV", or nothing, based on the task's `requires: vars:`
# block in Taskfile.yml. BRAND takes priority if a task (hypothetically)
# declared both.
task_required_var() {
  local task="$1" repo="${2:-.}"
  [[ -f "$repo/Taskfile.yml" ]] || return 0
  awk -v t="$task" '
    $0 == "  " t ":" { intask=1; next }
    intask && $0 ~ /^  [A-Za-z0-9_.:-]+:$/ { intask=0 }
    intask && $0 ~ /vars:.*BRAND/ { print "BRAND"; exit }
    intask && $0 ~ /vars:.*ENV/   { print "ENV"; exit }
  ' "$repo/Taskfile.yml"
}

# materialize_task_env_arg <task_name> <env_token> [<repo_root>]
# Given an inferred env token ("mentolder"|"korczewski"|"dev"|"fleet-mentolder"|…),
# produce the correctly-named `VAR=value` argument for the task, or an empty
# string if the task takes neither ENV nor BRAND.
materialize_task_env_arg() {
  local task="$1" token="$2" repo="${3:-.}"
  [[ -z "$token" ]] && return 0
  local var
  var="$(task_required_var "$task" "$repo")"
  case "$var" in
    BRAND)
      case "$token" in
        fleet-*)               echo "BRAND=${token}" ;;
        mentolder|korczewski)  echo "BRAND=fleet-${token}" ;;
        *)                     echo "" ;;
      esac
      ;;
    ENV)
      echo "ENV=${token}"
      ;;
    *)
      echo ""
      ;;
  esac
}
