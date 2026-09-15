#!/usr/bin/env bats
# tests/spec/local-dev-mesh/migrate-from-k3d.bats — T900118
# SSOT: specs/local-dev-mesh.md, Requirement "Migration from k3d preserves data and verifies row counts"
# Pruefmodus: Output-Verifikation mit kubectl-Stub; Zeilenzahlen kommen aus Fixture-Dateien
# counts-<context>-<db>, jeder kubectl-Aufruf landet im Protokoll.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/devmesh/migrate-from-k3d.sh"
  FIX="$(mktemp -d)"
  export STUB_DIR="$FIX" STUB_LOG="$FIX/kubectl.log"
  export DEVMESH_DUMP_DIR="$FIX/dump" DEVMESH_MIGRATE_DBS="pocket_id website"
  mkdir -p "$DEVMESH_DUMP_DIR" "$FIX/bin"
  : > "$STUB_LOG"
  cat > "$FIX/bin/kubectl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
ctx="$(sed -nE 's/.*--context[= ]([^ ]+).*/\1/p' <<<"$*")"
db="$(sed -nE 's/.* -d ([^ ]+).*/\1/p' <<<"$*")"
case " $* " in
  *" config get-contexts "*) printf 'k3d-mentolder-dev\ndevmesh\n' ;;
  *" get pod "*)             echo "pod/shared-db-0" ;;
  *" get secret "*)          cat "$STUB_DIR/enckey-$ctx" ;;
  *" exec "*)                cat "$STUB_DIR/counts-$ctx-$db" ;;
esac
EOF
  chmod +x "$FIX/bin/kubectl"
  export PATH="$FIX/bin:$PATH"
  printf 'public.users|3\npublic.oidc_clients|20\n' > "$DEVMESH_DUMP_DIR/pocket_id.counts"
  printf 'tickets.tickets|388\n' > "$DEVMESH_DUMP_DIR/website.counts"
  cp "$DEVMESH_DUMP_DIR/pocket_id.counts" "$FIX/counts-devmesh-pocket_id"
}

teardown() { rm -rf "$FIX"; }

@test "verify: gleiche Zeilenzahlen enden mit Exit 0" {
  cp "$DEVMESH_DUMP_DIR/website.counts" "$FIX/counts-devmesh-website"
  run bash "$SCRIPT" verify
  [ "$status" -eq 0 ]
  grep -F 'ok' <<<"$output" | grep -qF 'website.tickets.tickets'
}

@test "verify: abweichende Tabelle endet mit Exit 1, nennt sie und fasst die Quelle nicht an" {
  printf 'tickets.tickets|387\n' > "$FIX/counts-devmesh-website"
  run bash "$SCRIPT" verify
  grep -F 'ok' <<<"$output" | grep -qF 'pocket_id.public.users'
  [ "$status" -eq 1 ]
  grep -F 'ABWEICHUNG' <<<"$output" | grep -qF 'website.tickets.tickets'
  src_calls="$(grep -F -- '--context k3d-mentolder-dev' "$STUB_LOG" || true)"
  [ -z "$src_calls" ]
}

@test "preflight: gleicher Pocket-ID-Key besteht, abweichender endet mit Exit 1" {
  echo "a2V5LWE=" > "$FIX/enckey-k3d-mentolder-dev"
  echo "a2V5LWE=" > "$FIX/enckey-devmesh"
  run bash "$SCRIPT" preflight
  [ "$status" -eq 0 ]
  echo "a2V5LWI=" > "$FIX/enckey-devmesh"
  run bash "$SCRIPT" preflight
  [ "$status" -eq 1 ]
  grep -qF 'POCKET_ID_ENCRYPTION_KEY' <<<"$output"
}

@test "restore gegen fleet wird vor jedem kubectl-Aufruf verweigert" {
  run env DEVMESH_DST_CTX=fleet bash "$SCRIPT" restore
  [ "$status" -eq 1 ]
  grep -qF 'verweigert' <<<"$output"
  [ ! -s "$STUB_LOG" ]
}
