"""devmesh-Monitoring-Addon: Invarianten, an denen die Health-Goal-Messung haengt.

Pruefmodus: Konfigurationsaussage ueber die gerenderten Manifestdateien. Die
Laufzeit (Prometheus-Antworten) deckt test_runtime_health_goals.py ab.
"""

import importlib.util

import yaml

ADDON = "dev-local/addons/monitoring"


def _docs(repo_root, name):
    text = (repo_root / ADDON / name).read_text(encoding="utf-8")
    return [d for d in yaml.safe_load_all(text) if d]


def _measure(repo_root):
    spec = importlib.util.spec_from_file_location(
        "runtime_health_measure", repo_root / "scripts/lib/runtime-health-measure.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _scrape_config(repo_root):
    cm = next(d for d in _docs(repo_root, "prometheus.yaml")
              if d["kind"] == "ConfigMap" and d["metadata"]["name"] == "prometheus-config")
    return yaml.safe_load(cm["data"]["prometheus.yml"])


def test_addon_is_part_of_the_devmesh_addons_render(repo_root):
    addons = yaml.safe_load((repo_root / "dev-local/addons/kustomization.yaml").read_text())
    assert "monitoring" in addons["resources"]
    inner = yaml.safe_load((repo_root / ADDON / "kustomization.yaml").read_text())
    for name in inner["resources"]:
        assert (repo_root / ADDON / name).is_file(), name


def test_slo_probe_job_matches_the_measured_brand_set_and_window(repo_root):
    jobs = {j["job_name"]: j for j in _scrape_config(repo_root)["scrape_configs"]}
    probe = jobs["brand-public-health"]
    brands = {sc["labels"]["brand"] for sc in probe["static_configs"]}
    # slo() verlangt exakt die Brand-Menge und >= 1900 Samples in 7 Tagen.
    assert brands == _measure(repo_root).BRANDS
    assert all(len(sc["targets"]) == 1 for sc in probe["static_configs"])
    assert probe["scrape_interval"] == "5m"
    assert 7 * 24 * 60 // 5 >= 1900


def test_capacity_basis_and_query_service_exist(repo_root):
    jobs = {j["job_name"] for j in _scrape_config(repo_root)["scrape_configs"]}
    assert "kubelet" in jobs
    docs = _docs(repo_root, "prometheus.yaml")
    svc = next(d for d in docs if d["kind"] == "Service")
    # Der Service-Proxy-Pfad der Messung adressiert monitoring/prometheus, Port http.
    assert (svc["metadata"]["namespace"], svc["metadata"]["name"]) == ("monitoring", "prometheus")
    assert [p["name"] for p in svc["spec"]["ports"]] == ["http"]
    rules = next(d for d in docs if d["kind"] == "ClusterRole")["rules"]
    assert any("nodes/proxy" in r["resources"] for r in rules)


def test_images_are_digest_pinned_and_history_is_persistent(repo_root):
    deployments = [d for name in ("prometheus.yaml", "blackbox-exporter.yaml")
                   for d in _docs(repo_root, name) if d["kind"] == "Deployment"]
    assert len(deployments) == 2
    for dep in deployments:
        for c in dep["spec"]["template"]["spec"]["containers"]:
            assert "@sha256:" in c["image"], c["image"]
    prom = next(d for d in deployments if d["metadata"]["name"] == "prometheus")
    volumes = prom["spec"]["template"]["spec"]["volumes"]
    assert any("persistentVolumeClaim" in v for v in volumes)
    args = prom["spec"]["template"]["spec"]["containers"][0]["args"]
    assert "--storage.tsdb.retention.time=15d" in args
