#!/usr/bin/env python3
"""
scripts/openspec-telemetry-optout.py

One-shot helper: add `OPENSPEC_TELEMETRY: '0'` to the workflow-level
`env:` block of every GitHub Actions workflow under `.github/workflows/`
that does not already declare it. If no workflow-level `env:` exists,
insert a new one immediately before `jobs:`.

Used by the OpenSpec improvements batch (T001265) to opt the entire
CI fleet out of OpenSpec telemetry.

Usage:
  python3 scripts/openspec-telemetry-optout.py --dry-run .github/workflows/*.yml
  python3 scripts/openspec-telemetry-optout.py .github/workflows/*.yml
"""
from __future__ import annotations

import sys
import argparse
from pathlib import Path
import re


def process(path: Path, dry_run: bool) -> str:
    text = path.read_text()
    if 'OPENSPEC_TELEMETRY' in text:
        return "ok-already"

    lines = text.splitlines(keepends=True)

    # Find top-level "env:" (column 0)
    env_idx = None
    for i, line in enumerate(lines):
        if re.match(r'^env:\s*$', line):
            env_idx = i
            break

    if env_idx is not None:
        # Add OPENSPEC_TELEMETRY: '0' as a new entry under the existing env: block
        # Find the end of the env block (first non-indented, non-blank line)
        end_idx = env_idx + 1
        while end_idx < len(lines):
            l = lines[end_idx]
            if l.strip() == '' or l.startswith(' ') or l.startswith('\t'):
                end_idx += 1
                continue
            break
        # Insert just before end_idx
        insert = "  OPENSPEC_TELEMETRY: '0'\n"
        lines.insert(end_idx, insert)
    else:
        # No env: — insert a new env: block before jobs:
        jobs_idx = None
        for i, line in enumerate(lines):
            if re.match(r'^jobs:\s*$', line):
                jobs_idx = i
                break
        if jobs_idx is None:
            return "skip-no-jobs"
        # Insert env: block with proper spacing
        # Check if previous non-blank line is `---` (YAML doc separator) or has a blank line before
        insert_at = jobs_idx
        # If the line just before jobs is a block end (no blank), add a blank
        if insert_at > 0 and lines[insert_at - 1].strip() != '':
            lines.insert(insert_at, '\n')
            insert_at += 1
        # Ensure there's a blank line AFTER the env block, before jobs:
        new_block = "env:\n  OPENSPEC_TELEMETRY: '0'\n\n"
        lines.insert(insert_at, new_block)

    new_text = ''.join(lines)
    if new_text == text:
        return "no-change"

    if not dry_run:
        path.write_text(new_text)
    return "modified"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+', help='GitHub Actions workflow YAML files')
    ap.add_argument('--dry-run', action='store_true', help='Report changes without writing')
    args = ap.parse_args()

    counts = {"modified": 0, "ok-already": 0, "skip-no-jobs": 0, "no-change": 0}
    for f in args.files:
        p = Path(f)
        if not p.exists():
            print(f"MISSING: {f}", file=sys.stderr)
            continue
        result = process(p, args.dry_run)
        if result == "modified":
            prefix = "WOULD MODIFY" if args.dry_run else "MODIFIED"
            print(f"{prefix}: {f}")
        counts[result] = counts.get(result, 0) + 1

    print()
    print("=== summary ===")
    for k, v in counts.items():
        print(f"{k:20s} {v}")
    if args.dry_run:
        print("(dry-run — no files changed)")


if __name__ == '__main__':
    main()
