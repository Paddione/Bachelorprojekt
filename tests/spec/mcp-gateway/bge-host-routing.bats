#!/usr/bin/env bats
# tests/spec/mcp-gateway/bge-host-routing.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002551
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): QUELLTEXT/RENDER — hier
# greift die dokumentierte Ausnahme. Das gerenderte Deployment ist eine
# Konfigurationsdatei; sein Ergebnis manifestiert sich ausschliesslich in
# seinem Inhalt. Das Laufzeitverhalten (Env im Pod) setzt einen erreichbaren
# Cluster voraus und ist in der CI nicht deterministisch.
#
# Hintergrund: Der Shim importiert components/website/src/lib/bge-router.ts. Dessen
# resolveEndpoint('embed'|'rerank') liest LLM_EMBED_URL bzw. LLM_RERANKER_URL
# und wirft ohne Wert (fail-closed). Seit T002551 liefen die bge-Server als
# CPU-Deployments im Cluster (k3d/llm-gpu.yaml, Port 8081) und die Unit holte
# sie per kubectl port-forward auf 127.0.0.1. Seit T003205 zeigen beide URLs
# auf den llm-proxy (127.0.0.1:18235): dessen Rollen-Routen (/v1/embeddings,
# /v1/rerank) starten das lokale CPU-Loadout bei Bedarf und fallen auf die
# port-forwards zurueck — der Shim selbst kennt nur noch die Proxy-Adresse.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  ROUTER="$REPO/components/website/src/lib/bge-router.ts"
}
@test "llm-services-Deployment pinnt beide bge-Endpoint-URLs auf den Pod-lokalen llm-proxy (T900191, Nachfolger von T003205)" {
  # Ersetzt "unit pins both bge endpoint URLs to the llm-proxy": beide Werte
  # bleiben http://127.0.0.1:18235 (P1b rendert sie exakt so — bge-mcp und
  # llm-proxy laufen im selben Pod).
  # Abweichung vom Partial-Entwurf: dessen einzeiliges
  # `LLM_EMBED_URL[^#]*127.0.0.1:18235` matcht das reale Render NICHT (0/0 —
  # das Manifest schreibt `- name:`/`value:` auf getrennte Zeilen). Geprueft
  # wird deshalb das Wertepaar; ConfigMaps mit Cluster-DNS-URLs scheiden aus,
  # weil sie nie die `- name:`-Form tragen.
  local deploy_out urls
  deploy_out="$(bash "${REPO}/scripts/devmesh/render-stack.sh" core 2>/dev/null)" || skip "render-stack.sh Vorbedingung fehlt"
  for var in LLM_EMBED_URL LLM_RERANKER_URL; do
    urls="$(printf '%s\n' "$deploy_out" | grep -A1 -- "- name: ${var}" | grep 'value:' || true)"
    # Positiv-Anker: die Variable existiert ueberhaupt im Deployment-Stil.
    [ -n "$urls" ]
    # JEDE Deployment-Deklaration pinnt 127.0.0.1:18235 — damit ist zugleich
    # "kein Cluster-DNS" abgedeckt (der gestrichene Negativtest ist subsumiert).
    [ -z "$(printf '%s\n' "$urls" | grep -v '127\.0\.0\.1:18235' || true)" ]
  done
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
