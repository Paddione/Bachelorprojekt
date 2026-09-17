#!/usr/bin/env bash
# scripts/lib/application-pipeline-themes.sh
# Theme registry for Typst dossier rendering (T900230).
#
# Provides:
#   app_pipeline_resolve_theme <name>
#     Resolves a theme name to the absolute path of its .typ file.
#     Exits with code 1 and lists available themes on error.

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_repo_root="$(cd "${_script_dir}/../.." && pwd)"
_themes_dir="${_repo_root}/templates/application-pipeline/themes"

app_pipeline_resolve_theme() {
  local theme_name="${1:-}"

  if [[ -z "$theme_name" ]]; then
    echo "Error: theme name required" >&2
    app_pipeline_list_themes >&2
    return 1
  fi

  local theme_path="${_themes_dir}/${theme_name}.typ"

  if [[ ! -f "$theme_path" ]]; then
    echo "Error: unknown theme '${theme_name}'" >&2
    app_pipeline_list_themes >&2
    return 1
  fi

  echo "$theme_path"
}

app_pipeline_list_themes() {
  if [[ ! -d "$_themes_dir" ]]; then
    return 0
  fi
  find "$_themes_dir" -name '*.typ' -exec basename {} .typ \; | sort
}
