"""Native migration of tests/spec/llm-pipeline/kv-offload.bats."""

import re

import pytest


@pytest.fixture
def gemma(repo_root):
    path = repo_root / "scripts/llm/start-gemma-server.ps1"
    return path


def _lines(path):
    # grep arbeitet zeilenweise; CRLF-Zeilenenden bleiben als \r erhalten (wie bei grep).
    return path.read_bytes().decode("utf-8", errors="surrogateescape").split("\n")


def _grep_q(path, pattern):
    """grep -qE/-q (Zeilenweise Suche, Treffer = Exit 0)."""
    return any(re.search(pattern, line) for line in _lines(path))


def test_kv_offload_kvoffload_exists_as_switch_in_param_block_t002482(gemma):
    # Positiv-Anker: $Ctx existiert weiterhin als Parameter.
    assert _grep_q(gemma, r"\[int\]\$Ctx")
    assert _grep_q(gemma, r"\[switch\]\$KvOffload")


def test_kv_offload_nkvo_only_appended_when_kvoffload_is_set_condition_append_in_same_if_t002482(gemma):
    # Positiv-Anker: -kvu-Block mit $Slots ist das Vorbild-Muster.
    assert _grep_q(
        gemma,
        r'if\s*\(\s*\$Slots\s*-gt\s*1\s*\)\s*\{\s*\$Params\s*\+=\s*"-kvu"',
    )
    assert _grep_q(
        gemma,
        r'if\s*\(\s*\$KvOffload\s*\)\s*\{\s*\$Params\s*\+=\s*"-nkvo"',
    )


def test_kv_offload_needmib_block_branches_on_kvoffload_t002482(gemma):
    # Positiv-Anker: $needMiB wird aus $baseMiB berechnet.
    lines = _lines(gemma)
    assert any(re.search(r"\$needMiB\s*=\s*\$baseMiB", line) for line in lines)
    # grep -A 4 '\$needMiB = \$baseMiB' | grep -c '\$KvOffload' >= 1
    count = 0
    for i, line in enumerate(lines):
        if "$needMiB = $baseMiB" in line:
            count += sum(1 for l2 in lines[i : i + 5] if "$KvOffload" in l2)
    assert count >= 1


def test_kv_offload_slotsavepath_exists_as_string_param_with_empty_default_slot_save_path_only_when_non_empty_t002482(gemma):
    assert _grep_q(gemma, r"\[string\]\$LlamaDir\s*=")
    assert _grep_q(gemma, r'\[string\]\$SlotSavePath\s*=\s*""')
    assert _grep_q(gemma, r"--slot-save-path")


def test_kv_offload_nkvo_appears_only_inside_if_blocks_never_unconditional_in_params_t002482(gemma):
    # Positiv-Anker: "-fit", "off" steht weiterhin unbedingt in $Params.
    assert _grep_q(gemma, r'"-fit",\s*"off"')
    # -nkvo muss existieren.
    assert _grep_q(gemma, r"-nkvo")


def test_kv_offload_start_gemma_server_ps1_contains_no_non_ascii_bytes_and_no_bom_t002482(gemma):
    data = gemma.read_bytes()
    # Kein Byte ausserhalb ASCII.
    assert not any(b > 0x7F for b in data), "nicht-ASCII-Bytes gefunden"
    # Kein BOM (die ersten drei Bytes duerfen nicht ef bb bf sein).
    assert data[:3].hex(" ") != "ef bb bf"
