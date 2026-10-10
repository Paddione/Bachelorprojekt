#!/usr/bin/env python3
"""devflow_ci_watch.py — Watch PR-CI bis gruen (max MAX_CI_ATTEMPTS Versuche).

Migriert aus scripts/devflow-ci-watch.sh (Chore T001007 / Python-Migration).
Synchroner CI-Watcher mit automatischer DIRTY-Rebase-Selbstheilung,
Gegenprobe auf Job-Ebene (T003224), dynamischer Repository-Erkennung
und fail-closed Fehlerbehandlung (T014466).
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse


def run_cmd(args, check=False, cwd=None, env=None, text=True, capture=True):
    """Führt ein externes Kommando aus und gibt CompletedProcess zurück."""
    try:
        res = subprocess.run(
            args,
            cwd=cwd,
            env=env,
            check=check,
            text=text,
            capture_output=capture,
        )
        return res
    except subprocess.CalledProcessError as exc:
        return exc


def extract_repo_from_url(pr_url: str) -> str:
    """Extrahiert owner/repo aus einer GitHub PR-URL oder fällt auf Default zurück."""
    try:
        parsed = urlparse(pr_url)
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and ("pull" in parts or "pulls" in parts):
            return f"{parts[0]}/{parts[1]}"
    except Exception:
        pass
    return "Paddione/Bachelorprojekt"


def resolve_ticket_sh(script_dir: Path) -> Path:
    """Findet ticket.sh aus der Umgebung oder Projektpfaden."""
    env_ticket = os.environ.get("TICKET_SH")
    if env_ticket:
        return Path(env_ticket)
    if Path("scripts/ticket.sh").is_file():
        return Path("scripts/ticket.sh")
    return script_dir / "ticket.sh"


def is_executable(path: Path) -> bool:
    """Prüft, ob ein Pfad existiert und ausführbar ist."""
    return path.is_file() and os.access(path, os.X_OK)


def record_phase(ticket_sh: Path, ticket_id: str, detail: str) -> None:
    """Sendet Best-Effort Phasen-Telemetrie an ticket.sh."""
    if not is_executable(ticket_sh):
        return
    try:
        subprocess.run(
            [
                str(ticket_sh),
                "phase",
                ticket_id,
                "deploy",
                "entered",
                "--driver",
                "devflow",
                "--detail",
                detail,
            ],
            capture_output=True,
            timeout=10,
        )
    except Exception:
        pass


def assert_phase_chain(ticket_sh: Path, ticket_id: str) -> bool:
    """Verifiziert die Phase-Chain via ticket.sh."""
    try:
        res = subprocess.run(
            [str(ticket_sh), "assert-phase-chain", "--id", ticket_id],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if res.stdout:
            sys.stdout.write(res.stdout)
        if res.stderr:
            sys.stderr.write(res.stderr)
        return res.returncode == 0
    except Exception as exc:
        sys.stderr.write(f"Fehler bei assert-phase-chain: {exc}\n")
        return False


def get_sleep_interval(default_seconds: int) -> float:
    """Gibt das Sleep-Intervall zurück (unterstützt CI_WATCH_SLEEP und schnelle Test-Mocks)."""
    env_sleep = os.environ.get("CI_WATCH_SLEEP") or os.environ.get("CI_POLL_SLEEP")
    if env_sleep is not None:
        try:
            return float(env_sleep)
        except ValueError:
            pass
    if "MARKER_DIR" in os.environ:
        return 0.05
    return float(default_seconds)


def run_ci_watch(ticket_id: str, pr_url: str, max_attempts: int = 5) -> int:
    script_dir = Path(__file__).resolve().parent
    ticket_sh = resolve_ticket_sh(script_dir)
    repo = extract_repo_from_url(pr_url)

    # Initial-Telemetrie
    pr_num_res = run_cmd(["gh", "pr", "view", "--json", "number", "-q", ".number"])
    pr_num_telem = pr_num_res.stdout.strip() if pr_num_res.returncode == 0 else ""
    record_phase(ticket_sh, ticket_id, f"PR #{pr_num_telem} · CI watch")

    # 1. Preflight: DIRTY (Rebase nötig)
    merge_state_res = run_cmd(["gh", "pr", "view", pr_url, "--json", "mergeStateStatus", "-q", ".mergeStateStatus"])
    merge_state = merge_state_res.stdout.strip() if merge_state_res.returncode == 0 else ""
    if merge_state == "DIRTY":
        sys.stdout.write("⚠ PR mergeStateStatus=DIRTY — Rebase gegen origin/main vor dem CI-Poll ...\n")
        run_cmd(["git", "fetch", "origin", "main"])
        rebase_res = run_cmd(["git", "rebase", "origin/main"])
        if rebase_res.returncode == 0:
            sys.stdout.write("↻ Freshness-Artefakte nach Rebase regenerieren ...\n")
            regen_res = run_cmd(["task", "freshness:regenerate"])
            if regen_res.returncode != 0:
                sys.stderr.write("⚠ freshness:regenerate fehlgeschlagen — Push läuft ohne Regeneration weiter.\n")
            status_res = run_cmd(["git", "status", "--porcelain"])
            if status_res.returncode == 0 and status_res.stdout.strip():
                run_cmd(["git", "add", "-A"])
                run_cmd(["git", "commit", "-m", f"chore(ci): regenerate freshness artifacts after auto-rebase [{ticket_id}]"])
            push_res = run_cmd(["git", "push", "--force-with-lease"])
            if push_res.returncode != 0:
                sys.stderr.write("❌ push nach Rebase fehlgeschlagen (force-with-lease abgelehnt oder Netzwerkfehler) — manuelles Eingreifen nötig.\n")
                return 3
        else:
            run_cmd(["git", "rebase", "--abort"])
            sys.stderr.write("❌ Rebase-Konflikt gegen origin/main — manuelle Konfliktlösung nötig (kein Auto-Force).\n")
            return 3

    # 2. Conflict Preflight: mergeable=CONFLICTING
    mergeable_res = run_cmd(["gh", "pr", "view", pr_url, "--json", "mergeable", "-q", ".mergeable"])
    mergeable = mergeable_res.stdout.strip() if mergeable_res.returncode == 0 else ""
    if mergeable == "CONFLICTING":
        branch_res = run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"])
        branch = branch_res.stdout.strip() if branch_res.returncode == 0 else "unknown"
        sys.stderr.write("❌ PR hat echte Merge-Konflikte gegen main (mergeable=CONFLICTING) — manueller Rebase nötig (kein Auto-Resolve möglich).\n")
        sys.stderr.write(f"   Branch: {branch}\n")
        sys.stderr.write("   Fix: rebase den Branch auf origin/main, dann rufe devflow-ci-watch.sh erneut auf.\n")
        return 4

    # 3. MERGED Preflight: bereits gemergt (T002671)
    state_res = run_cmd(["gh", "pr", "view", pr_url, "--json", "state", "-q", ".state"])
    pr_state = state_res.stdout.strip() if state_res.returncode == 0 else ""
    if pr_state == "MERGED":
        sys.stdout.write("✅ PR bereits gemergt (state=MERGED) — Checks waren per Branch-Protection bereits grün. Überspringe Poll-Loop.\n")
        if not is_executable(ticket_sh):
            sys.stderr.write(f"⚠ ticket.sh nicht erreichbar ({ticket_sh}) — Phase-Chain kann nicht verifiziert werden (Worktree entfernt?).\n")
            return 7
        if not assert_phase_chain(ticket_sh, ticket_id):
            sys.stderr.write("❌ Phase-Chain nicht vollständig — siehe Meldungen oben.\n")
            return 6
        return 0

    # 4. Polling-Schleife
    ci_attempt = 0
    while True:
        ci_attempt += 1
        sys.stdout.write(f"⏳ CI-Check Versuch {ci_attempt}/{max_attempts} für {pr_url} ...\n")
        sys.stdout.flush()
        record_phase(ticket_sh, ticket_id, f"CI attempt {ci_attempt}/{max_attempts}")

        # gh pr checks --watch blockiert bis zum nächsten Update
        run_cmd(["gh", "pr", "checks", pr_url, "--watch", "--interval", "15"])

        # Head OID ermitteln
        head_res = run_cmd(["gh", "pr", "view", pr_url, "--json", "headRefOid", "-q", ".headRefOid"])
        pr_head_oid = head_res.stdout.strip() if head_res.returncode == 0 else ""
        if not pr_head_oid:
            sys.stderr.write("⚠ gh pr view --json headRefOid fehlgeschlagen — PR-HEAD nicht bestimmbar, Checks können nicht sicher bewertet werden.\n")
            if ci_attempt >= max_attempts:
                sys.stderr.write(f"❌ Nach {max_attempts} Versuchen weiterhin keine verlässliche Check-Auskunft von gh — manuelles Eingreifen nötig.\n")
                return 1
            time.sleep(get_sleep_interval(15))
            continue

        # Check-Runs für den Commit abrufen
        check_runs_url = f"repos/{repo}/commits/{pr_head_oid}/check-runs?filter=latest"
        check_runs_q = '[.check_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out") | (.name // "unknown") + ": " + (.html_url // "")]'
        check_runs_res = run_cmd(["gh", "api", check_runs_url, "-q", check_runs_q])
        if check_runs_res.returncode != 0:
            sys.stderr.write("⚠ gh api check-runs fehlgeschlagen (Auth/Schema/Rate-Limit?) — kann Checks nicht sicher bewerten.\n")
            if ci_attempt >= max_attempts:
                sys.stderr.write(f"❌ Nach {max_attempts} Versuchen weiterhin keine verlässliche Check-Auskunft von gh — manuelles Eingreifen nötig.\n")
                return 1
            time.sleep(get_sleep_interval(15))
            continue

        failed_checks_str = check_runs_res.stdout.strip()
        if failed_checks_str == "[]":
            failed_checks_str = ""

        # Total count ermitteln
        total_url = f"repos/{repo}/commits/{pr_head_oid}/check-runs"
        total_res = run_cmd(["gh", "api", total_url, "-q", ".total_count"])
        total_checks_raw = total_res.stdout.strip() if total_res.returncode == 0 else "0"
        try:
            total_checks = int(total_checks_raw)
        except ValueError:
            total_checks = 0

        if total_checks == 0:
            sys.stdout.write("⚠ Keine CI-Checks gefunden (total_count=0) — CI wurde nie gestartet oder läuft noch.\n")
            return 5

        # Pending-Checks prüfen (T003612)
        pending_q = '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length'
        pending_res = run_cmd(["gh", "pr", "view", pr_url, "--json", "statusCheckRollup", "-q", pending_q])
        pending_raw = pending_res.stdout.strip() if pending_res.returncode == 0 else "0"
        try:
            pending_count = int(pending_raw)
        except ValueError:
            pending_count = 0

        if pending_count > 0:
            if ci_attempt >= max_attempts:
                sys.stderr.write(f"❌ Nach {max_attempts} Versuchen noch {pending_count} Checks nicht abgeschlossen — manuelles Eingreifen nötig.\n")
                return 1
            sys.stdout.write(f"⏳ {pending_count} Checks noch nicht abgeschlossen — warte ...\n")
            time.sleep(get_sleep_interval(30))
            continue

        # Gegenprobe auf Run-/Job-Ebene (T003224, T014466)
        failed_run_id = ""
        if failed_checks_str:
            branch_res = run_cmd(["gh", "pr", "view", pr_url, "--json", "headRefName", "-q", ".headRefName"])
            pr_branch = branch_res.stdout.strip() if branch_res.returncode == 0 else ""
            if not pr_branch:
                sys.stderr.write("⚠ PR-Branch nicht bestimmbar — die Gegenprobe kann rote Checks nicht entlasten.\n")

            if pr_branch:
                run_list_res = run_cmd(["gh", "run", "list", "--branch", pr_branch, "--json", "databaseId,headSha,status,conclusion"])
                if run_list_res.returncode == 0 and run_list_res.stdout.strip():
                    try:
                        runs_data = json.loads(run_list_res.stdout)
                        matched = [
                            r for r in runs_data
                            if r.get("conclusion") == "failure" and r.get("headSha") == pr_head_oid
                        ]
                        if matched:
                            matched.sort(key=lambda x: x.get("databaseId", 0))
                            failed_run_id = str(matched[-1].get("databaseId", ""))
                    except Exception:
                        pass

            if failed_run_id:
                jobs_url = f"repos/{repo}/actions/runs/{failed_run_id}/jobs"
                jobs_res = run_cmd(["gh", "api", jobs_url, "--jq", '[.jobs[] | select(.conclusion == "failure")] | length'])
                real_failures_raw = jobs_res.stdout.strip() if jobs_res.returncode == 0 else ""
                try:
                    real_failures = int(real_failures_raw)
                    if real_failures == 0:
                        sys.stdout.write(f"ℹ Check {failed_run_id} meldet failure, aber KEIN Job ist failure (cancelled/skipped) — kein Codefehler, weiter beobachten.\n")
                        failed_checks_str = ""
                except ValueError:
                    pass
            else:
                sys.stderr.write(f"⚠ check-runs meldet failure, aber kein zugehoeriger Run war ueber Branch '{pr_branch or '?'}' auffindbar.\n")
                sys.stderr.write("   Die Gegenprobe kann den Fehler weder bestaetigen noch entlasten — er bleibt bestehen (fail-closed, T014466).\n")

        # Wenn keine echten Fehler verbleiben -> GRÜN!
        if not failed_checks_str:
            sys.stdout.write(f"✅ {total_checks} CI-Checks, alle grün.\n")
            if not is_executable(ticket_sh):
                sys.stderr.write(f"⚠ ticket.sh nicht erreichbar ({ticket_sh}) — Phase-Chain kann nicht verifiziert werden (Worktree entfernt?).\n")
                return 7
            if not assert_phase_chain(ticket_sh, ticket_id):
                sys.stderr.write("❌ Phase-Chain nicht vollständig — siehe Meldungen oben.\n")
                return 6
            return 0

        # Prüfe auf max_attempts
        if ci_attempt >= max_attempts:
            sys.stdout.write(f"❌ CI nach {max_attempts} Versuchen noch rot — manuelles Eingreifen nötig:\n")
            try:
                parsed = json.loads(failed_checks_str)
                if isinstance(parsed, list):
                    for item in parsed:
                        sys.stdout.write(f"{item}\n")
                else:
                    sys.stdout.write(f"{failed_checks_str}\n")
            except Exception:
                sys.stdout.write(f"{failed_checks_str}\n")
            return 1

        sys.stdout.write("⚠ Fehlgeschlagene Checks:\n")
        try:
            parsed = json.loads(failed_checks_str)
            if isinstance(parsed, list):
                for item in parsed:
                    sys.stdout.write(f"{item}\n")
            else:
                sys.stdout.write(f"{failed_checks_str}\n")
        except Exception:
            sys.stdout.write(f"{failed_checks_str}\n")

        if failed_run_id:
            sys.stdout.write(f"--- CI-Logs (Run {failed_run_id}) ---\n")
            logs_res = run_cmd(["gh", "run", "view", failed_run_id, "--log-failed"])
            if logs_res.stdout:
                lines = logs_res.stdout.splitlines()[-200:]
                sys.stdout.write("\n".join(lines) + "\n")

            sys.stdout.write(f"--- Job-Step-Diagnose (Run {failed_run_id}) ---\n")
            jobs_detail_res = run_cmd([
                "gh", "api", f"repos/{repo}/actions/runs/{failed_run_id}/jobs",
                "--jq", '.jobs[] | select(.conclusion == "failure") | {id: .id, name: .name, steps: [.steps[] | select(.conclusion == "failure") | {step: .name, number: .number, conclusion: .conclusion}]}'
            ])
            if jobs_detail_res.stdout.strip():
                sys.stdout.write(jobs_detail_res.stdout + "\n")

        sys.stdout.write("🔧 CI-Fix-Subagenten spawnen (siehe dev-flow-execute Schritt 5.5 für Prompt-Bauanleitung) ...\n")
        sys.stdout.write("   Kontext für den Fix-Subagenten: fehlgeschlagene Steps aus der Job-Diagnose oben\n")
        sys.stdout.write(f"   + gh run view {failed_run_id} --log-failed für den vollständigen Stacktrace.\n")
        sys.stdout.write("   → Nach erfolgreichem Fix: commit + push, Loop wiederholen.\n")
        sys.stdout.flush()
        time.sleep(get_sleep_interval(15))


def main() -> int:
    if len(sys.argv) < 3:
        sys.stderr.write("usage: devflow-ci-watch.sh <TICKET_ID> <PR_URL>\n")
        return 2

    ticket_id = sys.argv[1]
    pr_url = sys.argv[2]
    max_attempts_raw = os.environ.get("MAX_CI_ATTEMPTS", "5")
    try:
        max_attempts = int(max_attempts_raw)
    except ValueError:
        max_attempts = 5

    return run_ci_watch(ticket_id, pr_url, max_attempts)


if __name__ == "__main__":
    sys.exit(main())
