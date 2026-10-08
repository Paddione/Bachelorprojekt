"""Native migration of tests/spec/unsloth-training-env/template-guard.bats."""

import pytest

CORPUS = '{"messages": [{"role": "user", "content": "Hallo"}, {"role": "assistant", "content": "Hi"}]}\n'

HUB = (
    "{%- for message in messages -%}\n"
    "<start_of_turn>{{ message['role'] }}\n"
    "{{ message['content'] }}<end_of_turn>\n"
    "{% endfor -%}\n"
    "{%- if add_generation_prompt -%}\n"
    "<start_of_turn>model\n"
    "{%- endif -%}\n"
)

HUB_GEN = (
    "{%- for message in messages -%}\n"
    "{%- if message['role'] == 'user' -%}\n"
    "{{- '<start_of_turn>user\\n' + message['content'] + '<end_of_turn>\\n' -}}\n"
    "{%- elif message['role'] == 'assistant' -%}\n"
    "{{- '<start_of_turn>model\\n' + message['content'] + '<end_of_turn>\\n' -}}\n"
    "{%- endif -%}\n"
    "{%- endfor -%}\n"
)

PATCHED_GEN = (
    "{%- for message in messages -%}\n"
    "{%- if message['role'] == 'user' -%}\n"
    "{{- '<start_of_turn>user\\n' + message['content'] + '<end_of_turn>\\n' -}}\n"
    "{%- elif message['role'] == 'assistant' -%}\n"
    "{{- '<start_of_turn>model\\n' -}}\n"
    "{%- generation -%}\n"
    "{{- message['content'] -}}\n"
    "{%- endgeneration -%}\n"
    "{{- '<end_of_turn>\\n' -}}\n"
    "{%- endif -%}\n"
    "{%- endfor -%}\n"
)

PATCHED_LINT = (
    "{%- for message in messages -%}\n"
    "{%- if message['role'] == 'user' -%}\n"
    "{{- '<start_of_turn>user\\n' + message['content'] + '<end_of_turn>\\n' -}}\n"
    "{%- elif message['role'] == 'assistant' -%}\n"
    "{{- '<start_of_turn>model\\n' -}}\n"
    "{% generation %}\n"
    "{{- message['content'] -}}\n"
    "{% endgeneration %}\n"
    "{{- '<end_of_turn>\\n' -}}\n"
    "{%- endif -%}\n"
    "{%- endfor -%}\n"
)


@pytest.fixture
def tg(repo_root, tmp_path):
    """BATS setup(): corpus and hub template in tmp_path."""
    corpus = tmp_path / "mini_corpus.jsonl"
    corpus.write_text(CORPUS)
    (tmp_path / "hub.jinja").write_text(HUB)
    return {"script": str(repo_root / "scripts" / "finetune" / "template_guard.py"),
            "corpus": str(corpus), "dir": tmp_path}


def _guard(run_cmd, tg, hub, patched_name, patched_text=None):
    d = tg["dir"]
    if patched_text is not None:
        (d / patched_name).write_text(patched_text)
    return run_cmd(["python3", tg["script"], "--hub-template", str(d / hub),
                    "--patched-template", str(d / patched_name), "--corpus", tg["corpus"]])


def test_template_guard_identische_templates_ergeben_exit_null(run_cmd, tg):
    r = _guard(run_cmd, tg, "hub.jinja", "patched_same.jinja", HUB)
    assert r.returncode == 0


def test_template_guard_ein_um_genau_ein_zeichen_verandertes_template_ergibt_exit_ungleich_null_und_nennt_die_position(run_cmd, tg):
    r = _guard(run_cmd, tg, "hub.jinja", "patched_same.jinja", HUB)
    assert r.returncode == 0

    diff = HUB.replace("<start_of_turn>{{ message", "<start_of_turn> {{ message", 1)
    r = _guard(run_cmd, tg, "hub.jinja", "patched_diff.jinja", diff)
    assert r.returncode != 0
    assert "Position" in r.output


def test_template_guard_generation_marker_template_ist_byte_identisch_und_warnt_nicht(run_cmd, tg):
    (tg["dir"] / "hub_gen.jinja").write_text(HUB_GEN)
    r = _guard(run_cmd, tg, "hub_gen.jinja", "patched_gen.jinja", PATCHED_GEN)
    assert r.returncode == 0
    assert "WARNUNG" not in r.output


def test_template_guard_generation_marker_ohne_whitespace_kontrolle_loest_die_falle_2_warnung_aus(run_cmd, tg):
    (tg["dir"] / "hub_gen.jinja").write_text(HUB_GEN)
    r = _guard(run_cmd, tg, "hub_gen.jinja", "patched_gen.jinja", PATCHED_GEN)
    assert r.returncode == 0
    assert "WARNUNG" not in r.output

    r = _guard(run_cmd, tg, "hub_gen.jinja", "patched_lint.jinja", PATCHED_LINT)
    assert r.returncode == 0
    assert "WARNUNG" in r.output
