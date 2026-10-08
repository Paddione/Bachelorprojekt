"""Native migration of tests/unit/fleet-dns-cutover.bats."""
import os
import re
from pathlib import Path

import pytest

# Unit tests for the fleet DNS cutover mechanism.


def _grep_after(lines, pattern: str, after: int) -> str:
    """grep -A <after> <pattern> over lines; groups separated by '--' like GNU grep."""
    out = []
    last_printed = -1
    for idx, line in enumerate(lines):
        if pattern not in line:
            continue
        start = idx
        end = min(len(lines) - 1, idx + after)
        if out and start > last_printed + 1:
            out.append("--")
        for j in range(max(start, last_printed + 1), end + 1):
            out.append(lines[j])
        last_printed = end
    return "\n".join(out)


def _grep_e(path: Path, regex: str) -> str:
    """grep -E output: matching lines joined with newlines (empty when none)."""
    pat = re.compile(regex)
    return "\n".join(line for line in path.read_text(encoding="utf-8").splitlines()
                     if pat.search(line))


@pytest.fixture
def fake_curl(tmp_path):
    """Mirror _make_fake_curl(): a curl stub that logs every call to CURL_LOG.

    The BATS helper is called before FIXTURE_GET_DOMAINS is set, so the stub is
    generated with an empty fixture path, exactly as in the original.
    """
    fake_bin = tmp_path / "fakebin"
    fake_bin.mkdir()
    curl_log = tmp_path / "curl.log"
    curl_log.write_text("", encoding="utf-8")
    script = fake_bin / "curl"
    script.write_text(
        "#!/usr/bin/env bash\n"
        f'echo "$@" >> "{curl_log}"\n'
        "if printf '%s\\n' \"$@\" | grep -q 'get_domains'; then\n"
        '  cat ""\n'
        "fi\n"
        "exit 0\n",
        encoding="utf-8",
    )
    script.chmod(0o755)
    return {"bin": fake_bin, "log": curl_log}


def _cutover_env(fake, state_dir, **extra):
    env = {
        "PATH": f"{fake['bin']}{os.pathsep}{os.environ.get('PATH', '')}",
        "PROD_DOMAIN": "mentolder.de",
        "FLEET_NODE_IP": "204.168.244.104",
        "IPV64_API_KEY": "testkey",
        "FLEET_DNS_STATE_DIR": str(state_dir),
    }
    env.update(extra)
    return env


@pytest.fixture
def cutover_script(repo_root):
    return str(repo_root / "scripts" / "fleet-dns-cutover.sh")


def test_fleet_mentolder_env_pins_turn_public_ip_to_pk_hetzner_4(repo_root):
    out = _grep_e(repo_root / "environments" / "fleet-mentolder.yaml", "TURN_PUBLIC_IP")
    assert out != ""
    assert "204.168.244.104" in out
    assert "46.225.125.59" not in out
    assert "178.104.169.206" not in out


def test_plan_mentolder_change_set_is_a_records_only_allowlisted_prefixes_correct_ips(run_cmd, repo_root, cutover_script):
    r = run_cmd(["bash", cutover_script, "plan"],
                env={"PROD_DOMAIN": "mentolder.de", "STREAM_PIN_IP": "204.168.244.104"})
    assert r.returncode == 0
    for needle in ["A|@|204.168.244.104", "A|@|37.27.251.38", "A|@|62.238.23.79",
                   "A|*|62.238.23.79", "A|turn|204.168.244.104"]:
        assert needle in r.output


def test_plan_change_set_never_contains_mail_or_non_a_records(run_cmd, cutover_script):
    r = run_cmd(["bash", cutover_script, "plan"],
                env={"PROD_DOMAIN": "mentolder.de", "STREAM_PIN_IP": "204.168.244.104"})
    assert r.returncode == 0
    for needle in ["MX", "TXT", "CNAME", "mailbox", "tutanota", "_dmarc",
                   "_domainkey", "mta-sts", "spf"]:
        assert needle not in r.output
    for line in r.output.splitlines():
        if not line.startswith("CHANGE:"):
            continue
        rest = line[len("CHANGE: "):] if line.startswith("CHANGE: ") else line
        assert rest.startswith("A|"), f"non-A change: {line}"


def test_korczewski_pins_the_turn_subdomain_to_the_configured_turn_public_ip(run_cmd, cutover_script):
    r = run_cmd(["bash", cutover_script, "plan"],
                env={"PROD_DOMAIN": "korczewski.de", "TURN_PUBLIC_IP": "37.27.251.38"})
    assert r.returncode == 0
    assert "A|turn|37.27.251.38" in r.output
    assert "A|@|204.168.244.104" in r.output


def test_fails_loudly_when_required_env_vars_are_missing(run_cmd, cutover_script, monkeypatch):
    monkeypatch.delenv("PROD_DOMAIN", raising=False)
    r = run_cmd(["bash", cutover_script, "plan"])
    assert r.returncode != 0
    assert "not set" in r.output


def test_cutover_issues_only_type_a_ipv64_writes_for_allowlisted_prefixes(run_cmd, cutover_script, fake_curl, tmp_path):
    r = run_cmd(["bash", cutover_script, "cutover"], env=_cutover_env(fake_curl, tmp_path))
    assert r.returncode == 0
    log = fake_curl["log"].read_text(encoding="utf-8")
    assert not re.search(r"type=MX|type=TXT|type=CNAME", log)


def test_cutover_writes_a_rollback_state_file(run_cmd, cutover_script, fake_curl, tmp_path):
    run_cmd(["bash", cutover_script, "cutover"], env=_cutover_env(fake_curl, tmp_path)).check()
    assert (tmp_path / "fleet-dns-rollback-mentolder.de.state").is_file()


def test_rollback_restores_exactly_the_recorded_state_lines(run_cmd, cutover_script, fake_curl, tmp_path):
    (tmp_path / "fleet-dns-rollback-mentolder.de.state").write_text(
        "A|@|46.225.125.59\n\n", encoding="utf-8")
    r = run_cmd(["bash", cutover_script, "rollback"], env=_cutover_env(fake_curl, tmp_path))
    assert r.returncode == 0
    assert "content=46.225.125.59" in fake_curl["log"].read_text(encoding="utf-8")


def test_rollback_fails_loudly_when_no_state_file_exists(run_cmd, cutover_script, fake_curl, tmp_path):
    r = run_cmd(["bash", cutover_script, "rollback"], env=_cutover_env(fake_curl, tmp_path))
    assert r.returncode != 0
    assert "no rollback state" in r.output


def test_taskfile_declares_fleet_dns_cutover_and_fleet_dns_rollback(repo_root):
    out = _grep_e(repo_root / "taskfiles" / "Taskfile.platform.yml",
                  r"^[ \t]+fleet:dns:(cutover|rollback):")
    assert out != ""
    assert "fleet:dns:cutover:" in out
    assert "fleet:dns:rollback:" in out


def test_fleet_shared_services_uses_office_hosts_not_collabora_for_collabora(repo_root):
    lines = (repo_root / "taskfiles" / "Taskfile.platform.yml").read_text(encoding="utf-8").splitlines()
    out = _grep_after(lines, "fleet:shared-services:", 25)
    assert out != ""
    assert 'COLLABORA_HOST="office.' in out
    assert 'COLLABORA_HOST="collabora.' not in out


def test_fleet_shared_services_aliasgroup_references_files_not_cloud(repo_root):
    lines = (repo_root / "taskfiles" / "Taskfile.platform.yml").read_text(encoding="utf-8").splitlines()
    out = _grep_after(lines, "fleet:shared-services:", 25)
    assert out != ""
    # Taskfile uses double-backslash (YAML literal block -> envsubst escaping).
    assert r'ALIASGROUP1="https://files\\' in out
    assert r'ALIASGROUP1="https://cloud\\' not in out
