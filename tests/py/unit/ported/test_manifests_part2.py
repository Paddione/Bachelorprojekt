"""Native migration of tests/unit/manifests.bats (part 2/2)."""
import fcntl
import json
import os
import re
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path

import pytest
import yaml

# Validate kustomize output without a running cluster: expected resources, image
# pinning, namespace consistency, label hygiene, cross-references. Part 2 covers
# backup/PVC resources, secrets, prod overlays, network policies and pvc-backup logic.

pytestmark = pytest.mark.repo_lock("k3d-secrets-yaml")

DUMMY_SECRETS = (
    "apiVersion: v1\n"
    "kind: Secret\n"
    "metadata:\n"
    "  name: workspace-secrets\n"
    "type: Opaque\n"
    "stringData:\n"
    "  PLACEHOLDER: bats-dummy\n"
)
OFFICE_ENV = {
    "PROD_DOMAIN": "localhost",
    "COLLABORA_HOST": "office.localhost",
    "COLLABORA_ALIASGROUP1": "http://nextcloud.workspace.svc.cluster.local:80",
    "COLLABORA_SERVER_NAME": "office.localhost",
    "COLLABORA_SSL_TERMINATION": "false",
    "COLLABORA_TLS_SECRET": "collabora-tls-dev",
    "COLLABORA_INGRESS_MIDDLEWARES": "workspace-infra-redirect-https@kubernetescrd",
}
ENVSUBST_VARS = (
    "$PROD_DOMAIN $COLLABORA_HOST $COLLABORA_ALIASGROUP1 $COLLABORA_SERVER_NAME "
    "$COLLABORA_SSL_TERMINATION $COLLABORA_TLS_SECRET $COLLABORA_INGRESS_MIDDLEWARES"
)
KF = "--load-restrictor=LoadRestrictionsNone"


@contextmanager
def _secrets_ref(secrets):
    """Share k3d/secrets.yaml across modules (xdist): first user creates, last user removes."""
    lock_dir = Path(tempfile.gettempdir()) / "pytest-repo-locks"
    lock_dir.mkdir(exist_ok=True)
    state_file = lock_dir / "k3d-secrets-yaml.refs.json"
    lock_path = lock_dir / "k3d-secrets-yaml.refs.lock"
    with open(lock_path, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = json.loads(state_file.read_text()) if state_file.exists() else {"n": 0, "created": False}
        if not secrets.exists():
            secrets.write_text(DUMMY_SECRETS, encoding="utf-8")
            state["created"] = True
        state["n"] += 1
        state_file.write_text(json.dumps(state))
    try:
        yield
    finally:
        with open(lock_path, "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            state = json.loads(state_file.read_text())
            state["n"] -= 1
            if state["n"] == 0:
                if state["created"] and secrets.exists():
                    secrets.unlink()
                state["created"] = False
            state_file.write_text(json.dumps(state))


@pytest.fixture(scope="module", autouse=True)
def rendered(repo_root):
    """Mirror setup_file(): render k3d/ and the office-stack into one text blob."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    if shutil.which("envsubst") is None:
        pytest.skip("envsubst not installed")
    manifests = repo_root / "k3d"
    office = manifests / "office-stack"
    with _secrets_ref(manifests / "secrets.yaml"):
        first = subprocess.run(["kubectl", "kustomize", str(manifests), KF],
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, timeout=300)
        if first.returncode != 0:
            pytest.fail(f"kubectl kustomize failed — output:\n{first.stdout}")
        text = first.stdout + "\n---\n"
        env = {**os.environ, **OFFICE_ENV}
        build = subprocess.run(["kubectl", "kustomize", str(office), KF], env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, timeout=300)
        sub = subprocess.run(["envsubst", ENVSUBST_VARS], input=build.stdout, env=env,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, timeout=300)
        text += sub.stdout + build.stderr + sub.stderr
    yield text


def _lines_matching(text, regex):
    pat = re.compile(regex)
    return [line for line in text.splitlines() if pat.search(line)]


def _non_comment_lines(path):
    return [line for line in path.read_text(encoding="utf-8").splitlines()
            if not re.match(r"^[ \t]*#", line)]


def _grep_count(path, needle):
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if needle in line)


def _overlay_dirs(root, pattern):
    """Brand overlays matching a glob plus nested wrappers, filtered like _is_overlay()."""
    import glob

    return [d for d in sorted(set(glob.glob(os.path.join(root, pattern))
                                  + glob.glob(os.path.join(root, pattern, "*"))))
            if _is_overlay(d)]


def _is_overlay(d):
    if not os.path.isdir(d):
        return False
    for k in ("kustomization.yaml", "kustomization.yml", "Kustomization"):
        p = os.path.join(d, k)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as fh:
                if "kind: Component" in fh.read():
                    return False
            return True
    return False


def _kustomize_docs(run_cmd, overlay):
    """Build an overlay with kubectl; a non-zero exit fails the test."""
    r = run_cmd(["kubectl", "kustomize", overlay, KF], timeout=300)
    assert r.returncode == 0, f"kustomize build failed for {overlay}: {r.stderr}"
    return r


def test_backup_cronjob_exists(rendered):
    assert "kind: CronJob" in rendered


def test_pvc_backup_cronjob_references_critical_data_pvcs(rendered):
    assert "name: pvc-backup" in rendered
    assert "nextcloud-data-pvc" in rendered
    assert "vaultwarden-data-pvc" in rendered


def test_pvc_backup_filen_upload_fails_loudly_on_upload_error(repo_root):
    # T000330: exit 1 on upload failure, not a silent WARNING echo.
    cronjob = repo_root / "k3d" / "pvc-backup-cronjob.yaml"
    assert _grep_count(cronjob, "WARNING: Filen upload failed") == 0
    assert "exit 1" in cronjob.read_text(encoding="utf-8")


def test_persistent_volume_claims_exist_for_stateful_services(rendered):
    assert "kind: PersistentVolumeClaim" in rendered


def test_no_plaintext_passwords_in_deployment_env_vars(rendered):
    lines = rendered.splitlines()
    # grep -B2 -A0 -i 'password': matched lines plus up to two lines of leading context.
    keep = set()
    for i, line in enumerate(lines):
        if re.search("password", line, re.I):
            keep.update(range(max(0, i - 2), i + 1))
    ctx = [lines[j] for j in sorted(keep)]
    filters = [
        (r"value:", True),
        (r"valueFrom|secretKeyRef|configMapKeyRef|\$\(", False),
        (r'value: (admin|devadmin|invoiceninja|keycloak|postgres|nextcloud|opensearch|outline|website|password|"")|value: [a-z]+@|value: "[0-9]+"', False),
        (r'value: "?https?"?$|value: "?https?://', False),
        (r'value: "?\$\{[A-Z_]+\}"?', False),
    ]
    remaining = ctx
    for pattern, keep_match in filters:
        pat = re.compile(pattern, re.I)
        remaining = [line for line in remaining if bool(pat.search(line)) == keep_match]
    assert remaining == [], f"Possible hardcoded passwords: {remaining}"


def test_prod_kustomize_output_has_no_workspace_secrets_secret_with_data(run_cmd, repo_root):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    overlays = _overlay_dirs(str(repo_root), "prod*")
    found = []
    for overlay in overlays:
        r = _kustomize_docs(run_cmd, overlay)
        try:
            for doc in yaml.safe_load_all(r.stdout):
                if not doc:
                    continue
                if (doc.get("kind") == "Secret"
                        and doc.get("metadata", {}).get("name") == "workspace-secrets"
                        and (doc.get("stringData") or doc.get("data"))):
                    found.append(overlay)
                    break
        except yaml.constructor.ConstructorError:
            # YAML 1.1 merge-key constructs from Helm charts (monitoring ns) are unsupported.
            pass
    assert found == [], f"workspace-secrets Secret with data found in: {', '.join(found)}"


# billing-dunning-detection targets the website namespace (T000295).
def test_prod_overlays_billing_dunning_detection_does_not_target_workspace_ns(run_cmd, repo_root):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    overlays = _overlay_dirs(str(repo_root), "prod-*")
    bad = []
    for ov in overlays:
        r = run_cmd(["kubectl", "kustomize", ov, KF], timeout=300)
        assert r.returncode == 0, f"kustomize build failed for {ov}: {r.stderr}"
        try:
            for doc in yaml.safe_load_all(r.stdout):
                if not doc:
                    continue
                if (doc.get("kind") == "CronJob"
                        and doc.get("metadata", {}).get("name") == "billing-dunning-detection"):
                    container = doc["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]
                    cmd = " ".join(container.get("command", []))
                    if "website.workspace.svc" in cmd:
                        bad.append(f"{os.path.basename(ov)}: {cmd}")
        except yaml.constructor.ConstructorError:
            pass
    assert bad == [], f"dunning CronJob still targets the workspace ns: {bad}"


def test_taskfile_yml_does_not_corrupt_native_kubernetes_expansions_with_sed(repo_root):
    needle = r"sed 's/\$(\([^)]*\))/\${\1}/g'"
    files = [repo_root / "Taskfile.yml"] + sorted((repo_root / "taskfiles").rglob("*"))
    hits = []
    for f in files:
        if f.is_file():
            text = f.read_text(encoding="utf-8", errors="ignore")
            if needle in text:
                hits.append(str(f))
    assert hits == [], f"breaking sed expansion still present in: {hits}"


def test_website_overlay_allows_egress_to_workspace_office_collabora_health_probe(run_cmd, repo_root):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    overlay = str(repo_root / "prod-fleet" / "website-mentolder")
    r = _kustomize_docs(run_cmd, overlay)

    def allows_office(doc):
        if not doc or doc.get("kind") != "NetworkPolicy":
            return False
        spec = doc.get("spec", {})
        if "Egress" not in (spec.get("policyTypes") or []):
            return False
        for rule in spec.get("egress") or []:
            for peer in rule.get("to") or []:
                ns = (peer.get("namespaceSelector") or {}).get("matchLabels") or {}
                if ns.get("kubernetes.io/metadata.name") == "workspace-office":
                    return True
        return False

    found = any(allows_office(d) for d in yaml.safe_load_all(r.stdout))
    assert found, "MISSING: no NetworkPolicy grants egress to workspace-office"


def test_network_policies_grant_egress_to_the_kubernetes_apiserver(rendered):
    docs = list(yaml.safe_load_all(rendered))

    def egress_to(doc, cidr, port):
        if not doc or doc.get("kind") != "NetworkPolicy":
            return False
        spec = doc.get("spec", {})
        if "Egress" not in (spec.get("policyTypes") or []):
            return False
        for rule in spec.get("egress") or []:
            cidrs = {(p.get("ipBlock") or {}).get("cidr") for p in (rule.get("to") or [])}
            ports = {pr.get("port") for pr in (rule.get("ports") or [])}
            if cidr in cidrs and (not ports or port in ports):
                return True
        return False

    node_ok = any(egress_to(d, "10.20.0.0/24", 6443) for d in docs)
    clusterip_ok = any(egress_to(d, "10.43.0.0/16", 443) for d in docs)
    assert node_ok and clusterip_ok, (
        f"MISSING apiserver egress: node_cidr_6443={node_ok} clusterip_443={clusterip_ok}")


def test_pvc_backup_derives_namespace_at_runtime_not_hardcoded_ns_workspace(repo_root):
    cronjob = repo_root / "k3d" / "pvc-backup-cronjob.yaml"
    assert not any(re.search(r"^[ \t]*NS=workspace[ \t]*$", line)
                   for line in cronjob.read_text(encoding="utf-8").splitlines())
    assert "/var/run/secrets/kubernetes.io/serviceaccount/namespace" in cronjob.read_text(encoding="utf-8")


def test_pvc_backup_mounter_nodeaffinity_has_no_decommissioned_node_names(repo_root):
    hits = [line for line in _non_comment_lines(repo_root / "k3d" / "pvc-backup-cronjob.yaml")
            if re.search(r"k3s-1|k3s-2|k3s-3|k3w-1|k3w-2|k3w-3", line)]
    assert hits == []


def test_pvc_backup_gates_clone_creation_on_storageclassname_longhorn(repo_root):
    text = (repo_root / "k3d" / "pvc-backup-cronjob.yaml").read_text(encoding="utf-8")
    assert _lines_matching(text, r"get pvc vaultwarden-data-pvc -o jsonpath=.*storageClassName")
    assert _lines_matching(text, r'\[ "\$VW_SC" = "longhorn" \]')


def test_pvc_backup_no_longer_unconditionally_clones_vaultwarden_data_pvc(repo_root):
    hits = [line for line in _non_comment_lines(repo_root / "k3d" / "pvc-backup-cronjob.yaml")
            if 'CLONES="vaultwarden-data-backup-clone' in line]
    assert hits == []


def test_korczewski_overlay_pins_vaultwarden_data_pvc_to_longhorn(run_cmd, repo_root, tmp_path):
    overlay = str(repo_root / "prod-fleet" / "korczewski")
    r = run_cmd(["kubectl", "kustomize", overlay, KF], timeout=300)
    assert r.returncode == 0, r.output
    rendered_file = tmp_path / "korcz.yaml"
    rendered_file.write_text(r.output + "\n", encoding="utf-8")
    docs = []
    for chunk in rendered_file.read_text(encoding="utf-8").split("\n---\n"):
        try:
            d = yaml.safe_load(chunk)
            if d:
                docs.append(d)
        except (yaml.constructor.ConstructorError, yaml.scanner.ScannerError):
            pass
    want = {"vaultwarden-data-pvc"}
    seen = {}
    for d in docs:
        if d.get("kind") == "PersistentVolumeClaim" and d.get("metadata", {}).get("name") in want:
            seen[d["metadata"]["name"]] = d.get("spec", {}).get("storageClassName")
    missing = want - set(seen)
    assert not missing, f"PVC(s) not found in korczewski overlay: {sorted(missing)}"
    bad = {n: sc for n, sc in seen.items() if sc != "longhorn"}
    assert not bad, f"PVC(s) not pinned to longhorn: {bad}"


def test_tests_results_retention_has_no_stale_node_location_affinity(repo_root):
    hits = [line for line in _non_comment_lines(repo_root / "k3d" / "tests-retention-cronjob.yaml")
            if "node-location" in line]
    assert hits == []


def test_pvc_backup_stale_clone_deletion_waits_and_fails_loud_on_stuck_clone(repo_root):
    cronjob = repo_root / "k3d" / "pvc-backup-cronjob.yaml"
    body = _non_comment_lines(cronjob)
    assert any(re.search(r"delete pvc.*--ignore-not-found.*--wait=true.*--timeout=120s", line)
               for line in body)
    text = cronjob.read_text(encoding="utf-8")
    assert "stuck in Terminating" in text
    assert "exit 1" in text
    assert not any(re.search(r"delete pvc.*--wait=true.*--timeout=120s.*\|\|[ \t]*true", line)
                   for line in body)


def test_pvc_backup_bind_check_fails_on_clone_with_deletiontimestamp(repo_root):
    text = (repo_root / "k3d" / "pvc-backup-cronjob.yaml").read_text(encoding="utf-8")
    assert "deletionTimestamp" in text
    assert "is being deleted" in text


def test_pvc_backup_removes_stale_mounter_jobs_before_launching_new_one(repo_root):
    cronjob = repo_root / "k3d" / "pvc-backup-cronjob.yaml"
    text = cronjob.read_text(encoding="utf-8")
    assert "delete jobs -l app=pvc-backup,role=mounter" in text
    assert "Launching mounter Job" in text
    assert _grep_count(cronjob, "delete jobs -l app=pvc-backup,role=mounter") >= 1


def test_pvc_backup_mounter_job_has_ttlsecondsafterfinished_for_zombie_prevention(repo_root):
    assert "ttlSecondsAfterFinished: 86400" in (repo_root / "k3d" / "pvc-backup-cronjob.yaml").read_text(encoding="utf-8")
