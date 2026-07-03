#!/usr/bin/env bats
# SSOT: openspec/changes/img02-image-drift/ (planned)
# G-IMG02: Fremd-Image-Versions-Drift — 0 Drift-Familien über alle k3d/ und
# prod*/ Manifeste. Drift = dieselbe Image-Familie in ≥ 2 unterschiedlichen Tags
# (ohne @sha256-Digest).
#
# Strategie:
#   - Pro Familie (busybox, curl, k8s-sidecar, …) wird der "kanonische" Tag
#     als Single-Source-of-Truth definiert.
#   - Alle anderen Tags dieser Familie sind Drift und führen zum Test-Fail.
#   - Helm-rendered Dateien (kube-prometheus-stack-rendered.yaml,
#     loki-rendered.yaml, promtail-rendered.yaml) sind deterministisch aus
#     dem Upstream-Chart → werden ausgeschlossen.
#
# Aktuelle kanonische Pins (2026-07-03):
#   busybox:1.38.0
#   curlimages/curl:8.7.1   (zusätzlich: 8.7.1@sha256:… bleibt erlaubt)
#   kiwigrid/k8s-sidecar:2.7.3   (nur in helm-rendered; derzeit ausgeschlossen)

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-IMG02: keine busybox Drift-Tags (außer 1.38.0) in hand-editierten Manifesten" {
  drift=$(grep -rhE 'image:[[:space:]]+["'"'"']?busybox:' \
    "$REPO_ROOT/k3d/" "$REPO_ROOT/prod/" "$REPO_ROOT/prod-korczewski/" 2>/dev/null \
    | grep -vE 'busybox:1\.38\.0(@sha256|\s|$|")' \
    | grep -vE 'kube-prometheus-stack-rendered|loki-rendered|promtail-rendered' \
    | wc -l)
  [ "$drift" -eq 0 ]
}

@test "G-IMG02: keine curlimages/curl Drift-Tags (außer 8.7.1 + sha256-Pin) in hand-editierten Manifesten" {
  drift=$(grep -rhE 'image:[[:space:]]+["'"'"']?curlimages/curl:' \
    "$REPO_ROOT/k3d/" "$REPO_ROOT/prod/" "$REPO_ROOT/prod-korczewski/" 2>/dev/null \
    | grep -vE 'curlimages/curl:8\.7\.1(@sha256|\s|$|")' \
    | wc -l)
  [ "$drift" -eq 0 ]
}

@test "G-IMG02: busybox Drift-Familie: 0 (≤ 1 kanonischer Tag in hand-editierten Manifesten)" {
  refs=$(grep -rhE 'image:[[:space:]]+["'"'"']?busybox:' \
    "$REPO_ROOT/k3d/" "$REPO_ROOT/prod/" "$REPO_ROOT/prod-korczewski/" 2>/dev/null \
    | grep -vE 'kube-prometheus-stack-rendered|loki-rendered|promtail-rendered' \
    | sed -E 's/.*image:[[:space:]]*//; s/["'"'"']//g; s/[[:space:]]*#.*//; s/@sha256.*//' \
    | sort -u)
  count=$(echo -n "$refs" | grep -c .)
  [ "$count" -le 1 ]
}

@test "G-IMG02: curlimages/curl Drift-Familie: 0 (≤ 1 kanonischer Tag in hand-editierten Manifesten)" {
  refs=$(grep -rhE 'image:[[:space:]]+["'"'"']?curlimages/curl:' \
    "$REPO_ROOT/k3d/" "$REPO_ROOT/prod/" "$REPO_ROOT/prod-korczewski/" 2>/dev/null \
    | sed -E 's/.*image:[[:space:]]*//; s/["'"'"']//g; s/[[:space:]]*#.*//; s/@sha256.*//' \
    | sort -u)
  count=$(echo -n "$refs" | grep -c .)
  [ "$count" -le 1 ]
}
