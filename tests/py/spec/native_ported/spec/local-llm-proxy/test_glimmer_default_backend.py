"""Native migration of tests/spec/local-llm-proxy/glimmer-default-backend.bats."""

from pathlib import Path


def _fixed_status(path: Path, needle: str) -> int:
    """grep -qF semantics: 0 found, 1 not found, 2 file missing."""
    if not path.is_file():
        return 2
    return 0 if needle in path.read_text(encoding="utf-8", errors="replace") else 1


def test_glimmer_default_backend_t900350_t900365_project_default_selects_the_local_qwen3_8_27b_model(repo_root):
    config = repo_root / ".opencode/opencode.jsonc"
    assert _fixed_status(config, '"model": "llamacpp-local/Qwen3.8-27B"') == 0
    assert _fixed_status(config, '"model": "llamacpp-local/Qwen3.8-27B-gsq"') != 0
    assert _fixed_status(config, '"model": "llamacpp-local/qwen38-220k"') != 0
    assert _fixed_status(config, '"model": "freetoken-local/active"') != 0


def test_glimmer_default_backend_t013141_migration_registers_the_qwen38_proxy_backend(repo_root):
    migration = repo_root / "scripts/migrations/2026-08-22-llm-proxy-qwen38-backend.sql"
    assert migration.is_file()
    assert _fixed_status(migration, "'llamacpp-qwen38', 'llamacpp', 'http://127.0.0.1:8094/v1'") == 0
    assert _fixed_status(migration, "'{\"qwen38-220k\":\"qwen38-220k\"}'::jsonb, 1") == 0
    assert _fixed_status(migration, "ON CONFLICT (name) DO UPDATE") == 0
