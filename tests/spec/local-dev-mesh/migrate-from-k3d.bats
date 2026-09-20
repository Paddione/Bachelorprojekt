#!/usr/bin/env bats
# tests/spec/local-dev-mesh/migrate-from-k3d.bats — T900118, umgeschrieben fuer T900120
# SSOT: openspec/specs/local-dev-mesh.md, Requirement
#       "The k3d migration verifies row counts against the archived dump"
#
# Pruefmodus: Output-Verifikation. Die Quelle ist eine Dump-DATEI (der k3d-Cluster existiert
# nicht mehr), das Ziel bleibt ein kubectl-Stub. Jeder kubectl-Aufruf landet im Protokoll,
# damit "das Skript hat das Ziel nicht angefasst" beweisbar ist statt angenommen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/devmesh/migrate-from-k3d.sh"
  FIX="$(mktemp -d)"
  export STUB_DIR="$FIX" STUB_LOG="$FIX/kubectl.log"
  export DEVMESH_DUMP_DIR="$FIX/dump" DEVMESH_MIGRATE_DBS="pocket_id website"
  export DEVMESH_SRC_DUMP="$FIX/cluster.sql"
  mkdir -p "$DEVMESH_DUMP_DIR" "$FIX/bin"
  : > "$STUB_LOG"

  # pg_dumpall-Gestalt: \connect je Datenbank, COPY-Bloecke mit abschliessendem \.
  {
    printf '\\connect pocket_id\n'
    printf 'COPY public.users (id, username) FROM stdin;\n'
    printf '1 alice\n2 bob\n3 carol\n'
    printf '\\.\n'
    printf 'COPY public.oidc_clients (id, name) FROM stdin;\n'
    printf '\\.\n'
    printf '\\connect website\n'
    printf 'COPY tickets.tickets (id) FROM stdin;\n'
    printf 'a\nb\nc\nd\n'
    printf '\\.\n'
  } > "$DEVMESH_SRC_DUMP"

  cat > "$FIX/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
ctx="$(sed -nE 's/.*--context[= ]([^ ]+).*/\1/p' <<<"$*")"
db="$(sed -nE 's/.* -d ([^ ]+).*/\1/p' <<<"$*")"
case " $* " in
  *" config get-contexts "*) printf 'devmesh\nfleet\n' ;;
  *" get pod "*)             echo "pod/shared-db-0" ;;
  *" exec "*)                cat "$STUB_DIR/counts-$ctx-$db" ;;
esac
STUB
  chmod +x "$FIX/bin/kubectl"
  export PATH="$FIX/bin:$PATH"
}

teardown() { rm -rf "$FIX"; }

@test "counts: die Zeilenzahlen kommen aus dem Dump, je Datenbank eine Datei" {
  run bash "$SCRIPT" counts
  [ "$status" -eq 0 ]
  grep -qxF 'public.users|3' "$DEVMESH_DUMP_DIR/pocket_id.counts"
  grep -qxF 'public.oidc_clients|0' "$DEVMESH_DUMP_DIR/pocket_id.counts"
  grep -qxF 'tickets.tickets|4' "$DEVMESH_DUMP_DIR/website.counts"
}

@test "verify: gleiche Zeilenzahlen enden mit Exit 0" {
  printf 'public.users|3\npublic.oidc_clients|0\n' > "$DEVMESH_DUMP_DIR/pocket_id.counts"
  printf 'tickets.tickets|4\n' > "$DEVMESH_DUMP_DIR/website.counts"
  cp "$DEVMESH_DUMP_DIR/pocket_id.counts" "$FIX/counts-devmesh-pocket_id"
  cp "$DEVMESH_DUMP_DIR/website.counts"   "$FIX/counts-devmesh-website"
  run bash "$SCRIPT" verify
  [ "$status" -eq 0 ]
  grep -F 'ok' <<<"$output" | grep -qF 'website.tickets.tickets'
}

@test "verify: abweichende Tabelle endet mit Exit 1 und wird genannt" {
  printf 'public.users|3\n' > "$DEVMESH_DUMP_DIR/pocket_id.counts"
  printf 'tickets.tickets|4\n' > "$DEVMESH_DUMP_DIR/website.counts"
  cp "$DEVMESH_DUMP_DIR/pocket_id.counts" "$FIX/counts-devmesh-pocket_id"
  printf 'tickets.tickets|3\n' > "$FIX/counts-devmesh-website"
  run bash "$SCRIPT" verify
  [ "$status" -eq 1 ]
  grep -F 'ok' <<<"$output" | grep -qF 'pocket_id.public.users'
  grep -F 'ABWEICHUNG' <<<"$output" | grep -qF 'website.tickets.tickets'
}

@test "preflight: fehlender Dump ist Vorbedingung (Exit 2) und wird benannt" {
  run env DEVMESH_SRC_DUMP="$FIX/gibt-es-nicht.sql.gz" bash "$SCRIPT" preflight
  [ "$status" -eq 2 ]
  grep -qF 'gibt-es-nicht.sql.gz' <<<"$output"
}

@test "preflight: vorhandener Dump und zulaessiges Ziel bestehen" {
  run bash "$SCRIPT" preflight
  [ "$status" -eq 0 ]
  grep -qF "$DEVMESH_SRC_DUMP" <<<"$output"
}

@test "fleet als Ziel wird vor dem ersten kubectl-Aufruf verweigert" {
  run env DEVMESH_DST_CTX=fleet bash "$SCRIPT" verify
  [ "$status" -eq 1 ]
  grep -qF 'verweigert' <<<"$output"
  [ ! -s "$STUB_LOG" ]
}

@test "restore ist kein Unterbefehl mehr" {
  run bash "$SCRIPT" restore
  [ "$status" -eq 2 ]
  [ ! -s "$STUB_LOG" ]
}
