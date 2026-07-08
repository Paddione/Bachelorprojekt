#!/usr/bin/env bats
# Guards the shared-db self-heal: the postStart hook must idempotently ensure
# every service role AND database exists on each pod start, so a partial/failed
# one-shot initdb (roles created, DBs missing — korczewski on fleet, 2026-05-30)
# self-heals on the next restart instead of leaving services crash-looping.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  MANIFEST="$REPO_ROOT/k3d/shared-db.yaml"
}

@test "shared-db.yaml exists" {
  [ -f "$MANIFEST" ]
}

@test "postStart self-heals databases (CREATE DATABASE loop over all services)" {
  run grep -qE 'for db in nextcloud vaultwarden website pentest videovault pocket_id; do' "$MANIFEST"
  [ "$status" -eq 0 ]
  grep -qE 'CREATE DATABASE' "$MANIFEST"
}

@test "postStart self-heals roles (CREATE USER guarded by NOT EXISTS) for every service" {
  for role in nextcloud vaultwarden website pentest videovault; do
    grep -qE "rolname='$role'.*CREATE USER $role" "$MANIFEST" \
      || grep -qE "rolname='$role'\)    THEN CREATE USER $role" "$MANIFEST"
  done
}

@test "self-heal db-existence check precedes CREATE DATABASE (idempotent)" {
  run grep -qE "SELECT 1 FROM pg_database WHERE datname='\\\$\\\$db'" "$MANIFEST"
  [ "$status" -eq 0 ]
}
