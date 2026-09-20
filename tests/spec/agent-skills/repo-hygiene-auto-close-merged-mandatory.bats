#!/usr/bin/env bats
# T900103: Messung vom 2026-09-20 zeigte 7 gemergte PRs, deren Tickets offen blieben,
# weil auto-close-merged.sh nur ueber die Factory-Wakeup-Schleife (wakeup.sh:248) laeuft.
# Faellt die Factory (oder laeuft sie in einem Fenster nicht), greift kein Netz. Die
# Nutzerentscheidung vom selben Tag macht den Abgleich zum VERBINDLICHEN Schritt des
# repo-hygiene-Laufs (§3) — kein neuer Cron, kein neuer Workflow, wakeup.sh:248 bleibt
# unveraendert. Dieser Test belegt, dass der Aufruf im Ablauf-Abschnitt §3 selbst steht
# (nicht nur irgendwo im Dokument erwaehnt) und als Pflicht formuliert ist.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  OPS_MD="$REPO_ROOT/.claude/skills/references/repo-hygiene-ops.md"
}

@test "repo-hygiene-ops.md ist ein Symlink auf die opencode-Quelle (beide Spiegel geteilt)" {
  [ -L "$REPO_ROOT/.claude/skills/references" ]
}

@test "§3 ruft auto-close-merged.sh als verbindlichen Schritt auf, fuer beide Brands" {
  run sed -n '/^## 3\. PR-Triage/,/^## 4\./p' "$OPS_MD"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Aufruf selbst steht im §3-Textkoerper.
  grep -qF "auto-close-merged.sh" <<<"$output"
  grep -qF "BRAND=mentolder" <<<"$output"
  grep -qF "BRAND=korczewski" <<<"$output"
  # Pflicht-Sprache, nicht optionale Erwaehnung.
  grep -qiE "verbindlich" <<<"$output"
}

@test "§3-Aufruf ist als Netz unabhaengig von der laufenden Factory begruendet" {
  run sed -n '/^## 3\. PR-Triage/,/^## 4\./p' "$OPS_MD"
  [ "$status" -eq 0 ]
  grep -qiE "Factory.*(nicht laeuft|nicht läuft)" <<<"$output"
}
