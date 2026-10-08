"""Native migration of tests/spec/security/website-clusterrole-least-privilege.bats."""

import yaml


def _docs(path):
    return [d for d in yaml.safe_load_all(path.read_text(encoding="utf-8")) if d]


def _monitoring_reader(docs):
    """Ersatz fuer `d` der BATS-Hilfsfunktion y(): ClusterRole *-monitoring-reader, sonst erstes Dokument."""
    for d in docs:
        if d.get("kind") == "ClusterRole" and str((d.get("metadata") or {}).get("name", "")).endswith("-monitoring-reader"):
            return d
    return docs[0]


def _find(docs, kind, name):
    for d in docs:
        if d.get("kind") == kind and (d.get("metadata") or {}).get("name") == name:
            return d
    return None


def _rules(d):
    return d.get("rules") or []


def _has(seq, item):
    return item in (seq or [])


def _count_rules(d, pred):
    return len([r for r in _rules(d) if pred(r)])


def _role_count(docs, kind, name, pred):
    role = _find(docs, kind, name)
    if role is None:
        return None
    return len([r for r in (role.get("rules") or []) if pred(r)])


def test_1_1_1_website_clusterrole_contains_only_read_verbs_get_list(repo_root):
    docs = _docs(repo_root / "k3d" / "website.yaml")
    d = _monitoring_reader(docs)
    # Positive anchor: ClusterRole exists
    assert d.get("kind") == "ClusterRole" and str((d.get("metadata") or {}).get("name", "")).endswith("-monitoring-reader")
    non_read = [v for r in _rules(d) for v in (r.get("verbs") or []) if v not in ("get", "list")]
    assert len(non_read) == 0


def test_1_1_2_website_clusterrole_has_no_delete_verb_on_pods(repo_root):
    d = _monitoring_reader(_docs(repo_root / "k3d" / "website.yaml"))
    assert _count_rules(d, lambda r: _has(r.get("resources"), "pods") and _has(r.get("verbs"), "delete")) == 0


def test_1_1_3_website_clusterrole_has_no_patch_verb_on_deployments(repo_root):
    d = _monitoring_reader(_docs(repo_root / "k3d" / "website.yaml"))
    assert _count_rules(d, lambda r: _has(r.get("resources"), "deployments") and _has(r.get("verbs"), "patch")) == 0


def test_1_1_4_website_clusterrole_has_no_create_verb_on_jobs_or_cronjobs(repo_root):
    d = _monitoring_reader(_docs(repo_root / "k3d" / "website.yaml"))
    assert _count_rules(
        d,
        lambda r: (_has(r.get("resources"), "jobs") or _has(r.get("resources"), "cronjobs")) and _has(r.get("verbs"), "create"),
    ) == 0


def test_1_1_5_website_clusterrole_does_not_reference_obsolete_argoproj_io(repo_root):
    d = _monitoring_reader(_docs(repo_root / "k3d" / "website.yaml"))
    assert _count_rules(d, lambda r: any("argoproj.io" in g for g in (r.get("apiGroups") or []))) == 0


def test_1_1_6_website_clusterrole_retains_read_access_to_pods_deployments_and_jobs(repo_root):
    d = _monitoring_reader(_docs(repo_root / "k3d" / "website.yaml"))
    for res in ("pods", "deployments", "jobs"):
        assert any(_has(r.get("resources"), res) and _has(r.get("verbs"), "list") for r in _rules(d)), res


def test_1_2_1_role_website_self_exec_grants_deployments_patch_in_website_namespace(repo_root):
    docs = _docs(repo_root / "k3d" / "website.yaml")
    n = _role_count(docs, "Role", "website-self-exec",
                    lambda r: _has(r.get("resources"), "deployments") and _has(r.get("verbs"), "patch"))
    assert n is not None and n >= 1


def test_1_2_2_role_website_test_runner_exec_grants_deployments_patch_in_workspace(repo_root):
    docs = _docs(repo_root / "k3d" / "website-test-runner-rbac.yaml")
    n = _role_count(docs, "Role", "website-test-runner-exec",
                    lambda r: _has(r.get("resources"), "deployments") and _has(r.get("verbs"), "patch"))
    assert n is not None and n >= 1


def test_1_2_3_role_website_test_runner_exec_grants_jobs_create_in_workspace(repo_root):
    docs = _docs(repo_root / "k3d" / "website-test-runner-rbac.yaml")
    n = _role_count(docs, "Role", "website-test-runner-exec",
                    lambda r: _has(r.get("resources"), "jobs") and _has(r.get("verbs"), "create"))
    assert n is not None and n >= 1
