#!/usr/bin/env bats
# tests/spec/agent-skills/post-merge-finalize-create-new.bats
# SSOT: openspec/specs/agent-skills.md (T900105)
#
# PRÜFMODUS: Output-Verifikation (T002448-M4) — die Entscheidungslogik lebt in
# scripts/lib/openspec-archive-args.sh (reine Funktion, keine Seiteneffekte
# beim Sourcen, kein Cluster-/DB-Zugriff) und wird hier direkt aufgerufen; nur
# die Verdrahtung im Hauptskript (source + Aufruf) ist ein Source-Grep-Anker.
#
# Regression für T900105 (entdeckt bei T900104/work-vm-shared-dev, neue
# SSOT-Komponente): Schritt 8 von scripts/devflow-post-merge-finalize.sh
# baute archive_args nur mit --no-merge für mishap-incident-rollup-Slugs,
# kannte aber KEIN --create-new. Bei einer genuin neuen SSOT-Komponente
# schlug der Archiv-Merge fail-closed fehl ("Target ... does not exist. ...
# pass --create-new", openspec-merge.mjs); der Change musste manuell
# archiviert werden.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
  [ -f "$FINALIZE" ]
  source "$REPO_ROOT/scripts/lib/openspec-archive-args.sh"
}

# Positiv-Anker (T002356-M1): Das Hauptskript nutzt den Helper — ohne diese
# Verdrahtung wären alle folgenden Logik-Aussagen vakuos.
@test "T900105: finalize nutzt openspec_archive_args (Anker)" {
  run grep -qF 'openspec_archive_args "$SLUG"' "$FINALIZE"
  [ "$status" -eq 0 ]
  run grep -qF 'source "$REPO_DIR/scripts/lib/openspec-archive-args.sh"' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Rot vor dem Fix: kein --create-new-Pfad existent; grün: Delta ohne
# SSOT-Target (openspec/specs/<basename> fehlt) ergibt --create-new — die
# Semantik, mit der openspec-merge.mjs fail-closed ablehnt.
@test "T900105: Delta ohne SSOT-Target ergibt --create-new" {
  root="$BATS_TEST_TMPDIR/newcomp"
  mkdir -p "$root/openspec/changes/demo-specs/specs" "$root/openspec/specs"
  touch "$root/openspec/changes/demo-specs/specs/neue-komponente.md"
  openspec_archive_args "demo-specs" "$root"
  [ "${ARCHIVE_ARGS[0]}" = "--create-new" ]
  [ "${#ARCHIVE_ARGS[@]}" -eq 1 ]
}

# Positiv-Anker für die Bedingungs-Aussage: Existiert das SSOT-Target, bleibt
# das Array leer (Standard-Merge mit Guards) — ohne diesen Anker wäre die
# --create-new-Aussage vakuos (ein Helper, der immer --create-new liefert,
# bestünde den vorigen Test ebenfalls).
@test "T900105: Delta mit existierendem SSOT-Target ergibt keine Flags (Anker)" {
  root="$BATS_TEST_TMPDIR/existing"
  mkdir -p "$root/openspec/changes/demo-specs/specs" "$root/openspec/specs"
  touch "$root/openspec/changes/demo-specs/specs/agent-skills.md"
  touch "$root/openspec/specs/agent-skills.md"
  openspec_archive_args "demo-specs" "$root"
  [ "${#ARCHIVE_ARGS[@]}" -eq 0 ]
}

# Regressionsschutz: Der mishap-incident-rollup-Spezialfall (--no-merge, kein
# Merge, keine Guards) behält Vorrang — der neue Zweig darf ihn nicht
# schlucken, auch wenn dort Deltas ohne SSOT-Target liegen.
@test "T900105: mishap-incident-rollup behält --no-merge" {
  root="$BATS_TEST_TMPDIR/mishap"
  mkdir -p "$root/openspec/changes/mishap-incident-rollup-x/specs" "$root/openspec/specs"
  touch "$root/openspec/changes/mishap-incident-rollup-x/specs/notizen.md"
  openspec_archive_args "mishap-incident-rollup-x" "$root"
  [ "${ARCHIVE_ARGS[0]}" = "--no-merge" ]
  [ "${#ARCHIVE_ARGS[@]}" -eq 1 ]
}
