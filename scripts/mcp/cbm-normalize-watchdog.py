#!/usr/bin/env python3
"""cbm-normalize-watchdog.py — Daemon-Pfad-Kind-Normalisierung (K1 repo-graph-label-cleanup).

Der K1-Normalisierer (scripts/mcp/cbm-normalize-kinds.py) hing bisher nur im
CLI-Pfad (scripts/mcp/cbm-single-flight.sh). Rebuilds ueber den CBM-Daemon
(MCP-Tool index_repository anderer Harnesses, Auto-Watch-Reindexes) umgehen
ihn und fuehren Wild-Kinds wieder ein (EnvVar/Type/DiagramElement/Diagram/
Process/Branch/Decorator).

Dieser Watchdog folgt dem Daemon-Log wie `tail -F` und normalisiert nach jedem
gemeldeten Index-Lauf die Projekt-DB. Idempotent; schreibt je Ereignis EINE
JSON-Zeile ins eigene Log.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_PROJECTS = [
    "home-patrick",
    "home-patrick-Bachelorprojekt",
    "home-patrick-agentic-resources",
    "home-patrick-news-agent",
    "home-patrick-unsloth-boxes",
    "home-patrick-mcp-servers-task-runner",
]

WILD_KINDS = (
    "EnvVar",
    "Type",
    "DiagramElement",
    "Diagram",
    "Process",
    "Branch",
    "Decorator",
)

PROJECT_RE = re.compile(r"project=(\S+)")

DEFAULT_DAEMON_LOG = "/home/patrick/.cache/codebase-memory-mcp/logs/cbm-daemon.log"
DEFAULT_CACHE_DIR = "/home/patrick/.cache/codebase-memory-mcp"
DEFAULT_WATCH_LOG = "/home/patrick/.cache/codebase-memory-mcp/logs/cbm-normalize.log"
DEFAULT_REPO_ROOT = "/home/patrick/Bachelorprojekt"

QUIESCE_INTERVAL = 1.5
QUIESCE_MAX_WAIT = 30.0
NORMALIZE_TIMEOUT = 300
RETRY_DELAY = 60.0


def parse_index_result_line(line):
    """Extrahiert das Projekt aus einer daemon.index.result-Zeile.

    Gibt den Projektnamen zurueck, wenn die Zeile einen abgeschlossenen
    Index-Lauf (status=indexed) meldet, sonst None.
    """
    if not line or "daemon.index.result" not in line:
        return None
    if "status=indexed" not in line:
        return None
    match = PROJECT_RE.search(line)
    if not match:
        return None
    return match.group(1)


def wait_db_quiescence(db, interval=QUIESCE_INTERVAL, max_wait=QUIESCE_MAX_WAIT,
                       stat_fn=os.stat, sleep_fn=time.sleep,
                       clock_fn=time.monotonic):
    """Wartet, bis mtime+size der DB zweimal im Abstand `interval` identisch sind.

    Gibt True zurueck, sobald die DB ruhig ist, sonst False (DB fehlt oder
    wird innerhalb von `max_wait` Sekunden nie ruhig).
    """
    try:
        first = stat_fn(str(db))
    except OSError:
        return False
    start = clock_fn()
    prev = (first.st_mtime_ns, first.st_size)
    while True:
        sleep_fn(interval)
        try:
            current = stat_fn(str(db))
        except OSError:
            return False
        now = (current.st_mtime_ns, current.st_size)
        if now == prev:
            return True
        prev = now
        if clock_fn() - start >= max_wait:
            return False


def run_normalizer(db, project, repo_root, apply, timeout=NORMALIZE_TIMEOUT):
    """Ruft cbm-normalize-kinds.py per Subprozess auf und parst die JSON-Ausgabe.

    Gibt (exit_code, daten_dict) zurueck. Bei Subprozess-Fehlern ist
    exit_code != 0 und daten_dict enthaelt einen "error"-Schluessel.
    """
    script = Path(repo_root) / "scripts" / "mcp" / "cbm-normalize-kinds.py"
    cmd = [sys.executable, str(script), "--db", str(db),
           "--project", project]
    if apply:
        cmd.append("--apply")
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True,
                              timeout=timeout)
    except Exception as exc:  # noqa: BLE001 — als Fehler-Report zurueckgeben
        return (2, {"error": "%s" % exc})
    out = (proc.stdout or "").strip()
    try:
        data = json.loads(out) if out else {}
    except ValueError:
        data = {"raw": out, "stderr": proc.stderr}
    if proc.returncode != 0 and "error" not in data:
        data = {"error": out or proc.stderr or
                "normalizer exit %d" % proc.returncode}
    return (proc.returncode, data)


def wild_counts(db, project):
    """Zaehlt Wild-Kind-Labels in der Projekt-DB (read-only)."""
    conn = sqlite3.connect("file:%s?mode=ro" % db, uri=True)
    try:
        counts = {}
        for wild in WILD_KINDS:
            row = conn.execute(
                "SELECT COUNT(*) FROM nodes WHERE label=? AND project=?",
                (wild, project)).fetchone()
            counts[wild] = row[0] if row else 0
        return counts
    finally:
        conn.close()


def has_wild_kinds(db, project):
    """True, wenn die Projekt-DB noch Wild-Kind-Labels enthaelt."""
    try:
        return any(count > 0 for count in wild_counts(db, project).values())
    except Exception:  # noqa: BLE001 — fehlende DB/Tabelle heisst: nichts zu tun
        return False


class Watchdog:
    """Beobachtet das Daemon-Log und normalisiert Projekt-DBs nach Index-Laeufen."""

    def __init__(self, daemon_log=DEFAULT_DAEMON_LOG,
                 watch_log=DEFAULT_WATCH_LOG,
                 cache_dir=DEFAULT_CACHE_DIR, repo_root=DEFAULT_REPO_ROOT,
                 projects=None, dry_run=False, once=False,
                 sleep_fn=time.sleep, stat_fn=os.stat,
                 clock_fn=time.monotonic):
        self.daemon_log = str(daemon_log)
        self.watch_log = str(watch_log)
        self.cache_dir = str(cache_dir)
        self.repo_root = str(repo_root)
        self.projects = list(projects) if projects is not None else list(DEFAULT_PROJECTS)
        self.dry_run = bool(dry_run)
        self.once = bool(once)
        self.sleep_fn = sleep_fn
        self.stat_fn = stat_fn
        self.clock_fn = clock_fn

    def _log(self, payload):
        entry = dict(payload)
        entry.setdefault("ts", datetime.datetime.now(
            datetime.timezone.utc).isoformat())
        try:
            Path(self.watch_log).parent.mkdir(parents=True, exist_ok=True)
            with open(self.watch_log, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry, sort_keys=True) + "\n")
        except Exception as exc:  # noqa: BLE001 — Logging darf nie crashen
            print("watchdog log failed: %s" % exc, file=sys.stderr)

    def _db_for(self, project):
        return Path(self.cache_dir) / ("%s.db" % project)

    def _in_scope(self, project):
        return project in self.projects

    def _normalize_project(self, project):
        db = self._db_for(project)
        if not Path(str(db)).exists():
            self._log({"event": "error", "project": project,
                       "error": "db missing: %s" % db})
            return False
        quiet = wait_db_quiescence(
            db, QUIESCE_INTERVAL, QUIESCE_MAX_WAIT,
            stat_fn=self.stat_fn, sleep_fn=self.sleep_fn,
            clock_fn=self.clock_fn)
        if not quiet:
            self._log({"event": "error", "project": project,
                       "error": "db not quiescent: %s" % db})
            return False
        exit_code, data = run_normalizer(
            str(db), project, self.repo_root, True)
        if exit_code != 0:
            self.sleep_fn(RETRY_DELAY)
            exit_code, data = run_normalizer(
                str(db), project, self.repo_root, True)
        if exit_code != 0:
            self._log({"event": "error", "project": project,
                       "error": str(data.get("error", data))})
            return False
        self._log({"event": "normalized", "project": project,
                   "mapped": data.get("mapped", {}), "exit": 0})
        return True

    def handle_line(self, line):
        """Verarbeitet EINE Daemon-Log-Zeile (crash-sicher)."""
        try:
            project = parse_index_result_line(line)
            if project is None:
                return False
            if not self._in_scope(project):
                return False
            return bool(self._normalize_project(project))
        except Exception as exc:  # noqa: BLE001 — kein Crash-Loop
            try:
                self._log({"event": "error", "project": "",
                           "error": "handle_line: %s" % exc})
            except Exception:  # noqa: BLE001, S110 — Logging best effort
                pass
            return False

    def run_once(self):
        """Normalisiert alle Scope-Projekte mit Wild-Kinds, dann Ende."""
        report = {}
        for project in self.projects:
            db = self._db_for(project)
            try:
                if not Path(str(db)).exists():
                    if self.dry_run:
                        report[project] = {"db": str(db), "error": "db missing",
                                           "would_normalize": False}
                    else:
                        self._log({"event": "error", "project": project,
                                   "error": "db missing: %s" % db})
                    continue
                counts = wild_counts(str(db), project)
                pending = sum(counts.values())
                if self.dry_run:
                    report[project] = {"db": str(db), "wild": counts,
                                       "would_normalize": pending > 0}
                    continue
                if pending > 0:
                    self._normalize_project(project)
            except Exception as exc:  # noqa: BLE001 — pro Projekt robust
                if self.dry_run:
                    report[project] = {"db": str(db), "error": "%s" % exc,
                                       "would_normalize": False}
                else:
                    self._log({"event": "error", "project": project,
                               "error": "%s" % exc})
        if self.dry_run:
            print(json.dumps(report, sort_keys=True))
        return report

    def follow(self):
        """Folgt dem Daemon-Log wie `tail -F` (Rotation/Re-Create-sicher)."""
        self._log({"event": "startup", "project": "",
                   "daemon_log": self.daemon_log,
                   "projects": self.projects})
        position = None
        inode = None
        while True:
            try:
                try:
                    current = self.stat_fn(self.daemon_log)
                except OSError:
                    inode = None
                    position = None
                    self.sleep_fn(1.0)
                    continue
                if inode is None:
                    inode = current.st_ino
                    position = current.st_size
                elif current.st_ino != inode:
                    inode = current.st_ino
                    position = 0
                elif current.st_size < position:
                    position = 0
                if current.st_size > position:
                    with open(self.daemon_log, encoding="utf-8",
                              errors="replace") as handle:
                        handle.seek(position)
                        chunk = handle.read()
                        position = handle.tell()
                    for line in chunk.splitlines():
                        self.handle_line(line)
                else:
                    self.sleep_fn(0.5)
            except Exception as exc:  # noqa: BLE001 — kein Crash-Loop
                try:
                    self._log({"event": "error", "project": "",
                               "error": "follow: %s" % exc})
                except Exception:  # noqa: BLE001, S110 — Logging best effort
                    pass
                self.sleep_fn(5.0)

    def run(self):
        if self.once or self.dry_run:
            return self.run_once()
        return self.follow()


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Normalisiert CBM-Projekt-DBs nach Daemon-Index-Laeufen.")
    parser.add_argument("--projects", default=",".join(DEFAULT_PROJECTS),
                        help="Komma-separierte Scope-Liste (Default: K1-Scope)")
    parser.add_argument("--daemon-log", default=DEFAULT_DAEMON_LOG)
    parser.add_argument("--watch-log", default=DEFAULT_WATCH_LOG)
    parser.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR)
    parser.add_argument("--repo-root", default=DEFAULT_REPO_ROOT)
    parser.add_argument("--once", action="store_true",
                        help="Alle Scope-Projekte mit Wild-Kinds einmal "
                             "normalisieren, dann beenden.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur JSON-Bericht je Projekt, keine Schreibzugriffe.")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    projects = [item.strip() for item in args.projects.split(",")
                if item.strip()]
    watchdog = Watchdog(daemon_log=args.daemon_log,
                        watch_log=args.watch_log,
                        cache_dir=args.cache_dir,
                        repo_root=args.repo_root,
                        projects=projects,
                        dry_run=args.dry_run,
                        once=args.once)
    watchdog.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
