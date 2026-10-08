"""Native migration of tests/spec/agent-skills/repo-hygiene-tick-snapshot-guard.bats."""

def _sed_range(lines, start_re, end_re):
    """sed -n '/start/,/end/p': Bereich inkl. Start- und Endzeile, Start wird wiederholt geoeffnet."""
    import re

    out = []
    in_range = False
    for line in lines:
        if not in_range:
            if re.search(start_re, line):
                in_range = True
                out.append(line)
                # Endzeile wird erst ab der Folgezeile geprueft.
            continue
        out.append(line)
        if re.search(end_re, line):
            in_range = False
    return "\n".join(out)


def test_repo_hygiene_ops_md_s0_verweist_auf_den_hygiene_tick_vorcheck(repo_root):
    ops_md = repo_root / ".claude/skills/references/repo-hygiene-ops.md"
    section = _sed_range(ops_md.read_text(encoding="utf-8").splitlines(), r"^## 0\. Arbeitsbaum", r"^## 1\.")
    # Positiv-Anker: der Abschnitt nennt den Tick-Vorcheck namentlich.
    assert "Hygiene-Tick" in section
    assert "repo-hygiene-tick.lock" in section
