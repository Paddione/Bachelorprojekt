"""Native migration of tests/spec/release-notes-erden.bats."""

from pathlib import Path

VDA_CORE = """vda_header() { :; }
vda_error() { echo "[ERROR] $*" >&2; }
vda_warn() { echo "[WARN] $*" >&2; }
vda_success() { echo "[OK] $*"; }
vda_dry_run() { echo "[DRY_RUN] $*"; }
"""

NARRATIVE_TEMPLATE = r'''
export PATH="__MOCK_BIN__:$PATH"
export SCRIPT_DIR="__MOCK_BIN__"
pr_titles="__PR_TITLES__"
DEEPSEEK_API_KEY="mock-key"
DEEPSEEK_BASE_URL="http://127.0.0.1:59999"

mkdir -p "__MOCK_BIN__/lib"
cat <<'INNEREOF' > "__MOCK_BIN__/lib/vda-core.sh"
__VDA_CORE__INNEREOF

source "__SCRIPT__"

curl() {
  shift
  local payload=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "-d" ]]; then
      payload="$2"
      break
    fi
    shift
  done

  if [[ "$payload" =~ "[TICKET_CONTEXT]" ]]; then
    echo '{"choices":[{"message":{"content":"__FOUND__"}}]}'
  else
    echo '{"choices":[{"message":{"content":"__NOTFOUND__"}}]}'
  fi
}

_deepseek_narrative "$pr_titles"
'''


def _narrative_script(mock_bin: Path, script: Path, pr_titles: str, found: str, notfound: str) -> str:
    text = NARRATIVE_TEMPLATE.replace("__VDA_CORE__", VDA_CORE)
    return (text.replace("__MOCK_BIN__", str(mock_bin))
                .replace("__SCRIPT__", str(script))
                .replace("__PR_TITLES__", pr_titles)
                .replace("__FOUND__", found)
                .replace("__NOTFOUND__", notfound))


def _mock_ticket(mock_bin: Path, body: str) -> None:
    mock_bin.mkdir(parents=True, exist_ok=True)
    ticket = mock_bin / "ticket.sh"
    ticket.write_text("#!/usr/bin/env bash\n" + body, encoding="utf-8")
    ticket.chmod(0o755)


def test_release_notes_deepseek_narrative_prompt_includes_ticket_context_when_t00xxx_tag_is_present(run_cmd, repo_root, tmp_path):
    mock_bin = tmp_path / "bin"
    _mock_ticket(mock_bin, (
        'if [[ "$1" == "get" && "$3" == "T002403" ]]; then\n'
        '  echo \'{"id":"c307b1fb","external_id":"T002403","type":"chore",'
        '"title":"release-notes erden: Ticket-Kontext","description":"Detailed ticket description here",'
        '"areas":["scripts","tools"]}\'\n'
        "  exit 0\n"
        "fi\n"
        "echo '{}'\n"
    ))
    script = _narrative_script(mock_bin, repo_root / "scripts" / "vda" / "release-notes.sh",
                               "feat(scripts): add feature [T002403]",
                               "Captured prompt with ticket context", "No ticket context found")
    r = run_cmd(["bash", "-c", script])
    assert r.returncode == 0, r.output
    assert "Captured prompt with ticket context" in r.output


def test_release_notes_pr_without_t00xxx_tag_handles_gracefully_without_context(run_cmd, repo_root, tmp_path):
    mock_bin = tmp_path / "bin"
    _mock_ticket(mock_bin, "echo '{}'\n")
    script = _narrative_script(mock_bin, repo_root / "scripts" / "vda" / "release-notes.sh",
                               "feat(scripts): add feature without tag",
                               "FAIL: context found", "SUCCESS: no ticket context")
    r = run_cmd(["bash", "-c", script])
    assert r.returncode == 0, r.output
    assert "SUCCESS: no ticket context" in r.output


def test_release_notes_ticket_lookup_db_error_handles_gracefully_without_context_or_failing_script(run_cmd, repo_root, tmp_path):
    mock_bin = tmp_path / "bin"
    _mock_ticket(mock_bin, 'echo "DB Connection Error: database unreachable" >&2\nexit 1\n')
    script = _narrative_script(mock_bin, repo_root / "scripts" / "vda" / "release-notes.sh",
                               "fix(db): handle failure [T009999]",
                               "FAIL: context found", "SUCCESS: fallback without context")
    r = run_cmd(["bash", "-c", script])
    assert r.returncode == 0, r.output
    assert "SUCCESS: fallback without context" in r.output
