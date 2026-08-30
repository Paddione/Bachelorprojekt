#!/usr/bin/env bash
# manifest-drift-check.sh — compare declared manifests with the live cluster.
# Usage: bash scripts/lib/manifest-drift-check.sh <replicas|probes|sealed>
# Prints an integer, or '-' when the live basis cannot be obtained.
set -o pipefail

MODE="${1:-replicas}"
CTX="${HG_OPS_CTX:-fleet}"
NS="${HG_OPS_NS:-workspace}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo '-'; exit 0; }

case "$MODE" in
  replicas|probes) resource=deployments ;;
  sealed) resource=sealedsecrets ;;
  *) echo "unbekannter Modus: $MODE" >&2; exit 2 ;;
esac

# HG_DRIFT_INPUT is intentionally only a test seam. Production always reads
# from the selected fleet context.
MODE="$MODE" ROOT="$ROOT" RESOURCE="$resource" NS="$NS" CTX="$CTX" python3 - <<'PY' 2>/dev/null || echo '-'
import json, os, subprocess
from pathlib import Path

mode, root = os.environ["MODE"], os.environ["ROOT"]
fixture = os.environ.get("HG_DRIFT_INPUT")
if fixture:
    with open(fixture, encoding="utf-8") as handle:
        live = json.load(handle)
else:
    command = ["kubectl", "get", os.environ["RESOURCE"]]
    command += ["-A"] if mode == "sealed" else ["-n", os.environ["NS"]]
    command += ["--context", os.environ["CTX"], "-o", "json"]
    raw = subprocess.check_output(command, stderr=subprocess.DEVNULL)
    live = json.loads(raw)
items = live.get("items") or []
if not items:
    raise ValueError("empty live basis")

if mode == "sealed":
    print(sum(
        any(c.get("type") == "Unsealed" and c.get("status") != "True"
            for c in (item.get("status", {}).get("conditions") or []))
        for item in items
    ))
    raise SystemExit

import yaml
expected = {}
for path in Path(root, "k3d").rglob("*.yaml"):
    if path.name.endswith("-rendered.yaml"):
        continue
    try:
        for doc in yaml.safe_load_all(path.read_text(encoding="utf-8")):
            if not isinstance(doc, dict) or doc.get("kind") != "Deployment":
                continue
            name = (doc.get("metadata") or {}).get("name")
            if name and "${" not in name:
                expected[name] = doc.get("spec") or {}
    except (OSError, yaml.YAMLError):
        continue
if not expected:
    raise ValueError("no manifest basis")

live_by_name = {item.get("metadata", {}).get("name"): item for item in items}
drift = 0
for name, spec in expected.items():
    item = live_by_name.get(name)
    if item is None:
        continue
    live_spec = item.get("spec") or {}
    if mode == "replicas":
        drift += spec.get("replicas", 1) != live_spec.get("replicas", 1)
        continue
    declared = {c.get("name"): (bool(c.get("readinessProbe")), bool(c.get("livenessProbe")))
                for c in ((spec.get("template", {}).get("spec", {}).get("containers")) or [])}
    actual = {c.get("name"): (bool(c.get("readinessProbe")), bool(c.get("livenessProbe")))
              for c in ((live_spec.get("template", {}).get("spec", {}).get("containers")) or [])}
    drift += declared != actual
print(drift)
PY
