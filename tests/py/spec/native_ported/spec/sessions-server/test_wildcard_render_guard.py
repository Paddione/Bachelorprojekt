"""Native migration of tests/spec/sessions-server/wildcard-render-guard.bats."""

import os
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def ctx(repo_root, tmp_path):
    """BATS setup: guard script and sessions source manifest, plus temp-file helper."""
    return {
        "guard": str(repo_root / "scripts" / "render-guard.sh"),
        "src": repo_root / "prod-fleet" / "mentolder" / "sessions-server.yaml",
        "repo": repo_root,
        "tmp": tmp_path,
    }


def _render_sessions(ctx, domain: str) -> str:
    """Render the sessions source with SESSIONS_DOMAIN substituted (envsubst '$SESSIONS_DOMAIN')."""
    env = os.environ.copy()
    env["SESSIONS_DOMAIN"] = domain
    completed = subprocess.run(
        ["envsubst", "$SESSIONS_DOMAIN"],
        input=ctx["src"].read_text(encoding="utf-8"),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, check=True,
    )
    return completed.stdout


def _write(ctx, name: str, text: str) -> Path:
    path = ctx["tmp"] / name
    path.write_text(text, encoding="utf-8")
    return path


def _guard(run_cmd, ctx, manifest: Path):
    return run_cmd(["bash", ctx["guard"], str(manifest)])


def test_gesunder_sessions_render_passiert_den_guard_positiv_anker(run_cmd, ctx):
    healthy = _write(ctx, "healthy.yaml", _render_sessions(ctx, "sessions.mentolder.de"))
    # Der gesunde Render enthaelt die volle Wildcard.
    assert '"*.sessions.mentolder.de"' in healthy.read_text(encoding="utf-8")
    r = _guard(run_cmd, ctx, healthy)
    assert r.returncode == 0, r.output


def test_leere_sessions_domain_wird_abgewiesen_dnsnames(run_cmd, ctx):
    healthy = _write(ctx, "healthy.yaml", _render_sessions(ctx, "sessions.mentolder.de"))
    broken = _write(ctx, "broken.yaml", _render_sessions(ctx, ""))
    # Positiv-Anker: der Guard laesst den gesunden Render durch.
    assert _guard(run_cmd, ctx, healthy).returncode == 0
    # Defekt-Nachweis (T003548): der leere Render enthaelt wirklich "*."
    assert '"*."' in broken.read_text(encoding="utf-8")
    # Guard muss den kaputten Render abweisen (fail-closed).
    assert _guard(run_cmd, ctx, broken).returncode != 0


def test_leere_sessions_domain_wird_abgewiesen_hostregexp_rest(run_cmd, ctx):
    healthy = _write(ctx, "healthy.yaml", _render_sessions(ctx, "sessions.mentolder.de"))
    broken = _write(ctx, "broken.yaml", _render_sessions(ctx, ""))
    assert _guard(run_cmd, ctx, healthy).returncode == 0
    # Defekt-Nachweis: der HostRegexp-Match endet auf den leeren Rest.
    assert "\\.$`" in broken.read_text(encoding="utf-8")
    assert _guard(run_cmd, ctx, broken).returncode != 0


def test_unsubstituiertes_sessions_domain_in_dnsnames_wird_abgewiesen(run_cmd, ctx):
    healthy_text = _render_sessions(ctx, "sessions.mentolder.de")
    healthy = _write(ctx, "healthy.yaml", healthy_text)
    assert _guard(run_cmd, ctx, healthy).returncode == 0
    # Platzhalter stehen lassen statt substituieren = unvollstaendiger Render.
    broken = _write(ctx, "broken.yaml", healthy_text.replace("sessions.mentolder.de", "${SESSIONS_DOMAIN}"))
    assert "${SESSIONS_DOMAIN}" in broken.read_text(encoding="utf-8")
    assert _guard(run_cmd, ctx, broken).returncode != 0


def test_sessions_freies_manifest_passiert_ohne_false_positive_korczewski_scope(run_cmd, ctx):
    healthy = _write(ctx, "healthy.yaml", _render_sessions(ctx, "sessions.mentolder.de"))
    assert _guard(run_cmd, ctx, healthy).returncode == 0
    plain = _write(ctx, "plain.yaml", "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: demo\ndata:\n  key: value\n")
    import re
    assert not re.search(r"dnsNames|Host\(|HostRegexp", plain.read_text(encoding="utf-8"))
    assert _guard(run_cmd, ctx, plain).returncode == 0


def test_verdrahtung_konfiguration_flux_render_ruft_den_guard_auf(ctx):
    assert "render-guard.sh" in (ctx["repo"] / "scripts" / "flux-render-artifact.sh").read_text(encoding="utf-8")


def test_verdrahtung_konfiguration_taskfile_workspace_deploy_ruft_den_guard_auf(ctx):
    assert "render-guard.sh" in (ctx["repo"] / "taskfiles" / "Taskfile.workspace.yml").read_text(encoding="utf-8")
