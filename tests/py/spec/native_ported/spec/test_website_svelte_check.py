"""Native migration of tests/spec/website-svelte-check.bats."""

import re

import pytest


def test_t900809_svelte_check_meldet_0_fehler_in_components_website(run_cmd, repo_root):
    web = repo_root / "components" / "website"
    binary = web / "node_modules" / ".bin" / "svelte-check"
    if not (binary.is_file() and binary.stat().st_mode & 0o111):
        pytest.skip("svelte-check nicht installiert (pnpm install in components/website)")
    r = run_cmd(["bash", "-c", f"cd '{web}' && ./node_modules/.bin/svelte-check --threshold error --output machine 2>&1"])
    # Positiv-Anker: ohne COMPLETED-Zeile ist der Lauf abgebrochen.
    assert " COMPLETED " in r.output, f"svelte-check lief nicht durch:\n{r.output[-2000:]}"
    errors = [l for l in r.output.splitlines() if " ERROR " in l]
    print(f"svelte-check errors: {len(errors)}")
    print("\n".join(errors[:20]))
    assert len(errors) == 0


def test_t900809_ci_job_vitest_website_fuehrt_svelte_check_als_blockierenden_schritt_aus(repo_root):
    lines = (repo_root / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8").splitlines()
    block, active = [], False
    for line in lines:
        if line.startswith("  vitest-website:"):
            active = True
            continue
        if active and re.match(r"^  [a-z0-9-]+:$", line) and "vitest-website" not in line:
            break
        if active:
            block.append(line)
    assert any("svelte-check --threshold error" in l for l in block)
