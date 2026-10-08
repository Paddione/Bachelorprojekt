"""Native migration of tests/spec/dev-pod-mcp-bundle/dev-pod.bats."""

import glob
import re
from pathlib import Path

import pytest

Y_SCRIPT = """
    const fs=require('fs'), yaml=require('yaml');
    const docs=yaml.parseAllDocuments(fs.readFileSync(process.argv[1],'utf8'))
      .map(x=>x.toJS()).filter(Boolean);
    const d=docs[0];
    const out=(__EXPR__);
    console.log(typeof out==='string'?out:JSON.stringify(out));
"""


@pytest.fixture
def paths(repo_root):
    return {
        "repo": repo_root,
        "deploy": repo_root / "k3d/dev-pod/deployment.yaml",
        "svc": repo_root / "k3d/dev-pod/service.yaml",
        "pvc": repo_root / "k3d/dev-pod/pvc.yaml",
    }


def _y(run_cmd, repo, file: Path, expr: str):
    """y <datei> <js-ausdruck>: wertet einen JS-Ausdruck ueber dem ersten Dokument aus."""
    script = Y_SCRIPT.replace("__EXPR__", expr)
    return run_cmd(["node", "-e", script, str(file)], cwd=repo)


def test_dev_pod_deployment_manifest_exists(paths):
    assert paths["deploy"].is_file(), "erwartet: k3d/dev-pod/deployment.yaml"


def test_dev_pod_carries_exactly_the_four_declared_containers(run_cmd, paths):
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "d.spec.template.spec.containers.map(c=>c.name).sort().join(',')")
    assert res.returncode == 0
    assert res.output == "dev-shell,mcp-kubernetes,mcp-node,repo-sync"


def test_mcp_node_container_in_dev_pod_does_not_expose_llm_proxy_or_postgres_ports_anymore(run_cmd, paths):
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "d.spec.template.spec.containers.find(c=>c.name==='mcp-node').ports.map(p=>p.containerPort)")
    assert res.returncode == 0
    ports = [p for p in res.output.replace("[", "").replace("]", "").split(",") if p]
    # Positiv-Anker: der Container behaelt seinen Port 3002.
    assert "3002" in ports
    refused = [p for p in ports if p in ("18235", "3001")]
    assert len(refused) == 0


def test_mcp_node_container_sets_mcp_node_services_without_llm_proxy_or_postgres(run_cmd, paths):
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "(d.spec.template.spec.containers.find(c=>c.name==='mcp-node').env.find(e=>e.name==='MCP_NODE_SERVICES')||{}).value")
    assert res.returncode == 0
    assert res.output != "null"
    names = res.output.split(",")
    refused = [n for n in names if n in ("llm-proxy", "postgres")]
    assert len(refused) == 0
    # Positiv-Anker: die verbliebenen Server sind weiterhin gelistet.
    assert ",github," in "," + res.output + ","


def test_dev_pod_declares_no_init_container_that_installs_software(run_cmd, paths):
    res = _y(run_cmd, paths["repo"], paths["deploy"], "(d.spec.template.spec.initContainers||[]).length")
    assert res.returncode == 0
    assert res.output == "0"


def test_playwright_is_absent_from_the_bundle(run_cmd, paths):
    # Positiv-Anker zuerst: es gibt Container mit Images.
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "d.spec.template.spec.containers.map(c=>c.image).filter(Boolean).length")
    assert res.returncode == 0
    assert int(res.output) >= 3
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "d.spec.template.spec.containers.concat(d.spec.template.spec.initContainers||[])"
             ".filter(c=>/playwright/i.test(c.name+' '+(c.image||''))).map(c=>c.name).join(',')")
    assert res.output == ""


def test_checkout_volume_is_backed_by_the_dev_pod_repo_pvc(run_cmd, paths):
    assert paths["pvc"].is_file(), "erwartet: k3d/dev-pod/pvc.yaml"
    res = _y(run_cmd, paths["repo"], paths["pvc"], "d.kind+'/'+d.metadata.name")
    assert res.output == "PersistentVolumeClaim/dev-pod-repo"
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "(d.spec.template.spec.volumes||[]).filter(v=>v.persistentVolumeClaim&&v.persistentVolumeClaim.claimName==='dev-pod-repo').map(v=>v.name).join(',')")
    assert res.output != ""


def test_only_repo_sync_mounts_the_checkout_writable(run_cmd, paths):
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "(d.spec.template.spec.volumes||[]).filter(v=>v.persistentVolumeClaim&&v.persistentVolumeClaim.claimName==='dev-pod-repo').map(v=>v.name)[0]||''")
    volname = res.output
    assert volname, "kein PVC-Volume dev-pod-repo im Deployment"
    # Positiv-Anker: mindestens ein Container mountet das Volume.
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             f"d.spec.template.spec.containers.flatMap(c=>(c.volumeMounts||[]).filter(m=>m.name==='{volname}').map(m=>c.name)).join(',')")
    assert res.output, "niemand mountet das Checkout - der Negativtest waere vakuos"
    # Genau ein Schreiber, und der heisst repo-sync.
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             f"d.spec.template.spec.containers.flatMap(c=>(c.volumeMounts||[]).filter(m=>m.name==='{volname}'&&m.readOnly!==true).map(m=>c.name)).join(',')")
    assert res.output == "repo-sync"


def test_no_container_installs_packages_at_startup(run_cmd, paths, tmp_path):
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "JSON.stringify(d.spec.template.spec.containers.map(c=>[c.command||[],c.args||[]]))")
    assert res.returncode == 0
    cmds = tmp_path / "cmds.json"
    cmds.write_text(res.output + "\n")
    pat = re.compile(r"apk add|apt-get install|npm install|pip install", re.IGNORECASE)
    count = sum(1 for ln in cmds.read_text().splitlines() if pat.search(ln))
    assert count == 0


def test_mcp_node_image_is_built_from_a_dockerfile_that_carries_its_dependencies(paths):
    df = paths["repo"] / "docker/mcp-node/Dockerfile"
    assert df.is_file(), "erwartet: docker/mcp-node/Dockerfile"
    lines = df.read_text().splitlines()
    # Positiv-Anker: das Image installiert seine Abhaengigkeiten zur BAUZEIT.
    build = [ln for ln in lines if re.search(r"^RUN .*(apk add|npm install|npm ci)", ln)]
    assert len(build) >= 1
    # ... und nicht im Startpfad.
    startup = [ln for ln in lines if re.match(r"^(CMD|ENTRYPOINT)", ln) and re.search(r"apk add|npm install", ln)]
    assert len(startup) == 0


def test_repo_sync_image_is_built_from_a_dockerfile(paths):
    assert (paths["repo"] / "docker/repo-sync/Dockerfile").is_file(), "erwartet: docker/repo-sync/Dockerfile"


def test_dev_pod_service_is_a_plain_cluster_ip(run_cmd, paths):
    assert paths["svc"].is_file(), "erwartet: k3d/dev-pod/service.yaml"
    res = _y(run_cmd, paths["repo"], paths["svc"], "(d.spec.type||'ClusterIP')")
    assert res.output == "ClusterIP"


def test_no_ingress_ingressroute_or_loadbalancer_exposes_the_dev_pod(paths):
    repo = paths["repo"]
    # Positiv-Anker: das Overlay-Verzeichnis traegt Manifeste.
    assert len(glob.glob(str(repo / "k3d/dev-pod/*.yaml"))) >= 3
    exposing = re.compile(r"^kind: (Ingress|IngressRoute)$|type: LoadBalancer", re.MULTILINE)
    hits = []
    for base in ("k3d", "prod-fleet"):
        for p in (repo / base).rglob("*.yaml"):
            try:
                text = p.read_text()
            except (OSError, UnicodeDecodeError):
                continue
            if "dev-pod" in text and exposing.search(text):
                hits.append(str(p))
    assert hits == [], f"exposing manifests: {hits}"


def test_dev_pod_overlay_is_referenced_by_a_flux_kustomization(run_cmd, paths):
    ks = paths["repo"] / "flux/clusters/fleet/ks-dev-pod.yaml"
    assert ks.is_file(), "erwartet: flux/clusters/fleet/ks-dev-pod.yaml"
    res = _y(run_cmd, paths["repo"], ks, "d.kind+' '+d.spec.path")
    assert res.output == "Kustomization ./dev-pod"
    kust = paths["repo"] / "prod-fleet/dev-pod/kustomization.yaml"
    assert kust.is_file(), "erwartet: prod-fleet/dev-pod/kustomization.yaml"
    assert "k3d/dev-pod" in kust.read_text()


def test_the_render_pipeline_emits_the_dev_pod_overlay_into_the_artifact_tree(paths):
    assert "prod-fleet/dev-pod" in (paths["repo"] / "scripts/flux-render-artifact.sh").read_text()


def test_memory_requests_stay_well_below_the_monolith_s_960mi_declaration(run_cmd, paths):
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "d.spec.template.spec.containers.reduce((s,c)=>s+parseInt(String(c.resources.requests.memory).replace('Mi','')),0)")
    assert res.returncode == 0
    assert int(res.output) > 0
    assert int(res.output) < 960


def test_every_container_declares_a_memory_limit(run_cmd, paths):
    res = _y(run_cmd, paths["repo"], paths["deploy"],
             "d.spec.template.spec.containers.filter(c=>!(c.resources&&c.resources.limits&&c.resources.limits.memory)).map(c=>c.name).join(',')")
    assert res.output == ""
