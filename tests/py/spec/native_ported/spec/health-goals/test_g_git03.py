"""Native migration of tests/spec/health-goals/g-git03.bats."""

import re


def test_g_git03_target_in_health_goals_check_sh_matches_goals_md_target_7(repo_root):
    check_sh = repo_root / "scripts" / "health-goals-check.sh"
    goals_md = repo_root / ".claude" / "lib" / "goals.md"

    check_values = []
    for line in check_sh.read_text(encoding="utf-8").splitlines():
        if not re.search(r"\brow +(gate|target) +G-GIT03\b", line):
            continue
        fields = line.split()
        for i, field in enumerate(fields):
            if field in ("le", "ge", "eq"):
                check_values.append(fields[i + 1] if i + 1 < len(fields) else "")
    target_check = "\n".join(check_values)

    doc_values = []
    for line in goals_md.read_text(encoding="utf-8").splitlines():
        if not re.match(r"^\| +\*\*G-GIT03\*\*", line):
            continue
        field5 = line.split("|")[4] if len(line.split("|")) > 4 else ""
        doc_values.extend(re.findall(r"[0-9]+", field5))
    target_doc = "\n".join(doc_values)

    assert target_check, "kein Target fuer G-GIT03 in health-goals-check.sh"
    assert target_doc, "kein Target fuer G-GIT03 in goals.md"
    assert target_check == "7"
    assert target_doc == "7"
    assert target_check == target_doc
