"""Native migration of tests/spec/vda-frontmatter.bats."""
import re


def test_vda_sh_frontmatter_ignores_code_blocks_when_deriving_domains(repo_root, run_cmd, tmp_path):
    vda = repo_root / "scripts" / "vda.sh"
    plan = tmp_path / "repro-db.md"
    plan.write_text(
        "# Plan\n\nThis is a factory tooling change.\n\n```sql\nSELECT * FROM psql;\n```\n",
        encoding="utf-8",
    )

    res = run_cmd(["bash", str(vda), "frontmatter", str(plan)], cwd=repo_root, timeout=300)
    assert res.returncode == 0, res.output

    # Darf NICHT als db abgeleitet werden (grep -q 'domains:.*db' muss scheitern).
    text = plan.read_text(encoding="utf-8")
    assert not any(re.search(r"domains:.*db", line) for line in text.splitlines())
