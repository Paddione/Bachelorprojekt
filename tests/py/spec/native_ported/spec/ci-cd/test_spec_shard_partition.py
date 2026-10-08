"""Native migration of tests/spec/ci-cd/spec-shard-partition.bats."""

import re
import subprocess
from pathlib import Path

import pytest
import yaml


def _pipe(repo: Path, args, stdin_text: str):
    """printf '%s\\n' "$input" | bash <args> — stdout/stderr getrennt."""
    return subprocess.run(args, cwd=str(repo), input=stdin_text, capture_output=True, text=True, timeout=120)


def _all_spec_files(repo: Path):
    """cd REPO && find tests/spec -name '*.bats' -type f | LC_ALL=C sort"""
    files = [str(p.relative_to(repo)) for p in (repo / "tests/spec").rglob("*.bats") if p.is_file()]
    return sorted(files, key=lambda s: s.encode())


def _load_ci(repo: Path):
    return yaml.safe_load((repo / ".github/workflows/ci.yml").read_text())


@pytest.fixture
def ctx(repo_root):
    return {"repo": repo_root, "shard": repo_root / "scripts/spec-shard.sh", "ci": repo_root / ".github/workflows/ci.yml"}


def _find_pipe_cmd(c, *shard_args):
    return ["bash", "-c", f"cd '{c['repo']}' && find tests/spec -name '*.bats' -type f | bash '{c['shard']}' " + " ".join(shard_args)]


def test_t002500_spec_shard_sh_existiert_und_ist_ausfuehrbar(ctx):
    assert ctx["shard"].is_file()
    assert ctx["shard"].stat().st_mode & 0o111


def test_t002500_verify_meldet_eine_restlose_ueberschneidungsfreie_partition(run_cmd, ctx):
    res = run_cmd(_find_pipe_cmd(ctx, "--verify", "--of", "4"), cwd=ctx["repo"])
    assert res.returncode == 0
    assert any(re.match(r"^spec-shard: OK", ln) for ln in res.output.splitlines())


def test_t002500_die_vereinigung_aller_shards_ist_exakt_die_eingabemenge(ctx):
    files = _all_spec_files(ctx["repo"])
    assert files
    union = []
    for s in range(1, 5):
        res = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", str(s), "--of", "4"], "\n".join(files) + "\n")
        union.extend(ln for ln in res.stdout.splitlines() if ln)
    # Positiv-Anker zuerst: die Union darf nicht leer sein.
    assert len(union) > 100
    assert "\n".join(sorted(union, key=lambda s: s.encode())) == "\n".join(files)


def test_t002500_kein_shard_enthaelt_eine_datei_doppelt_oder_aus_einem_anderen_shard(ctx):
    files = _all_spec_files(ctx["repo"])
    lines = []
    for s in range(1, 5):
        res = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", str(s), "--of", "4"], "\n".join(files) + "\n")
        lines.extend(ln for ln in res.stdout.splitlines() if ln)
    assert len(lines) > 100
    assert len(lines) == len(set(lines))


def test_t002500_die_partition_ist_deterministisch_zwei_laeufe_identisches_ergebnis(ctx):
    files = "\n".join(_all_spec_files(ctx["repo"])) + "\n"
    a = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "2", "--of", "4"], files).stdout.strip()
    b = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "2", "--of", "4"], files).stdout.strip()
    assert a
    assert a == b


def test_t002500_unsortierte_eingabe_ergibt_dieselbe_partition_wie_sortierte(ctx):
    files = _all_spec_files(ctx["repo"])
    sorted_in = "\n".join(files) + "\n"
    shuffled_in = "\n".join(sorted(files, key=lambda s: s.encode(), reverse=True)) + "\n"
    a = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "3", "--of", "4"], sorted_in).stdout.strip()
    b = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "3", "--of", "4"], shuffled_in).stdout.strip()
    assert a
    assert a == b


def test_t002500_die_shards_sind_nach_gemessener_laufzeit_balanciert_schwerster_le_1_5x_leichtester(run_cmd, ctx):
    # Geprueft wird der von --verify selbst gemeldete Wert (min/max >= 67 %).
    res = run_cmd(_find_pipe_cmd(ctx, "--verify", "--of", "4"), cwd=ctx["repo"])
    assert res.returncode == 0, f"--verify schlug fehl (status={res.returncode}): {res.output}"
    out_lines = res.output.splitlines()

    # Positiv-Anker 1: es wurde ueberhaupt Gewicht verteilt.
    shard1 = [ln for ln in out_lines if "shard 1:" in ln]
    weights = []
    for ln in shard1:
        weights.extend(re.findall(r"Gewicht[ \t]+([0-9.]+)", ln))
    assert weights, f"--verify meldet kein Shard-Gewicht; Output: {res.output}"
    assert float(weights[0]) > 0, f"Shard 1 traegt Gewicht {weights[0]}, erwartet > 0"

    # Positiv-Anker 2: die Balance-Zeile existiert.
    bal_digits = []
    for ln in out_lines:
        if "Balance" in ln:
            bal_digits.extend(re.findall(r"[0-9]+", ln))
    assert bal_digits, f"--verify meldet keine Balance-Zeile; Output: {res.output}"
    balance = int(bal_digits[0])
    assert balance >= 67, f"Laufzeit-Balance nur {balance}% (min/max), erwartet >= 67%"


def test_t002500_ungueltige_shard_of_werte_werden_abgewiesen(ctx):
    cases = [("--shard", "5", "--of", "4"), ("--shard", "0", "--of", "4"), ("--shard", "1", "--of", "0")]
    for args in cases:
        res = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), *args], "tests/spec/ci-cd.bats\n")
        assert res.returncode != 0, f"{args} wurde nicht abgewiesen"
    # Positiv-Anker: der gueltige Fall MUSS durchlaufen.
    res = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "1", "--of", "1"], "tests/spec/ci-cd.bats\n")
    assert res.returncode == 0


def test_t002500_ci_yml_behaelt_den_required_check_namen(ctx):
    wf = _load_ci(ctx["repo"])
    names = [j.get("name") for j in wf["jobs"].values()]
    assert "Spec + Guards" in names, f"Aggregator-Name fehlt: {names!r}"
    agg = wf["jobs"]["test-spec"]
    assert agg["name"] == "Spec + Guards"
    assert "strategy" not in agg, "Aggregator darf keine Matrix haben (wuerde den Namen suffixen)"


def test_t002500_der_aggregator_ist_fail_closed_always_needs_result_pruefung(ctx):
    wf = _load_ci(ctx["repo"])
    agg = wf["jobs"]["test-spec"]
    cond = str(agg.get("if", ""))
    assert "always()" in cond, f"if fehlt always(): {cond!r}"
    needs = agg["needs"]
    assert "test-spec-shard" in needs and "test-spec-fast" in needs, needs
    body = " ".join(str(s.get("run", "")) for s in agg["steps"])
    assert "exit 1" in body, "Aggregator scheitert nie"
    for var in ("FAST_RESULT", "SHARDS_RESULT"):
        assert var in body, f"Result {var} wird nicht geprueft"


def test_t002500_pyyaml_wird_vor_der_spec_bats_suite_installiert(ctx):
    wf = _load_ci(ctx["repo"])
    names = [str(s.get("name", "")) for s in wf["jobs"]["test-spec-shard"]["steps"]]
    pyyaml = next((i for i, n in enumerate(names) if "PyYAML" in n), None)
    suite = next((i for i, n in enumerate(names) if "Spec BATS suite" in n), None)
    assert pyyaml is not None and suite is not None
    assert pyyaml < suite, f"PyYAML ({pyyaml}) steht hinter der Suite ({suite})"


def test_t002500_der_shard_job_reicht_spec_shard_spec_shards_passend_zur_matrix_durch(ctx):
    wf = _load_ci(ctx["repo"])
    job = wf["jobs"]["test-spec-shard"]
    shards = job["strategy"]["matrix"]["shard"]
    assert len(shards) > 1, shards
    assert job["strategy"].get("fail-fast") is False, "fail-fast muss false sein"
    env = job["env"]
    assert int(env["SPEC_SHARDS"]) == len(shards), (env["SPEC_SHARDS"], shards)
    assert "matrix.shard" in str(env["SPEC_SHARD"]), env["SPEC_SHARD"]


def test_t004024_seed_ist_deterministisch_zwei_laeufe_identisches_ergebnis(ctx):
    files = "\n".join(_all_spec_files(ctx["repo"])) + "\n"
    args = ["bash", str(ctx["shard"]), "--shard", "2", "--of", "4", "--seed", "3f2a9c1d8e0b"]
    a = _pipe(ctx["repo"], args, files).stdout.strip()
    b = _pipe(ctx["repo"], args, files).stdout.strip()
    assert a
    assert a == b


def test_t004024_ohne_seed_partitioniert_exakt_wie_bisher_seed_kein_seed(ctx):
    files = "\n".join(_all_spec_files(ctx["repo"])) + "\n"
    a = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "1", "--of", "4"], files).stdout.strip()
    b = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "1", "--of", "4", "--seed", ""], files).stdout.strip()
    assert a
    assert a == b


def test_t004024_der_seed_rotiert_die_schwerste_datei_ueber_die_buckets(ctx, tmp_path):
    # Kontrollierte Eingabe mit einer dominanten Datei (Gewicht 100 vs. 1).
    inp = "heavy.bats\nsmall-a.bats\nsmall-b.bats\nsmall-c.bats\n"
    wf = tmp_path / "weights.tsv"
    wf.write_text("100\theavy.bats\n1\tsmall-a.bats\n1\tsmall-b.bats\n1\tsmall-c.bats\n")

    no_seed = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "1", "--of", "4", "--weights", str(wf)],
                    inp).stdout.strip()
    assert no_seed == "heavy.bats", f"ohne Seed: erwartet heavy.bats allein auf Shard 1, bekam: [{no_seed}]"

    s1 = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "4", "--of", "4", "--weights", str(wf),
                             "--seed", "000000000000"], inp).stdout.strip()
    assert s1 == "heavy.bats", f"Seed 000000000000: erwartet heavy.bats auf Shard 4, bekam: [{s1}]"

    s2 = _pipe(ctx["repo"], ["bash", str(ctx["shard"]), "--shard", "3", "--of", "4", "--weights", str(wf),
                             "--seed", "3f2a9c1d8e0b"], inp).stdout.strip()
    assert s2 == "heavy.bats", f"Seed 3f2a9c1d8e0b: erwartet heavy.bats auf Shard 3, bekam: [{s2}]"


def test_t004024_verify_funktioniert_mit_seed_und_meldet_ihn(run_cmd, ctx):
    res = run_cmd(_find_pipe_cmd(ctx, "--verify", "--of", "4", "--seed", "3f2a9c1d8e0b"), cwd=ctx["repo"])
    assert res.returncode == 0
    assert any(re.match(r"^spec-shard: OK", ln) for ln in res.output.splitlines())
    assert "Seed: 3f2a9c1d8e0b" in res.output


def test_t004024_taskfile_reicht_einen_seed_aus_der_head_sha_an_spec_shard_sh_durch(ctx):
    text = (ctx["repo"] / "taskfiles/Taskfile.test.yml").read_text()
    # Statischer Guard: die Aussage manifestiert sich ausschliesslich im Taskfile-Text.
    assert re.search(r"SPEC_SHARD_SEED=.*git rev-parse HEAD", text), \
        "Taskfile reicht keinen HEAD-SHA-Seed an spec-shard.sh durch"
    assert '--seed "${SPEC_SHARD_SEED:-}"' in text, \
        "Taskfile reicht keinen HEAD-SHA-Seed an spec-shard.sh durch"
