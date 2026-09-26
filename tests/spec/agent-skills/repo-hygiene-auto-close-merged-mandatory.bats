#!/usr/bin/env bats
# T900103 (historisches Netz, T900399 abgeloest): Messung vom 2026-09-20 zeigte
# 7 gemergte PRs, deren Tickets offen blieben, weil auto-close-merged.sh nur ueber die
# Factory-Wakeup-Schleife (wakeup.sh:248) laeuft. Der Abgleich wurde daraufhin zum
# verbindlichen Schritt des repo-hygiene-Laufs (§3).
#
# T900399: mit dem Factory-Teardown sind auto-close-merged.sh, wakeup.sh und das
# Factory-Wakeup-Netz entfallen — es gibt keinen Ausloeser mehr, an dem dieser
# Test ansetzen koennte. Die beiden §3-Assertions sind deshalb ersatzlos entfallen
# (kein Ersatz-Anker moeglich: das Substrat existiert nicht mehr).
# Der Preis ist bewusst bezahlt: das kompensierende Netz aus T900103 existiert nicht
# mehr. Ticket-Schliessung nach gemergten PRs ist jetzt Sache des repo-hygiene-Laufs
# bzw. des Menschen; der Status-Block von T900399 haelt das fest.
# UEBRIG: nur der Symlink-Guard, der unabhaengig vom Factory-Thema gilt.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "repo-hygiene-ops.md ist ein Symlink auf die opencode-Quelle (beide Spiegel geteilt)" {
  [ -L "$REPO_ROOT/.claude/skills/references" ]
}

# T900399: die beiden §3-Assertions zu auto-close-merged.sh sind mit dem
# Factory-Teardown entfallen — siehe Header.
