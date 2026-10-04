#!/usr/bin/env bats
#
# T900995 — G-KNOW: Wissen lebt in Registry, Code-Guards und ADRs, nicht in
# Prosa-Doku. Die Messungen muessen Verstoesse zaehlen und einen Strukturbruch
# als Verletzung melden statt als gruen.
#
# Pruefmodus: Output-Verifikation [T002448-M4]. Registry-Faelle laufen gegen
# eine Fixture-Registry (HG_KNOW_REGISTRY), Git-Faelle gegen ein Temp-Repo.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  KG="$REPO_ROOT/scripts/lib/knowledge-goals.py"
  REG="$BATS_TEST_TMPDIR/registry"
  mkdir -p "$REG"
  cd "$BATS_TEST_TMPDIR" || return 1
  mkdir -p tests/spec && touch tests/spec/real-guard.bats
}

@test "G-KNOW01 zaehlt docs-only-Regeln" {
  cat > "$REG/guardrails.yaml" <<'EOF'
- id: A
  enforced_by: docs-only
- id: B
  enforced_by: tests/spec/real-guard.bats
- id: C
  enforced_by: "docs-only"
EOF
  run env HG_KNOW_REGISTRY="$REG" python3 "$KG" docs-only
  [ "$status" -eq 0 ]
  [ "$output" = "2" ]
}

@test "G-KNOW03 zaehlt Verweise ohne Datei, docs-only nicht" {
  cat > "$REG/guardrails.yaml" <<'EOF'
- id: A
  enforced_by: hook-ohne-datei
- id: B
  enforced_by: tests/spec/real-guard.bats
- id: C
  enforced_by: docs-only
- id: D
  where: tests/spec/real-guard.bats:3, tests/spec/fehlt.bats
- id: E
  where: tests/spec/real-guard.bats::setup
EOF
  run env HG_KNOW_REGISTRY="$REG" python3 "$KG" dangling
  [ "$status" -eq 0 ]
  [ "$output" = "2" ]
}

@test "fehlende Registry meldet Verletzung statt 0" {
  run env HG_KNOW_REGISTRY="$BATS_TEST_TMPDIR/leer" python3 "$KG" dangling
  [ "$status" -eq 0 ]
  [ "${lines[-1]}" = "99999" ]
}

@test "G-KNOW02/04 zaehlt docs-Markdown ausser adr/" {
  git init -q repo && cd repo
  mkdir -p docs/adr docs/x
  touch docs/a.md docs/x/b.md docs/adr/ADR-001-x.md docs/x/c.txt
  git add . && git -c user.email=t@t -c user.name=t commit -qm init
  run python3 "$KG" docs-md
  [ "$output" = "2" ]
}

@test "G-KNOW06 zaehlt Inhaltsaenderungen, nicht Status-Zeilen" {
  git init -q repo && cd repo
  mkdir -p docs/adr
  printf '# ADR-001\n**Status:** Entwurf\nInhalt\n' > docs/adr/ADR-001-x.md
  git add . && git -c user.email=t@t -c user.name=t commit -qm add
  sed -i 's/Entwurf/Final/' docs/adr/ADR-001-x.md
  git -c user.email=t@t -c user.name=t commit -qam status
  run python3 "$KG" adr-edits
  [ "$output" = "0" ]
  echo "Nachtrag" >> docs/adr/ADR-001-x.md
  git -c user.email=t@t -c user.name=t commit -qam edit
  run python3 "$KG" adr-edits
  [ "$output" = "1" ]
}

@test "G-KNOW05 summiert AGENTS.md/CLAUDE.md, Symlinks nicht" {
  git init -q repo && cd repo
  mkdir sub
  printf '12345' > AGENTS.md
  printf '123' > sub/CLAUDE.md
  ln -s ../AGENTS.md sub/AGENTS.md
  git add . && git -c user.email=t@t -c user.name=t commit -qm init
  run python3 "$KG" agent-ctx-bytes
  [ "$output" = "8" ]
}
