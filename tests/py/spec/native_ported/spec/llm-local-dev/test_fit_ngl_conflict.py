"""Native migration of tests/spec/llm-local-dev/fit-ngl-conflict.bats."""

from pathlib import Path


def params_block(path: Path) -> str:
    """Return the unconditional $Params = @( ... ) block body (CR-tolerant)."""
    out = []
    on = False
    for line in path.read_text(encoding="utf-8").replace("\r", "").splitlines():
        if not on and line.startswith("$Params = @("):
            on = True
            continue
        if on and line.startswith(")"):
            break
        if on:
            out.append(line)
    return "\n".join(out)


def test_start_scripts_using_fit_on_do_not_pass_ngl_unconditionally_t900171(repo_root):
    checked = 0
    offenders = []
    for f in sorted((repo_root / "scripts" / "llm").glob("start-*.ps1")):
        if '"-fit", "on"' not in f.read_text(encoding="utf-8"):
            continue
        block = params_block(f)
        assert block, f"kein $Params-Block gefunden: {f.name}"
        checked += 1
        if '"-ngl"' in block:
            offenders.append(f.name)
    assert checked >= 1, "kein Startskript mit -fit on gefunden"
    assert not offenders, f"-ngl neben -fit on (fit bricht ab): {' '.join(offenders)}"


def test_start_qwen_server_ps1_keeps_full_offload_on_the_fixed_context_path_t900171(repo_root):
    text = (repo_root / "scripts" / "llm" / "start-qwen-server.ps1").read_text(encoding="utf-8")
    lines = text.replace("\r", "").splitlines()
    context = []
    for i, line in enumerate(lines):
        if '"-fit", "off"' in line:
            context.append(line)
            if i + 1 < len(lines):
                context.append(lines[i + 1])
    assert context, "grep found no '\"-fit\", \"off\"' line"
    assert '"-ngl", "999"' in "\n".join(context)
