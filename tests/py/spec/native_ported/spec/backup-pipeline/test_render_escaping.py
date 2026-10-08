"""Native migration of tests/spec/backup-pipeline/render-escaping.bats."""

import re
import shutil
import subprocess

import pytest
import yaml


def render_flux_like(input_path, out_path):
    """Replicates the three render stages of scripts/flux-render-artifact.sh."""
    text = input_path.read_text(encoding="utf-8")
    names = re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", text)
    runtime = sorted(set(re.findall(r"\$\$\{([A-Za-z_][A-Za-z0-9_]*)\}", text)))
    variables = sorted(set(names) - set(runtime))
    envsubst_vars = "".join(f"${v} " for v in variables)

    text = re.sub(r"(?m): \$\{([a-zA-Z0-9_]+)\}[ \t]*$", r': "${\1}"', text)
    proc = subprocess.run(
        ["envsubst", envsubst_vars], input=text, capture_output=True, text=True, check=True
    )
    text = re.sub(r"\$\$([a-zA-Z0-9_({!?])", r"$\1", proc.stdout)
    out_path.write_text(text, encoding="utf-8")


def _need(binary):
    if shutil.which(binary) is None:
        pytest.skip(f"{binary} binary not installed")


def test_flux_render_of_pvc_backup_yields_bash_n_clean_mounter_script(
    tmp_path, repo_root, run_cmd
):
    _need("envsubst")
    _need("python3")
    pvc = repo_root / "k3d" / "pvc-backup-cronjob.yaml"
    rendered = tmp_path / "rendered.yaml"
    render_flux_like(pvc, rendered)

    lines = rendered.read_text(encoding="utf-8").splitlines()
    mjob_lines = []
    in_block = False
    for line in lines:
        if not in_block and "<<MJOB" in line:
            in_block = True
            mjob_lines.append(line)
            continue
        if in_block:
            mjob_lines.append(line)
            if re.match(r"^\s*MJOB\s*$", line):
                break
    if not in_block or not mjob_lines or not re.match(r"^\s*MJOB\s*$", mjob_lines[-1]):
        pytest.skip("MJOB heredoc block not found in rendered cronjob")

    heredoc = tmp_path / "heredoc.sh"
    body = mjob_lines[1:-1]
    heredoc.write_text("\n".join(["cat <<MJOB", *body, "MJOB"]) + "\n", encoding="utf-8")
    expanded = run_cmd(
        ["bash", str(heredoc)],
        env={
            "NS": "workspace",
            "STAMP": "test123",
            "MOUNTER": "pvc-backup-mounter-test123",
            "VW_SC": "longhorn",
            "CLONES": "vaultwarden-data-backup-clone",
            "VW_AFFINITY": "",
            "VW_CLAIM": "vaultwarden-data-backup-clone",
        },
    )
    assert expanded.returncode == 0, expanded.output
    mjob_yaml = tmp_path / "mjob.yaml"
    mjob_yaml.write_text(expanded.stdout, encoding="utf-8")

    class _Loader(yaml.SafeLoader):
        pass

    _Loader.add_constructor(
        "tag:yaml.org,2002:value", lambda loader, node: loader.construct_scalar(node)
    )
    docs = list(yaml.load_all(expanded.stdout, Loader=_Loader))
    script = None
    for doc in docs:
        if doc and doc.get("kind") == "Job":
            for container in doc["spec"]["template"]["spec"]["containers"]:
                if container["name"] == "backup":
                    script = container["args"][0]
                    break
        if script is not None:
            break
    assert script, "backup container not found in generated mounter Job"
    mounter = tmp_path / "mounter.sh"
    mounter.write_text(script, encoding="utf-8")

    result = run_cmd(["bash", "-n", str(mounter)])
    if result.returncode != 0:
        head = "\n".join(script.splitlines()[:20])
        print("# rendered mounter script (first 20 lines):\n" + head)
    assert result.returncode == 0, result.output


def test_rendered_mounter_script_keeps_runtime_vars_and_has_no_empty_substitution_remnants(
    tmp_path, repo_root
):
    _need("envsubst")
    rendered = tmp_path / "rendered2.yaml"
    render_flux_like(repo_root / "k3d" / "pvc-backup-cronjob.yaml", rendered)
    text = rendered.read_text(encoding="utf-8")
    assert not any("\\ " in line for line in text.splitlines())
    assert "${STAMP}" in text
    assert "${SRC}" in text


def test_push_path_unwrap_in_taskfile_yml_handles_command_substitution(repo_root):
    taskfile = repo_root / "taskfiles" / "Taskfile.workspace.yml"
    unwrap = None
    if taskfile.exists():
        for line in taskfile.read_text(encoding="utf-8").splitlines():
            match = re.match(r".*sed -E '([^']*)'.*", line)
            if match and r"\$\$" in match.group(1):
                unwrap = match.group(1)
                break
    if not unwrap:
        pytest.skip("no sed unwrap rule found in Taskfile suite")

    result = subprocess.run(
        ["sed", "-E", unwrap],
        input="X=$$(date +%s)\n",
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout == "X=$(date +%s)\n"
