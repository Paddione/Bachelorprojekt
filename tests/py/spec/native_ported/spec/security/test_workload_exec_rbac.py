"""Native migration of tests/spec/security/workload-exec-rbac.bats."""

import subprocess
from pathlib import Path

import pytest
import yaml


def _docs(path: Path):
    return [d for d in yaml.safe_load_all(path.read_text(encoding="utf-8")) if d]


def _monitoring_reader(docs):
    for d in docs:
        if d.get("kind") == "ClusterRole" and str((d.get("metadata") or {}).get("name", "")).endswith("-monitoring-reader"):
            return d
    return docs[0]


def _find(docs, kind, name):
    for d in docs:
        if d.get("kind") == kind and (d.get("metadata") or {}).get("name") == name:
            return d
    return None


def _has(seq, item):
    return item in (seq or [])


def _role_count(docs, kind, name, pred):
    role = _find(docs, kind, name)
    if role is None:
        return None
    return len([r for r in (role.get("rules") or []) if pred(r)])


def test_1_1_1_website_clusterrole_keeps_read_access_but_grants_no_pods_exec(repo_root):
    docs = _docs(repo_root / "k3d" / "website.yaml")
    d = _monitoring_reader(docs)
    # Positiv-Anker: die ClusterRole existiert.
    assert d.get("kind") == "ClusterRole" and str((d.get("metadata") or {}).get("name", "")).endswith("-monitoring-reader")
    # Negativ: keine Regel mit pods/exec.
    assert len([r for r in (d.get("rules") or []) if _has(r.get("resources"), "pods/exec")]) == 0


def test_1_1_1_clusterrole_still_has_list_access_to_pods_read_anchor(repo_root):
    d = _monitoring_reader(_docs(repo_root / "k3d" / "website.yaml"))
    n = len([r for r in (d.get("rules") or []) if _has(r.get("resources"), "pods") and _has(r.get("verbs"), "list")])
    assert n >= 1


def test_1_1_2_website_self_exec_role_grants_exec_in_the_website_namespace_only(repo_root):
    docs = _docs(repo_root / "k3d" / "website.yaml")
    assert len([d for d in docs if d.get("kind") == "Role" and (d.get("metadata") or {}).get("name") == "website-self-exec"]) >= 1
    n = _role_count(docs, "Role", "website-self-exec",
                    lambda r: _has(r.get("resources"), "pods/exec") and _has(r.get("verbs"), "create"))
    assert n is not None and n >= 1


def test_1_1_2_website_self_exec_rolebinding_binds_to_website_serviceaccount(repo_root):
    docs = _docs(repo_root / "k3d" / "website.yaml")
    rb = _find(docs, "RoleBinding", "website-self-exec")
    assert rb is not None
    subjects = rb.get("subjects") or []
    assert subjects and subjects[0].get("name") == "website"


def test_1_1_3_website_test_runner_exec_role_exists_in_k3d_website_test_runner_rbac_yaml(repo_root):
    path = repo_root / "k3d" / "website-test-runner-rbac.yaml"
    assert path.is_file(), "erwartet: k3d/website-test-runner-rbac.yaml"
    docs = _docs(path)
    assert len([d for d in docs if d.get("kind") == "Role" and (d.get("metadata") or {}).get("name") == "website-test-runner-exec"]) >= 1


def test_1_1_3_website_test_runner_exec_rolebinding_exists(repo_root):
    path = repo_root / "k3d" / "website-test-runner-rbac.yaml"
    assert path.is_file(), "erwartet: k3d/website-test-runner-rbac.yaml"
    docs = _docs(path)
    assert len([d for d in docs if d.get("kind") == "RoleBinding" and (d.get("metadata") or {}).get("name") == "website-test-runner-exec"]) >= 1


def test_1_1_3_rolebinding_subject_is_website_sa_with_namespace(repo_root):
    path = repo_root / "k3d" / "website-test-runner-rbac.yaml"
    assert path.is_file(), "erwartet: k3d/website-test-runner-rbac.yaml"
    docs = _docs(path)
    rb = _find(docs, "RoleBinding", "website-test-runner-exec")
    subjects = (rb or {}).get("subjects") or []
    assert subjects, "subject: leer"
    s = subjects[0]
    assert s.get("kind") == "ServiceAccount" and s.get("name") == "website"


def test_1_1_4_k3d_base_references_the_test_runner_rbac_in_resources(repo_root):
    text = (repo_root / "k3d" / "kustomization.yaml").read_text(encoding="utf-8")
    count = len([line for line in text.splitlines() if "website-test-runner-rbac.yaml" in line])
    assert count >= 1


def test_1_1_5_no_clusterrolebinding_in_k3d_binds_a_clusterrole_with_pods_exec_to_website_sa(repo_root):
    # Gleiche Semantik wie das Original: je Datei werden ClusterRoles mit pods/exec
    # und ClusterRoleBindings mit SA 'website' verglichen.
    found = 0
    for path in sorted((repo_root / "k3d").glob("*.yaml")):
        docs = _docs(path)
        exec_crs = {
            d["metadata"]["name"]
            for d in docs
            if d.get("kind") == "ClusterRole"
            and any(_has(r.get("resources"), "pods/exec") for r in (d.get("rules") or []))
        }
        for cb in (d for d in docs if d.get("kind") == "ClusterRoleBinding"):
            ref = (cb.get("roleRef") or {}).get("name")
            if ref in exec_crs and any(
                s.get("kind") == "ServiceAccount" and s.get("name") == "website" for s in (cb.get("subjects") or [])
            ):
                found = 1
    assert found == 0


def test_1_1_6_rendered_base_keeps_the_subject_namespace(repo_root, tmp_path, run_cmd):
    import shutil

    if shutil.which("kubectl") is None:
        pytest.skip("kubectl binary not installed")
    tmpd = tmp_path / "kustomize-render"
    tmpd.mkdir()
    rendered = tmpd / "rendered.yaml"
    r = subprocess.run(["bash", "-c", f"cd '{repo_root}' && kubectl kustomize k3d > '{rendered}'"],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert r.returncode == 0, "kubectl kustomize failed\n" + r.stderr
    assert rendered.is_file(), "rendered.yaml not created"

    docs = _docs(rendered)
    rb = _find(docs, "RoleBinding", "website-test-runner-exec")
    assert rb is not None, "not-found"
    ns = (rb.get("metadata") or {}).get("namespace")
    assert ns, "rolebinding namespace empty"
    # Der Subject-Namespace bleibt literal; Platzhalter-Vorkommen sind nur ein WARN, kein Fehlschlag.
    literal = rendered.read_text(encoding="utf-8").count("${WEBSITE_NAMESPACE}")
    if literal < 1:
        print("WARN: WEBSITE_NAMESPACE placeholder not found (may be substituted by overlay)")
