"""Native migration of tests/spec/sf-retirement-rest.bats."""

# (T900728)

import fnmatch
import re
from pathlib import Path


EXEMPT_FILES = {
    "tests/spec/decommission/decommission-guard.bats",
    "tests/e2e/specs/fa-48-factory-devflow.spec.ts",
    "tests/e2e/specs/fa-scs-scout.spec.ts",
    "tests/e2e/specs/dev-status-tabs.spec.ts",
    "tests/e2e/specs/fa-qa-review.spec.ts",
    "scripts/sdlc-cockpit-smoke.mjs",
    "docs/sdlc/cockpit-action-inventory.md",
    "tests/spec/sdlc-cockpit/leitstand-livedaten.bats",
    "scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/brief.md",
    "scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/checks/run.sh",
    "scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/reference/p1.md",
    "scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/reference/tasks.md",
    "tests/fixtures/mishap-dedupe-korpus.json",
    "tests/fixtures/context-retrieve/golden-queries.json",
    "scripts/rig_for_mixamo.py",
    "scripts/one-shot/2026-07-21-feature-product-backfill.mjs",
    "tests/spec/sdlc-cockpit/redesign-struktur.bats",
    "tests/spec/sdlc-cockpit/deck-kompakt-layout.bats",
    "tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats",
    "tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats",
    "tests/spec/pipeline-interface.bats",
    "tests/unit/scs-search.bats",
}

CONTENT_RE = re.compile(
    r"software[ -]?factory|factory-runner|factory[-_ ](floor|queue|runs?|tick|control|budget|pipeline|slots?"
    r"|worker|eval|post-merge|mcp|cockpit|dispatch|runner|daemon|state)|factoryfloor|/factory/|factory_[a-z]+|factory:",
    re.IGNORECASE,
)
NOISE_RE = re.compile(r"FACTORY-PLAN-REF|tickets\.(v_)?factory_|factory_schema_migrations")


def offenders(repo: Path, list_file: Path) -> list:
    out = []
    for raw in list_file.read_text(encoding="utf-8").splitlines():
        f = raw
        if not f or not (repo / f).exists():
            continue
        if fnmatch.fnmatchcase(f, "migrations/*.sql") or fnmatch.fnmatchcase(f, "scripts/migrations/*.sql"):
            continue
        if f in EXEMPT_FILES:
            continue
        if "Factory" in f or "factory" in f:
            out.append(f)
            continue
        kept = [l for l in (repo / f).read_text(encoding="utf-8", errors="replace").splitlines()
                if not NOISE_RE.search(l)]
        if any(CONTENT_RE.search(l) for l in kept):
            out.append(f)
    return out


def test_t900728_keine_datei_der_liste_enthaelt_noch_einen_verweis(repo_root):
    """T900728: keine Datei der Liste enthaelt noch einen Verweis"""
    list_file = repo_root / "tests" / "fixtures" / "sf-retirement" / "rest.txt"
    assert list_file.is_file() and list_file.stat().st_size > 0
    found = offenders(repo_root, list_file)
    assert not found, "\n".join(found[:40]) + f"\ngesamt: {len(found)}"
