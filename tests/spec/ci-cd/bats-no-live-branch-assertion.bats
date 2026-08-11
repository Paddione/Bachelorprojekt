#!/usr/bin/env bats
# tests/spec/ci-cd/bats-no-live-branch-assertion.bats — kein Test darf den Branch des
# lebenden Checkouts zur Vorbedingung machen [T003045]
#
# Pruefmodus: Quelltext-Pruefung ueber die .bats-Dateien des Repos. Das ist die in
# CLAUDE.md (T002448-M4) genannte Ausnahme fuer Querschnittstests — die Aussage
# ("keine Testdatei stellt diese Art Assertion") manifestiert sich ausschliesslich im
# Quelltext und hat keinen Laufzeit-Output, an dem sie zu messen waere.
#
# SACHLAGE (T003045)
# tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats:48 machte
#
#     current_branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
#     [ "$current_branch" != "main" ]
#
# zur Vorbedingung eines Tests, dessen eigener Titel "laeuft unabhaengig vom Branch"
# verspricht. Auf Feature-Branches ist die Vorbedingung erfuellt und damit unsichtbar;
# auf main — also in jedem Post-Merge-CI-Lauf — faellt sie um und haelt main dauerhaft
# rot. Gemessen am 2026-08-09: CI-Run 31326387787, Job "Factory spec shard 3".
#
# DIE TRENNLINIE
# Eine Branch-Assertion gegen ein Wegwerf-Repo ist voellig in Ordnung und im Repo ueblich
# — tests/spec/factory-branch-switch-guard.bats prueft so das Verhalten des
# Branch-Switch-Guards, tests/unit/worktree-create.bats das von worktree-create.sh. Der
# Unterschied ist nicht die Assertion, sondern ihr Gegenstand: eine Fixture kontrolliert
# der Test selbst, den lebenden Checkout kontrolliert er nicht. Verboten ist deshalb nur
# der Zugriff auf den Branch des laufenden Repos.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  # Selbst-Ausnahme fuer die Scans unten: aus dem Dateinamen abgeleitet statt hart
  # notiert, damit ein Umbenennen den Guard nicht still blind macht.
  SELF="$(basename "$BATS_TEST_FILENAME")"
}

@test "T003045: keine .bats-Datei liest den Branch des lebenden Checkouts" {
  # Positiv-Anker 1 — ohne ihn liefe die Negativ-Aussage unten auf einer leeren
  # Kandidatenliste vakuos durch (Pflicht aus CLAUDE.md, T002356-M1).
  run bash -c "cd '$REPO_ROOT' && find tests -name '*.bats' -type f | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -gt 100 ] || { echo "Scanner findet kaum .bats-Dateien ($output) — Pfad falsch?"; false; }

  # Positiv-Anker 2 — der Scanner findet die ERLAUBTE Fixture-Form ueberhaupt, und zwar
  # in anderen Dateien als dieser. Faende er sie nicht, waere auch sein Schweigen ueber
  # die verbotene Form wertlos: beides liefe dann nur darauf hinaus, dass die Suche ins
  # Leere greift. Die Selbst-Ausnahme ist hier noetig, weil diese Datei das gesuchte
  # Muster zwangslaeufig in ihren eigenen Regexen traegt.
  run bash -c "cd '$REPO_ROOT' && grep -rE 'git[[:space:]]+-C[[:space:]]+\"?\\\$(TMP|TR)' tests --include='*.bats' \
    | grep -cv '${SELF}'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ] || { echo "keine Fixture-Branch-Abfrage gefunden — Suchmuster stimmt nicht"; false; }

  # ── Zusicherung ────────────────────────────────────────────────────────────────
  # Denylist statt Allowlist. Die Allowlist-Variante ("melde alles, was nicht wie eine
  # Fixture aussieht") faengt zwar auch unbekannte Umgehungsformen, macht aber jede neu
  # eingefuehrte Fixture-Variable zum Fehlalarm — und ein Guard, der bei legitimer
  # Arbeit rot wird, wird abgeschaltet statt befolgt. Gemeldet werden deshalb die zwei
  # Formen, die den lebenden Checkout nachweislich treffen:
  #
  #   (a) git -C "$REPO_ROOT" …   — explizit das laufende Repo
  #   (b) git … ohne -C           — implizit das laufende Repo (bzw. das Bash-cwd)
  #
  # Bekannte Grenze: eine dritte Schreibweise (etwa -C "$PWD") rutscht durch. Das ist
  # der bewusst gezahlte Preis; taucht sie auf, gehoert sie hier ergaenzt.
  #
  # Zwei Ausschluesse sind zwingend, beide aus real eingetretenen Fehlern:
  #   * Kommentarzeilen — pr-refresh.bats:96 ERWAEHNT das Muster nur im Fliesstext.
  #     Dieselbe Falle musste spec-dir-convention.bats zweimal nachbessern.
  #   * Diese Datei selbst — sie enthaelt das Muster in ihren Regexen und waere sonst
  #     dauerhaft rot, unabhaengig vom Zustand des Repos.
  #
  # Dritte Ausnahme (T003045/T003102, 2026-08-11): quoted grep-Patterns. Eine Zeile
  # wie `run grep -F 'git branch --show-current' "$EXEC_SKILL"` prueft NUR, dass ein
  # Skill diese Zeichenkette enthaelt — git wird nicht ausgefuehrt. Der Guard wuerde
  # sie trotzdem als Verstoss lesen (dieselbe Falle wie Kommentarzeilen, nur als
  # grep-Argument statt Fliesstext). ticket-lock-closure-T003102.bats:130,132 ist der
  # Beleg: der Branch-Check im opencode-flow-execute-Skill wird von einem Test
  # referenziert, nicht von einem Test ausgefuehrt.
  offenders=$(cd "$REPO_ROOT" && grep -rnE 'rev-parse[[:space:]]+--abbrev-ref[[:space:]]+HEAD|branch[[:space:]]+--show-current' \
      tests --include='*.bats' \
    | grep -v "${SELF}" \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' \
    | grep -vE "grep[[:space:]]+-[a-zA-Z]+[[:space:]]+['\"].*git[[:space:]]+(branch|rev-parse)[[:space:]]+--" \
    | grep -E 'git[[:space:]]+-C[[:space:]]+"?\$REPO_ROOT|git[[:space:]]+(rev-parse|branch)[[:space:]]+--' \
    | cut -d: -f1,2)

  [ -z "$offenders" ] || {
    echo "Diese Stellen lesen den Branch des lebenden Checkouts:"
    printf '%s\n' "$offenders" | sed 's/^/  /'
    echo "Branch-Assertions gehoeren gegen ein Wegwerf-Repo (git -C \"\$TMP/...\"),"
    echo "nicht gegen das laufende Repo — siehe Dateikopf."
    false
  }
}
