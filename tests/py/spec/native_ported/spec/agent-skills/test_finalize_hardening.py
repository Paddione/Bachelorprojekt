"""Native migration of tests/spec/agent-skills/finalize-hardening.bats."""

import pytest


@pytest.fixture
def finalize(repo_root):
    script = repo_root / "scripts/devflow-post-merge-finalize.sh"
    assert script.is_file()
    return script


def _awk_range(lines, start_prefix, end_pattern, end_inclusive=True):
    """Emuliert awk: /<start>/{i=1} i{print} i&&/<end>/{exit}  (Zeilen inkl. Endzeile)."""
    out = []
    active = False
    for line in lines:
        if not active and line.startswith(start_prefix):
            active = True
        if active:
            out.append(line)
            if end_pattern in line:
                break
    return out


def _extract_marker_fns(finalize, end_fn):
    lines = finalize.read_text(encoding="utf-8").splitlines()
    return "\n".join(_awk_range(lines, "mark_ok()", end_fn))


# ── B2: Skip-Semantik ────────────────────────────────────────────────────────


def test_b2_anker_mark_ok_und_mark_skip_zaehlen_getrennt(run_cmd, finalize):
    fns = _extract_marker_fns(finalize, "mark_skip()")
    assert fns != ""
    script = (
        "set -uo pipefail; DONE_COUNT=0; SKIP_COUNT=0; WARN_COUNT=0\n"
        + fns
        + "\nmark_ok a; mark_skip b\n"
        + 'echo "D=$DONE_COUNT S=$SKIP_COUNT"'
    )
    r = run_cmd(["bash", "-c", script])
    assert r.returncode == 0
    assert "[ok]   a" in r.output
    assert "[skip] b" in r.output
    assert "D=1 S=1" in r.output


def test_b2_mark_warn_existiert_zaehlt_eigenstaendig_und_markiert_mit_warn(run_cmd, finalize):
    fns = _extract_marker_fns(finalize, "mark_warn()")
    assert fns != ""
    script = (
        "set -uo pipefail; DONE_COUNT=0; SKIP_COUNT=0; WARN_COUNT=0\n"
        + fns
        + "\nmark_warn 'Eingabe nicht aufloesbar'\n"
        + 'echo "D=$DONE_COUNT S=$SKIP_COUNT W=$WARN_COUNT"'
    )
    r = run_cmd(["bash", "-c", script])
    assert r.returncode == 0
    assert "[warn]" in r.output
    assert "Eingabe nicht aufloesbar" in r.output
    # Eine nicht aufloesbare Eingabe ist kein Skip.
    assert "D=0 S=0 W=1" in r.output


def test_b2_die_schlusszeile_nennt_die_warnungen(finalize):
    lines = finalize.read_text(encoding="utf-8").splitlines()
    assert any("WARN_COUNT" in line for line in lines)
    # Schlusszeile muss den Zaehler ausgeben.
    matching = [line for line in lines if "Finalize $TICKET_ID abgeschlossen" in line]
    assert sum(1 for line in matching if "WARN_COUNT" in line) >= 1


def test_b2_schritt_10_meldet_einen_widerspruch_als_warn_statt_als_skip(finalize):
    lines = finalize.read_text(encoding="utf-8").splitlines()
    section = "\n".join(_awk_range(lines, "# Schritt 10 —", "branch-reaper"))
    assert section != ""
    assert any("mark_warn" in line for line in section.splitlines())
