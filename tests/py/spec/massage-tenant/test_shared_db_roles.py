"""Massage-Tenant (T901440): shared-db-Init — beide Skripte real ausfuehren.

Extrahiert ConfigMap-Key `init-databases.sh` und postStart-command aus dem
tatsaechlichen Kustomize-Render (inkl. produktivem $$-Unwrapping) und fuehrt
beide als echte Bash-Prozesse mit psql/pg_isready-Doubles aus. Keine reale DB.
"""
import os
import re
import stat
import subprocess
from pathlib import Path

import pytest
import yaml


def _yaml_load_all(text: str):
    """Parse multi-doc YAML incl. upstream CRD value-tags (T002236)."""
    loader = yaml.SafeLoader
    loader.add_constructor(
        "tag:yaml.org,2002:value", lambda ldr, node: ldr.construct_scalar(node)
    )
    return list(yaml.load_all(text, Loader=loader))




NEW_ROLES = ["website_massage", "pocket_id_korczewski"]
NEW_PASSWORD_VARS = ["WEBSITE_MASSAGE_DB_PASSWORD", "POCKET_ID_KORCZEWSKI_DB_PASSWORD"]
EXISTING_PASSWORD_VARS = [
    "NEXTCLOUD_DB_PASSWORD",
    "VAULTWARDEN_DB_PASSWORD",
    "WEBSITE_DB_PASSWORD",
    "VIDEOVAULT_DB_PASSWORD",
    "POCKET_ID_DB_PASSWORD",
]
OLD_DBS = ["nextcloud", "vaultwarden", "website", "pentest", "videovault", "pocket_id"]


def _render_shared_db(repo_root: Path) -> str:
    res = subprocess.run(
        ["kustomize", "build", "prod-fleet/mentolder", "--load-restrictor=LoadRestrictionsNone"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert res.returncode == 0, f"kustomize build failed: {res.stderr}"
    # Produktives $$-Unwrapping wie scripts/flux-render-artifact.sh
    return re.sub(r"\$\$([a-zA-Z0-9_({!?])", r"$\1", res.stdout)


def _extract_scripts(rendered: str):
    docs = [d for d in _yaml_load_all(rendered) if d]
    init_script = None
    poststart_script = None
    for doc in docs:
        if doc.get("kind") == "ConfigMap" and (doc.get("metadata", {}) or {}).get(
            "name"
        ) == "shared-db-init":
            init_script = (doc.get("data", {}) or {}).get("init-databases.sh")
        if doc.get("kind") == "Deployment" and (doc.get("metadata", {}) or {}).get(
            "name"
        ) == "shared-db":
            containers = (
                doc.get("spec", {})
                .get("template", {})
                .get("spec", {})
                .get("containers", [])
            )
            for container in containers:
                cmd = (
                    (container.get("lifecycle", {}) or {})
                    .get("postStart", {})
                    .get("exec", {})
                    .get("command", [])
                )
                if len(cmd) >= 3 and cmd[0] == "/bin/bash" and cmd[1] == "-c":
                    poststart_script = cmd[2]
    assert init_script, "init-databases.sh fehlt im Render"
    assert poststart_script, "postStart-command fehlt im Render"
    return {"init": init_script, "poststart": poststart_script}


@pytest.fixture(scope="module")
def scripts(repo_root: Path):
    return _extract_scripts(_render_shared_db(repo_root))


def _write_doubles(bin_dir: Path):
    """psql protokolliert argv+stdin; Existenzabfragen steuerbar via FAKE_PSQL_MODE."""
    bin_dir.mkdir(parents=True, exist_ok=True)
    psql = bin_dir / "psql"
    psql.write_text(
        """#!/bin/bash
echo "ARGV: $*" >> "$FAKE_PSQL_LOG"
cat >> "$FAKE_PSQL_LOG"
echo "---END-CALL---" >> "$FAKE_PSQL_LOG"
# Existenzabfragen: mode=missing -> nichts (anlegen), mode=exists -> Treffer
for arg in "$@"; do
  case "$arg" in
    *"FROM pg_database"*) [ "$FAKE_PSQL_MODE" = "exists" ] && echo " 1" || true; exit 0 ;;
    *"FROM pg_roles"*) [ "$FAKE_PSQL_MODE" = "exists" ] && echo " 1" || true; exit 0 ;;
  esac
done
exit 0
""",
        encoding="utf-8",
    )
    for name, body in {
        "pg_isready": "#!/bin/bash\nexit 0\n",
        "sleep": "#!/bin/bash\nexit 0\n",
    }.items():
        (bin_dir / name).write_text(body, encoding="utf-8")
    for tool in ("psql", "pg_isready", "sleep"):
        (bin_dir / tool).chmod((bin_dir / tool).stat().st_mode | stat.S_IEXEC)


def _run_script(script: str, tmp_path: Path, pw_values: dict, mode: str = "missing"):
    _write_doubles(tmp_path / "bin")
    log = tmp_path / "psql.log"
    log.write_text("", encoding="utf-8")
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{tmp_path / 'bin'}:{env['PATH']}",
            "FAKE_PSQL_LOG": str(log),
            "FAKE_PSQL_MODE": mode,
            "POSTGRES_USER": "postgres",
            "POSTGRES_DB": "postgres",
        }
    )
    for var in EXISTING_PASSWORD_VARS:
        env[var] = "synth-existing-pw"
    for var in NEW_PASSWORD_VARS:
        env.pop(var, None)
    env.update(pw_values)
    script_file = tmp_path / "script.sh"
    script_file.write_text(script, encoding="utf-8")
    res = subprocess.run(
        ["bash", str(script_file)], env=env, capture_output=True, text=True, timeout=120
    )
    return res, log.read_text(encoding="utf-8")


@pytest.mark.parametrize("path", ["init", "poststart"])
def test_scripts_have_valid_bash_syntax(scripts, tmp_path: Path, path: str):
    script_file = tmp_path / f"{path}.sh"
    script_file.write_text(scripts[path], encoding="utf-8")
    res = subprocess.run(
        ["bash", "-n", str(script_file)], capture_output=True, text=True, timeout=30
    )
    assert res.returncode == 0, f"bash -n {path} failed: {res.stderr}"


@pytest.mark.parametrize("path", ["init", "poststart"])
def test_new_roles_created_idempotently(scripts, tmp_path: Path, path: str):
    pw = {v: "synth-new-pw" for v in NEW_PASSWORD_VARS}
    res, log = _run_script(scripts[path], tmp_path, pw, mode="missing")
    assert res.returncode == 0, f"{path} exit {res.returncode}: {res.stderr}"
    assert log.strip(), f"{path} hat psql nie aufgerufen (Log leer)"
    for role in NEW_ROLES:
        assert role in log, f"Rolle {role} fehlt im {path}-Lauf"
    # Idempotenz: Rollen-Anlage ist per IF NOT EXISTS geprueft (serverseitig),
    # DB-Anlage im postStart clientseitig — im "vorhanden"-Fall kein CREATE.
    for role in NEW_ROLES:
        assert re.search(
            rf"IF NOT EXISTS \(SELECT FROM pg_roles WHERE rolname *= *'{role}'\)",
            scripts[path],
        ), f"{path}: Rolle {role} ohne IF-NOT-EXISTS-Guard"
    if path == "poststart":
        _, log_exists = _run_script(scripts[path], tmp_path, pw, mode="exists")
        assert "CREATE DATABASE" not in log_exists, (
            f"{path} legt vorhandene DBs erneut an"
        )
        assert "CREATE DATABASE" in log, f"{path} legt fehlende DBs nicht an"


@pytest.mark.parametrize("path", ["init", "poststart"])
@pytest.mark.parametrize(
    "case",
    [
        {"env": {}, "expect_alter": []},
        {"env": {"WEBSITE_MASSAGE_DB_PASSWORD": ""}, "expect_alter": []},
        {
            "env": {"WEBSITE_MASSAGE_DB_PASSWORD": "pw-massage-1"},
            "expect_alter": ["website_massage"],
        },
        {
            "env": {"POCKET_ID_KORCZEWSKI_DB_PASSWORD": "pw-pocket-1"},
            "expect_alter": ["pocket_id_korczewski"],
        },
        {
            "env": {
                "WEBSITE_MASSAGE_DB_PASSWORD": "pw-massage-2",
                "POCKET_ID_KORCZEWSKI_DB_PASSWORD": "pw-pocket-2",
            },
            "expect_alter": ["website_massage", "pocket_id_korczewski"],
        },
    ],
)
def test_empty_password_guard(scripts, tmp_path: Path, path: str, case: dict):
    res, log = _run_script(scripts[path], tmp_path, case["env"], mode="missing")
    assert res.returncode == 0, f"{path} exit {res.returncode}: {res.stderr}"
    assert "PASSWORD ''" not in log, f"{path}: leere Passwort-Zuweisung"
    for role in NEW_ROLES:
        alters = [
            line
            for line in log.splitlines()
            if "ALTER" in line and role in line and "PASSWORD" in line
        ]
        if role in case["expect_alter"]:
            assert alters, f"{path}: ALTER PASSWORD fuer {role} fehlt trotz gesetztem Wert"
            expected = case["env"][
                "WEBSITE_MASSAGE_DB_PASSWORD"
                if role == "website_massage"
                else "POCKET_ID_KORCZEWSKI_DB_PASSWORD"
            ]
            assert any(expected in line for line in alters), (
                f"{path}: Testwert fuer {role} nicht im ALTER"
            )
        else:
            assert not alters, (
                f"{path}: ALTER PASSWORD fuer {role} ohne gueltigen Wert: {alters}"
            )


@pytest.mark.parametrize("path", ["init", "poststart"])
def test_existing_roles_keep_password_sync(scripts, tmp_path: Path, path: str):
    res, log = _run_script(scripts[path], tmp_path, {}, mode="missing")
    assert res.returncode == 0
    for role in ("nextcloud", "vaultwarden", "website", "videovault"):
        assert re.search(
            rf"ALTER.*{role}.*PASSWORD.*synth-existing-pw", log
        ), f"{path}: bestehende Rolle {role} ohne Passwort-Sync"
