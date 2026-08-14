#!/usr/bin/env bash
# scripts/lib/worktree-real-path.sh
#
# Helper function to resolve the actually registered path of a git worktree
# from `git worktree list --porcelain`. [T004604]
#
# Source-only library (never executed directly).

worktree_real_path() {
    local repo_root="${1:-.}"
    local target_path="${2:-}"

    [ -z "$target_path" ] && return 0

    if ! command -v git >/dev/null 2>&1; then
        return 0
    fi

    local porcelain_out
    porcelain_out="$(git -C "$repo_root" worktree list --porcelain 2>/dev/null)" || return 0

    local target_abs="$target_path"
    if [[ "$target_path" != /* ]]; then
        if [ -d "$repo_root" ]; then
            target_abs="$(cd "$repo_root" 2>/dev/null && pwd)/$target_path"
        fi
    fi
    local target_canon="$target_abs"
    if command -v realpath >/dev/null 2>&1; then
        target_canon="$(realpath -m "$target_abs" 2>/dev/null || echo "$target_abs")"
    fi

    local current_wt=""
    local match=""

    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            worktree\ *)
                current_wt="${line#worktree }"
                local wt_canon="$current_wt"
                if command -v realpath >/dev/null 2>&1; then
                    wt_canon="$(realpath -m "$current_wt" 2>/dev/null || echo "$current_wt")"
                fi
                if [ "$current_wt" = "$target_path" ] || \
                   [ "$current_wt" = "$target_abs" ] || \
                   [ "$wt_canon" = "$target_canon" ] || \
                   [ "$wt_canon" = "$target_abs" ]; then
                    match="$current_wt"
                fi
                ;;
            "")
                if [ -n "$match" ]; then
                    echo "$match"
                    return 0
                fi
                current_wt=""
                ;;
        esac
    done <<< "$porcelain_out"

    if [ -n "$match" ]; then
        echo "$match"
        return 0
    fi

    return 0
}
