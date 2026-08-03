#!/usr/bin/env bats
# tests/spec/llm-pipeline/bge-usecase-reachability.bats
# SSOT: openspec/specs/llm-pipeline.md
# Ticket: T002604
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert fuer die
# Manifest-Teile — geprueft wird der Output von `kubectl kustomize k3d/`, nicht
# der Quelltext der Einzeldateien. Damit faellt der Test auch dann rot aus, wenn
# eine Ressource zwar in einer Datei steht, aber nicht in die Kustomization
# aufgenommen wurde. Fuer die systemd-Unit ist Source-Pruefung die Ausnahme nach
# T002448-M4: die Unit-Datei IST das Deliverable, ihr Laufzeitverhalten setzt
# einen erreichbaren Cluster voraus und waere in CI nicht deterministisch.
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

# --- F3: bge-mcp Port-Forwards unter systemd-Aufsicht -------------------------

@test "bge-mcp: die Unit startet keine Port-Forwards als unbeaufsichtigte Hintergrundjobs" {
  unit="${REPO_ROOT}/scripts/bge-mcp/bge-mcp.service"
  [ -f "$unit" ]

  # Positiv-Anker: die Unit startet ueberhaupt den Shim.
  grep -q 'bge-mcp/server.mjs' "$unit"

  # Der Defekt: `kubectl port-forward ... &` im ExecStart. systemd ueberwacht nur
  # den Vordergrundprozess; sterben die Forwards, meldet die Unit weiter active
  # und jeder Tool-Call scheitert mit "fetch failed".
  run grep -c 'port-forward.*&' "$unit"
  [ "$output" = "0" ]
}

@test "bge-mcp: fuer jede Rolle existiert eine eigene, neustartende Port-Forward-Unit" {
  dir="${REPO_ROOT}/scripts/bge-mcp"
  [ -d "$dir" ]

  for role in embed rerank; do
    unit="${dir}/bge-forward-${role}.service"
    [ -f "$unit" ]

    # Positiv-Anker: die Unit forwarded wirklich den passenden Service.
    grep -q "svc/llm-gateway-${role}" "$unit"

    # Der eigentliche Punkt: sie muss sich selbst heilen. Ohne Restart= bliebe
    # genau der Zustand vom 2026-08-03 bestehen (Forwards tot, Unit active).
    grep -qE '^Restart=always' "$unit"
  done

  # Der Shim darf erst starten, wenn die Forwards da sind, und mit ihnen fallen.
  grep -qE '^(Requires|BindsTo)=.*bge-forward-embed\.service' "${dir}/bge-mcp.service"
  grep -qE '^(Requires|BindsTo)=.*bge-forward-rerank\.service' "${dir}/bge-mcp.service"
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
