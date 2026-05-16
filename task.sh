 # ~/.bashrc or ~/.zshrc
  t() {
    local task_name
    task_name=$(task --list-all 2>/dev/null \
      | awk '/^\* / {print $2}' \
      | sed 's/:$//' \
      | fzf --query="$1" --select-1 --exit-0)
    [[ -n "$task_name" ]] && task "$task_name"
  }
