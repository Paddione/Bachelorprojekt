"""Native migration of tests/unit/openclaw-taskfile.bats."""
import yaml

TF = "taskfiles/Taskfile.openclaw.yml"
ENV_EXAMPLE_VARS = [
    "OPENCLAW_GATEWAY_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "OPENCLAW_LOCAL_BASE_URL",
    "OPENCODE_GO_API_KEY",
    "OPENCLAW_GO_SESSION",
    "OPENCLAW_LOG_LEVEL",
]


def _tasks(repo_root):
    return yaml.safe_load((repo_root / TF).read_text(encoding="utf-8"))["tasks"]


def test_taskfile_openclaw_yml_parses_as_yaml(repo_root):
    yaml.safe_load((repo_root / TF).read_text(encoding="utf-8"))


def test_alle_pflicht_tasks_sind_vorhanden(repo_root):
    tasks = _tasks(repo_root)
    want = ["backup", "install", "configure", "start", "status", "logs", "restore", "wipe"]
    missing = [t for t in want if t not in tasks]
    assert not missing, "missing: " + " ".join(missing)


def test_das_taskfile_verwaltet_kein_opencode(run_cmd, repo_root):
    # Positive anchor first: the file parses and declares install.
    assert "install" in _tasks(repo_root)
    path = repo_root / TF
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    forbidden = [
        "npm install -g opencode",
        "npm uninstall -g opencode",
        "command -v opencode",
        ".config/opencode",
    ]
    hits = [
        f"{idx}:{line}"
        for idx, line in enumerate(text.splitlines(), start=1)
        for pat in forbidden
        if pat in line
    ]
    assert not hits, "\n".join(hits)


def test_env_example_lists_all_seven_variables_with_empty_secrets(run_cmd, repo_root):
    script = (
        "set -a\n"
        ". ./openclaw/.env.example\n"
        "for v in " + " ".join(ENV_EXAMPLE_VARS) + "; do\n"
        '  printf "%s=%s\\n" "$v" "${!v-UNSET}"\n'
        "done"
    )
    res = run_cmd(["env", "-i", "bash", "-c", script], cwd=repo_root, timeout=300)
    assert res.returncode == 0, res.output
    expected = [
        "OPENCLAW_GATEWAY_TOKEN=",
        "TELEGRAM_BOT_TOKEN=",
        "TELEGRAM_CHAT_ID=",
        "OPENCLAW_LOCAL_BASE_URL=http://127.0.0.1:1919/v1",
        "OPENCODE_GO_API_KEY=",
        "OPENCLAW_GO_SESSION=",
        "OPENCLAW_LOG_LEVEL=info",
    ]
    assert res.output == "\n".join(expected)


def test_root_taskfile_yml_includes_openclaw(repo_root):
    data = yaml.safe_load((repo_root / "Taskfile.yml").read_text(encoding="utf-8"))
    inc = data["includes"]["openclaw"]
    value = inc["taskfile"] if isinstance(inc, dict) else inc
    assert value == "./taskfiles/Taskfile.openclaw.yml"


def test_gitignore_excludes_openclaw_env(run_cmd, repo_root):
    # Positive anchor: the template itself is NOT ignored.
    res = run_cmd(["git", "check-ignore", "-q", "openclaw/.env.example"], cwd=repo_root, timeout=300)
    assert res.returncode == 1
    res = run_cmd(["git", "check-ignore", "-q", "openclaw/.env"], cwd=repo_root, timeout=300)
    assert res.returncode == 0
