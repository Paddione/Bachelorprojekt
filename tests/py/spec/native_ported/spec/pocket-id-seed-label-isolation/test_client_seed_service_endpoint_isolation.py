"""Native migration of tests/spec/pocket-id-seed-label-isolation/client-seed-service-endpoint-isolation.bats."""

# [T014938]

def _yq(run_cmd, repo_root, expr, path):
    res = run_cmd(["yq", expr, str(path)], cwd=repo_root)
    assert res.returncode == 0, res.output
    return res.stdout.strip()


def test_client_seed_service_endpoint_isolation_pocket_id_service_selector_does_not_match_client_seed_job_pod_template(run_cmd, repo_root):
    service_manifest = repo_root / "k3d/pocket-id.yaml"
    seed_manifest = repo_root / "k3d/pocket-id-client-seed.yaml"

    svc_selector = _yq(run_cmd, repo_root,
                       'select(.kind == "Service" and .metadata.name == "pocket-id") | .spec.selector.app',
                       service_manifest)
    assert svc_selector not in ("", "null"), "Anker fehlgeschlagen: Service pocket-id hat keinen app-Selector"

    tmpl_label = _yq(run_cmd, repo_root,
                     'select(.kind == "Job") | .spec.template.metadata.labels.app',
                     seed_manifest)
    assert tmpl_label not in ("", "null"), "Anker fehlgeschlagen: Seed-Job-Pod-Template hat kein app-Label"

    assert tmpl_label != svc_selector, (
        f"Seed-Job-Pod-Template-Label '{tmpl_label}' matcht den Service-Selector — "
        "der Seed-Pod wird zum pocket-id Service-Endpoint (Connection Refused)"
    )
