"""Native migration of tests/spec/sf-retirement-web.bats."""

# (T900727)

import fnmatch
import re
from pathlib import Path

NOISE_RE = re.compile(r"FACTORY-PLAN-REF|tickets\.(v_)?factory_|factory_schema_migrations")
CONTENT_RE = re.compile(
    r"software[ -]?factory|factory-runner|factory[-_ ](floor|queue|runs?|tick|control|budget|pipeline|slots?"
    r"|worker|eval|post-merge|mcp|cockpit|dispatch|runner|daemon|state)|factoryfloor|/factory/|factory_[a-z]+|factory:",
    re.IGNORECASE,
)
EXEMPT_EXACT = {
    "components/website/src/lib/tickets/migrations.ts",
    "components/website/src/lib/tickets-db.test.ts",
    "components/website/src/lib/sdlc/cockpit-observability.ts",
    "components/website/src/pages/sdlc/api/cockpit-control.ts",
    "components/website/src/middleware/redirect-map.ts",
    "components/website/src/middleware/redirect-map.test.ts",
}


def offenders(repo: Path, list_file: Path) -> list:
    out = []
    for f in list_file.read_text(encoding="utf-8").splitlines():
        if not f or not (repo / f).exists():
            continue
        if fnmatch.fnmatchcase(f, "*/migrations/*.sql") or fnmatch.fnmatchcase(f, "*/db/migrations/*"):
            continue
        if f in EXEMPT_EXACT:
            continue
        if "Factory" in f or "factory" in f:
            out.append(f)
            continue
        kept = [l for l in (repo / f).read_text(encoding="utf-8", errors="replace").splitlines()
                if not NOISE_RE.search(l)]
        if any(CONTENT_RE.search(l) for l in kept):
            out.append(f)
    return out


def test_t900727_keine_datei_der_liste_enthaelt_noch_einen_verweis(repo_root):
    """T900727: keine Datei der Liste enthaelt noch einen Verweis"""
    list_file = repo_root / "tests" / "fixtures" / "sf-retirement" / "web.txt"
    assert list_file.is_file() and list_file.stat().st_size > 0
    found = offenders(repo_root, list_file)
    assert not found, "\n".join(found[:40]) + f"\ngesamt: {len(found)}"
