"""Native migration of tests/spec/flux-render-security/runtime-var-unwrapping.bats."""

import re

UNWRAP_LITERAL = r"s/\$\$([a-zA-Z0-9_({!?])/$\1/g"
UNWRAP_RX = re.compile(r"\$\$([a-zA-Z0-9_({!?])")


def _unwrap(text: str) -> str:
    """Python equivalent of the sed -E unwrap expression used by the BATS source."""
    return UNWRAP_RX.sub(lambda m: "$" + m.group(1), text)


def test_runtime_var_unwrapping_der_renderer_verwendet_genau_das_hier_gepruefte_unwrapping_muster(repo_root):
    script = (repo_root / "scripts/flux-render-artifact.sh").read_text(encoding="utf-8")
    count = sum(1 for line in script.splitlines() if UNWRAP_LITERAL in line)
    assert count >= 2, f"unwrap pattern found on {count} line(s), expected >= 2"


def test_runtime_var_unwrapping_dollar_dollar_var_mit_klammern_wird_zu_dollar_var_mit_klammern():
    assert _unwrap("mkdir -p $${CONFIG_PATH_FOR_INIT}") == "mkdir -p ${CONFIG_PATH_FOR_INIT}"


def test_runtime_var_unwrapping_dollar_dollar_var_ohne_klammern_wird_zu_dollar_var():
    assert _unwrap("wait $$register_pid") == "wait $register_pid"


def test_runtime_var_unwrapping_dollar_dollar_paren_wird_zu_dollar_paren_sonst_expandiert_die_shell_zur_pid():
    assert _unwrap("for i in $$(seq 1 3); do") == "for i in $(seq 1 3); do"


def test_runtime_var_unwrapping_dollar_dollar_bang_und_question_werden_zu_dollar_bang_und_question():
    assert _unwrap("register_pid=$$! ; retval=$$?") == "register_pid=$! ; retval=$?"


def test_runtime_var_unwrapping_cronjob_auth_secrets_survive_fleet_envsubst_for_runtime_expansion(repo_root):
    manifests = [
        "k3d/cronjob-scheduled-publish.yaml",
        "k3d/notify-unread-cronjob.yaml",
        "k3d/error-log-retention-cronjob.yaml",
    ]
    for manifest in manifests:
        text = (repo_root / manifest).read_text(encoding="utf-8")
        assert text.count("Bearer $${CRON_SECRET}") == 1, manifest
        assert _unwrap(text).count("Bearer ${CRON_SECRET}") == 1, manifest
