#!/usr/bin/env bats
# T013041: brain-ingest Delivery-Branch-Staleness — Verhaltenstests (Output-Verifikation).
# SSOT-Delta: openspec/changes/brain-ingest-stale-branch-T013041/specs/brain-k4-brain-wiki.md
#
# Prüfmodus: command-output verification. Der Ingest läuft gegen eine Fixture aus
# Fake-Origin (bare Repo), Brain-Clone, Quell-Baum mit kopierten Skripten und einem
# gecshimten curl (deterministische Transform-Antwort). Assertions messen Git-Zustand
# (Branch-Basis, Push-Ergebnis, Exit-Codes) — keine Source-Greps auf brain-ingest.sh.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  INGEST="$REPO_ROOT/scripts/brain-ingest.sh"
  WORK="$(mktemp -d)"
  BRANCH_NAME="feature/t013041-fixture"
}

teardown() {
  rm -rf "$WORK"
  unset ADVANCE_MAIN_SEED ADVANCE_MARKER || true
}

# Fixture: bare origin mit main (c2) + stale Delivery-Branch (s1, Basis c1),
# Brain-Clone davon, Quell-Baum mit kopierten Ingest-Skripten und minimal-Manifest,
# fake curl/gh in PATH.
build_fixture() {
  local with_stale="${1:-with-stale}"
  local origin="$WORK/origin.git" seed="$WORK/seed" brain="$WORK/brain"
  local source_root="$WORK/source-root" fake_bin="$WORK/bin"

  git init -q --bare -b main "$origin"
  # GitHub-Verhalten nachbilden: Non-Fast-Forward-Pushes werden abgelehnt.
  git -C "$origin" config receive.denyNonFastForwards true

  git clone -q "$origin" "$seed"
  git -C "$seed" config user.email t@t
  git -C "$seed" config user.name t
  printf '# seed v1\n' > "$seed/README.md"
  git -C "$seed" add README.md
  git -C "$seed" commit -q -m c1
  printf '# seed v2\n' > "$seed/README.md"
  git -C "$seed" commit -q -a -m c2
  git -C "$seed" push -q origin main

  # Stale Delivery-Branch: von c1 statt main-Spitze (c2). Für den
  # Staleness-Gate-Test (frischer Branch-Name) abschaltbar.
  if [ "$with_stale" != "no-stale-branch" ]; then
    git -C "$seed" checkout -q -b stale-seed HEAD~1
    printf 'stale\n' > "$seed/stale-only.txt"
    git -C "$seed" add stale-only.txt
    git -C "$seed" commit -q -m s1
    git -C "$seed" push -q origin "stale-seed:$BRANCH_NAME"
    git -C "$seed" checkout -q main
  fi

  git clone -q "$origin" "$brain"
  git -C "$brain" config user.email t@t
  git -C "$brain" config user.name t

  mkdir -p "$source_root/scripts/brain" "$source_root/docs/runbooks"
  for script in brain-ingest.sh brain-ingest-transform.sh brain-chunk.sh \
    brain-ingest-reset.sh brain-group-match.sh brain-source-provenance.sh \
    brain-ingest-worklist.sh brain-page-metadata.py brain-ingest-moc.sh \
    brain-ingest-prune.sh brain-ingest-coverage.sh; do
    cp "$REPO_ROOT/scripts/$script" "$source_root/scripts/$script"
  done
  printf '# Guide\n\nFixture body.\n' > "$source_root/docs/runbooks/guide.md"
  cat > "$source_root/scripts/brain/ingest-sources.yaml" <<'YAML'
exclude: []
groups:
  runbooks: docs/runbooks/*.md
type_map:
  defaults:
    runbooks: note
  overrides: []
tag_defaults:
  runbooks: [runbooks]
YAML

  mkdir -p "$brain/scripts"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$brain/scripts/lint-frontmatter.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$brain/scripts/lint-wikilinks.sh"
  chmod +x "$brain/scripts/lint-frontmatter.sh" "$brain/scripts/lint-wikilinks.sh"

  mkdir -p "$fake_bin"
  cat > "$fake_bin/curl" <<'SH'
#!/usr/bin/env bash
# [T013041 Test-Hook] optionaler Main-Vorschub mitten in der Generierung,
# um das Staleness-Gate vor dem Push zu triggern.
if [ -n "${ADVANCE_MAIN_SEED:-}" ] && [ -n "${ADVANCE_MARKER:-}" ] && [ ! -e "$ADVANCE_MARKER" ]; then
  : > "$ADVANCE_MARKER"
  printf '%s\n' '# mid-run addition' > "$ADVANCE_MAIN_SEED/midrun.txt"
  git -C "$ADVANCE_MAIN_SEED" add midrun.txt
  git -C "$ADVANCE_MAIN_SEED" commit -q -m c3-midrun
  git -C "$ADVANCE_MAIN_SEED" push -q origin main
fi
content="$(printf '%s\n' '---' 'type: note' 'tags: [fixture]' \
  'status: active' '---' '# Fixture page' '' \
  "source:: Bachelorprojekt ${BRAIN_SOURCE_PATH:?}" '' 'See [[index-moc]].')"
jq -n --arg content "$content" '{choices:[{message:{content:$content}}]}'
SH
  chmod +x "$fake_bin/curl"
  # gh-Shim: PR-Erstellung ist hier unerwünscht; Fehler dort warnen nur (Zeile ~640).
  printf '#!/usr/bin/env bash\nexit 0\n' > "$fake_bin/gh"
  chmod +x "$fake_bin/gh"
}

run_ingest() {
  local mode="${1:-}"
  run env PATH="$WORK/bin:$PATH" LM_STUDIO_URL=http://fixture.invalid LM_MODEL=fixture \
    MAX_PARALLEL=1 BRAIN_CHUNK_TARGET_CHARS=800 \
    ADVANCE_MAIN_SEED="${ADVANCE_MAIN_SEED:-}" ADVANCE_MARKER="${ADVANCE_MARKER:-}" \
    bash "$WORK/source-root/scripts/brain-ingest.sh" --brain-repo "$WORK/brain" \
    --state "$WORK/state.json" --branch "$BRANCH_NAME" $mode
}

@test "[T013041] Branch-Preparation startet trotz vorhandenem Stale-Delivery-Branch bei origin/main" {
  build_fixture
  local br="$BRANCH_NAME" stale_sha main_sha
  stale_sha="$(git -C "$WORK/brain" rev-parse "origin/$br")"
  main_sha="$(git -C "$WORK/brain" rev-parse origin/main)"
  # Positiv-Anker: die Fixture ist wirklich stale (Branch ≠ main).
  [ -n "$stale_sha" ]
  [ "$stale_sha" != "$main_sha" ]

  run_ingest "--dry-run"
  [ "$status" -eq 0 ]

  [ "$(git -C "$WORK/brain" symbolic-ref --short HEAD)" = "$br" ]
  [ "$(git -C "$WORK/brain" rev-parse HEAD)" = "$(git -C "$WORK/brain" rev-parse "refs/remotes/origin/main")" ]
}

@test "[T013041] Abgelehnter Push (non-fast-forward) bricht die Lieferung mit Exit 1 ab" {
  build_fixture
  local br="$BRANCH_NAME" remote_before
  remote_before="$(git -C "$WORK/origin.git" rev-parse "refs/heads/$br")"

  run_ingest ""
  [ "$status" -ne 0 ]
  [[ "$output" == *"delivery aborted"* ]]

  # Positiv-Anker: der Push wurde wirklich abgewiesen — der Remote-Branch steht
  # noch auf dem alten stale Commit.
  [ "$(git -C "$WORK/origin.git" rev-parse "refs/heads/$br")" = "$remote_before" ]
}

@test "[T013041] Staleness-Gate rebased den generierten Commit auf gewandertes origin/main und liefert sauber" {
  build_fixture no-stale-branch
  export ADVANCE_MAIN_SEED="$WORK/seed" ADVANCE_MARKER="$WORK/midrun-marker"
  local old_main
  old_main="$(git -C "$WORK/brain" rev-parse origin/main)"

  run_ingest ""
  [ "$status" -eq 0 ]
  [[ "$output" == *"origin/main moved during generation"* ]]

  # Positiv-Anker: main ist wirklich mitten im Lauf gewandert.
  local new_main pushed_parent pushed_remote
  new_main="$(git -C "$WORK/origin.git" rev-parse refs/heads/main)"
  [ "$new_main" != "$old_main" ]

  # Der gelieferte Commit sitzt direkt auf dem neuen main.
  pushed_parent="$(git -C "$WORK/brain" rev-parse "$BRANCH_NAME~1")"
  [ "$pushed_parent" = "$new_main" ]
  # Und der Push ist angekommen.
  pushed_remote="$(git -C "$WORK/origin.git" rev-parse "refs/heads/$BRANCH_NAME")"
  [ "$pushed_remote" = "$(git -C "$WORK/brain" rev-parse "$BRANCH_NAME")" ]
}

@test "[T014737] Angehaengter Remote-Commit am Delivery-Branch (Fast-Forward-Fall) liefert per Rebase sauber" {
  # E9-Fall (T013914): ein konkurrierender Lauf haengt an den Delivery-Branch an,
  # ohne die Basis zu veraendern — der Rebase muss diesen Anhang erhalten und
  # sauber liefern (Gegenstueck zum Divergenz-Abbruch im Test darueber).
  build_fixture no-stale-branch
  git -C "$WORK/seed" checkout -q -b ff-append main
  printf 'appended\n' > "$WORK/seed/appended.txt"
  git -C "$WORK/seed" add appended.txt
  git -C "$WORK/seed" commit -q -m e9-append
  git -C "$WORK/seed" push -q origin "ff-append:$BRANCH_NAME"
  git -C "$WORK/seed" checkout -q main
  local appended_tip
  appended_tip="$(git -C "$WORK/origin.git" rev-parse "refs/heads/$BRANCH_NAME")"

  run_ingest ""
  [ "$status" -eq 0 ]
  [[ "$output" == *"Pushed to origin/$BRANCH_NAME"* ]]

  # Positiv-Anker: der gelieferte Commit sitzt auf dem angehaengten Remote-Tip.
  local remote_tip delivered_parent
  remote_tip="$(git -C "$WORK/origin.git" rev-parse "refs/heads/$BRANCH_NAME")"
  delivered_parent="$(git -C "$WORK/brain" rev-parse "$BRANCH_NAME~1")"
  [ "$delivered_parent" = "$appended_tip" ]
  [ "$remote_tip" = "$(git -C "$WORK/brain" rev-parse "$BRANCH_NAME")" ]
}
