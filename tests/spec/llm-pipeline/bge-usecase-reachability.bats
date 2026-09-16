#!/usr/bin/env bats
# tests/spec/llm-pipeline/bge-usecase-reachability.bats
# SSOT: openspec/specs/llm-pipeline.md
# Ticket: T002604
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert fuer die
# Manifest-Teile — geprueft wird der Output von `kubectl kustomize k3d/` bzw.
# `kubectl kustomize dev-local/core`, nicht der Quelltext der Einzeldateien.
# Damit faellt der Test auch dann rot aus, wenn eine Ressource zwar in einer
# Datei steht, aber nicht in die Kustomization aufgenommen wurde.
# T900191/D7: die fruehere Source-Ausnahme fuer die bge-mcp-systemd-Unit ist
# entfallen — die Unit existiert nicht mehr, F3 prueft das gerenderte Deployment.
#
# HINTERGRUND — am 2026-08-03 live gemessen, Cluster fleet:
#
#   ns workspace  -> llm-gateway-embed:8081   HTTP 200 (684ms)
#   ns website    -> llm-gateway-embed:8081   ECONNREFUSED (182ms)
#
# DNS loeste in beiden Faellen korrekt auf 10.43.42.200 auf. Der Unterschied ist
# die NetworkPolicy: ns workspace faehrt default-deny-ingress und traegt
# Ausnahmen allow-website-to-{brain,docuseal,keycloak,nextcloud,pocket-id,
# shared-db,vaultwarden}-ingress — aber keine fuer bge. Bei der Migration der
# bge-Server vom WSL-Host in den Cluster (T002551) wurde die Ausnahme vergessen.
# Wirkung: die Website erreicht weder Embedding noch Reranking, bge-router.ts ist
# fail-closed, alle /api/bge/*-Endpunkte liefern 503.
#
# ECONNREFUSED statt TIMEOUT ist dabei die Signatur: k3s' eingebautes kube-router
# setzt bei Policy-Verstoss ein aktives REJECT, kein DROP.
#
# ZWEITER BEFUND — bge-embed-7cf55557c9-fhvzl steckte 155min in Init:0/1. Das
# VolumeAttachment der ReadWriteOnce-Longhorn-PVC haengt an pk-hetzner-8 (alter
# Pod), der neue Pod war auf pk-hetzner-6 geschedult. Ein Deployment mit
# RWO-PVC und RollingUpdate/maxSurge kann seinen eigenen Rollout nicht
# abschliessen — der neue Pod wartet auf ein Attach, das erst frei wird, wenn
# der alte weicht. `strategy.type: Recreate` ist bei RWO die einzige korrekte
# Wahl. bge-rerank trug dasselbe Muster und war nur zufaellig noch nicht
# haengengeblieben.
#
# Jeder Negativtest traegt einen Positiv-Anker im selben @test (T002356-M1):
# ohne ihn bestuende der Test vakuos, sobald das Rendering leer bleibt.

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
  RENDERED="${BATS_FILE_TMPDIR}/k3d-rendered.yaml"
  export RENDERED
  kubectl kustomize "${REPO_ROOT}/k3d" > "${RENDERED}" 2>/dev/null || true
}

# --- F1: NetworkPolicy-Ausnahmen fuer bge ------------------------------------

@test "bge: gerendertes k3d-Manifest traegt Ingress-Ausnahmen fuer embed und rerank aus dem website-Namespace" {
  [ -s "${RENDERED}" ]

  # Positiv-Anker: das Muster existiert bereits fuer brain (T002465). Faellt es
  # weg, ist das Rendering kaputt und die Negativ-Aussage unten waere vakuos.
  run yq eval-all 'select(.kind == "NetworkPolicy") | .metadata.name' "${RENDERED}"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'allow-website-to-brain-ingress'

  echo "$output" | grep -qx 'allow-website-to-bge-embed-ingress'
  echo "$output" | grep -qx 'allow-website-to-bge-rerank-ingress'
}

@test "bge: die Ingress-Ausnahmen adressieren den Pod-Port 8080, nicht den Service-Port 8081" {
  [ -s "${RENDERED}" ]

  for role in embed rerank; do
    # Positiv-Anker: podSelector trifft das richtige Deployment. Ohne diesen
    # Check wuerde eine Policy mit falschem Selektor die Port-Aussage bestehen.
    run yq eval-all \
      "select(.kind == \"NetworkPolicy\" and .metadata.name == \"allow-website-to-bge-${role}-ingress\") | .spec.podSelector.matchLabels.app" \
      "${RENDERED}"
    [ "$status" -eq 0 ]
    [ "$output" = "bge-${role}" ]

    run yq eval-all \
      "select(.kind == \"NetworkPolicy\" and .metadata.name == \"allow-website-to-bge-${role}-ingress\") | .spec.ingress[0].ports[0].port" \
      "${RENDERED}"
    [ "$status" -eq 0 ]
    [ "$output" = "8080" ]
  done
}

# --- F2: Recreate-Strategie bei ReadWriteOnce --------------------------------

@test "bge: Deployments mit ReadWriteOnce-PVC nutzen strategy Recreate statt RollingUpdate" {
  [ -s "${RENDERED}" ]

  for role in embed rerank; do
    # Positiv-Anker: das Deployment existiert ueberhaupt im Rendering.
    run yq eval-all \
      "select(.kind == \"Deployment\" and .metadata.name == \"bge-${role}\") | .metadata.name" \
      "${RENDERED}"
    [ "$status" -eq 0 ]
    [ "$output" = "bge-${role}" ]

    # Positiv-Anker: die zugehoerige PVC ist tatsaechlich RWO — nur dann ist
    # Recreate ueberhaupt die richtige Forderung.
    run yq eval-all \
      "select(.kind == \"PersistentVolumeClaim\" and .metadata.name == \"bge-${role}-models\") | .spec.accessModes[0]" \
      "${RENDERED}"
    [ "$status" -eq 0 ]
    [ "$output" = "ReadWriteOnce" ]

    run yq eval-all \
      "select(.kind == \"Deployment\" and .metadata.name == \"bge-${role}\") | .spec.strategy.type" \
      "${RENDERED}"
    [ "$status" -eq 0 ]
    [ "$output" = "Recreate" ]
  done
}

# --- F3: bge-mcp Port-Forwards unter devmesh-Aufsicht (T900191) -----------------
# Nachfolger der geloeschten systemd-Aufsicht: bge-mcp laeuft als
# Supervisor-Kind im llm-services-Pod (MCP_NODE_SERVICES); Port-Forwards als
# unbeaufsichtigte Hintergrundjobs (`port-forward ... &`) haben im Deployment
# nichts verloren. Geprueft wird das gerenderte dev-local/core (ERGEBNIS,
# keine Unit-Quelle mehr).

@test "bge-mcp: laeuft als Supervisor-Kind im llm-services-Deployment, kein Hintergrundjob (T900191, Nachfolger F3)" {
  local deploy_out
  deploy_out="$(kubectl kustomize --load-restrictor=LoadRestrictionsNone "${REPO_ROOT}/dev-local/core" 2>/dev/null)" || skip "kubectl kustomize Vorbedingung fehlt"
  echo "$deploy_out" | grep -qF 'MCP_NODE_SERVICES'
  echo "$deploy_out" | grep -qF 'bge-mcp'
  amp="$(echo "$deploy_out" | grep -cE 'port-forward.*&' || true)"
  [ "$amp" -eq 0 ]
}


# --- F5: Diagnosefaehigkeit des Shims ----------------------------------------

@test "bge-mcp: ein fehlgeschlagener Upstream-Aufruf nennt Rolle und Ziel-URL" {
  server="${REPO_ROOT}/scripts/bge-mcp/server.mjs"
  [ -f "$server" ]

  # Positiv-Anker: der Shim behandelt Upstream-Fehler ueberhaupt.
  grep -q 'isError' "$server"

  # Am 2026-08-03 lautete die gesamte Fehlermeldung "fetch failed" — ohne Rolle,
  # ohne Ziel. Die Diagnose kostete dadurch mehrere Schritte.
  run node -e '
    const { readFileSync } = require("node:fs");
    const src = readFileSync(process.argv[1], "utf8");
    // Die Fehlerantwort muss die aufgeloeste Zieladresse mitfuehren.
    process.stdout.write(/upstream/i.test(src) && /\$\{\s*url\s*\}|\$\{\s*endpoint\s*\}|\$\{\s*target\s*\}/.test(src) ? "ok" : "missing");
  ' "$server"
  [ "$output" = "ok" ]
}
