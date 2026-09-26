#!/usr/bin/env bats
# tests/spec/software-factory/decommission-guard.bats
# Ticket: T900399 — Software-Factory Decommission
# SSOT: openspec/changes/software-factory-decommission/
#
# Decommissioning guard: asserts the Software-Factory subsystem is really gone.
# This is the only file that survives in tests/spec/software-factory/ — every
# other spec in that directory exercised the deleted pipeline/dispatcher and is
# retired together with the subsystem (T900399, p5 Task 5.2).
#
# RED proof: before the p1–p4 partials this guard failed (factory.timer active,
# factory-runner in the kustomization, scripts/factory/ populated).
# GREEN proof: after the partials all cases below pass.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

# ── Guard 1: no active systemd user units for the factory stack ─────────

@test "decommission: no factory systemd user units are active" {
  if ! systemctl --user show-environment >/dev/null 2>&1; then
    skip "no systemd --user manager on this host"
  fi
  for unit in factory.timer factory.service factory-mcp.service; do
    run systemctl --user is-active "$unit"
    [ "$status" -ne 0 ] || {
      echo "ACTIVE: $unit is still running (decommissioned, T900399)" >&2
      false
    }
  done
}

@test "decommission: no factory systemd user units are enabled" {
  if ! systemctl --user show-environment >/dev/null 2>&1; then
    skip "no systemd --user manager on this host"
  fi
  for unit in factory.timer factory.service factory-mcp.service; do
    run systemctl --user is-enabled "$unit"
    [ "$status" -ne 0 ] || {
      echo "ENABLED: $unit is still enabled (decommissioned, T900399)" >&2
      false
    }
  done
}

@test "decommission: no factory systemd user unit files are installed" {
  local unit_dir="${HOME}/.config/systemd/user"
  for unit in factory.service factory.timer factory-mcp.service; do
    [ ! -e "${unit_dir}/${unit}" ] || {
      echo "LEFTOVER: ${unit_dir}/${unit} still present (decommissioned, T900399)" >&2
      false
    }
  done
}

# ── Guard 2: no factory-runner resources in the kustomize base ─────────

@test "decommission: k3d/dev-stack/kustomization.yaml has no factory-runner resources" {
  run grep -n 'factory-runner' "$REPO/k3d/dev-stack/kustomization.yaml"
  [ "$status" -ne 0 ] || {
    echo "factory-runner still referenced in k3d/dev-stack/kustomization.yaml:" >&2
    echo "$output" >&2
    false
  }
}

@test "decommission: no factory-runner manifests remain under k3d/" {
  local leftovers
  leftovers="$(find "$REPO/k3d" -name 'factory-runner*' -o -name 'factory-otel*' 2>/dev/null || true)"
  [ -z "$leftovers" ] || {
    echo "LEFTOVER factory-runner/factory-otel manifests:" >&2
    echo "$leftovers" >&2
    false
  }
}

# T900399: eine geloeschte Datei, auf die ein kustomization.yaml zeigt, bricht
# JEDEN Overlay-Build (kustomize laedt die Datei als Quelle, nicht als Pfad).
# Der Datei-Check oben sieht so einen Dangling-Reference nicht -- der muss es.
@test "decommission: no kustomization references a removed factory manifest" {
  # Kommentarzeilen ausblenden: die T900399-Tombstones in den Kustomizations
  # NENNEN die entfernten Manifeste bewusst, um die Loeschung zu erklaeren.
  # Gefangen werden muss nur ein tatsaechlicher resource-/patch-Eintrag.
  local refs
  refs="$(grep -rn -e 'factory-runner' -e 'factory-otel' \
            --include='kustomization.yaml' "$REPO" 2>/dev/null \
            | grep -vE ':[0-9]+:[[:space:]]*#' || true)"
  [ -z "$refs" ] || {
    echo "DANGLING kustomize reference to a removed factory manifest:" >&2
    echo "$refs" >&2
    false
  }
}

# ── Guard 3: scripts/factory/ is gone ──────────────────────────────────

@test "decommission: scripts/factory/ no longer exists" {
  [ ! -d "$REPO/scripts/factory" ] || {
    echo "LEFTOVER: scripts/factory/ still present" >&2
    find "$REPO/scripts/factory" -type f >&2
    false
  }
}

@test "decommission: no factory unit sources remain in the repo" {
  local leftovers
  leftovers="$(find "$REPO/scripts" -name 'factory.service' -o -name 'factory.timer' \
    -o -name 'factory-mcp.service' 2>/dev/null || true)"
  [ -z "$leftovers" ] || {
    echo "LEFTOVER factory unit sources:" >&2
    echo "$leftovers" >&2
    false
  }
}

# ── Guard 4: the shared DB migration path survives the rename ──────────

@test "decommission: scripts/migrate-db.mjs exists and is the migration entrypoint" {
  [ -f "$REPO/scripts/migrate-db.mjs" ] || {
    echo "MISSING scripts/migrate-db.mjs — factory:migrate/db:migrate would break" >&2
    false
  }
  run grep -q "'migrations'" "$REPO/scripts/migrate-db.mjs"
  [ "$status" -eq 0 ] || {
    echo "scripts/migrate-db.mjs no longer reads the migrations dir" >&2
    false
  }
}

# T900399: der api-inventory-Scanner las die toolList aus dem geloeschten
# scripts/factory/mcp-go/main.go und brach mit ENOENT ab, was
# `task freshness:regenerate` im Gate stoppte. Ein fehlender Pfad muss als
# "keine Tools" gelten, nicht als Fehler -- und der Generator muss laufen.
@test "decommission: api-inventory runs without the factory-mcp Go source" {
  local out="$BATS_TEST_TMPDIR/api-inventory.json"
  API_INVENTORY_OUT="$out" run node "$REPO/scripts/sdlc/api-inventory.mjs"
  [ "$status" -eq 0 ] || {
    echo "api-inventory.mjs fails without scripts/factory/mcp-go/main.go:" >&2
    echo "$output" >&2
    false
  }
  [ "$(jq '.factoryTools | length' "$out")" -eq 0 ]
}

@test "decommission: the DROP migration for the factory tables is committed" {
  [ -f "$REPO/scripts/migrations/2026-09-26-factory-decommission.sql" ] || {
    echo "MISSING scripts/migrations/2026-09-26-factory-decommission.sql" >&2
    false
  }
  run grep -qi 'DROP TABLE' "$REPO/scripts/migrations/2026-09-26-factory-decommission.sql"
  [ "$status" -eq 0 ] || {
    echo "decommission migration drops no tables" >&2
    false
  }
}

# ── Guard 5: registry + task wiring carry no factory entry ─────────────

@test "decommission: agent-guide registry has no factory-mcp or factory tooling entries" {
  local hits
  hits="$(grep -rn 'factory-mcp-node\|factory-dispatch\|factory-steuerung' \
    "$REPO/docs/agent-guide/registry/" 2>/dev/null || true)"
  [ -z "$hits" ] || {
    echo "LEFTOVER factory entries in docs/agent-guide/registry:" >&2
    echo "$hits" >&2
    false
  }
}

@test "decommission: Taskfile includes no factory taskfile" {
  run grep -n 'Taskfile.factory.yml' "$REPO/Taskfile.yml"
  [ "$status" -ne 0 ] || {
    echo "Taskfile.yml still includes the factory taskfile:" >&2
    echo "$output" >&2
    false
  }
}

@test "decommission: taskfiles/Taskfile.agents.yml has no factory-mcp tasks" {
  run grep -n 'factory-mcp' "$REPO/taskfiles/Taskfile.agents.yml"
  [ "$status" -ne 0 ] || {
    echo "taskfiles/Taskfile.agents.yml still references factory-mcp:" >&2
    echo "$output" >&2
    false
  }
}

# ── Guard 6: cockpit endpoints answer as decommissioned ────────────────

@test "decommission: cockpit factory-control endpoint reports decommissioning" {
  run grep -q 'factory_decommissioned' \
    "$REPO/components/website/src/pages/sdlc/api/factory-control.ts"
  [ "$status" -eq 0 ] || {
    echo "factory-control.ts does not report factory_decommissioned" >&2
    false
  }
}

@test "decommission: cockpit force-tick endpoint reports decommissioning" {
  run grep -q 'factory_decommissioned' \
    "$REPO/components/website/src/pages/sdlc/api/factory/force-tick.ts"
  [ "$status" -eq 0 ] || {
    echo "force-tick.ts does not report factory_decommissioned" >&2
    false
  }
}

@test "decommission: no cockpit endpoint reads the factory_control table" {
  # Comments may still name the retired table (that is the documentation of
  # *why* the endpoint no longer queries it) — only executable code matters.
  local hits
  hits="$(grep -rn 'factory_control' \
    "$REPO/components/website/src/pages/sdlc/api/" 2>/dev/null | grep -v '^\s*[^:]*:[0-9]*:\s*//' || true)"
  [ -z "$hits" ] || {
    echo "LEFTOVER factory_control DB access in the cockpit API:" >&2
    echo "$hits" >&2
    false
  }
}

@test "decommission: the website schema init no longer recreates factory_control" {
  # The DROP migration is only durable if no code path re-creates the table.
  run grep -q 'CREATE TABLE IF NOT EXISTS tickets.factory_control' \
    "$REPO/components/website/src/lib/tickets/tables/factory-control.ts"
  [ "$status" -ne 0 ] || {
    echo "website schema init still creates tickets.factory_control (undoes the DROP migration)" >&2
    false
  }
}

@test "decommission: the DROP migration keeps the devflow phase-event table" {
  run grep -qi 'DROP TABLE.*factory_phase_events' \
    "$REPO/scripts/migrations/2026-09-26-factory-decommission.sql"
  [ "$status" -ne 0 ] || {
    echo "decommission migration drops tickets.factory_phase_events — devflow still records phase events there" >&2
    false
  }
}

@test "decommission: ticket.sh exposes no factory-only subcommands" {
  for sub in unfactory factory-control dryrun-mark dryrun-check; do
    run grep -qE "^  ${sub}\)" "$REPO/scripts/ticket.sh"
    [ "$status" -ne 0 ] || {
      echo "ticket.sh still dispatches the removed subcommand: ${sub}" >&2
      false
    }
  done
}

@test "decommission: ticket.sh no longer queries the dropped factory tables" {
  # Comments may still name the retired tables (they document the removal).
  local hits
  hits="$(grep -nE 'tickets\.(factory_control|factory_run_budget|factory_model_slots)' \
    "$REPO/scripts/ticket.sh" | grep -vE '^[0-9]+:\s*#' || true)"
  [ -z "$hits" ] || {
    echo "ticket.sh still queries a dropped factory table:" >&2
    echo "$hits" >&2
    false
  }
}

@test "decommission: release-hold no longer nudges the removed factory.service" {
  run grep -q 'systemctl --user start.*factory\.service' "$REPO/scripts/ticket.sh"
  [ "$status" -ne 0 ] || {
    echo "ticket.sh release-hold still starts the decommissioned factory.service" >&2
    false
  }
}
