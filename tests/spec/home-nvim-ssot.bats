#!/usr/bin/env bats
# Spec-Guard fuer T901212 (nvim-ssot-umzug): Das Home-Repo (Paddione/dotfiles)
# trackt .config/nvim nicht mehr — SSOT ist dotfiles/nvim, die Live-Config
# liegt unter ~/.config/nvim. Laeuft nur, wo $HOME das Dotfiles-Repo ist
# (sonst Skip, z.B. CI-Runner ohne Home-Repo).

home_is_dotfiles_repo() {
  [ -e "$HOME/.git" ] && git -C "$HOME" remote get-url origin 2>/dev/null | grep -q "Paddione/dotfiles"
}

@test "T901212-1: home repo tracks no .config/nvim files" {
  home_is_dotfiles_repo || skip "kein Dotfiles-Home-Repo unter \$HOME"
  [ -z "$(git -C "$HOME" ls-files .config/nvim)" ]
}

@test "T901212-2: live config still present" {
  home_is_dotfiles_repo || skip "kein Dotfiles-Home-Repo unter \$HOME"
  [ -f "$HOME/.config/nvim/init.lua" ]
}

@test "T901212-3: gitignore carries no nvim whitelist" {
  home_is_dotfiles_repo || skip "kein Dotfiles-Home-Repo unter \$HOME"
  ! grep -q "config/nvim" "$HOME/.gitignore"
}
