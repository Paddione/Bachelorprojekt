#!/usr/bin/env python3
"""scripts/ci_red_intake.py — CI-Rot-Intake mit Auto-Resolve (T900759).

Subcommands:
  intake --sha <sha> --workflow <name> [--dry-run]
  resolve --sha <sha> [--dry-run]

intake: prüft die check-runs des Commits; bei Rot (failure/timed_out, cancelled
ist kein Fehler) ein GitHub-Issue (Label `ci`) anlegen, bei Treffer im Titel-Dedupe
(T001147) nur kommentieren.
resolve: offene Rot-Issues bei grünem Beleg-Run schließen. Jeder unbestimmbare
Zustand bricht ohne Schließung ab (fail-closed).

Ticket-Pfad retiriert 2026-10-14: Tracking läuft über GitHub-Issues statt
`tickets.tickets`. Der Mishap-Buffer-Dedupe entfiel mit ihm (kein JSON-Buffer mehr).
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def canon(text: str) -> str:
    """Kanonische Titelform für Dedupe (T001147): case-insensitiv, whitespace-normalisiert."""
    return re.sub(r"\s+", " ", text.lower().strip())


def get_gh_repo() -> str:
    return os.environ.get("CI_RED_INTAKE_REPO", "Paddione/Bachelorprojekt")


def gh_issue_list_open(gh_repo: str) -> list | None:
    """Offene Issues mit Rot-Prefix; fail-closed bei Fehler."""
    try:
        res = subprocess.run(
            ["gh", "issue", "list", "-R", gh_repo, "--state", "open",
             "--search", "CI-Rot auf main:", "--json", "number,title", "--limit", "100"],
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            sys.stderr.write("ci-red-intake: gh issue list fehlgeschlagen (fail-closed).\n")
            return None
        return json.loads(res.stdout) if res.stdout.strip() else []
    except Exception:
        sys.stderr.write("ci-red-intake: issue-liste nicht parsbar (fail-closed).\n")
        return None


def gh_issue_create(gh_repo: str, title: str, body: str) -> str | None:
    """Legt ein Issue an; gibt die Nummer zurück (fail-closed)."""
    try:
        res = subprocess.run(
            ["gh", "issue", "create", "-R", gh_repo, "--title", title,
             "--body", body, "--label", "ci"],
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            return None
        match = re.search(r"/issues/(\d+)", res.stdout)
        return match.group(1) if match else "?"
    except Exception:
        return None


def gh_issue_comment(gh_repo: str, number: str, body: str) -> bool:
    try:
        res = subprocess.run(
            ["gh", "issue", "comment", str(number), "-R", gh_repo, "--body", body],
            capture_output=True,
            check=False,
        )
        return res.returncode == 0
    except Exception:
        return False


def gh_issue_close(gh_repo: str, number: str) -> bool:
    try:
        res = subprocess.run(
            ["gh", "issue", "close", str(number), "-R", gh_repo],
            capture_output=True,
            check=False,
        )
        return res.returncode == 0
    except Exception:
        return False


def fetch_check_runs(sha: str, gh_repo: str) -> dict | None:
    """Holt check-runs JSON via gh api; fail-closed bei Fehler."""
    cmd = ["gh", "api", f"repos/{gh_repo}/commits/{sha}/check-runs?filter=latest"]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if res.returncode != 0 or not res.stdout.strip():
            sys.stderr.write(f"ci-red-intake: gh api check-runs fuer {sha} fehlgeschlagen (fail-closed).\n")
            return None
        return json.loads(res.stdout)
    except Exception:
        sys.stderr.write(f"ci-red-intake: leere check-runs-Antwort fuer {sha} (fail-closed).\n")
        return None


def open_rot_issues(gh_repo: str) -> list | None:
    """Gibt offene Rot-Issues mit Titel-Prefix 'CI-Rot auf main:' zurück."""
    items = gh_issue_list_open(gh_repo)
    if items is None:
        return None
    return [
        t for t in items
        if (t.get("title") or "").strip().lower().startswith("ci-rot auf main:")
    ]


def cmd_intake(sha: str, workflow: str, dry_run: bool = False) -> int:
    gh_repo = get_gh_repo()

    checks_json = fetch_check_runs(sha, gh_repo)
    if checks_json is None:
        return 1

    total = checks_json.get("total_count", 0)
    if total == 0:
        sys.stderr.write(f"ci-red-intake: keine CI-Checks fuer {sha} (fail-closed, nichts angelegt).\n")
        return 1

    check_runs = checks_json.get("check_runs", [])
    failed = [
        r for r in check_runs
        if r.get("conclusion") in ("failure", "timed_out")
    ]

    if not failed:
        sys.stdout.write(f"ci-red-intake: {sha} gruen, kein Issue noetig.\n")
        return 0

    failed_names = ", ".join(r.get("name") or "unknown" for r in failed)
    failed_urls = " ".join(r.get("html_url") or "" for r in failed)
    short_sha = sha[:7]
    title = f"CI-Rot auf main: {workflow} @ {short_sha} ({failed_names})"
    body = f"CI-Rot auf main (HEAD {sha}, Workflow {workflow}). Fehlgeschlagene Checks: {failed_names}. Runs: {failed_urls}"
    canon_title = canon(title)

    # Dedupe: Offenes Issue gleichen Titels oder gleicher SHA
    rot_issues = open_rot_issues(gh_repo)
    if rot_issues is None:
        return 1

    hit_num = None
    for t in rot_issues:
        t_title = t.get("title") or ""
        t_canon = canon(t_title)
        if t_canon == canon_title or short_sha.lower() in t_title.lower():
            hit_num = t.get("number")
            break

    if hit_num:
        if dry_run:
            sys.stdout.write(f"ci-red-intake [dry-run]: wuerde #{hit_num} kommentieren (Dedupe, SHA {short_sha}).\n")
            return 0
        comment_body = f"Erneuter Rot-Befund gleiche SHA {short_sha} ({workflow}): {failed_names}. Runs: {failed_urls}"
        gh_issue_comment(gh_repo, hit_num, comment_body)
        sys.stdout.write(f"ci-red-intake: #{hit_num} kommentiert (Dedupe, kein Duplikat).\n")
        return 0

    if dry_run:
        sys.stdout.write(f"ci-red-intake [dry-run]: wuerde Issue anlegen: {title}\n")
        return 0

    num = gh_issue_create(gh_repo, title, body)
    if num is None:
        sys.stderr.write("ci-red-intake: gh issue create fehlgeschlagen (fail-closed).\n")
        return 1
    sys.stdout.write(f"ci-red-intake: Issue #{num} angelegt: {title}\n")
    return 0


def cmd_resolve(sha: str, dry_run: bool = False) -> int:
    gh_repo = get_gh_repo()

    checks_json = fetch_check_runs(sha, gh_repo)
    if checks_json is None:
        return 1

    total = checks_json.get("total_count", 0)
    check_runs = checks_json.get("check_runs", [])
    failed = [
        r for r in check_runs
        if r.get("conclusion") in ("failure", "timed_out")
    ]
    success_runs = [
        r for r in check_runs
        if r.get("conclusion") == "success"
    ]

    if total == 0:
        sys.stderr.write(f"ci-red-intake: keine CI-Checks fuer {sha} (fail-closed, nichts geschlossen).\n")
        return 1

    if failed:
        sys.stderr.write(f"ci-red-intake: {sha} noch rot ({len(failed)} fehlgeschlagene Checks) — nichts geschlossen.\n")
        return 1

    if not success_runs:
        sys.stderr.write(f"ci-red-intake: {sha} ohne success-Beleg (nur pending/neutral) — nichts geschlossen (fail-closed).\n")
        return 1

    proof_url = success_runs[0].get("html_url") or ""
    rot_issues = open_rot_issues(gh_repo)
    if rot_issues is None:
        return 1

    if not rot_issues:
        sys.stdout.write("ci-red-intake: kein offenes Rot-Issue — nichts zu schliessen.\n")
        return 0

    proof_comment = f"Beleg-Run gruen: {proof_url} (HEAD {sha}, conclusion=success). Auto-Resolve per T900759."
    if dry_run:
        for t in rot_issues:
            num = t.get("number")
            if num:
                sys.stdout.write(f"ci-red-intake [dry-run]: wuerde #{num} schliessen ({proof_url}).\n")
        return 0

    rc = 0
    for t in rot_issues:
        num = t.get("number")
        if not num:
            continue
        if not gh_issue_comment(gh_repo, num, proof_comment):
            rc = 1
        if not gh_issue_close(gh_repo, num):
            rc = 1
        sys.stdout.write(f"ci-red-intake: #{num} geschlossen.\n")

    return rc


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="ci-red-intake.sh",
        description="CI-Rot-Intake mit Auto-Resolve (T900759)",
    )
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # intake
    p_intake = subparsers.add_parser("intake")
    p_intake.add_argument("--sha", required=True, help="Git Commit SHA")
    p_intake.add_argument("--workflow", required=True, help="Workflow Name")
    p_intake.add_argument("--dry-run", action="store_true", default=False)

    # resolve
    p_resolve = subparsers.add_parser("resolve")
    p_resolve.add_argument("--sha", required=True, help="Git Commit SHA")
    p_resolve.add_argument("--dry-run", action="store_true", default=False)

    args = parser.parse_args()

    if args.subcommand == "intake":
        return cmd_intake(args.sha, args.workflow, args.dry_run)
    elif args.subcommand == "resolve":
        return cmd_resolve(args.sha, args.dry_run)

    return 2


if __name__ == "__main__":
    sys.exit(main())
