"""Native migration of tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats."""

import re

import pytest

MARKER_RE = re.compile(r"RUNTIME-CHECK: function=tickets\.fn_purge_test_data marker=(\S+)")


def _natural_key(path):
    return [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", path.name)]


@pytest.fixture
def paths(repo_root):
    latest = sorted((repo_root / "scripts" / "one-shot").glob("purge-fn-v*.sql"), key=_natural_key)[-1]
    return {"repo": repo_root, "latest": latest, "mod": repo_root / "components/website/src/lib/tickets/purge-fn.ts"}


def _module_body(run_cmd, p):
    script = (
        f"const m = await import('file://{p['mod']}');\n"
        "process.stdout.write(m.PURGE_FN_BODY);\n"
    )
    return run_cmd(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script])


def _file_body(latest):
    out, on = [], False
    for line in latest.read_text(encoding="utf-8").splitlines():
        if line == "AS $$":
            on = True
            continue
        if line == "$$;":
            on = False
        if on:
            out.append(line)
    return "\n".join(out)


def test_the_latest_migration_declares_a_runtime_check_marker_positive_anchor(paths):
    markers = MARKER_RE.findall(paths["latest"].read_text(encoding="utf-8"))
    assert markers and markers[0]


def test_the_runtime_definition_carries_the_marker_of_the_latest_migration(run_cmd, paths):
    markers = MARKER_RE.findall(paths["latest"].read_text(encoding="utf-8"))
    assert markers
    r = _module_body(run_cmd, paths)
    assert r.returncode == 0
    assert any(m in r.output for m in markers)


def test_the_runtime_body_equals_the_latest_migration_body(run_cmd, paths):
    body = _file_body(paths["latest"])
    assert body
    r = _module_body(run_cmd, paths)
    assert r.returncode == 0
    assert r.stdout.rstrip("\n") == body.rstrip("\n")


def test_no_other_website_module_defines_the_purge_function(run_cmd, paths):
    src = paths["repo"] / "components" / "website" / "src"
    hits = [str(p) for p in sorted(src.rglob("*")) if p.is_file()
            and "CREATE OR REPLACE FUNCTION tickets.fn_purge_test_data" in p.read_text(encoding="utf-8", errors="replace")]
    assert hits == [str(paths["mod"])]
