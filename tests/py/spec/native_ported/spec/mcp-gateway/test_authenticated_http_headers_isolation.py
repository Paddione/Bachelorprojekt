"""Native migration of tests/spec/mcp-gateway/authenticated-http-headers-isolation.bats."""
# Port note: the original runs `bats --filter "renderers pass headers through for any
# http client, not just bge-mcp"` on authenticated-http-headers.bats. That filter matches
# no test in the target file (verified: `bats --count` with the filter returns 0), so the
# original passes vacuously. This port keeps the intent instead: the header-passthrough

# render runs in an isolated tmp dir and must leave the real tracked config mtimes untouched.

import shutil
import tempfile
from pathlib import Path


PROBE_FIXTURE = """clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
      X-Probe: "static-value"
    harness:
      claude_code:
        type: http
        url: http://localhost:19999/mcp
      agy:
        serverUrl: http://localhost:19999/mcp
      opencode:
        type: remote
        url: http://localhost:19999/mcp
        enabled: true
cluster: {}
"""


def _stamp(repo: Path) -> str:
    """Name, mtime and size of the tracked MCP config artifacts, sorted."""
    lines = []
    for name in (".mcp.json", ".opencode/opencode.jsonc", "scripts/llm/mcp-servers.json"):
        path = repo / name
        if path.exists():
            st = path.stat()
            lines.append(f"{name} {int(st.st_mtime)} {st.st_size}")
    return "\n".join(sorted(lines))


def test_t002941_generic_header_passthrough_test_never_touches_real_tracked_config_mtimes(
    repo_root, run_cmd, monkeypatch
):
    """T002941: generic-header-passthrough test never touches real tracked config mtimes"""
    monkeypatch.delenv("PROBE_TOKEN", raising=False)
    before = _stamp(repo_root)

    tmpd = Path(tempfile.mkdtemp())
    try:
        fixture = tmpd / "registry.yaml"
        fixture.write_text(PROBE_FIXTURE, encoding="utf-8")
        result = run_cmd(
            ["bash", str(repo_root / "scripts" / "mcp-sync.sh"), "render"],
            env={"HOME": str(tmpd / "fakehome"), "MCP_REGISTRY": str(fixture), "MCP_OUT_DIR": str(tmpd)},
        )
        # Positiv-Anker: der Lauf muss stattfinden und die Ausgabe erzeugen.
        assert result.returncode == 0, result.output
        assert (tmpd / ".mcp.json").is_file()
    finally:
        shutil.rmtree(tmpd, ignore_errors=True)

    after = _stamp(repo_root)
    assert before == after
