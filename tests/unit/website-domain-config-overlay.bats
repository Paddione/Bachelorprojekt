#!/usr/bin/env bats
# Regression: die website-Namespace muss die domain-config ConfigMap deklarativ
# im Overlay tragen — sonst bricht ein frischer `task website:deploy ENV=<brand>`
# mit CreateContainerConfigError, weil k3d/website.yaml MEDIAVIEWER_HOST per
# required configMapKeyRef aus `domain-config` bezieht, die in der website-ns
# (ohne dieses Overlay) gar nicht existiert. So live-gefixt bei PR #1735.
#
# Komplementär zu tests/unit/mediaviewer-host-durability.bats:
#   - mediaviewer-host-durability.bats schützt den WORKSPACE-ns-Pfad
#     (prod/configmap-domains.yaml + dessen envsubst).
#   - DIESER Guard schützt den WEBSITE-ns-Pfad (geteilte Overlay-ConfigMap).
# Keine Überschneidung. Rein offline (grep), keine Cluster-Calls.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  WEBSITE="$REPO_ROOT/k3d/website.yaml"
  SHARED_CM="$REPO_ROOT/prod-fleet/website-common/domain-config.yaml"
  PROD_DOMAINS="$REPO_ROOT/prod/configmap-domains.yaml"
  KUST_MENTOLDER="$REPO_ROOT/prod-fleet/website-mentolder/kustomization.yaml"
  KUST_KORCZEWSKI="$REPO_ROOT/prod-fleet/website-korczewski/kustomization.yaml"
}

@test "shared website domain-config ConfigMap file exists" {
  [ -f "$SHARED_CM" ]
}

@test "shared domain-config is named 'domain-config' (matches configMapKeyRef name)" {
  run grep -qE '^[[:space:]]*name:[[:space:]]*domain-config[[:space:]]*$' "$SHARED_CM"
  [ "$status" -eq 0 ]
}

@test "shared domain-config carries NO metadata.namespace (overlay re-namespaces it)" {
  # Ein hartes namespace: hier würde das brand-korrekte Re-Namespacing brechen.
  run grep -qE '^[[:space:]]*namespace:' "$SHARED_CM"
  [ "$status" -ne 0 ]
}

@test "parity: every domain-config configMapKeyRef key in website.yaml is in the shared ConfigMap" {
  # Extrahiere alle keys, die k3d/website.yaml via configMapKeyRef aus domain-config zieht.
  # Heuristik (offline, ohne yaml-Parser): finde Blöcke 'name: domain-config' gefolgt von
  # 'key: <KEY>' im selben valueFrom.configMapKeyRef. Wir lesen alle 'key:' Zeilen, die
  # in einem configMapKeyRef-Block mit name: domain-config stehen.
  keys="$(awk '
    /configMapKeyRef:/ { in_ref=1; name=""; next }
    in_ref && /name:[[:space:]]*domain-config/ { name="domain-config"; next }
    in_ref && /key:/ {
      if (name=="domain-config") { gsub(/^[[:space:]]*key:[[:space:]]*/,""); gsub(/[[:space:]]*$/,""); print }
      in_ref=0; name=""; next
    }
    in_ref && /name:/ { name=""; }   # ein anderer ConfigMap-name → kein domain-config-key
  ' "$WEBSITE")"
  [ -n "$keys" ]   # mindestens MEDIAVIEWER_HOST muss gefunden werden
  while IFS= read -r k; do
    [ -z "$k" ] && continue
    run grep -qE "^[[:space:]]+${k}:" "$SHARED_CM"
    [ "$status" -eq 0 ] || { echo "FEHLT in shared domain-config: $k"; false; }
  done <<< "$keys"
}

@test "presence: mentolder overlay references the shared domain-config" {
  run grep -qF '../website-common/domain-config.yaml' "$KUST_MENTOLDER"
  [ "$status" -eq 0 ]
}

@test "presence: korczewski overlay references the shared domain-config" {
  run grep -qF '../website-common/domain-config.yaml' "$KUST_KORCZEWSKI"
  [ "$status" -eq 0 ]
}

@test "drift: shared MEDIAVIEWER_HOST expression equals prod/configmap-domains.yaml" {
  shared="$(grep -E '^[[:space:]]+MEDIAVIEWER_HOST:' "$SHARED_CM" | tr -s ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  prod="$(grep -E '^[[:space:]]+MEDIAVIEWER_HOST:' "$PROD_DOMAINS" | tr -s ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -n "$shared" ]
  [ "$shared" = "$prod" ]
}

@test "MEDIAVIEWER_HOST derives from \${PROD_DOMAIN} (no hardcoded brand domain, S3)" {
  run grep -qE '^[[:space:]]+MEDIAVIEWER_HOST:[[:space:]]*"mediaviewer\.\$\{PROD_DOMAIN\}"' "$SHARED_CM"
  [ "$status" -eq 0 ]
}
