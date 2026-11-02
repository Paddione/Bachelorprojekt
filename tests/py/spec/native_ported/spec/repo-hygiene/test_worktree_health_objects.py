"""git-worktree-health.sh objects: keine Fehlbefunde aus Lock-Dateien und Schreib-Wettlaeufen.

Befund 2026-11-02: eine verwaiste .git/objects/maintenance.lock (0 Byte) erschien als
"0-Byte-Objektdatei", und vier "missing blob" aus git fsck waren Blobs, die eine
parallel stagende Session eine Sekunde spaeter geschrieben hatte.
"""

import os
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def ctx(repo_root: Path, run_cmd, tmp_path):
    health = repo_root / "scripts" / "git-worktree-health.sh"
    repo = tmp_path / "repository"
    repo.mkdir()
    run_cmd(["git", "init", "-q", str(repo)]).check()
    run_cmd(["git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
             "-c", "core.hooksPath=/dev/null", "commit", "-q", "--allow-empty", "-m", "test: fixture"],
            cwd=repo).check()
    return {"repo": repo, "health": health, "run": run_cmd, "tmp": tmp_path}


def _objects(c, env=None):
    return c["run"](["bash", str(c["health"]), "objects"], cwd=c["repo"], env=env)


def test_gesunder_speicher_ist_sauber(ctx):
    res = _objects(ctx)
    assert res.returncode == 0, res.output
    assert "Objektspeicher intakt" in res.output


def test_leere_lock_datei_ist_kein_objektbefund(ctx):
    (ctx["repo"] / ".git" / "objects" / "maintenance.lock").write_bytes(b"")
    res = _objects(ctx)
    assert res.returncode == 0, res.output
    assert "0-Byte-Objektdateien" not in res.output
    assert "maintenance.lock" in res.output  # als Hinweis sichtbar, nicht verschwiegen


def test_leere_objektdatei_bleibt_befund(ctx):
    shard = ctx["repo"] / ".git" / "objects" / "ab"
    shard.mkdir()
    (shard / ("c" * 38)).write_bytes(b"")
    res = _objects(ctx)
    assert res.returncode == 1, res.output
    assert "0-Byte-Objektdateien" in res.output


def test_dauerhaft_fehlendes_objekt_bleibt_befund(ctx):
    missing = "1" * 40
    ctx["run"](["git", "update-index", "--add", "--info-only", "--cacheinfo",
                f"100644,{missing},weg.txt"], cwd=ctx["repo"]).check()
    res = _objects(ctx)
    assert res.returncode == 1, res.output
    assert "BEFUND: git fsck" in res.output


def test_bei_nachpruefung_vorhandenes_objekt_ist_kein_befund(ctx):
    # fsck sieht das Objekt noch nicht, die Nachpruefung schon: Schreib-Wettlauf.
    source = ctx["tmp"] / "da.txt"
    source.write_text("da\n")
    blob = ctx["run"](["git", "hash-object", "-w", str(source)], cwd=ctx["repo"])
    blob.check()
    sha = blob.stdout.strip()
    shim = ctx["tmp"] / "shim"
    shim.mkdir()
    real_git = shutil.which("git")
    (shim / "git").write_text(
        "#!/usr/bin/env bash\n"
        f'if [ "$1" = fsck ]; then echo "missing blob {sha}"; exit 1; fi\n'
        f'exec {real_git} "$@"\n')
    (shim / "git").chmod(0o755)
    res = _objects(ctx, env={"PATH": f"{shim}:{os.environ['PATH']}"})
    assert res.returncode == 0, res.output
    assert "HINWEIS" in res.output and sha in res.output
