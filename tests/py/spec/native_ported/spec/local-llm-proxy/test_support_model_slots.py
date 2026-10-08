"""Native migration of tests/spec/local-llm-proxy/support-model-slots.bats."""

# [T006840/T007033]

import json
import re
from pathlib import Path

import pytest

E2B = "gemma-4-e2b@ud-q4_k_xl"
QWEN = "qwen3.5-4b@q6_k"


def _lmstudio_block(model_file: Path) -> str:
    """awk: from '"lmstudio": {' to the first line matching ^ {4}}."""
    out = []
    in_block = False
    for line in model_file.read_text(encoding="utf-8").splitlines():
        if re.search(r'"lmstudio": \{', line):
            in_block = True
        if in_block and re.match(r"^[ \t]{4}\}", line):
            out.append(line)
            break
        if in_block:
            out.append(line)
    return "\n".join(out)


def _slot_entry(model_file: Path, key: str) -> str:
    """awk: from the '"<key>": {' line to the first line matching ^ {8}}."""
    out = []
    in_entry = False
    needle = f'"{key}": {{'
    for line in model_file.read_text(encoding="utf-8").splitlines():
        if needle in line:
            in_entry = True
        if in_entry and re.match(r"^[ \t]{8}\}", line):
            out.append(line)
            break
        if in_entry:
            out.append(line)
    return "\n".join(out)


def _active(text: str):
    return [l for l in text.splitlines() if not re.match(r"^[ \t]*(#|//)", l)]


def _count(lines, needle):
    return sum(1 for l in lines if needle in l)


@pytest.fixture
def model_file(repo_root):
    return repo_root / ".opencode/agent-models.jsonc"


def test_support_model_slots_t006840_lmstudio_slots_sind_deklariert_limits_16384_4096_bzw_32768_4096(model_file):
    block = _lmstudio_block(model_file)
    if not block:
        pytest.skip("lmstudio-Provider ist retired (T900164, docs/agent-guide/registry/retired.md)")
    active = _active(block)
    assert _count(active, f'"{E2B}"') == 1
    assert _count(active, f'"{QWEN}"') == 1

    e2b = _slot_entry(model_file, E2B).splitlines()
    qwen = _slot_entry(model_file, QWEN).splitlines()
    assert _count(e2b, '"context": 16384') == 1
    assert _count(e2b, '"output": 4096') == 1
    assert _count(qwen, '"context": 32768') == 1
    assert _count(qwen, '"output": 4096') == 1


def test_support_model_slots_t006840_die_neuen_slot_eintraege_enthalten_keine_backend_port_literale(model_file):
    block = _lmstudio_block(model_file)
    if not block:
        pytest.skip("lmstudio-Provider ist retired (T900164, docs/agent-guide/registry/retired.md)")
    active = _active(block)
    assert _count(active, f'"{E2B}"') == 1
    assert _count(active, f'"{QWEN}"') == 1

    entries = _active(_slot_entry(model_file, E2B)) + _active(_slot_entry(model_file, QWEN))
    assert sum(1 for l in entries if re.search(r":1234|:8093", l)) == 0


def test_support_model_slots_t006840_beide_lmstudio_slots_erscheinen_in_der_llm_proxy_discovery(run_cmd, repo_root):
    proxy = __import__("os").environ.get("LLM_PROXY_URL", "http://127.0.0.1:18235")
    health = run_cmd(
        ["bash", "-c", f'source "{repo_root}/tests/spec/local-llm-proxy/helpers/llm-endpoint.bash"; '
                       f'llm_endpoint_healthy "{proxy}/v1/models" 5'],
        cwd=repo_root,
    )
    if health.returncode != 0:
        pytest.skip(f"llm-proxy auf {proxy} nicht erreichbar (HTTP {health.stdout.strip() or '000'}) — kein Aussagewert")

    models = run_cmd(["curl", "-s", "--max-time", "10", f"{proxy}/v1/models"], cwd=repo_root)
    assert models.returncode == 0
    body = json.loads(models.stdout)
    ids = [str(d["id"]) for d in body["data"]]

    state = run_cmd(["curl", "-s", "--max-time", "10", f"{proxy}/admin/state"], cwd=repo_root)
    try:
        lmstudio_backends = sum(1 for b in (json.loads(state.stdout).get("backends") or []) if b.get("kind") == "lmstudio")
    except (ValueError, AttributeError):
        lmstudio_backends = 0
    if lmstudio_backends == 0:
        pytest.skip("kein lmstudio-Backend im Proxy registriert — Geraete offline/LM Link nicht verbunden, kein Aussagewert")

    assert sum(1 for i in ids if E2B in i) == 1
    assert sum(1 for i in ids if QWEN in i) == 1
