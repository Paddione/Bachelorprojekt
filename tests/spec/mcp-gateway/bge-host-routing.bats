#!/usr/bin/env bats
# tests/spec/mcp-gateway/bge-host-routing.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002488
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): QUELLTEXT — hier greift die
# dokumentierte Ausnahme. Die systemd-Unit ist eine Konfigurationsdatei; ihr
# Ergebnis manifestiert sich ausschliesslich in ihrem Inhalt. Das Laufzeit-
# verhalten (`systemctl --user show bge-mcp -p Environment`) haengt am
# installierten Host-Zustand und ist in der CI nicht reproduzierbar.
#
# Hintergrund: Der Shim importiert website/src/lib/bge-router.ts. Dessen
# DEFAULTS zeigen auf Cluster-DNS (*.workspace.svc.cluster.local) — korrekt fuer
# einen Pod, falsch fuer den Host-Prozess, wo der Name nicht aufloesbar ist.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  UNIT="$REPO/scripts/bge-mcp/bge-mcp.service"
  ROUTER="$REPO/website/src/lib/bge-router.ts"
}

@test "bge-mcp unit exists" {
  [ -f "$UNIT" ]
}

@test "unit pins all four bge pair URLs to localhost" {
  # Positiv-Anker: alle vier Variablen, die bge-router.ts als ENV_KEYS liest.
  for var in LLM_EMBED_URL LLM_RERANKER_URL LLM_EMBED_BATCH_URL LLM_RERANKER_BATCH_URL; do
    run grep -c "^Environment=${var}=http://127\.0\.0\.1:" "$UNIT"
    echo "$var -> $output"
    [ "$status" -eq 0 ]
    [ "$output" -ge 1 ]
  done
}

@test "unit variable names match the ENV_KEYS the router actually reads" {
  # Ein Tippfehler im Variablennamen waere sonst unsichtbar: der Router faellt
  # still auf seine Cluster-Defaults zurueck, ohne dass irgendetwas meldet.
  for var in LLM_EMBED_URL LLM_RERANKER_URL LLM_EMBED_BATCH_URL LLM_RERANKER_BATCH_URL; do
    run grep -c "'${var}'" "$ROUTER"
    echo "router knows $var -> $output"
    [ "$status" -eq 0 ]
    [ "$output" -ge 1 ]
  done
}

@test "unit pins no cluster DNS name — those are unresolvable from the host" {
  # Positiv-Anker zuerst: die Unit deklariert ueberhaupt Environment-Zeilen.
  run grep -c '^Environment=' "$UNIT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 4 ]

  # Negativ-Aussage: keine AKTIVE Zeile zeigt in den Cluster. Bewusst auf
  # '^Environment=' verankert — der Kommentarblock darueber nennt den
  # Cluster-DNS-Namen absichtlich, um zu erklaeren, wogegen hier gepinnt wird.
  # Ein unverankertes grep wuerde genau diese Erklaerung als Verstoss werten.
  run grep -c '^Environment=.*svc\.cluster\.local' "$UNIT"
  [ "$output" -eq 0 ]
}

@test "EnvironmentFile comes after Environment so local overrides win" {
  # Reihenfolge ist semantisch: systemd laesst die spaetere Deklaration gewinnen.
  # Stuende EnvironmentFile oben, wuerden die Unit-Defaults den Token und jeden
  # lokalen Override aus server.env ueberschreiben.
  local env_line file_line
  env_line="$(grep -n '^Environment=LLM_EMBED_URL' "$UNIT" | head -1 | cut -d: -f1)"
  file_line="$(grep -n '^EnvironmentFile=' "$UNIT" | head -1 | cut -d: -f1)"
  echo "Environment=@$env_line EnvironmentFile=@$file_line"
  [ -n "$env_line" ]
  [ -n "$file_line" ]
  [ "$file_line" -gt "$env_line" ]
}
