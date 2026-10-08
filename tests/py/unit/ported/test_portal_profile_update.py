"""Native migration of tests/unit/portal-profile-update.bats."""
from pathlib import Path

import pytest

WEBSITE = "components/website"
VALIDATION_IMPORT = "import {validateProfileInput} from './src/lib/profile-validation.ts';"


@pytest.fixture
def website_dir(repo_root) -> Path:
    return repo_root / WEBSITE


def test_validate_profile_input_rejects_an_over_long_phone(run_cmd, website_dir):
    code = VALIDATION_IMPORT + " const r=validateProfileInput({phone:'x'.repeat(31)}); process.exit(r.ok?1:0)"
    res = run_cmd(["npx", "tsx", "-e", code], cwd=website_dir, timeout=300)
    assert res.returncode == 0, res.output


def test_validate_profile_input_rejects_an_invalid_contact_channel(run_cmd, website_dir):
    code = VALIDATION_IMPORT + " const r=validateProfileInput({preferred_contact_channel:'fax'}); process.exit(r.ok?1:0)"
    res = run_cmd(["npx", "tsx", "-e", code], cwd=website_dir, timeout=300)
    assert res.returncode == 0, res.output


def test_validate_profile_input_accepts_a_valid_payload(run_cmd, website_dir):
    code = VALIDATION_IMPORT + " const r=validateProfileInput({phone:'+49 30 1',communication_frequency:'monatlich'}); process.exit(r.ok?0:1)"
    res = run_cmd(["npx", "tsx", "-e", code], cwd=website_dir, timeout=300)
    assert res.returncode == 0, res.output


def test_contact_types_enum_excludes_profile_update(run_cmd, website_dir):
    code = (
        "import {CONTACT_TYPES} from './src/lib/profile-validation.ts'; "
        "process.exit(CONTACT_TYPES.includes('email') && !CONTACT_TYPES.includes('profile_update') ? 0 : 1)"
    )
    res = run_cmd(["npx", "tsx", "-e", code], cwd=website_dir, timeout=300)
    assert res.returncode == 0, res.output
