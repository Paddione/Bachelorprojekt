"""scripts/llm/gemma-bulk.sh: GPU-Fenster fuer den Gemma-Bulk-Reindex.

Pruefmodus: command output — das Skript laeuft gegen ein Fake-kubectl, das jeden
Aufruf protokolliert und einen Replika-Zustand fuehrt; geprueft werden Reihenfolge
und Endzustand.
"""

import os
import textwrap

import pytest

FAKE = textwrap.dedent("""\
    #!/usr/bin/env bash
    # Fake-kubectl: protokolliert Aufrufe, haelt qwen-Replikas + Annotation in Dateien.
    a="$*"; echo "$a" >> "$STATE/calls"
    case "$*" in
      *"get deploy qwen35-4b-instruct -o jsonpath={.spec.replicas}"*) cat "$STATE/qwen" ;;
      *"restore-replicas}"*) cat "$STATE/anno" 2>/dev/null ;;
      *"scale deploy qwen35-4b-instruct --replicas="*) echo "${a##*=}" > "$STATE/qwen" ;;
      *"annotate --overwrite deploy qwen35-4b-instruct gemma-bulk/restore-replicas="*) echo "${a##*=}" > "$STATE/anno" ;;
      *"restore-replicas-"*) rm -f "$STATE/anno" ;;
    esac
    exit 0
""")


@pytest.fixture
def env(tmp_path):
    fake = tmp_path / "kubectl"
    fake.write_text(FAKE)
    fake.chmod(0o755)
    (tmp_path / "qwen").write_text("2\n")
    return {**os.environ, "KUBECTL": str(fake), "STATE": str(tmp_path)}, tmp_path


def _calls(state):
    return (state / "calls").read_text().splitlines()


def _idx(calls, needle):
    return next(i for i, c in enumerate(calls) if needle in c)


def test_up_pausiert_flux_vor_entladen_und_startet_bulk_danach(run_cmd, repo_root, env):
    e, state = env
    run_cmd(["bash", str(repo_root / "scripts/llm/gemma-bulk.sh"), "up", "1"], env=e).check()
    calls = _calls(state)
    parent = _idx(calls, 'kustomization flux-system --type merge -p {"spec":{"suspend":true}}')
    suspend = _idx(calls, 'kustomization devmesh-workspace --type merge -p {"spec":{"suspend":true}}')
    unload = _idx(calls, "scale deploy qwen35-4b-instruct --replicas=0")
    gone = _idx(calls, "wait --for=delete pod -l app=qwen35-4b-instruct")
    bulk = _idx(calls, "scale deploy gemma-embed-bulk --replicas=1")
    assert parent < suspend < unload < gone < bulk
    assert (state / "anno").read_text().strip() == "2"


def test_down_stellt_gemerkte_replikas_her_und_setzt_flux_fort(run_cmd, repo_root, env):
    e, state = env
    script = str(repo_root / "scripts/llm/gemma-bulk.sh")
    run_cmd(["bash", script, "up"], env=e).check()
    # Zweites up darf die gemerkte Zahl nicht mit 0 ueberschreiben.
    run_cmd(["bash", script, "up"], env=e).check()
    run_cmd(["bash", script, "down"], env=e).check()
    calls = _calls(state)
    stop = max(i for i, c in enumerate(calls) if "scale deploy gemma-embed-bulk --replicas=0" in c)
    restore = _idx(calls, "scale deploy qwen35-4b-instruct --replicas=2")
    resume = _idx(calls, 'kustomization devmesh-workspace --type merge -p {"spec":{"suspend":false}}')
    parent = _idx(calls, 'kustomization flux-system --type merge -p {"spec":{"suspend":false}}')
    assert stop < restore < resume < parent
    assert (state / "qwen").read_text().strip() == "2"
    assert not (state / "anno").exists()


def test_unbekanntes_kommando_exit_2(run_cmd, repo_root, env):
    e, _ = env
    r = run_cmd(["bash", str(repo_root / "scripts/llm/gemma-bulk.sh"), "bogus"], env=e)
    assert r.returncode == 2
