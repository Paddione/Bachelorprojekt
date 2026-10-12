"""Native migration of tests/spec/flux-render-security/runtime-var-unwrapping.bats."""

import re
import shutil

import pytest

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
        "k3d/appointment-reminders-cronjob.yaml",
        "k3d/notify-unread-cronjob.yaml",
        "k3d/error-log-retention-cronjob.yaml",
    ]
    for manifest in manifests:
        text = (repo_root / manifest).read_text(encoding="utf-8")
        assert text.count("Bearer $${CRON_SECRET}") == 1, manifest
        assert _unwrap(text).count("Bearer ${CRON_SECRET}") == 1, manifest


def test_runtime_var_unwrapping_cronjob_exit_code_var_survives_fleet_envsubst(repo_root):
    # T901780: single-$ $code wurde von envsubst beim Rendern weg
    # expandiert (leeres Echo, toter [ "" -lt 200 ]-Check). Die
    # Laufzeit-Variable muss $$-escaped sein wie CRON_SECRET.
    manifests = [
        "k3d/cronjob-scheduled-publish.yaml",
        "k3d/appointment-reminders-cronjob.yaml",
    ]
    bare = re.compile(r"(?<!\$)\$code")
    for manifest in manifests:
        text = (repo_root / manifest).read_text(encoding="utf-8")
        assert text.count("$$code") >= 3, manifest
        assert not bare.search(text), manifest
        assert _unwrap(text).count("$code") >= 3, manifest


# --- T901780-Follow-up: klammerlose $$VAR vs. gleichnamige ${VAR} ---
#
# brain.yaml brachte ${code} (JS-Template-Literal) ins mentolder-Overlay und
# vergiftete damit die envsubst-Liste: $$code wurde overlay-weit zu "$"
# (toter Check, leeres Echo, Jobs in BackoffLimitExceeded). Der Renderer muss
# klammerlose $$VAR aus der Ersetzungsliste entfernen wie $${VAR} auch.

VARS_EXTRACT_LITERAL = r"grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}'"
RUNTIME_EXTRACT_LITERAL = r"grep -oE '\$\$(\{)?[A-Za-z_][A-Za-z0-9_]*\}?'"

VARS_EXTRACT_RX = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
RUNTIME_EXTRACT_RX = re.compile(r"\$\$(\{)?([A-Za-z_][A-Za-z0-9_]*)(\})?")


def _fleet_envsubst_list(text):
    """vars minus runtime_vars — Abbild von render_component.

    Entspricht scripts/flux-render-artifact.sh: erst alle ${VAR} einsammeln,
    dann alle $$-escapten Runtime-Namen (mit und ohne Klammern) entfernen.
    Die Literal-Kopplung unten faellt bei Skript-Divergenz.
    """
    names = set(VARS_EXTRACT_RX.findall(text))
    runtime = {m.group(2) for m in RUNTIME_EXTRACT_RX.finditer(text)}
    return sorted(names - runtime)


def test_runtime_var_renderer_verwendet_genau_die_hier_gepruefte_extraktion(repo_root):
    script = (repo_root / "scripts/flux-render-artifact.sh").read_text(encoding="utf-8")
    assert VARS_EXTRACT_LITERAL in script
    assert RUNTIME_EXTRACT_LITERAL in script


def test_runtime_var_extraktions_abbild_untercheidet_runtime_formen():
    # Klammer-Runtime schuetzt (T002306, Bestand):
    assert _fleet_envsubst_list('a: "${NS}" b: "$${NS}"') == []
    # Klammerlose Runtime schuetzt (T901780-Follow-up, neu):
    assert _fleet_envsubst_list('a: "${NS}" b: "$$NS"') == []
    # Kein Name nach $$ -> kein Schutz, aber auch kein Listeneintrag:
    assert _fleet_envsubst_list('a: "${NS}" b: "$$(seq 1 3)" c: "$$! $$?"') == ["NS"]
    # Der brain.yaml-Fall: fremdes ${code} + eigenes $$code:
    assert _fleet_envsubst_list('js: "${code}" rt: "$$code"') == []


def test_runtime_var_klammerlose_form_ueberlebt_listen_kollision(run_cmd, tmp_path, monkeypatch):
    # End-to-end mit ECHTEM envsubst: ${code} (brain.yaml-Simulation,
    # ungesetzt) + $$code (CronJob-Simulation) + ${NS} (echte Render-Var).
    # Vor dem Fix: $$code -> "$", ${code} -> "" (beides kaputt).
    # Nach dem Fix: $$code -> $code, ${code} bleibt stehen (Gate faengt es),
    # ${NS} wird normal substituiert.
    if shutil.which("envsubst") is None:
        pytest.skip("envsubst nicht installiert")
    for name in ("code", "target", "link"):
        monkeypatch.delenv(name, raising=False)
    fixture = (
        'js: "exited with code ${code}"\n'
        'check: "HTTP $$code" [ "$$code" -lt 200 ]\n'
        'ns: "${NS}"\n'
    )
    subst = _fleet_envsubst_list(fixture)
    assert subst == ["NS"], subst
    src = tmp_path / "overlay.yaml"
    src.write_text(fixture, encoding="utf-8")
    var_list = " ".join("$" + v for v in subst)
    res = run_cmd(f"envsubst '{var_list}' < {src}", env={"NS": "workspace"})
    assert res.returncode == 0, res.stderr
    out = _unwrap(res.stdout)
    assert '"HTTP $code"' in out, out
    assert '[ "$code" -lt 200 ]' in out, out
    assert 'ns: "workspace"' in out, out
    assert '"exited with code ${code}"' in out, out


def test_runtime_var_escapte_js_literale_und_runtime_ueberleben_gemeinsam(run_cmd, tmp_path, monkeypatch):
    # brain.yaml nach dem Fix ($${code}) + CronJob ($$code): beide Formen
    # muessen im selben Overlay nebeneinander ueberleben.
    if shutil.which("envsubst") is None:
        pytest.skip("envsubst nicht installiert")
    monkeypatch.delenv("code", raising=False)
    fixture = 'js: "exited with code $${code}"\ncheck: "HTTP $$code"\n'
    subst = _fleet_envsubst_list(fixture)
    assert subst == [], subst
    src = tmp_path / "overlay.yaml"
    src.write_text(fixture, encoding="utf-8")
    res = run_cmd(f"envsubst '' < {src}", env={})
    assert res.returncode == 0, res.stderr
    out = _unwrap(res.stdout)
    assert '"exited with code ${code}"' in out, out
    assert '"HTTP $code"' in out, out


def test_runtime_var_brain_yaml_js_literale_sind_runtime_escaped(repo_root):
    # Echte Render-Vars sind per Konvention GROSS; ${klein} in brain.yaml
    # kann nur JS sein und muss $${...}-escaped sein, sonst vergiftet es
    # die envsubst-Liste des ganzen mentolder-Overlays (T901780-Follow-up).
    text = (repo_root / "prod-fleet/mentolder/brain.yaml").read_text(encoding="utf-8")
    unescaped = re.compile(r"(?<!\$)\$\{[a-z][A-Za-z0-9_]*\}")
    match = unescaped.search(text)
    assert match is None, f"unescaped JS literal: {match.group(0)}"
    for name in ("target", "link", "code"):
        assert "$${" + name + "}" in text, name
