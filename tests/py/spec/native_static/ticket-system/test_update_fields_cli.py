"""Native pytest migration of tests/spec/ticket-system/update-fields-cli.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_ticket_sh_update_fields_rejects_missing_id_1(repo_root, run_cmd, tmp_path):
    'ticket.sh update-fields rejects missing --id'
    result = run_cmd(['bash', str(repo_root) + '/scripts/ticket.sh', 'update-fields', '--title', 'x'])
    assert result.returncode == 2, result.output
