"""Verify the rendered Massage dev deployment, including Kubernetes env ordering."""
import subprocess

import yaml


def test_massage_devmesh_runtime_configuration(repo_root):
    result = subprocess.run(
        ["bash", "scripts/devmesh/render-stack.sh", "core"], cwd=repo_root,
        capture_output=True, text=True, check=True,
    )
    docs = {(d["kind"], d["metadata"]["name"]): d
            for d in yaml.safe_load_all(result.stdout) if d}
    config = docs["ConfigMap", "website-config"]["data"]
    assert all(isinstance(value, str) for value in config.values())
    assert config["BRAND"] == config["BRAND_ID"] == "massage"
    assert config["SITE_URL"] == "https://massage.devmesh.korczewski.de"
    deployment = docs["Deployment", "website"]
    assert deployment["metadata"]["namespace"] == "workspace"
    pod = deployment["spec"]["template"]
    assert len(pod["metadata"]["annotations"]["checksum/config"]) == 64
    env = pod["spec"]["containers"][0]["env"]
    assert all(isinstance(entry["value"], str) for entry in env if "value" in entry)
    names = [entry["name"] for entry in env]
    assert names.index("WEBSITE_DB_PASSWORD") < names.index("SESSIONS_DATABASE_URL")
    assert next(e["value"] for e in env if e["name"] == "SESSIONS_DATABASE_URL") == (
        "postgresql://website:$(WEBSITE_DB_PASSWORD)@"
        "massage-db-dev.workspace.svc.cluster.local:5432/website"
    )
    assert docs["Service", "massage-db-dev"]["spec"]["selector"] == {"app": "massage-db-dev"}
    assert "'massage'" in docs["ConfigMap", "massage-brand-seed"]["data"]["seed.sql"]
    seed = docs["Job", "pocket-id-client-seed"]["spec"]["template"]["spec"]["containers"][0]
    assert next(e["value"] for e in seed["env"] if e["name"] == "WEBSITE_EXTRA_CALLBACK") == (
        "https://massage.devmesh.korczewski.de/api/auth/callback,"
        "https://web.korczewski.de/api/auth/callback,"
        "https://korczewski.de/api/auth/callback"
    )
    assert "web.${SUFFIX}/api/auth/callback" in seed["command"][-1]
    assert "${WEBSITE_EXTRA_CALLBACK}" in seed["command"][-1]


def test_website_database_bootstrap_runs_before_readiness(repo_root, tmp_path):
    """A persistent DB must bootstrap on restart and fail closed on SQL errors."""
    import os
    docs = list(yaml.safe_load_all((repo_root / "dev-local/core/massage-db-dev.yaml").read_text()))
    container = docs[0]["spec"]["template"]["spec"]["containers"][0]
    command = container["lifecycle"]["postStart"]["exec"]["command"]
    scripts = tmp_path / "schema"
    scripts.mkdir()
    for name in ("init-knowledge-schema.sh", "init-meetings-schema.sh"):
        (scripts / name).write_text('echo "' + name + '" >> "$BOOTSTRAP_LOG"\n'
                                    + 'test "${FAIL_SCRIPT:-}" != "' + name + '"\n')
    binaries = tmp_path / "bin"
    binaries.mkdir()
    ready = binaries / "pg_isready"
    ready.write_text("#!/bin/sh\nexit 0\n")
    ready.chmod(0o755)
    psql = binaries / "psql"
    psql.write_text('#!/bin/sh\necho "$*" >> "$MIGRATION_LOG"\ntest "${FAIL_MIGRATION:-}" != 1\n')
    psql.chmod(0o755)
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    (migrations / "001.sql").write_text("SELECT 1;")
    log = tmp_path / "log"
    env = dict(os.environ, PATH=str(binaries) + ":" + os.environ["PATH"],
               POSTGRES_USER="website", POSTGRES_DB="website", BOOTSTRAP_LOG=str(log),
               MIGRATION_LOG=str(tmp_path / "migrations.log"))
    script = command[-1].replace("/schema/", str(scripts) + "/").replace(
        "/tmp/website-schema-ready", str(tmp_path / "ready")).replace(
            "/migrations/", str(migrations) + "/")
    result = subprocess.run([*command[:-1], script], env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert log.read_text().splitlines() == ["init-knowledge-schema.sh", "init-meetings-schema.sh"]
    assert (tmp_path / "ready").exists()
    assert "-X -1 -v ON_ERROR_STOP=1 -U website -d website -f " in (tmp_path / "migrations.log").read_text()
    (tmp_path / "ready").unlink()
    result = subprocess.run([*command[:-1], script], env=dict(env, FAIL_SCRIPT="init-knowledge-schema.sh"),
                            capture_output=True, text=True)
    assert result.returncode != 0
    assert not (tmp_path / "ready").exists()
    assert "website-schema-ready" in str(container["readinessProbe"])
    mounts = {entry["mountPath"]: entry for entry in container["volumeMounts"]}
    assert "/schema" in mounts
    assert mounts["/docker-entrypoint-initdb.d/10-knowledge.sh"]["subPath"] == "init-knowledge-schema.sh"
    assert mounts["/docker-entrypoint-initdb.d/15-meetings.sh"]["subPath"] == "init-meetings-schema.sh"

    result = subprocess.run([*command[:-1], script], env=dict(env, FAIL_MIGRATION="1"),
                            capture_output=True, text=True)
    assert result.returncode != 0
    assert not (tmp_path / "ready").exists()
