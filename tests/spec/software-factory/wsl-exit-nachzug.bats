#!/usr/bin/env bats
# T900054 - wsl-exit-nachzug
# Prueft, dass die WSL-Herkunftsannahmen aus den SSOT-Dateien entfernt wurden.
# Querschnittstest (grep auf Quelldateien) - output verification gegen Dateistruktur.
# Testnamen bewusst ASCII: Umlaute brechen den bats-Runner unter Windows
# ("bats: unknown test name") und die Faelle laufen dann still nicht.

setup() {
  REPO_ROOT="$(git rev-parse --show-toplevel)"
}

# 1. Keine k3d-dev Kontexte mehr in CLAUDE.md
@test "CLAUDE.md nennt keine k3d-dev-Kontexte" {
  local f="$REPO_ROOT/CLAUDE.md"
  # Positiv-Anker: die Datei ist die erwartete, nicht eine leere/fehlende
  grep -q 'Cluster Topology' "$f"
  run grep -c 'k3d-mentolder-dev\|k3d-korczewski-dev' "$f"
  [ "$output" -eq 0 ]
}

# 2. Keine "aus WSL bedient"-Zeichenkette in capabilities.yaml
@test "capabilities.yaml nennt kein 'aus WSL bedient'" {
  local f="$REPO_ROOT/docs/agent-guide/registry/capabilities.yaml"
  grep -q 'capabilities:' "$f"
  run grep -c 'aus WSL bedient' "$f"
  [ "$output" -eq 0 ]
}

# 3. Kein "WSL GPU host" in components.yaml
@test "components.yaml nennt keinen 'WSL GPU host'" {
  local f="$REPO_ROOT/docs/agent-guide/registry/components.yaml"
  grep -q '^- slug:' "$f"
  run grep -c 'WSL GPU host' "$f"
  [ "$output" -eq 0 ]
}

# 4. ADR-007 nennt den Docker-Desktop-Beschluss und die verworfene Hyper-V-Alternative
@test "ADR-Datei nennt den Docker-Desktop-Beschluss und Hyper-V" {
  local f="$REPO_ROOT/docs/adr/ADR-007-wsl-exit-fleet-native.md"
  grep -q 'Docker Desktop' "$f"
  grep -q 'Hyper-V' "$f"
}

# 5. Runbook remote-docker-context.md existiert
@test "Runbook remote-docker-context.md existiert" {
  [ -f "$REPO_ROOT/docs/runbooks/remote-docker-context.md" ]
  grep -q 'docker context create' "$REPO_ROOT/docs/runbooks/remote-docker-context.md"
}

# 6. Vier tote Units sind geloescht
@test "Die vier toten .service-Files existieren nicht" {
  # Positiv-Anker: die Nachbarverzeichnisse existieren weiterhin
  [ -d "$REPO_ROOT/scripts/mcp-gateway" ]
  for f in \
    "scripts/llm-proxy/llm-proxy.service" \
    "scripts/llm-proxy/llm-proxy-lan.service" \
    "scripts/dev-host-units/k3d-dev-ingress-bridge@.service" \
    "scripts/mcp-gateway/k3d-postgres-forward.service"; do
    [ ! -f "$REPO_ROOT/$f" ]
  done
}

# 7. Jede verbliebene .service/.timer unter scripts/ hat # Status: in ersten 15 Zeilen
@test "Verbliebene .service/.timer tragen eine # Status: Kopfzeile" {
  local missing=() found=0 file header
  while IFS= read -r file; do
    found=$((found + 1))
    header="$(head -15 "$file" 2>/dev/null || true)"
    if ! printf '%s\n' "$header" | grep -q '# Status:'; then
      missing+=("$file")
    fi
  done < <(find "$REPO_ROOT/scripts" \( -name '*.service' -o -name '*.timer' \) 2>/dev/null)
  # Positiv-Anker: der find-Lauf hat ueberhaupt Units gesehen
  [ "$found" -gt 0 ]
  if [ ${#missing[@]} -gt 0 ]; then
    printf 'Fehlende "# Status:" Kopfzeile: %s\n' "${missing[*]}" >&2
    return 1
  fi
}
