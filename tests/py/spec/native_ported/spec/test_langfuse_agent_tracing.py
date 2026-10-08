"""Native migration of tests/spec/langfuse-agent-tracing.bats."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import time

import pytest

BASH = shutil.which("bash") or "/usr/bin/bash"
HARNESS_PATH_TAIL = ":/usr/bin:/bin"


def _merged(args, cwd, env=None, stdin=None, clean=False):
    """bats run equivalent: stdout and stderr merged, stdout exit status."""
    full = {} if clean else dict(os.environ)
    full.update(env or {})
    proc = subprocess.run(
        args, cwd=str(cwd), env=full, input=stdin,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=600,
    )
    return proc.returncode, proc.stdout.rstrip("\n")


def _has_line(text, pattern):
    return re.search(pattern, text, re.M) is not None


@pytest.fixture(scope="module")
def rendered(repo_root, tmp_path_factory):
    """setup(): render-stack.sh core once per file; skip when the prerequisite fails."""
    path = tmp_path_factory.mktemp("langfuse") / "rendered.yaml"
    with open(path, "w", encoding="utf-8") as out:
        proc = subprocess.run(
            [BASH, str(repo_root / "scripts" / "devmesh" / "render-stack.sh"), "core"],
            cwd=str(repo_root), stdout=out, stderr=subprocess.DEVNULL, timeout=600,
        )
    if proc.returncode != 0 or path.stat().st_size == 0:
        pytest.skip("render-stack.sh Vorbedingung fehlt (kubectl/yq/envsubst/Inventar)")
    return path


def _yq_file(repo_root, expr, path):
    return _merged(["yq", "ea", "-r", expr, str(path)], repo_root)


def _yq_stdin(repo_root, expr, text):
    return _merged(["yq", "ea", "-r", expr, "-"], repo_root, stdin=text)


def _harness_env(home, path_dir):
    return {"HOME": str(home), "PATH": f"{path_dir}{HARNESS_PATH_TAIL}"}


def _stub_bin(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    for name in ("claude", "opencode", "omp", "codex"):
        stub = bin_dir / name
        stub.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        stub.chmod(0o755)
    return bin_dir


def _setup_env(tmp_path):
    home = tmp_path / "home"
    xdg = tmp_path / "xdg"
    bin_dir = tmp_path / "bin"
    for d in (home, xdg / "langfuse", bin_dir):
        d.mkdir(parents=True, exist_ok=True)
    (xdg / "langfuse" / "agent-tracing.env").write_text(
        "LANGFUSE_PUBLIC_KEY=pk-test\nLANGFUSE_SECRET_KEY=sk-test\n"
        "LANGFUSE_BASE_URL=https://langfuse.example.test\n",
        encoding="utf-8",
    )
    return home, xdg, bin_dir


def _run_setup(repo_root, tmp_path, home, xdg, bin_dir):
    env = {"HOME": str(home), "XDG_CONFIG_HOME": str(xdg), "PATH": f"{bin_dir}{HARNESS_PATH_TAIL}"}
    return _merged([BASH, str(repo_root / "scripts" / "langfuse" / "setup-harnesses.sh")], repo_root, env)


def _write_exec(path, body):
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _tracing_env(tmp_path, bin_dir_name="stubbin"):
    (tmp_path / bin_dir_name).mkdir(exist_ok=True)
    (tmp_path / "xdg").mkdir(exist_ok=True)
    (tmp_path / "cache").mkdir(exist_ok=True)
    _write_exec(tmp_path / bin_dir_name / "opencode", "#!/bin/sh\nexit 0\n")
    return {
        "HOME": str(tmp_path),
        "XDG_CONFIG_HOME": str(tmp_path / "xdg"),
        "XDG_CACHE_HOME": str(tmp_path / "cache"),
        "PATH": f"{tmp_path / bin_dir_name}{HARNESS_PATH_TAIL}",
    }


def _write_cache(tmp_path, tool_traces, gap):
    target_dir = tmp_path / "cache" / "langfuse"
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    target = target_dir / "tracing-status.json"
    target.write_text(
        '{"refreshed_at":"%s","tool_traces":%s,"last_claude_trace":null,"export_gap_session":%s}'
        % (stamp, tool_traces, gap),
        encoding="utf-8",
    )
    target.touch()


# ── T900688 ──────────────────────────────────────────────────────────────────

def test_t900688_render_stack_core_rendert_alle_langfuse_workloads(repo_root, rendered):
    status, output = _yq_file(repo_root, 'select(.metadata.name | test("^langfuse")) | .kind + "/" + .metadata.name', rendered)
    assert status == 0, output
    for obj in ("Deployment/langfuse-web", "Deployment/langfuse-worker", "StatefulSet/langfuse-clickhouse",
                "Deployment/langfuse-valkey", "StatefulSet/langfuse-minio", "Job/langfuse-db-init",
                "Deployment/langfuse-otel-redact"):
        assert obj in output, f"fehlt: {obj}"


def test_t900688_ingress_routet_api_public_otel_auf_den_redact_collector_auf_langfuse_web(repo_root, rendered):
    status, output = _yq_file(
        repo_root,
        'select(.kind == "Ingress") | .spec.rules[] | select(.host | test("^langfuse-dev\\.")) '
        '| .http.paths[] | .path + " " + .backend.service.name',
        rendered,
    )
    assert status == 0, output
    assert "/api/public/otel langfuse-otel-redact" in output
    assert "/ langfuse-web" in output


def test_t900688_collector_config_maskiert_jeden_secret_typ_aus_design_md(repo_root, rendered):
    status, output = _yq_file(
        repo_root,
        'select(.kind == "ConfigMap" and .metadata.name == "langfuse-otel-redact-config") | .data."config.yaml"',
        rendered,
    )
    assert status == 0, output
    assert "traces_url_path: /api/public/otel/v1/traces" in output
    assert "context: spanevent" in output
    assert "$$1$$2[REDACTED:kv-secret]" in output
    for typ in ("langfuse", "anthropic-openai", "github", "gitlab", "aws", "private-key", "bearer", "kv-secret"):
        assert f"[REDACTED:{typ}]" in output, f"fehlt: {typ}"


def test_t900688_kein_gerendertes_objekt_enthaelt_langfuse_key_literale(rendered):
    text = rendered.read_text(encoding="utf-8")
    count = sum(1 for line in text.splitlines() if re.search(r"(pk|sk)-lf-[A-Za-z0-9]", line))
    assert str(count) == "0"


def test_t900688_langfuse_images_sind_gepinnt(repo_root, rendered):
    status, output = _yq_file(
        repo_root,
        'select(.metadata.name == "langfuse-web" or .metadata.name == "langfuse-worker") '
        '| select(.kind == "Deployment") | .spec.template.spec.containers[].image',
        rendered,
    )
    assert status == 0, output
    assert ":latest" not in output
    assert sum(1 for line in output.splitlines() if line.endswith(":4.46.0")) == 2


def test_t900688_setup_harnesses_dry_run_plant_alle_vier_harnesses_und_schreibt_nichts(repo_root, tmp_path):
    bin_dir = _stub_bin(tmp_path)
    home = tmp_path / "home"
    home.mkdir()
    status, output = _merged(
        [BASH, str(repo_root / "scripts" / "langfuse" / "setup-harnesses.sh"), "--dry-run"],
        repo_root, _harness_env(home, bin_dir),
    )
    assert status == 0, output
    for harness in ("claude", "opencode", "omp", "codex"):
        assert _has_line(output, rf"^{harness}: "), f"fehlt: {harness}"
    assert not [p for p in home.rglob("*") if p.is_file()]


def test_t900688_setup_harnesses_dry_run_ohne_harnesses_meldet_skip_fuer_alle_vier(repo_root, tmp_path):
    home = tmp_path / "home"
    empty = tmp_path / "empty"
    home.mkdir()
    empty.mkdir()
    status, output = _merged(
        [BASH, str(repo_root / "scripts" / "langfuse" / "setup-harnesses.sh"), "--dry-run"],
        repo_root, _harness_env(home, empty),
    )
    assert status == 0, output
    assert sum(1 for line in output.splitlines() if re.search(r"not installed$", line)) == 4


def test_t900688_client_env_sh_ohne_devmesh_context_endet_mit_exit_2(repo_root):
    status, output = _merged(
        [BASH, str(repo_root / "scripts" / "langfuse" / "client-env.sh")], repo_root, {"KUBECONFIG": "/dev/null"}
    )
    assert status == 2, output


# ── T900690 ──────────────────────────────────────────────────────────────────

def test_t900690_codex_bekommt_hooks_true_auch_bei_bestehender_features_sektion(repo_root, tmp_path):
    home, xdg, bin_dir = _setup_env(tmp_path)
    _write_exec(bin_dir / "codex", "#!/bin/sh\nexit 0\n")
    (home / ".codex").mkdir()
    cfg = home / ".codex" / "config.toml"
    cfg.write_text('[features]\nprevent_idle_sleep = true\n\n[mcp_servers.x]\nurl = "http://localhost"\n',
                   encoding="utf-8")
    status, output = _run_setup(repo_root, tmp_path, home, xdg, bin_dir)
    assert status == 0, output
    text = cfg.read_text(encoding="utf-8")
    assert sum(1 for line in text.splitlines() if line.startswith("[features]")) == 1
    section = None
    matches = []
    for line in text.splitlines():
        if line.startswith("["):
            section = line
        if section == "[features]" and re.match(r"^hooks *= *true", line):
            matches.append(line)
    assert matches, "hooks = true fehlt in [features]"


def test_t900690_omp_setup_scheitert_laut_wenn_das_plugin_nach_omp_install_fehlt(repo_root, tmp_path):
    home, xdg, bin_dir = _setup_env(tmp_path)
    _write_exec(bin_dir / "omp", '#!/bin/sh\n[ "$1" = list ] && echo "No packages installed."\nexit 0\n')
    status, output = _run_setup(repo_root, tmp_path, home, xdg, bin_dir)
    assert status != 0, output
    assert "pi-observability-plugin" in output


def test_t900691_devmesh_ingress_fuer_langfuse_dev_lauscht_auf_dem_web_entrypoint(repo_root, rendered):
    status, output = _yq_file(
        repo_root,
        'select(.kind == "Ingress" and (.spec.rules[].host | test("^langfuse-dev\\\\."))) '
        '| .metadata.annotations."traefik.ingress.kubernetes.io/router.entrypoints"',
        rendered,
    )
    assert status == 0, output
    assert output == "web"


def test_t900691_devmesh_rendert_keinen_langfuse_devmesh_domain_host_mehr_und_nextauth_url_zeigt_auf_langfuse_dev(
    repo_root, rendered
):
    status, output = _yq_file(repo_root, 'select(.kind == "Ingress") | .spec.rules[].host', rendered)
    assert status == 0, output
    assert "langfuse-dev." in output
    assert not _has_line(output, r"^langfuse\.")
    status, output = _yq_file(
        repo_root,
        'select(.kind == "Deployment" and .metadata.name == "langfuse-web") '
        '| .spec.template.spec.containers[].env[] | select(.name == "NEXTAUTH_URL") | .value',
        rendered,
    )
    assert output.startswith("https://langfuse-dev."), output


def _render_fleet_proxy(repo_root):
    env = {
        "WORKSPACE_NAMESPACE": "workspace",
        "PROD_DOMAIN": "mentolder.example",
        "TLS_SECRET_NAME": "workspace-wildcard-tls",
    }
    src = repo_root / "prod-fleet" / "mentolder" / "langfuse-dev-proxy.yaml"
    with open(src, encoding="utf-8") as fh:
        status, output = _merged(
            ["envsubst", "$WORKSPACE_NAMESPACE $PROD_DOMAIN $TLS_SECRET_NAME"], repo_root, env, stdin=fh.read()
        )
    return output


def test_t900691_fleet_ingress_langfuse_dev_nutzt_das_wildcard_tls_und_den_proxy_service(repo_root):
    assert (repo_root / "prod-fleet" / "mentolder" / "langfuse-dev-proxy.yaml").is_file()
    out = _render_fleet_proxy(repo_root)
    status, output = _yq_stdin(
        repo_root,
        'select(.kind == "Ingress") | .spec.tls[0].secretName + " " + .spec.rules[0].host + " " '
        '+ .spec.rules[0].http.paths[0].backend.service.name',
        out,
    )
    assert output == "workspace-wildcard-tls langfuse-dev.mentolder.example langfuse-dev-proxy"


def test_t900691_endpointslice_zeigt_auf_die_drei_devmesh_tailscale_adressen_port_80(repo_root):
    out = _render_fleet_proxy(repo_root)
    status, output = _yq_stdin(
        repo_root,
        'select(.kind == "EndpointSlice") | (.metadata.labels."kubernetes.io/service-name") + " " '
        '+ (.ports[0].port | tostring) + " " + ([.endpoints[].addresses[0]] | sort | join(","))',
        out,
    )
    assert output == "langfuse-dev-proxy 80 100.115.236.87,100.120.125.39,100.126.111.105"


def test_t900691_fleet_overlay_bindet_den_langfuse_proxy_ein(run_cmd, repo_root):
    result = run_cmd(["kubectl", "kustomize", str(repo_root / "prod-fleet" / "mentolder")], cwd=repo_root)
    assert result.returncode == 0, result.output
    assert "name: langfuse-dev-proxy" in result.output


def test_t900692_collector_batch_behaelt_den_authorization_kontext_fuer_headers_setter(repo_root, rendered):
    status, config = _yq_file(
        repo_root,
        'select(.kind == "ConfigMap" and .metadata.name == "langfuse-otel-redact-config") | .data."config.yaml"',
        rendered,
    )
    assert status == 0, config
    status, output = _merged(["yq", "-r", ".processors.batch.metadata_keys[]", "-"], repo_root, stdin=config)
    assert output == "authorization"


def test_t900693_codex_stop_hook_ist_aktiviert_und_fuer_v0_4_0_freigegeben_zweiter_lauf_aendert_nichts(
    repo_root, tmp_path
):
    home, xdg, bin_dir = _setup_env(tmp_path)
    _write_exec(bin_dir / "codex", "#!/bin/sh\nexit 0\n")
    (home / ".codex").mkdir()
    cfg = home / ".codex" / "config.toml"
    sec = '[hooks.state."tracing@codex-observability-plugin:hooks/hooks.json:stop:0:0"]'
    cfg.write_text(
        "[features]\nhooks = true\n\n" + sec + '\ntrusted_hash = "sha256:alt"\n\n'
        '[mcp_servers.x]\nurl = "http://localhost"\n',
        encoding="utf-8",
    )
    status, output = _run_setup(repo_root, tmp_path, home, xdg, bin_dir)
    assert status == 0, output
    text = cfg.read_text(encoding="utf-8")
    assert sum(1 for line in text.splitlines() if line == sec) == 1
    selected = []
    in_section = False
    for line in text.splitlines():
        if line.startswith("["):
            in_section = line == sec
        if in_section and re.match(r"^(enabled|trusted_hash)", line):
            selected.append(line)
    joined = "\n".join(selected)
    assert "enabled = true" in joined
    assert (
        'trusted_hash = "sha256:69a05cbfa6984ec5f1433343b45480d5239c119e7332ae863f9865edc2efec74"' in joined
    )
    assert _has_line(text, r"^\[mcp_servers.x\]")
    before = hashlib.md5(cfg.read_bytes()).hexdigest()
    status, output = _run_setup(repo_root, tmp_path, home, xdg, bin_dir)
    assert hashlib.md5(cfg.read_bytes()).hexdigest() == before


# ── T900750 ──────────────────────────────────────────────────────────────────

def test_t900750_clickhouse_limit_ist_8gi(repo_root, rendered):
    status, output = _yq_file(
        repo_root,
        'select(.kind=="StatefulSet" and .metadata.name=="langfuse-clickhouse") '
        '| .spec.template.spec.containers[0].resources.limits.memory',
        rendered,
    )
    assert status == 0, output
    assert output == "8Gi"


def test_t900750_collector_setzt_fehlendes_environment_auf_development(repo_root, rendered):
    status, output = _yq_file(
        repo_root,
        'select(.kind == "ConfigMap" and .metadata.name == "langfuse-otel-redact-config") | .data."config.yaml"',
        rendered,
    )
    assert status == 0, output
    assert (
        'set(resource.attributes["langfuse.environment"], "development") '
        'where resource.attributes["langfuse.environment"] == nil'
    ) in output


def test_t900750_cronjob_langfuse_export_mountet_das_export_skript(repo_root, rendered):
    status, output = _yq_file(
        repo_root,
        'select(.kind == "CronJob" and .metadata.name == "langfuse-export") '
        '| .spec.jobTemplate.spec.template.spec.volumes[0].configMap.name',
        rendered,
    )
    assert status == 0, output
    assert output == "langfuse-export-script"
    status, output = _yq_file(
        repo_root,
        'select(.kind == "ConfigMap" and .metadata.name == "langfuse-export-script") | .data | keys | .[]',
        rendered,
    )
    assert status == 0, output
    assert "export_traces.py" in output


def test_t900750_export_traces_py_print_key(repo_root):
    status, output = _merged(
        ["python3", str(repo_root / "scripts" / "langfuse" / "export_traces.py"), "--print-key", "--date", "2026-09-27"],
        repo_root,
    )
    assert status == 0, output
    assert output == "exports/observations/2026-09-27.jsonl"


def test_t900750_export_traces_py_ohne_env_endet_mit_2(repo_root):
    status, output = _merged(
        ["python3", str(repo_root / "scripts" / "langfuse" / "export_traces.py"), "--date", "2026-09-27"],
        repo_root, {"PATH": os.environ["PATH"]}, clean=True,
    )
    assert status == 2, output


def test_t900750_tracing_status_check_meldet_fehlende_harness_config(repo_root, tmp_path):
    env = _tracing_env(tmp_path)
    status, output = _merged(
        [BASH, str(repo_root / "scripts" / "langfuse" / "tracing-status.sh"), "check"], repo_root, env
    )
    assert status == 0, output
    assert "opencode tracet nicht" in output


def test_t900750_finetune_erinnerung_ab_3000_tool_traces(repo_root, tmp_path):
    env = _tracing_env(tmp_path)
    _write_cache(tmp_path, 3000, "null")
    status, output = _merged(
        [BASH, str(repo_root / "scripts" / "langfuse" / "tracing-status.sh"), "check"], repo_root, env
    )
    assert status == 0, output
    assert "docs/runbooks/qwen35-mtp-subagent-finetuning.md" in output


def test_t900750_keine_finetune_erinnerung_bei_2999(repo_root, tmp_path):
    env = _tracing_env(tmp_path)
    _write_cache(tmp_path, 2999, "null")
    status, output = _merged(
        [BASH, str(repo_root / "scripts" / "langfuse" / "tracing-status.sh"), "check"], repo_root, env
    )
    assert status == 0, output
    assert "docs/runbooks/qwen35-mtp-subagent-finetuning.md" not in output


def test_t900750_exportluecke_nennt_den_backfill_befehl(repo_root, tmp_path):
    env = _tracing_env(tmp_path)
    _write_cache(tmp_path, 0, '"322c4ec8-dd16-4f01-8b9c-7726559d91f3"')
    status, output = _merged(
        [BASH, str(repo_root / "scripts" / "langfuse" / "tracing-status.sh"), "check"], repo_root, env
    )
    assert status == 0, output
    assert "task devmesh:langfuse:backfill SESSION=322c4ec8-dd16-4f01-8b9c-7726559d91f3" in output


def test_t900750_check_hook_liefert_sessionstart_json(repo_root, tmp_path):
    env = _tracing_env(tmp_path)
    _write_cache(tmp_path, 3000, "null")
    status, output = _merged(
        [BASH, str(repo_root / "scripts" / "langfuse" / "tracing-status.sh"), "check", "--hook"], repo_root, env
    )
    assert status == 0, output
    status, event = _merged(["jq", "-r", ".hookSpecificOutput.hookEventName"], repo_root, stdin=output)
    assert event == "SessionStart"


def test_t900750_backfill_claude_sh_lehnt_ungueltige_session_id_ab(repo_root):
    status, output = _merged([BASH, str(repo_root / "scripts" / "langfuse" / "backfill-claude.sh"), "nope"], repo_root)
    assert status == 2, output


def test_t900750_taskfile_kennt_status_und_backfill(run_cmd, repo_root):
    if shutil.which("task") is None:
        pytest.skip("task binary not installed")
    result = run_cmd(["task", "--list"], cwd=repo_root)
    assert result.returncode == 0, result.output
    assert "devmesh:langfuse:status" in result.output
    assert "devmesh:langfuse:backfill" in result.output
