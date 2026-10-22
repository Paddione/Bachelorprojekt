"""Taskfile registry guards: heredoc delimiter + retired tickets-table ref.

- #6810: `task db:migrate` (T901440-Massage-Zweig) hat einen ungeschlossenen
  EOSQL-Heredoc — der Delimiter steht eingerückt, sh meldet
  `unclosed here-document`.
- #6814: `task registry:migrate` prüft die Registry auf der retirten
  `tickets.llm_proxy_backends` statt auf `LLM_PROXY_BACKENDS_JSON` (F2, #6804).
"""

import yaml


def _cmds(repo_root, taskfile, task):
    doc = yaml.safe_load((repo_root / taskfile).read_text())
    return doc["tasks"][task]["cmds"]


def test_db_migrate_eosql_delimiter_at_column_zero(repo_root):
    """#6810: jeder <<'EOSQL'-Heredoc braucht einen Spalte-0-Delimiter."""
    for cmd in _cmds(repo_root, "taskfiles/Taskfile.data.yml", "db:migrate"):
        text = cmd if isinstance(cmd, str) else cmd.get("cmd", "")
        if "<<'EOSQL'" not in text:
            continue
        lines = text.splitlines()
        opener = next(i for i, ln in enumerate(lines) if "<<'EOSQL'" in ln)
        closers = [ln for ln in lines[opener + 1:] if ln == "EOSQL"]
        assert closers, "EOSQL-Heredoc ohne Spalte-0-Delimiter (#6810)"


def test_registry_migrate_no_retired_tickets_ref(repo_root):
    """#6814: kein Verweis auf die retirte tickets.llm_proxy_backends."""
    source = (repo_root / "taskfiles/Taskfile.devmesh.yml").read_text()
    assert "tickets.llm_proxy_backends" not in source
