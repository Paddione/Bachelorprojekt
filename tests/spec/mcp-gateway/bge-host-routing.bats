#!/usr/bin/env bats
# tests/spec/mcp-gateway/bge-host-routing.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002551
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): QUELLTEXT — hier greift die
# dokumentierte Ausnahme. Die systemd-Unit ist eine Konfigurationsdatei; ihr
# Ergebnis manifestiert sich ausschliesslich in ihrem Inhalt. Das Laufzeit-
# verhalten (`systemctl --user show bge-mcp -p Environment`) haengt am
# installierten Host-Zustand und ist in der CI nicht reproduzierbar.
#
# Hintergrund: Der Shim importiert website/src/lib/bge-router.ts. Dessen
# resolveEndpoint('embed'|'rerank') liest LLM_EMBED_URL bzw. LLM_RERANKER_URL
# und wirft ohne Wert (fail-closed). Seit T002551 liefen die bge-Server als
# CPU-Deployments im Cluster (k3d/llm-gpu.yaml, Port 8081) und die Unit holte
# sie per kubectl port-forward auf 127.0.0.1. Seit T003205 zeigen beide URLs
# auf den llm-proxy (127.0.0.1:18235): dessen Rollen-Routen (/v1/embeddings,
# /v1/rerank) starten das lokale CPU-Loadout bei Bedarf und fallen auf die
# port-forwards zurueck — der Shim selbst kennt nur noch die Proxy-Adresse.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  UNIT="$REPO/scripts/bge-mcp/bge-mcp.service"
  ROUTER="$REPO/website/src/lib/bge-router.ts"
}

@test "bge-mcp unit exists" {
  [ -f "$UNIT" ]
}

@test "unit pins both bge endpoint URLs to the llm-proxy" {
  # Positiv-Anker: beide Variablen, die bge-router.ts liest, zeigen auf
  # 127.0.0.1 — seit T003205 auf den llm-proxy :18235, dessen Rollen-Routen
  # das lokale Loadout starten und auf die Cluster-Forwards zurueckfallen.
  # 8093 statt 8082 (T002565): Port 8082 ist auf dem GPU-Host von einem
  # Windows-svchost belegt (networkingMode=mirrored, in WSL selbst mit
  # ss/lsof unsichtbar, nur ueber netstat.exe von der Windows-Seite sichtbar).
  run grep -c "^Environment=LLM_EMBED_URL=http://127\.0\.0\.1:18235$" "$UNIT"
  echo "LLM_EMBED_URL -> $output"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  run grep -c "^Environment=LLM_RERANKER_URL=http://127\.0\.0\.1:18235$" "$UNIT"
  echo "LLM_RERANKER_URL -> $output"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "unit variable names match the env keys the router actually reads" {
  # Ein Tippfehler im Variablennamen waere sonst unsichtbar: der Router wuerde
  # ohne Wert fail-closed — aber mit laengerem Diagnose-Weg. Der Abgleich mit
  # process.env.* verankert den Namen an der echten Lese-Stelle.
  for var in LLM_EMBED_URL LLM_RERANKER_URL; do
    run grep -c "process\.env\.${var}" "$ROUTER"
    echo "router knows $var -> $output"
    [ "$status" -eq 0 ]
    [ "$output" -ge 1 ]
  done
}

@test "unit pins no cluster DNS name — those are unresolvable from the host" {
  # Positiv-Anker zuerst: die Unit deklariert ueberhaupt Environment-Zeilen.
  run grep -c '^Environment=' "$UNIT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]

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
