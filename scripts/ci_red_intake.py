#!/usr/bin/env python3
"""scripts/ci_red_intake.py — CI-Rot-Intake mit Auto-Resolve (T900759).

Migriert aus scripts/ci-red-intake.sh.
Subcommands:
  intake --sha <sha> --workflow <name> [--dry-run]
  resolve --sha <sha> [--dry-run]

intake: prüft die check-runs des Commits; bei Rot (failure/timed_out, cancelled
ist kein Fehler) ein type=bug-Ticket (areas=ci) anlegen, bei Treffer im Titel-Dedupe
(T001147) oder Mishap-Buffer (T002844) nur kommentieren.
resolve: offene Rot-Tickets bei grünem Beleg-Run als done (resolution=fixed)
schließen. Jeder unbestimmbare Zustand bricht ohne Schließung ab (fail-closed).
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


def get_repo_root() -> Path:
    script_dir = Path(__file__).resolve().parent
    return script_dir.parent


def get_ticket_sh(repo_root: Path) -> Path:
    env_ticket = os.environ.get("TICKET_SH")
    if env_ticket:
        return Path(env_ticket)
    return repo_root / "scripts" / "ticket.sh"


def get_gh_repo() -> str:
    return os.environ.get("CI_RED_INTAKE_REPO", "Paddione/Bachelorprojekt")


def mishap_buffer_path(repo_root: Path) -> Path:
    env_buf = os.environ.get("MISHAP_BUFFER")
    if env_buf:
        return Path(env_buf)
    try:
        res = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "--git-common-dir"],
            capture_output=True,
            text=True,
            check=False,
        )
        common = res.stdout.strip()
    except Exception:
        common = ""

    if not common:
        return repo_root / ".git" / "mishap-buffer.json"
    if common.startswith("/"):
        return Path(common) / "mishap-buffer.json"
    return repo_root / common / "mishap-buffer.json"


def fetch_check_runs(sha: str, gh_repo: str) -> dict | None:
    """Holt check-runs JSON via gh api; fail-closed bei Fehler."""
    cmd = ["gh", "api", f"repos/{gh_repo}/commits/{sha}/check-runs?filter=latest"]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if res.returncode != 0 or not res.stdout.strip():
            sys.stderr.write(f"ci-red-intake: gh api check-runs fuer {sha} fehlgeschlagen (fail-closed).\n")
            return None
        return json.loads(res.stdout)
    except Exception as exc:
        sys.stderr.write(f"ci-red-intake: leere check-runs-Antwort fuer {sha} (fail-closed).\n")
        return None


def open_rot_tickets(ticket_sh: Path) -> list | None:
    """Gibt offene Rot-Tickets mit Titel-Prefix 'CI-Rot auf main:' zurück."""
    try:
        res = subprocess.run(
            [str(ticket_sh), "list", "--status", "triage"],
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            sys.stderr.write("ci-red-intake: ticket.sh list fehlgeschlagen (fail-closed).\n")
            return None
        items = json.loads(res.stdout) if res.stdout.strip() else []
        rot_tickets = [
            t for t in items
            if (t.get("title") or "").strip().lower().startswith("ci-rot auf main:")
        ]
        return rot_tickets
    except Exception:
        sys.stderr.write("ci-red-intake: ticket-liste nicht parsbar (fail-closed).\n")
        return None


def cmd_intake(sha: str, workflow: str, dry_run: bool = False) -> int:
    repo_root = get_repo_root()
    ticket_sh = get_ticket_sh(repo_root)
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
        sys.stdout.write(f"ci-red-intake: {sha} gruen, kein Ticket noetig.\n")
        return 0

    failed_names = ", ".join(r.get("name") or "unknown" for r in failed)
    failed_urls = " ".join(r.get("html_url") or "" for r in failed)
    short_sha = sha[:7]
    title = f"CI-Rot auf main: {workflow} @ {short_sha} ({failed_names})"
    body = f"CI-Rot auf main (HEAD {sha}, Workflow {workflow}). Fehlgeschlagene Checks: {failed_names}. Runs: {failed_urls}"
    canon_title = canon(title)

    # Dedupe 1: Offenes Ticket gleichen Titels oder gleicher SHA
    rot_tickets = open_rot_tickets(ticket_sh)
    if rot_tickets is None:
        return 1

    hit_id = None
    for t in rot_tickets:
        t_title = t.get("title") or ""
        t_canon = canon(t_title)
        if t_canon == canon_title or short_sha.lower() in t_title.lower():
            hit_id = t.get("external_id")
            break

    if hit_id:
        if dry_run:
            sys.stdout.write(f"ci-red-intake [dry-run]: wuerde {hit_id} kommentieren (Dedupe, SHA {short_sha}).\n")
            return 0
        comment_body = f"Erneuter Rot-Befund gleiche SHA {short_sha} ({workflow}): {failed_names}. Runs: {failed_urls}"
        subprocess.run(
            [str(ticket_sh), "add-comment", "--id", str(hit_id), "--body", comment_body],
            capture_output=True,
            check=False,
        )
        sys.stdout.write(f"ci-red-intake: {hit_id} kommentiert (Dedupe, kein Duplikat).\n")
        return 0

    # Dedupe 2: Mishap-Buffer
    buf_path = mishap_buffer_path(repo_root)
    if buf_path.is_file():
        try:
            buf_items = json.loads(buf_path.read_text())
            if isinstance(buf_items, list):
                for item in buf_items:
                    item_title = item.get("title") or ""
                    if canon(item_title) == canon_title or short_sha.lower() in item_title.lower():
                        sys.stdout.write(f"ci-red-intake: Mishap-Buffer enthaelt {title} bereits — keine Neuanlage.\n")
                        return 0
        except Exception:
            pass

    if dry_run:
        sys.stdout.write(f"ci-red-intake [dry-run]: wuerde Ticket anlegen: {title}\n")
        return 0

    subprocess.run(
        [
            str(ticket_sh), "create",
            "--type", "bug",
            "--title", title,
            "--description", body,
            "--areas", "ci",
        ],
        capture_output=True,
        check=False,
    )
    return 0


def cmd_resolve(sha: str, dry_run: bool = False) -> int:
    repo_root = get_repo_root()
    ticket_sh = get_ticket_sh(repo_root)
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
    rot_tickets = open_rot_tickets(ticket_sh)
    if rot_tickets is None:
        return 1

    if not rot_tickets:
        sys.stdout.write("ci-red-intake: kein offenes Rot-Ticket — nichts zu schliessen.\n")
        return 0

    proof_comment = f"Beleg-Run gruen: {proof_url} (HEAD {sha}, conclusion=success). Auto-Resolve per T900759."
    if dry_run:
        for t in rot_tickets:
            tid = t.get("external_id")
            if tid:
                sys.stdout.write(f"ci-red-intake [dry-run]: wuerde {tid} als done/fixed schliessen ({proof_url}).\n")
        return 0

    rc = 0
    for t in rot_tickets:
        tid = t.get("external_id")
        if not tid:
            continue
        c_res = subprocess.run(
            [str(ticket_sh), "add-comment", "--id", str(tid), "--body", proof_comment],
            capture_output=True,
            check=False,
        )
        if c_res.returncode != 0:
            rc = 1
        s_res = subprocess.run(
            [
                str(ticket_sh), "update-status",
                "--id", str(tid),
                "--status", "done",
                "--resolution", "fixed",
                "--notes", proof_comment,
            ],
            capture_output=True,
            check=False,
        )
        if s_res.returncode != 0:
            rc = 1
        sys.stdout.write(f"ci-red-intake: {tid} als done/fixed geschlossen.\n")

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
