#!/usr/bin/env python3
"""Materialisiert .opencode/skills/* als relative Symlinks ins agentic-resources-Repo.

SSOT: docs/agent-guide/registry/skills.yaml (welche Skill-IDs opencode sieht)
      + <repo>/registry.json (wo jede ID im Repo liegt).
Links sind relativ und damit checkout-tiefenstabil (Hauptcheckout, Worktrees, CI).
Aufruf nach Klonen/Worktree-Erstellung und in CI vor skill-lesenden Tests.

    python3 scripts/agent-skills/link-from-repo.py [--root DIR] [--repo DIR] [--check]

Env: AGENTIC_RESOURCES_DIR (Default ~/agentic-resources).
"""

import argparse
import json
import os
import re
import subprocess
import sys

# Shared-Source-Bundle ohne SKILL.md (background-agents.ts, worktree.ts);
# wird von tests/py/spec/remaining_domain_specs/test_background_agents_fallback.py gelesen.
EXTRA_LINKS = ("dev-flow",)


def repo_root_of(cwd):
    try:
        out = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except subprocess.CalledProcessError:
        return os.path.abspath(cwd)


def opencode_ids(skills_yaml):
    """IDs mit harnesses.opencode.path: .opencode/skills/<id> (vgl. Test-Parser)."""
    ids = []
    cur = None
    in_opencode = False
    for line in skills_yaml.splitlines():
        m = re.match(r"  - id: (\S+)", line)
        if m:
            cur = m.group(1)
            in_opencode = False
            continue
        if line == "      opencode:":
            in_opencode = True
            continue
        if re.match(r"      \S", line):
            in_opencode = False
            continue
        if in_opencode:
            m = re.match(r"        path: \.opencode/skills/([A-Za-z0-9_-]+)$", line)
            if m and cur == m.group(1):
                ids.append(cur)
    return ids


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None)
    ap.add_argument("--repo", default=None)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    root = os.path.abspath(args.root) if args.root else repo_root_of(os.getcwd())
    repo = os.path.expanduser(
        args.repo or os.environ.get("AGENTIC_RESOURCES_DIR", "~/agentic-resources")
    )
    repo = os.path.abspath(repo)

    reg_path = os.path.join(repo, "registry.json")
    if not os.path.isfile(reg_path):
        print(f"FEHLT: agentic-resources-Repo unter {repo} (registry.json fehlt)", file=sys.stderr)
        print("Hinweis: Repo klonen nach ~/agentic-resources oder --repo/AGENTIC_RESOURCES_DIR setzen.", file=sys.stderr)
        return 2
    registry = json.load(open(reg_path, encoding="utf-8"))["skills"]

    skills_yaml_path = os.path.join(root, "docs/agent-guide/registry/skills.yaml")
    wanted = opencode_ids(open(skills_yaml_path, encoding="utf-8").read())
    for extra in EXTRA_LINKS:
        if extra in registry and extra not in wanted:
            wanted.append(extra)

    skills_dir = os.path.join(root, ".opencode/skills")
    os.makedirs(skills_dir, exist_ok=True)

    errors = 0
    linked = 0
    for sid in sorted(wanted):
        entry = registry.get(sid)
        if entry is None:
            print(f"WARNUNG: {sid} nicht in {reg_path} — uebersprungen")
            continue
        target_abs = os.path.normpath(os.path.join(repo, entry["path"]))
        if not os.path.isdir(target_abs):
            print(f"FEHLT: Ziel {target_abs} fuer {sid} existiert nicht")
            errors += 1
            continue
        link = os.path.join(skills_dir, sid)
        rel = os.path.relpath(target_abs, skills_dir)
        if os.path.islink(link):
            if os.readlink(link) == rel and os.path.isdir(link):
                linked += 1
                continue
            if args.check:
                print(f"DRIFT: {link} zeigt auf {os.readlink(link)}, erwartet {rel}")
                errors += 1
                continue
            os.unlink(link)
        elif os.path.exists(link):
            print(f"FEHLT: {link} ist kein Symlink (echte Datei/Verzeichnis) — manuell klaeren")
            errors += 1
            continue
        else:
            if args.check:
                print(f"FEHLT: {link} (Ziel {rel})")
                errors += 1
                continue
        os.symlink(rel, link)
        linked += 1

    print(f"{'geprueft' if args.check else 'verlinkt'}: {linked} Skills ({root} -> {repo})")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
