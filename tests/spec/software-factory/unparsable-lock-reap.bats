#!/usr/bin/env bats
# [T002702] Eine Lockdatei ohne parsbaren Inhalt muss als tot gelten.
#
# Pruefmodus: command output verification [T002448-M4] — die Tests RUFEN
# agent-lock.sh auf und pruefen den Zustand danach (existiert die Datei noch?
# was meldet `list`?). Kein Grep auf die Implementierung: dass eine
# Parsbarkeitspruefung im Quelltext steht, belegt nicht, dass reap die Datei
# danach auch entfernt.
#
# Befund (2026-08-08, nach einem WSL2-Crash): eine 0-Byte-Datei unter
# .git/agent-locks/ blockiert JEDEN Commit im main-Checkout und wird von reap
# nicht geraeumt. `_reapable()` leitet Totsein ausschliesslich aus Feldern IM
# Lock-JSON ab; bei einer leeren Datei ist jedes Feld leer, kein Zweig greift,
# und die Funktion endet auf `return 1` — der Rueckgabewert fuer "lebt". Der
# Guard dagegen wertet allein die Existenz der Datei als "gehalten".
#
# Alle Tests laufen in einem Wegwerf-Repo unter $BATS_TEST_TMPDIR. Das echte
# .git/agent-locks/ dieses Checkouts wird nicht angefasst — eine dort abgelegte
# 0-Byte-Datei wuerde exakt den Bug ausloesen, den dieser Test beschreibt, und
# die laufende Session aussperren.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/agent-lock.sh"

  SANDBOX="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$SANDBOX"
  git -C "$SANDBOX" init -q
  LOCKDIR="$SANDBOX/.git/agent-locks"
  mkdir -p "$LOCKDIR"
}

# Fuehrt agent-lock.sh im Sandbox-Repo aus, damit `git rev-parse --git-common-dir`
# dort landet und nicht im echten Checkout.
_al() {
  ( cd "$SANDBOX" && bash "$SCRIPT" "$@" )
}

@test "T002702: reap entfernt eine 0-Byte-Lockdatei" {
  : > "$LOCKDIR/main-checkout.json"
  [ -f "$LOCKDIR/main-checkout.json" ]

  run _al reap
  [ ! -f "$LOCKDIR/main-checkout.json" ]
}

@test "T002702: reap entfernt eine Lockdatei mit ungueltigem JSON" {
  printf '{not json' > "$LOCKDIR/branch__broken.json"
  [ -f "$LOCKDIR/branch__broken.json" ]

  run _al reap
  [ ! -f "$LOCKDIR/branch__broken.json" ]
}

@test "T002702: reap entfernt gueltiges JSON ohne jedes Identitaetsfeld" {
  printf '{}\n' > "$LOCKDIR/branch__empty-object.json"

  run _al reap
  [ ! -f "$LOCKDIR/branch__empty-object.json" ]
}

@test "T002702: ein Lock mit lebendem owner_pid ueberlebt reap (Positiv-Anker)" {
  # Ohne diesen Anker koennte reap schlicht ALLES loeschen und die Aussagen
  # oben blieben trotzdem wahr. Der Test muss auch die Gegenrichtung sichern.
  local now; now="$(date +%s)"
  cat > "$LOCKDIR/ticket__TALIVE.json" <<EOF
{
  "scope": "ticket",
  "id": "TALIVE",
  "owner_sid": "",
  "owner_pid": "$$",
  "tool": "bats",
  "label": "liveness anchor",
  "worktree": "$SANDBOX",
  "branch": "",
  "ticket": "TALIVE",
  "host": "test",
  "created_at": "$now",
  "heartbeat_at": "$now"
}
EOF

  run _al reap
  [ -f "$LOCKDIR/ticket__TALIVE.json" ]
}

@test "T002702: list meldet eine inhaltslose Lockdatei als stale, nicht als live" {
  : > "$LOCKDIR/main-checkout.json"

  run _al list
  [ "$status" -eq 0 ]

  # Die Zeile muss der Datei zuzuordnen sein — im gemeldeten Fall waren SCOPE,
  # ID und SID leer und die Ausgabe benannte nicht, WELCHE Datei betroffen war.
  local line
  line="$(printf '%s\n' "$output" | grep 'main-checkout' || true)"
  [ -n "$line" ]
  [[ "$line" == *stale* ]]
  [[ "$line" != *live* ]]
}

@test "T002702: reap protokolliert den Grund 'unparsable' mit Dateibezug" {
  : > "$LOCKDIR/main-checkout.json"

  run _al reap

  [ -f "$LOCKDIR/.reap.log" ]
  run grep 'unparsable' "$LOCKDIR/.reap.log"
  [ "$status" -eq 0 ]
  # Der Eintrag muss die Datei benennen. `_reap_log` liest sonst scope/id aus
  # dem Lock — bei einem leeren Lock ergibt das die Zeile "/" und die
  # Audit-Spur ist so nichtssagend wie die list-Zeile es war.
  [[ "$output" == *"main-checkout"* ]]
}

@test "T002702: der Guard meldet einen beschaedigten Lock als beschaedigt, nicht als Kollision" {
  : > "$LOCKDIR/main-checkout.json"

  # guard-precommit soll bei einem unparsbaren Lock NICHT die
  # Standard-Kollisionsmeldung ausgeben. Diese empfiehlt einen Worktree
  # anzulegen — bei einem beschaedigten Lock ist das die falsche Handlung,
  # denn niemand haelt ihn.
  run _al guard-precommit

  # Positiv-Anker: der Guard muss die Datei ueberhaupt bemerken und darueber
  # reden. Ein stilles Exit 0 ohne Ausgabe wuerde die Negativaussagen unten
  # vakuos erfuellen.
  [ -n "$output" ]
  [[ "$output" == *"main-checkout"* ]]

  # Und er darf nicht in die falsche Richtung schicken.
  [[ "$output" != *"worktree-create.sh"* ]]
}
