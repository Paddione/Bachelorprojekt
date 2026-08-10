#!/usr/bin/env bats
# Branch-Namens-Guard in scripts/worktree-create.sh [T002470]
#
# scripts/worktree-create.sh legt heute Worktrees fuer Branch-Namen an, die
# .githooks/pre-commit anschliessend bei JEDEM Commit ablehnt. Der Anker-Commit
# (T002412) laeuft mit --no-verify und kaschiert das; erst der erste inhaltliche
# Commit scheitert. Gemessen am 2026-07-29: 4 von 13 aktiven Worktrees betroffen.
#
# RED-Phase: Der Guard existiert noch nicht. Die Ablehnungs-Tests scheitern,
# der Positiv-Anker und die Drift-Guards laufen bereits gruen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  HELPER="$REPO/scripts/worktree-create.sh"
  HOOK="$REPO/.githooks/pre-commit"

  TMP="$(mktemp -d)"
  export HOME="$TMP/home"; mkdir -p "$HOME"
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"

  # Minimales Repo ohne origin/main: der Divergence-Guard (T001302) feuert dann
  # nicht, und der Namens-Guard laeuft isoliert.
  MAIN="$TMP/main"
  mkdir -p "$MAIN"
  git init -q -b main "$MAIN"
  git -C "$MAIN" config user.email t@example.com
  git -C "$MAIN" config user.name  Tester
  printf 'x\n' > "$MAIN/file.txt"
  git -C "$MAIN" add -A
  git -C "$MAIN" commit -qm init
}

teardown() { rm -rf "$TMP"; }

# ── RED: konventionswidrige Namen muessen abgelehnt werden ────────────

@test "T002470: kleingeschriebene Ticket-ID wird abgelehnt, kein Worktree entsteht" {
  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002407 '$TMP/wt-lower' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-lower" ]
}

@test "T002470: Kurzform ohne 6-stellige ID wird abgelehnt" {
  run bash -c "cd '$MAIN' && bash '$HELPER' feature/t2450-loc-gates '$TMP/wt-short' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-short" ]
}

@test "T002470: ungueltiges Typ-Praefix feat/ wird abgelehnt" {
  run bash -c "cd '$MAIN' && bash '$HELPER' feat/auto-triage-T002399 '$TMP/wt-feat' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-feat" ]
}

@test "T002470: die Meldung benennt die verletzte Bedingung einzeln" {
  # Positiv-Anker zuerst [T002356-M1]: der konforme Name laeuft durch. Ohne ihn
  # bestuende der folgende Negativtest auch dann, wenn der Helper generell bricht.
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/anker-T002470 '$TMP/wt-anker' HEAD"
  [ "$status" -eq 0 ]

  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002407 '$TMP/wt-msg' HEAD 2>&1"
  [ "$status" -ne 0 ]
  # Auf die Ticket-ID-Zeile eingrenzen statt gegen den gesamten Output zu matchen:
  # der Worktree-Pfad steht im Output und koennte Suchbegriffe selbst erfuellen.
  echo "$output" | grep -iE 'ticket-id|ticket_id' | grep -q 'T002407'
}

@test "T002470: die Meldung schlaegt den korrigierten Aufruf vor" {
  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002407 '$TMP/wt-sug' HEAD 2>&1"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q 'chore/mishap-T002407'
}

@test "T002470: der Guard greift auch fuer einen bereits existierenden Branch" {
  git -C "$MAIN" branch chore/mishap-t002424
  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002424 '$TMP/wt-exists' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-exists" ]
}

# ── Zweitbefund: keine Mutation vor der Validierung ───────────────────

@test "T002470: ein abgelehnter Name loest keinen Stash im Hauptcheckout aus" {
  printf 'uncommitted\n' >> "$MAIN/file.txt"
  before="$(git -C "$MAIN" stash list | wc -l)"
  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002407 '$TMP/wt-nostash' HEAD"
  [ "$status" -ne 0 ]
  after="$(git -C "$MAIN" stash list | wc -l)"
  [ "$before" -eq "$after" ]
  # Die ungespeicherte Aenderung liegt unveraendert im Arbeitsbaum.
  grep -q 'uncommitted' "$MAIN/file.txt"
}

# ── Positiv-Anker, Exemptions, Bypass ─────────────────────────────────

@test "T002470: ein konventionskonformer Name legt weiterhin einen Worktree an" {
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/branch-name-guard-T002470 '$TMP/wt-ok' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-ok" ]
}

@test "T002470: renovate/* ist vom Guard ausgenommen" {
  run bash -c "cd '$MAIN' && bash '$HELPER' renovate/npm-lodash '$TMP/wt-ren' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-ren" ]
}

@test "T002470: WT_SKIP_NAME_CHECK=1 laesst einen verletzenden Namen durch" {
  run bash -c "cd '$MAIN' && WT_SKIP_NAME_CHECK=1 bash '$HELPER' chore/mishap-t002407 '$TMP/wt-bypass' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-bypass" ]
}

# ── Gemeinsame Quelle statt Drift-Guard [T002817] ─────────────────────
#
# Bis T002817 standen hier drei grep-Tests, die Ticket-ID-Regex, Exemption-Liste und
# Typ-Praefixe zwischen Hook und Helper auf Textgleichheit verglichen. Begruendung
# damals: die Regel sei bewusst dupliziert, weil der pre-commit-Hook frei von
# Repo-Dateiabhaengigkeiten bleiben solle.
#
# Diese Absicherung hat nicht gehalten. Die --unattended-Allowlist (mit T002783
# hinzugekommen) fiel in keinen der drei Vergleiche, lief auseinander und machte
# chore/mishap-incident-rollup anlegbar, aber nicht committebar — die gesamte
# Mishap-Auswertung lief ins Leere. Eine duplizierte Regel ist nur so vollstaendig
# abgesichert wie die Aufzaehlung ihrer Drift-Tests gepflegt wird.
#
# Die Ausnahmeliste lebt jetzt in scripts/lib/branch-allowlist.sh. Die urspruengliche
# Sorge bleibt adressiert: beide Guards sourcen bedingt, fehlt die Datei verhalten sie
# sich wie zuvor. Der folgende Test misst die Eigenschaft, die das Requirement fordert
# (openspec/specs/divergence-guard.md) — dass beide Guards derselben Quelle folgen —
# statt Textgleichheit zu vergleichen.

@test "T002817: Hook und Helper folgen derselben Allowlist-Quelle" {
  LIB="$REPO/scripts/lib/branch-allowlist.sh"
  [ -f "$LIB" ]

  # Sandbox mit einer ERWEITERTEN Kopie der Lib: ein Name, der in der echten Liste
  # nicht steht. Wirkt er auf beide Guards, lesen beide dieselbe Quelle.
  SB="$TMP/shared"; mkdir -p "$SB/.githooks" "$SB/scripts/lib"
  git init -q -b main "$SB"
  git -C "$SB" config user.email t@example.com
  git -C "$SB" config user.name Tester
  git -C "$SB" config core.hooksPath .githooks
  cp "$HOOK" "$SB/.githooks/pre-commit"
  cp "$HELPER" "$SB/scripts/worktree-create.sh"
  cp "$REPO/.gitleaks.toml" "$SB/.gitleaks.toml" 2>/dev/null || true
  sed 's|^TICKETLESS_BRANCHES=.*|TICKETLESS_BRANCHES="chore/probe-shared-source"|' \
    "$LIB" > "$SB/scripts/lib/branch-allowlist.sh"
  for s in agent-lock.sh agent-collision.sh git-crypt-guard.sh guard-bonsai-overwrite.sh openspec-half-archive-check.sh; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "$SB/scripts/$s"; chmod +x "$SB/scripts/$s"
  done
  export FRESHNESS_HOOK_DISABLED=1 SKIP_BONSAI_GUARD=1

  # Basis-Commit auf main mit --no-verify: der Guard darf hier noch nicht greifen,
  # sonst haette das Repo gar keinen Commit und weder main noch eine Worktree-Basis.
  printf 'base\n' > "$SB/base.txt"
  git -C "$SB" add base.txt
  git -C "$SB" commit -q --no-verify -m "chore: base"

  # Positiv-Anker zuerst [T002356-M1]: der Guard wirkt ueberhaupt. Ohne ihn bestuenden
  # die folgenden Zusagen auch dann, wenn beide Guards vollstaendig ausgehaengt waeren.
  git -C "$SB" checkout -q -b chore/nicht-in-der-liste
  printf 'x\n' > "$SB/anchor.txt"
  git -C "$SB" add anchor.txt
  run git -C "$SB" commit -m "chore: anker"
  [ "$status" -ne 0 ]

  # Der Hook folgt der erweiterten Liste — dieselbe Datei, nur ein anderer Branch.
  git -C "$SB" checkout -q -b chore/probe-shared-source
  run git -C "$SB" commit -m "chore: probe"
  [ "$status" -eq 0 ]

  # Der Helper folgt derselben Liste — ohne eigene Kopie des Namens.
  # Vorher zurueck auf main: fuer einen bereits ausgecheckten Branch legt
  # worktree-create.sh grundsaetzlich keinen Worktree an ('branch in use').
  git -C "$SB" checkout -q main
  run bash -c "cd '$SB' && bash scripts/worktree-create.sh --unattended chore/probe-shared-source '$TMP/wt-shared' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-shared" ]

  # Und keiner von beiden traegt den Namen selbst.
  run grep -c 'probe-shared-source' "$SB/.githooks/pre-commit" "$SB/scripts/worktree-create.sh"
  [ "$status" -ne 0 ]
}
