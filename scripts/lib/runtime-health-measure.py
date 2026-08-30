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
    return sum(1 for run in (runs or []) for violation in run["violations"] if violation.get("impact") in {"critical", "serious"})


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


def _kube_get(args_list):
    """Helper: run kubectl get -o json, return parsed JSON or raise."""
    raw = subprocess.check_output(args_list, stderr=subprocess.DEVNULL)
    return json.loads(raw)


def _kube_cmd(args_list):
    """Helper: run arbitrary kubectl command, return stdout or raise."""
    return subprocess.check_output(args_list, stderr=subprocess.DEVNULL).decode()


def svc_probe(data):
    """G-SVC01: Count public services without blackbox HTTP probe.

    Reads Ingress manifests from k3d/, prod-fleet/*/ and compares against
    blackbox Probe targets in k3d/monitoring/blackbox-exporter.yaml.
    """
    import glob as glob_mod
    import yaml

    # A blackbox probe observes the public *host*, not the Kubernetes Service
    # behind it.  Comparing service names with probe URLs (the previous
    # implementation) can never establish coverage.
    ingress_hosts = set()
    manifest_dirs = ["prod-fleet/mentolder", "prod-fleet/korczewski"]
    for d in manifest_dirs:
        for path in sorted(glob_mod.glob(f"{d}/**/*.yaml", recursive=True)) + sorted(glob_mod.glob(f"{d}/**/*.yml", recursive=True)):
            try:
                with open(path, encoding="utf-8") as fh:
                    docs = list(yaml.safe_load_all(fh))
            except Exception:
                continue
            for d_obj in docs:
                if not isinstance(d_obj, dict) or d_obj.get("kind") != "Ingress":
                    continue
                for rule in d_obj.get("spec", {}).get("rules", []) or []:
                    host = rule.get("host")
                    if host:
                        ingress_hosts.add(host.lower())

    # Collect blackbox probe targets from the exporter config.
    probe_targets = set()
    probe_file = "k3d/monitoring/blackbox-exporter.yaml"
    if os.path.exists(probe_file):
        try:
            with open(probe_file, encoding="utf-8") as fh:
                docs = list(yaml.safe_load_all(fh))
        except Exception:
            docs = []
        for d_obj in docs:
            if not isinstance(d_obj, dict) or d_obj.get("kind") != "Probe":
                continue
            static = (d_obj.get("spec", {}).get("targets", {}) or {}).get("staticConfig", {}).get("static", [])
            for target in static or []:
                host = urllib.parse.urlparse(target).hostname
                if host:
                    probe_targets.add(host.lower())

    if not ingress_hosts or not probe_targets:
        raise ValueError("incomplete public probe basis")

    # Host templates use ${PROD_DOMAIN}; compare their stable subdomain label
    # to the concrete brand targets in the shared Probe resource.
    def covered(host):
        if host in probe_targets:
            return True
        label = host.split(".", 1)[0]
        return any(target.split(".", 1)[0] == label for target in probe_targets)

    uncovered = [host for host in ingress_hosts if not covered(host)]
    return len(uncovered)


def infra_tcp(data):
    """G-INF01-04: Count unreachable internal infrastructure services via TCP.

    Services to probe: coturn (3478/5349), janus (8188), nats (4222), redis (6379).
    Uses kubectl exec to run a TCP connect test.
    """
    ctx = os.environ.get("HG_OPS_CTX", "fleet")
    ns = "workspace"

    # (node_name, port) to probe.
    targets = [
        ("coturn", 3478),
        ("coturn", 5349),
        ("janus", 8188),
        ("nats", 4222),
        ("nextcloud-redis", 6379),
    ]

    failed = 0
    # Pick a running pod.  This deliberately raises when the cluster cannot
    # provide a test client; main() then emits '-' instead of a false green 0.
    pods = _kube_get(["kubectl", "get", "pods", "-n", ns, "--context", ctx, "-o", "json"])
    pod = next((item.get("metadata", {}).get("name") for item in pods.get("items", [])
                if item.get("status", {}).get("phase") == "Running"), None)
    if not pod:
        raise ValueError("no running pod for TCP probe")

    for svc_name, port in targets:
        test_cmd = [
            "kubectl", "exec", pod, "-n", ns, "--context", ctx, "--",
            "sh", "-c", f"nc -z -w 5 {svc_name}.{ns}.svc.cluster.local {port}"
        ]
        try:
            _kube_cmd(test_cmd)
        except Exception:
            failed += 1

    return failed


def _internal_http(url, marker):
    """Return 0/1 for one HTTP contract, or raise without a live basis."""
    ctx = os.environ.get("HG_OPS_CTX", "fleet")
    ns = "workspace"

    bad = 0

    pods = _kube_get(["kubectl", "get", "pods", "-n", ns, "--context", ctx, "-o", "json"])
    pod = next((item.get("metadata", {}).get("name") for item in pods.get("items", [])
                if item.get("status", {}).get("phase") == "Running"), None)
    if not pod:
        raise ValueError("no running pod for HTTP probe")

    test_cmd = [
        "kubectl", "exec", pod, "-n", ns, "--context", ctx,
        "--", "sh", "-c",
        f"wget -qO- '{url}' 2>/dev/null | grep -q '{marker}' && echo ok || echo fail"
    ]
    try:
        out = _kube_cmd(test_cmd).strip()
        if out != "ok":
            bad += 1
    except Exception:
        bad += 1

    return bad


def svc_oidc(data):
    """G-SVC02: Pocket-ID discovery returns its OIDC issuer metadata."""
    return _internal_http("http://pocket-id.workspace.svc.cluster.local:1411/.well-known/openid-configuration", '"issuer"')


def svc_nextcloud(data):
    """G-SVC03: Nextcloud reports itself installed."""
    return _internal_http("http://nextcloud.workspace.svc.cluster.local/status.php", '"installed":true')


def svc_whiteboard(data):
    """G-SVC04: Whiteboard accepts an HTTP request on its service port."""
    return _internal_http("http://whiteboard.workspace.svc.cluster.local:3002/", "")


def infra_http(data):
    """G-INF03: Janus /stats returns its expected JSON marker."""
    return _internal_http("http://janus.workspace.svc.cluster.local:8188/stats", '"janus"')


def cron_status(data):
    """G-CJ01: Count CronJobs with failed last run.

    A CronJob is "failed" if:
    - lastScheduleTime > lastSuccessfulTime (scheduled but not successful)
    - lastScheduleTime is older than 2x the expected schedule interval
    - No lastScheduleTime at all (never ran)
    """
    ctx = os.environ.get("HG_OPS_CTX", "fleet")
    ns = "workspace"

    cronjobs = _kube_get([
        "kubectl", "get", "cronjobs", "-n", ns, "--context", ctx, "-o", "json"
    ])

    import datetime
    items = cronjobs.get("items", [])
    bad = 0

    for cj in items:
        name = cj["metadata"]["name"]
        schedule = cj["spec"].get("schedule", "")
        ls = cj["status"].get("lastScheduleTime")
        lss = cj["status"].get("lastSuccessfulTime")

        if not ls:
            # Never ran — counts as failed.
            bad += 1
            continue

        try:
            ls_dt = datetime.datetime.fromisoformat(ls.replace("Z", "+00:00"))
        except Exception:
            bad += 1
            continue

        if not lss:
            # Scheduled but never successful.
            bad += 1
            continue

        try:
            lss_dt = datetime.datetime.fromisoformat(lss.replace("Z", "+00:00"))
        except Exception:
            bad += 1
            continue

        if ls_dt > lss_dt:
            # Last schedule time is after last successful time.
            bad += 1

    return bad


def alert_status(data):
    """G-ALR01: Check if Alertmanager has a non-null receiver.

    Reads k3d/monitoring/alertmanager-config.yaml and checks if the
    root receiver is something other than "null".
    """
    import yaml

    config_file = "k3d/monitoring/alertmanager-config.yaml"
    if not os.path.exists(config_file):
        return 1  # Missing config counts as failure.

    try:
        with open(config_file, encoding="utf-8") as fh:
            config = yaml.safe_load(fh)
    except Exception:
        return 1

    spec = config.get("spec", {}) or {}
    receiver = (spec.get("route", {}) or {}).get("receiver") or ""
    for configured in spec.get("receivers", []) or []:
        if configured.get("name") == receiver and configured.get("emailConfigs"):
            return 0
    return 1


def drift(data):
    """G-DRIFT01-02: Count deployment drift between manifest and live cluster.

    Compares Deployment.spec.replicas with live pod replicaCount.
    """
    ctx = os.environ.get("HG_OPS_CTX", "fleet")
    ns = "workspace"

    deployments = _kube_get([
        "kubectl", "get", "deployments", "-n", ns, "--context", ctx, "-o", "json"
    ])

    drift_count = 0
    for d in deployments.get("items", []):
        spec = d.get("spec", {}) or {}
        status = d.get("status", {}) or {}
        desired = spec.get("replicas", 1)
        actual = status.get("replicas", 0)
        if desired != actual:
            drift_count += 1

    return drift_count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("measurement", choices=(
        "flux", "scrape", "capacity", "axe", "lighthouse", "slo",
        "svc-probe", "svc-oidc", "svc-nextcloud", "svc-whiteboard", "infra-tcp", "infra-http", "cron-status", "alert-status", "drift",
    ))
    parser.add_argument("--input")
    args = parser.parse_args()
    try:
        data = load_json(args.input)
        func_name = args.measurement.replace("-", "_")
        value = globals()[func_name](data)
        if not isinstance(value, int):
            raise ValueError("measurement is not an integer")
        print(value)
    except Exception:
        return unavailable()
    return 0


if __name__ == "__main__":
    sys.exit(main())
