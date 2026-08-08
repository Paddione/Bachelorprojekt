#!/usr/bin/env bats

setup() {
  PROJECT_DIR="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  RENDER_SCRIPT="${PROJECT_DIR}/scripts/flux-render-artifact.sh"
}

@test "T002706: website overlay pins image by digest in rendered manifest" {
  local out_dir
  out_dir="$(mktemp -d)"
  export WEBSITE_IMAGE_DIGEST="sha256:1111111111111111111111111111111111111111111111111111111111111111"
  export BRETT_IMAGE_DIGEST="sha256:2222222222222222222222222222222222222222222222222222222222222222"

  bash "$RENDER_SCRIPT" --out "$out_dir"

  # Verify positive anchor: @sha256: is present
  run grep -r "@sha256:" "$out_dir"
  [ "$status" -eq 0 ]

  # Verify negative anchor: no website or workspace-brett image ends in :latest in prod overlays
  for dir in website-mentolder website-korczewski mentolder korczewski; do
    if [ -f "$out_dir/$dir/$dir.yaml" ]; then
      run grep -E 'image: ghcr\.io/paddione/(website|workspace-brett):latest' "$out_dir/$dir/$dir.yaml"
      [ "$status" -ne 0 ]
    fi
  done

  rm -rf "$out_dir"
}

@test "T002706: brett overlay pins image by digest in rendered manifest" {
  local out_dir
  out_dir="$(mktemp -d)"
  export WEBSITE_IMAGE_DIGEST="sha256:1111111111111111111111111111111111111111111111111111111111111111"
  export BRETT_IMAGE_DIGEST="sha256:2222222222222222222222222222222222222222222222222222222222222222"

  bash "$RENDER_SCRIPT" --out "$out_dir"

  # Verify BRETT digest reaches rendered mentolder manifest
  run grep -q "sha256:2222222222222222222222222222222222222222222222222222222222222222" "$out_dir/mentolder/mentolder.yaml"
  [ "$status" -eq 0 ]

  rm -rf "$out_dir"
}
