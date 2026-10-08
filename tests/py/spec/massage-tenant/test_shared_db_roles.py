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
def rendered(repo_root: Path):
    return _render_shared_db(repo_root)


@pytest.fixture(scope="module")
def scripts(rendered: str):
    return _extract_scripts(rendered)


@pytest.fixture(scope="module")
def backup_script(rendered: str):
    docs = [d for d in _yaml_load_all(rendered) if d]
    for doc in docs:
        if doc.get("kind") == "CronJob" and (doc.get("metadata", {}) or {}).get(
            "name"
        ) == "db-backup":
            containers = (
                doc.get("spec", {})
                .get("jobTemplate", {})
                .get("spec", {})
                .get("template", {})
                .get("spec", {})
                .get("containers", [])
            )
            for container in containers:
                if container.get("name") == "backup":
                    args = container.get("args", [])
                    assert args, "backup-container ohne args"
                    return args[0]
    raise AssertionError("db-backup CronJob fehlt im Render")


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
    # Der postStart ruft /scripts/ensure-*.sh im Container auf — im Test durch
    # Stubs ersetzen (Pfad-Rewrite, nur Test-Harness; produktiver Pfad un Veraendert).
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    for name in (
        "ensure-knowledge-schema.sh",
        "ensure-meetings-schema.sh",
        "ensure-bachelorprojekt-schema.sh",
    ):
        stub = scripts_dir / name
        stub.write_text(
            f'#!/bin/bash\necho "ENSURE-STUB: {name} WEBSITE_SCHEMA_DB=${{WEBSITE_SCHEMA_DB:-website}}" >> "$FAKE_PSQL_LOG"\nexit 0\n',
            encoding="utf-8",
        )
        stub.chmod(0o755)
    script = script.replace("/scripts/", f"{scripts_dir}/")
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
            # Wertuebergabe per psql-Variable: Wert steht in der -v-Zeile im Log
            assert expected in log, f"{path}: Testwert fuer {role} nicht uebergeben"
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


# ── Backup-CronJob (p1-Task 5) ───────────────────────────────────────────────

def test_backup_cronjob_covers_massage_dbs(rendered: str, backup_script: str):
    assert "website_massage" in backup_script
    assert "pocket_id_korczewski" in backup_script
    assert "WEBSITE_MASSAGE_DB_PASSWORD" in backup_script
    assert "POCKET_ID_KORCZEWSKI_DB_PASSWORD" in backup_script
    # Skip-Logik: unkonfigurierte neue Ziele ueberspringen, Rest dumpen
    assert "not configured yet" in backup_script
    # Secret-Keys optional wie in p1 vereinbart
    docs = [d for d in _yaml_load_all(rendered) if d]
    cronjob = next(
        d
        for d in docs
        if d.get("kind") == "CronJob"
        and (d.get("metadata", {}) or {}).get("name") == "db-backup"
    )
    containers = (
        cronjob.get("spec", {})
        .get("jobTemplate", {})
        .get("spec", {})
        .get("template", {})
        .get("spec", {})
        .get("containers", [])
    )
    backup = next(c for c in containers if c.get("name") == "backup")
    env_by_name = {e.get("name"): e for e in backup.get("env", [])}
    for key in ("WEBSITE_MASSAGE_DB_PASSWORD", "POCKET_ID_KORCZEWSKI_DB_PASSWORD"):
        assert key in env_by_name, f"{key} fehlt im backup-Container-Env"
        ref = (env_by_name[key].get("valueFrom") or {}).get("secretKeyRef") or {}
        assert ref.get("optional") is True, f"{key} muss optional sein"
        assert ref.get("name") == "workspace-secrets"


def _extract_db_loop(backup_script: str) -> str:
    match = re.search(r"for db in .*?done", backup_script, re.DOTALL)
    assert match, "DB-Loop im Backup-Skript nicht gefunden"
    return match.group(0)


def _run_backup_loop(loop: str, tmp_path: Path, pw_values: dict):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    (bin_dir / "pg_dump").write_text(
        '#!/bin/bash\necho "PGDUMP-TARGET: $*" >> "$FAKE_PGDUMP_LOG"\nprintf "PGDMP-fake-archive-for-test-"; head -c 300 /dev/zero | tr "\\0" "x"; printf "\\n"\n',
        encoding="utf-8",
    )
    (bin_dir / "pg_dump").chmod(0o755)
    dump_log = tmp_path / "pgdump.log"
    dump_log.write_text("", encoding="utf-8")
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir(exist_ok=True)
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{bin_dir}:{env['PATH']}",
            "FAKE_PGDUMP_LOG": str(dump_log),
            "STAMP": "test",
            "BACKUP_DIR": str(backup_dir),
            "NEXTCLOUD_DB_PASSWORD": "synth",
            "VAULTWARDEN_DB_PASSWORD": "synth",
            "WEBSITE_DB_PASSWORD": "synth",
        }
    )
    for var in ("WEBSITE_MASSAGE_DB_PASSWORD", "POCKET_ID_KORCZEWSKI_DB_PASSWORD"):
        env.pop(var, None)
    env.update(pw_values)
    loop_file = tmp_path / "loop.sh"
    loop_file.write_text("set -euo pipefail\n" + loop + "\n", encoding="utf-8")
    res = subprocess.run(
        ["bash", str(loop_file)], env=env, capture_output=True, text=True, timeout=120
    )
    return res, dump_log.read_text(encoding="utf-8")


def test_backup_loop_skips_unconfigured_targets(backup_script: str, tmp_path: Path):
    loop = _extract_db_loop(backup_script)
    res, dump_log = _run_backup_loop(loop, tmp_path, {})
    assert res.returncode == 0, f"Loop bricht ohne neue Passwoerter ab: {res.stderr}"
    assert "Skipping website_massage" in res.stdout or "Skipping website_massage" in res.stderr
    for db in ("nextcloud", "vaultwarden", "website"):
        assert db in dump_log, f"{db} wurde nicht gedumpt"
    assert "website_massage" not in dump_log
    assert "pocket_id_korczewski" not in dump_log


def test_backup_loop_dumps_configured_massage_targets(
    backup_script: str, tmp_path: Path
):
    loop = _extract_db_loop(backup_script)
    res, dump_log = _run_backup_loop(
        loop,
        tmp_path,
        {
            "WEBSITE_MASSAGE_DB_PASSWORD": "synth-massage",
            "POCKET_ID_KORCZEWSKI_DB_PASSWORD": "synth-pocket",
        },
    )
    assert res.returncode == 0, f"Loop mit Passwoertern fehlgeschlagen: {res.stderr}"
    assert "website_massage" in dump_log
    assert "pocket_id_korczewski" in dump_log
