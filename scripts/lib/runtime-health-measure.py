#!/usr/bin/env python3
"""Fail-closed, fixture-friendly runtime health measurements."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.parse
import urllib.request

BRANDS = {"mentolder", "korczewski"}
PROD_NAMESPACES = {"workspace", "workspace-korczewski"}


def unavailable():
    print("-")
    return 0


def load_json(path):
    if path:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    return None


def prometheus(query):
    base = os.environ.get("HG_PROMETHEUS_URL")
    if not base:
        raise RuntimeError("HG_PROMETHEUS_URL missing")
    url = f"{base.rstrip('/')}/api/v1/query?{urllib.parse.urlencode({'query': query})}"
    with urllib.request.urlopen(url, timeout=15) as response:
        return json.load(response)


def vector(data):
    if data.get("status") != "success" or data.get("data", {}).get("resultType") != "vector":
        raise ValueError("invalid Prometheus response")
    return data["data"].get("result", [])


def flux(data):
    if data is None:
        raw = subprocess.check_output(
            ["kubectl", "get", "kustomizations.kustomize.toolkit.fluxcd.io,gitrepositories.source.toolkit.fluxcd.io,ocirepositories.source.toolkit.fluxcd.io,helmrepositories.source.toolkit.fluxcd.io,buckets.source.toolkit.fluxcd.io,helmcharts.source.toolkit.fluxcd.io", "-A", "--context", os.environ.get("HG_OPS_CTX", "fleet"), "--request-timeout=15s", "-o", "json"],
            stderr=subprocess.DEVNULL,
        )
        data = json.loads(raw)
    items = data.get("items")
    if not items:
        raise ValueError("empty Flux basis")
    bad = 0
    for item in items:
        meta, spec, status = item.get("metadata", {}), item.get("spec", {}), item.get("status", {})
        if meta.get("labels", {}).get("health-goals.paddione.de/environment") == "non-production":
            continue
        ready = next((c.get("status") for c in status.get("conditions", []) if c.get("type") == "Ready"), None)
        stale = status.get("observedGeneration") != meta.get("generation")
        if spec.get("suspend") or ready != "True" or stale:
            bad += 1
    return bad


def scrape(data):
    rows = vector(data if data is not None else prometheus('up{job!=""}'))
    if not rows:
        raise ValueError("empty scrape basis")
    return sum(float(row["value"][1]) == 0 for row in rows)


def capacity(data):
    query = 'kubelet_volume_stats_available_bytes{namespace=~"workspace|workspace-korczewski"} / kubelet_volume_stats_capacity_bytes{namespace=~"workspace|workspace-korczewski"}'
    rows = vector(data if data is not None else prometheus(query))
    rows = [row for row in rows if row.get("metric", {}).get("namespace") in PROD_NAMESPACES and row.get("metric", {}).get("persistentvolumeclaim")]
    if not rows:
        raise ValueError("empty PVC basis")
    return sum(float(row["value"][1]) < 0.20 for row in rows)


def axe(data):
    runs = data.get("runs") if data else None
    route_file = Path(__file__).parents[2] / "tests/e2e/lib/public-routes.json"
    route_map = json.loads(route_file.read_text(encoding="utf-8"))
    expected = {(brand, route) for brand, routes in route_map.items() for route in routes}
    actual = {(run.get("brand"), run.get("route")) for run in runs or []}
    if actual != expected or any("violations" not in run for run in runs or []):
        raise ValueError("incomplete axe basis")
    return sum(1 for run in runs for violation in run["violations"] if violation.get("impact") in {"critical", "serious"})


def lighthouse(data):
    reports = data.get("reports") if data else None
    if not reports or set(reports) != BRANDS:
        raise ValueError("incomplete Lighthouse basis")
    scores = [reports[brand]["categories"]["performance"]["score"] for brand in BRANDS]
    if any(not isinstance(score, (int, float)) or score < 0 or score > 1 for score in scores):
        raise ValueError("invalid Lighthouse score")
    return int(min(scores) * 100)


def slo(data):
    query = 'avg_over_time(probe_success{job="brand-public-health"}[7d])'
    rows = vector(data if data is not None else prometheus(query))
    by_brand = {row.get("metric", {}).get("brand"): row for row in rows}
    if set(by_brand) != BRANDS or any(row.get("metric", {}).get("sample_coverage") not in (None, "1") for row in rows):
        raise ValueError("incomplete SLO basis")
    # Live data must expose a sample-count anchor created by the recording query.
    if data is None:
        count_rows = vector(prometheus('count_over_time(probe_success{job="brand-public-health"}[7d])'))
        counts = {row.get("metric", {}).get("brand"): float(row["value"][1]) for row in count_rows}
        if set(counts) != BRANDS or min(counts.values()) < 1900:  # 7d at a 5m interval, allowing <6% gaps
            raise ValueError("insufficient SLO history")
    return int(min(float(by_brand[brand]["value"][1]) for brand in BRANDS) * 1000)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("measurement", choices=("flux", "scrape", "capacity", "axe", "lighthouse", "slo"))
    parser.add_argument("--input")
    args = parser.parse_args()
    try:
        data = load_json(args.input)
        value = globals()[args.measurement](data)
        if not isinstance(value, int):
            raise ValueError("measurement is not an integer")
        print(value)
    except Exception:
        return unavailable()
    return 0


if __name__ == "__main__":
    sys.exit(main())
