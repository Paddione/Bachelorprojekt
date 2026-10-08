"""Native migration of tests/spec/ticket-system/update-fields-cli.bats."""
import re


def test_ticket_sh_update_fields_rejects_missing_id(run_cmd, repo_root):
    run = run_cmd(["bash", str(repo_root / "scripts/ticket.sh"), "update-fields", "--title", "x"])
    assert run.returncode == 2, run.output


def test_ticket_sh_update_fields_rejects_call_with_no_fields(run_cmd, repo_root):
    run = run_cmd(["bash", str(repo_root / "scripts/ticket.sh"), "update-fields", "--id", "T000001"])
    assert run.returncode == 2, run.output
    assert re.search(r"field|Feld", run.output, re.IGNORECASE), run.output


def test_ticket_sh_update_fields_offline_skips_write_and_exits_0(run_cmd, repo_root):
    run = run_cmd(
        ["bash", str(repo_root / "scripts/ticket.sh"), "update-fields", "--id", "T000001", "--title", "Neuer Titel"],
        env={"TICKET_OFFLINE": "1"},
    )
    assert run.returncode == 0, run.output
    assert re.search(r"OFFLINE", run.output, re.IGNORECASE), run.output


def test_ticket_sh_update_fields_is_listed_in_the_usage_help_output(run_cmd, repo_root):
    run = run_cmd(["bash", str(repo_root / "scripts/ticket.sh")])
    assert run.returncode == 1, run.output
    commands_lines = [ln for ln in run.output.splitlines() if ln.startswith("Commands:")]
    assert any("update-fields" in ln for ln in commands_lines), run.output


def test_ticket_mcp_update_fields_tool_schema_declares_title_and_description(repo_root):
    # Ausnahme von der Output-Verifikation (T002448-M4): das Ergebnis ist die
    # Schema-Deklaration im Quelltext selbst; grep-Semantik mit -n -A 8.
    src = repo_root / "scripts/ticket-mcp/go/internal/tools/lifecycle.go"
    assert src.is_file(), f"{src} fehlt"
    lines = src.read_text(encoding="utf-8", errors="replace").splitlines()
    window = []
    for i, line in enumerate(lines):
        if 'mcp.NewTool("update_fields"' in line:
            window.extend(lines[i:i + 9])
    assert window, "grep fand kein mcp.NewTool(\"update_fields\""
    text = "\n".join(window)
    assert 'WithString("title"' in text
    assert 'WithString("description"' in text
