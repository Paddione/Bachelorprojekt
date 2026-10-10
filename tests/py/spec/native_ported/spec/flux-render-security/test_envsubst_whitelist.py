"""envsubst whitelist for the fleet renderer (T901791).

Bug context: render_component (scripts/flux-render-artifact.sh) extracted ALL
${VAR} refs from the kustomize output — 98 distinct names in the mentolder
overlay, including 13 foreign ones (Grafana ${datasource} x500, ${cluster},
${namespace}, ${code}, ...) — and envsubst'd them. Unset vars render as "",
so every dashboard uid went empty. The leftover fail-closed check cannot
catch it (substitution DID happen). Same class as T901780, but vendored
upstream content, so hand-escaping is not an option (strategy D1: whitelist).

Fix contract: the subst list is computed as

    extracted ${VAR} ∩ set-in-environment − runtime-escaped ($$) − RENDER_SKIP_VARS

The computation lives in scripts/lib/render-subst-list.sh as
`render_subst_list` (stdin: rendered text, stdout: space-separated names) so
these tests exercise the real code without kustomize (not installed in the CI
spec shard). flux-render-artifact.sh must source the lib (S4).
"""

import shutil

import pytest

LIB = "scripts/lib/render-subst-list.sh"
RENDERER = "scripts/flux-render-artifact.sh"

# Grafana-critical foreign names (Phase-A evidence, mentolder overlay).
# The implementer extends the skip list empirically; these four are pinned.
PINNED_SKIP = ("datasource", "cluster", "namespace", "code")


def _subst_list(run_cmd, repo_root, fixture: str, env: dict) -> list:
    # Fixture via env var to keep stdin handling simple (fixtures are tiny).
    res = run_cmd(
        ["bash", "-c", f"source {LIB} && printf %s \"$FIXTURE\" | render_subst_list"],
        cwd=str(repo_root),
        env={**env, "FIXTURE": fixture},
        timeout=60,
    )
    assert res.returncode == 0, f"render_subst_list failed:\n{res.output}"
    return res.stdout.split()


def test_renderer_sources_subst_list_lib(repo_root):
    # S4 coupling: the lib must be referenced from the renderer, not orphaned.
    # RED (T901791): lib does not exist — expected: FAIL.
    script = (repo_root / RENDERER).read_text(encoding="utf-8")
    assert "render-subst-list.sh" in script
    assert (repo_root / LIB).exists()


def test_subst_list_contains_only_set_owned_vars(run_cmd, repo_root):
    # ${datasource} (unset, foreign) and ${MISSING_OWNED} (unset) stay out;
    # ${NS} (set) is the only entry.
    # RED (T901791): lib does not exist — expected: FAIL.
    fixture = 'uid: "${datasource}"\nns: "${NS}"\nother: "${MISSING_OWNED}"\n'
    names = _subst_list(run_cmd, repo_root, fixture, {"NS": "workspace"})
    assert names == ["NS"], names


def test_skip_list_wins_even_when_set(run_cmd, repo_root, monkeypatch):
    # Foreign names are never substituted, even if present in the environment.
    # RED (T901791): lib does not exist — expected: FAIL.
    for name in PINNED_SKIP:
        monkeypatch.delenv(name, raising=False)
    fixture = "".join(f'{n}: "${{{n}}}"\n' for n in PINNED_SKIP) + 'ns: "${NS}"\n'
    env = {n: "poison" for n in PINNED_SKIP}
    env["NS"] = "workspace"
    names = _subst_list(run_cmd, repo_root, fixture, env)
    assert names == ["NS"], names


def test_runtime_escaped_vars_stay_excluded(run_cmd, repo_root):
    # T002306/T901780 anchor: $$-escaped runtime vars never join the list,
    # with or without braces.
    # RED (T901791): lib does not exist — expected: FAIL.
    fixture = 'a: "${NS}"\nb: "$${NS}"\nc: "$$NS"\nd: "$${CRON_SECRET}"\n'
    names = _subst_list(run_cmd, repo_root, fixture, {"NS": "workspace"})
    assert names == [], names


def test_datasource_survives_real_envsubst_e2e(run_cmd, repo_root, tmp_path, monkeypatch):
    # End-to-end with REAL envsubst: list from the lib, substitution over a
    # Grafana-flavoured fixture. ${datasource} survives, ${NS} is substituted
    # (positive anchor against vacuity, T002356-M1).
    # RED (T901791): lib does not exist — expected: FAIL.
    if shutil.which("envsubst") is None:
        pytest.skip("envsubst nicht installiert")
    for name in PINNED_SKIP:
        monkeypatch.delenv(name, raising=False)
    fixture = (
        '{"datasource":{"type":"prometheus","uid":"${datasource}"}}\n'
        'ns: "${NS}"\n'
    )
    names = _subst_list(run_cmd, repo_root, fixture, {"NS": "workspace"})
    assert names == ["NS"], names
    src = tmp_path / "overlay.yaml"
    src.write_text(fixture, encoding="utf-8")
    var_list = " ".join("$" + v for v in names)
    res = run_cmd(f"envsubst '{var_list}' < {src}", env={"NS": "workspace"})
    assert res.returncode == 0, res.stderr
    assert '"uid":"${datasource}"' in res.stdout, res.stdout
    assert 'ns: "workspace"' in res.stdout, res.stdout
