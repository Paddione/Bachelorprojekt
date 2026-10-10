"""Native migration of tests/spec/workspace-deploy/ntfy-token-escaping-T900059.bats."""

import os
import re
import subprocess

import pytest


@pytest.fixture
def paths(repo_root):
    return {
        "manifest": repo_root / "k3d" / "ntfy.yaml",
        "schema": repo_root / "environments" / "schema.yaml",
        "taskfile": repo_root / "taskfiles" / "Taskfile.workspace.yml",
        "flux_render": repo_root / "scripts" / "flux-render-artifact.sh",
    }


def _sed_ranges(lines, start_re, end_re):
    """Emuliert sed -n '/start/,/end/p' (mehrere Bereiche, Ende inklusive, bis EOF)."""
    out = []
    inside = False
    for line in lines:
        if not inside and re.search(start_re, line):
            inside = True
            out.append(line)
            if re.search(end_re, line):
                inside = False
            continue
        if inside:
            out.append(line)
            if re.search(end_re, line):
                inside = False
    return out


def _render_token_lines(paths, run_cmd):
    lines = paths["manifest"].read_text(encoding="utf-8").splitlines()
    tokens = [l for l in lines if "ntfy token add" in l]
    tokens = [re.sub(r': \$\{([a-zA-Z0-9_]+)\}[ \t]*$', r': "${\1}"', l) for l in tokens]
    env = {"PROD_DOMAIN": "example.org", "SMTP_HOST": "smtp.example.org", "SMTP_PORT": "587",
           "SMTP_USER": "x", "POCKET_ID_SMTP_TLS": "starttls"}
    proc = subprocess.run(
        ["envsubst", "$PROD_DOMAIN $SMTP_HOST $SMTP_PORT $SMTP_USER $POCKET_ID_SMTP_TLS"],
        input="\n".join(tokens) + "\n", capture_output=True, text=True,
        env={**os.environ, **env},
    )
    out = proc.stdout.splitlines()
    return [re.sub(r"\$\$([a-zA-Z0-9_({!?])", r"$\1", l) for l in out]


def test_t900059_k3d_ntfy_yaml_carries_both_tokens_escaped_revert_guard(paths):
    text = paths["manifest"].read_text(encoding="utf-8")
    # Positiv-Anker: die escapte Form MUSS da sein.
    lines = text.splitlines()
    assert sum(1 for l in lines if '"$${NTFY_TOKEN_OPENCODE}"' in l) == 1
    assert sum(1 for l in lines if '"$${NTFY_TOKEN_AGY}"' in l) == 1
    # Negativ-Aussage: keine unescapte single-${}-Form mehr.
    unescaped = [l for l in lines if '"${NTFY_TOKEN_' in l.replace("$$", "")]
    assert unescaped == []


def test_t900059_ntfy_tokens_survive_the_full_deploy_pipeline_as_literal(paths, run_cmd):
    rendered = "\n".join(_render_token_lines(paths, run_cmd))
    assert 'ntfy token add opencode "${NTFY_TOKEN_OPENCODE}"' in rendered
    assert 'ntfy token add agy "${NTFY_TOKEN_AGY}"' in rendered
    emptied = [l for l in rendered.splitlines() if re.search(r'ntfy token add [^ ]* ""', l)]
    assert emptied == []


def test_t900059_schema_yaml_provides_ntfy_token_and_pushover_stays_removed(paths):
    lines = paths["schema"].read_text(encoding="utf-8").splitlines()
    for key in ("NTFY_TOKEN_OPENCODE", "NTFY_TOKEN_AGY"):
        assert any(re.match(rf"^[ \t]+- name: {key}$", l) for l in lines), f"FAIL: environments/schema.yaml misses entry: {key}"
    # Pushover routing decommissioned (T014542), dead config removed (T901739).
    for key in ("PUSHOVER_USER", "PUSHOVER_TOKEN"):
        assert not any(re.match(rf"^[ \t]+- name: {key}$", l) for l in lines), f"FAIL: environments/schema.yaml reintroduces removed entry: {key}"


def test_t900059_both_render_pipelines_keep_the_unescape_stage_escape_resolves(paths, run_cmd):
    # Taskfile workspace:deploy dev branch: Block zwischen den Markern, darin der Bereich
    # von 'kustomize build k3d/' bis 'kubectl apply'.
    taskfile = paths["taskfile"].read_text(encoding="utf-8").splitlines()
    block = _sed_ranges(taskfile, r"^  workspace:deploy:$", r"^  workspace:partial-deploy:$")
    section = _sed_ranges(block, r"kustomize build k3d/", r"kubectl apply")
    count = sum(1 for l in section if "({!?])/$\\1/g" in l)
    assert count >= 1
    # Flux renderer (prod/GitOps path)
    render_lines = paths["flux_render"].read_text(encoding="utf-8").splitlines()
    count = sum(1 for l in render_lines if r"s/\$\$([a-zA-Z0-9_({!?])/$\1/g" in l)
    assert count >= 1
