#!/usr/bin/env python3
"""scripts/context7_updater.py — taegliche Patch/Minor-Updates der npm-Workspaces.

Laeuft ohne Modell ueber den User-Timer context7-updater.timer (dotfiles,
~/.config/systemd/user). Ersetzt die Cloud-Routine "Daily Context7 Library
Updater"; der Name blieb, damit Branches, PR-Titel und Issue #6989 anschliessen.

Ablauf: frischer Clone von main, Scan aller Manifeste unter components/ und
packages/, Major-Spruenge ins Issue, Patch/Minor als ein PR mit Auto-Merge. Der
Lauf arbeitet nie im Live-Checkout.

Regeln, die hier stehen, weil sie nicht aus dem Code folgen:
- Release-Age: gilt auch fuer transitive Abhaengigkeiten. npm bekommt --before,
  pnpm --config.minimum-release-age (die camelCase-Form ignoriert pnpm still, und
  der Default auf dem Host ist 0). Ohne Grenze tragen die Cloud-Laeufe junge
  Versionen in minimumReleaseAgeExclude ein, statt sie abzulehnen. Legt pnpm
  trotzdem eine Ausnahme an, wird der Workspace verworfen und spaeter neu versucht.
- 0.x: dort darf ein Minor brechen, deshalb zaehlt es hier als Major.
- Exit 1 ist das Alarmsignal: repo-hygiene-audit.py prueft das Service-Ergebnis.
  Ein offener Update-PR blockiert alle Folgelaeufe, darum endet ein festhaengender
  PR (STALE_PR_HOURS) rot statt still.

Usage: context7_updater.py [--dry-run] [--exclude PAKET]...
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

REPO = "Paddione/Bachelorprojekt"
CLONE_URL = f"https://github.com/{REPO}"
BASE_BRANCH = "main"
BRANCH_PREFIX = "chore/context7-updates-"
MAJOR_ISSUE_TITLE = "chore(deps): major version updates available"
GIT_NAME = "Context7 Updater"
GIT_EMAIL = "context7-updater@bachelorprojekt.auto"

MIN_RELEASE_AGE_DAYS = 3
MIN_RELEASE_AGE = timedelta(days=MIN_RELEASE_AGE_DAYS)
STALE_PR_HOURS = 48
COMMAND_TIMEOUT = 600

MANIFEST_RE = re.compile(r"^(components|packages)/.*package\.json$")
SPEC_RE = re.compile(r"^([\^~]?)(\d+)\.(\d+)\.(\d+)$")
STABLE_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


class LockfileError(RuntimeError):
    pass


@dataclass
class ScanResult:
    updates: dict = field(default_factory=dict)
    majors: list = field(default_factory=list)
    held: list = field(default_factory=list)
    unparsed: list = field(default_factory=list)


@dataclass
class ApplyResult:
    applied: dict = field(default_factory=dict)
    failed: list = field(default_factory=list)
    gated: list = field(default_factory=list)


def parse_spec(raw):
    match = SPEC_RE.match(str(raw))
    if not match:
        return None
    return match[1], tuple(int(part) for part in match.groups()[1:])


def parse_stable(version):
    match = STABLE_RE.match(str(version))
    return tuple(int(part) for part in match.groups()) if match else None


def parse_time(stamp):
    return datetime.fromisoformat(stamp.replace("Z", "+00:00"))


def compat_line(version):
    return (0, version[1]) if version[0] == 0 else (version[0],)


def latest_version(doc):
    return parse_stable(doc.get("dist-tags", {}).get("latest", ""))


def pick_update(raw, doc, now, min_age):
    parsed, latest = parse_spec(raw), latest_version(doc)
    if not parsed or not latest:
        return None
    prefix, current = parsed
    best = None
    for version, published in doc.get("time", {}).items():
        candidate = parse_stable(version)
        if (candidate is None or candidate <= current or candidate > latest
                or compat_line(candidate) != compat_line(current)
                or now - parse_time(published) < min_age):
            continue
        if best is None or candidate > best:
            best = candidate
    return prefix + ".".join(map(str, best)) if best else None


def major_gap(raw, doc):
    parsed, latest = parse_spec(raw), latest_version(doc)
    if not parsed or not latest or latest <= parsed[1]:
        return None
    if compat_line(latest) == compat_line(parsed[1]):
        return None
    return ".".join(map(str, latest))


def held_version(raw, doc, now, min_age):
    parsed, latest = parse_spec(raw), latest_version(doc)
    if not parsed or not latest or latest <= parsed[1] or compat_line(latest) != compat_line(parsed[1]):
        return None
    version = ".".join(map(str, latest))
    published = doc.get("time", {}).get(version)
    return version if published and now - parse_time(published) < min_age else None


def scan(manifests, docs, now, min_age, exclude):
    result = ScanResult()
    held = set()
    for path in sorted(manifests):
        for pkg, raw in sorted(manifests[path].items()):
            if pkg in exclude:
                continue
            if not parse_spec(raw):
                result.unparsed.append((path, pkg, raw))
                continue
            doc = docs.get(pkg)
            if not doc:
                continue
            new_spec = pick_update(raw, doc, now, min_age)
            if new_spec:
                result.updates.setdefault(path, []).append((pkg, raw, new_spec))
            gap = major_gap(raw, doc)
            if gap:
                result.majors.append((path, pkg, raw, gap))
            young = held_version(raw, doc, now, min_age)
            if young:
                held.add((pkg, young))
    result.held = sorted(held)
    return result


def bump_manifest(text, pkg, new_spec):
    block = re.search(r'"dependencies"\s*:\s*\{[^}]*\}', text)
    if block:
        pattern = r'("%s"\s*:\s*")[^"]+(")' % re.escape(pkg)
        bumped, count = re.subn(pattern, lambda m: m[1] + new_spec + m[2], block[0], count=1)
        if count:
            return text[:block.start()] + bumped + text[block.end():]
    raise ValueError(f"{pkg} steht nicht in dependencies")


def run_cmd(cmd, cwd):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=COMMAND_TIMEOUT)
    return result.returncode, result.stdout + result.stderr


def refresh_lockfile(workspace, run=run_cmd):
    """Nur Lockfile, keine Installation: --ignore-scripts haelt Paketcode vom Host fern."""
    if (workspace / "pnpm-lock.yaml").exists():
        lockfile = "pnpm-lock.yaml"
        rc, out = run(["pnpm", "install", "--no-frozen-lockfile", "--lockfile-only", "--ignore-scripts",
                       f"--config.minimum-release-age={MIN_RELEASE_AGE_DAYS * 24 * 60}"], workspace)
    elif (workspace / "package-lock.json").exists():
        lockfile = "package-lock.json"
        cutoff = (datetime.now(timezone.utc) - MIN_RELEASE_AGE).isoformat(timespec="seconds")
        npm = ["npm", "install", "--package-lock-only", "--ignore-scripts", f"--before={cutoff}"]
        rc, out = run(npm, workspace)
        if rc and "ERESOLVE" in out:  # VideoVault: typescript 7 gegen @typescript-eslint
            rc, out = run([*npm, "--legacy-peer-deps"], workspace)
    else:
        raise LockfileError(f"kein Lockfile in {workspace.name}")
    if rc:
        raise LockfileError("\n".join(out.strip().splitlines()[-5:]))
    return lockfile


def restore_workspace(workspace):
    subprocess.run(["git", "checkout", "--", "."], cwd=workspace, check=True)


def apply_updates(root, updates, refresh=refresh_lockfile, run=run_cmd):
    result = ApplyResult()
    for path, ups in updates.items():
        manifest = root / path
        workspace = manifest.parent
        try:
            text = manifest.read_text()
            for pkg, _, new_spec in ups:
                text = bump_manifest(text, pkg, new_spec)
            manifest.write_text(text)
            lockfile = refresh(workspace, run)
        except (LockfileError, ValueError, subprocess.TimeoutExpired) as exc:
            restore_workspace(workspace)
            result.failed.append((path, str(exc)))
            continue
        changed = subprocess.run(["git", "diff", "--quiet", "--", "pnpm-workspace.yaml"], cwd=workspace)
        if changed.returncode:
            restore_workspace(workspace)
            result.gated.append(path)
            continue
        result.applied[path] = lockfile
    return result


def gh(*args):
    result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=COMMAND_TIMEOUT)
    if result.returncode:
        raise RuntimeError(f"gh {' '.join(args[:2])}: {result.stderr.strip()}")
    return result.stdout


def git(root, *args):
    subprocess.run(["git", *args], cwd=root, check=True, timeout=COMMAND_TIMEOUT)


def major_table(majors):
    rows = ["| Workspace | Package | Current | Major Version |", "|---|---|---|---|"]
    rows += [f"| {path.removesuffix('/package.json')} | {pkg} | {raw} | {latest} |"
             for path, pkg, raw, latest in majors]
    return "\n".join(rows)


def report_majors(majors, today):
    if not majors:
        return
    table = major_table(majors)
    issues = json.loads(gh("issue", "list", "--repo", REPO, "--state", "open", "--label", "maintenance",
                           "--limit", "100", "--json", "number,title"))
    match = next((issue for issue in issues if issue["title"] == MAJOR_ISSUE_TITLE), None)
    if not match:
        gh("issue", "create", "--repo", REPO, "--title", MAJOR_ISSUE_TITLE, "--label", "maintenance",
           "--body", f"Stand {today}, nur Bericht, kein Code geaendert:\n\n{table}")
        return
    number = str(match["number"])
    issue = json.loads(gh("issue", "view", number, "--repo", REPO, "--json", "body,comments"))
    last = issue["comments"][-1]["body"] if issue["comments"] else issue["body"]
    if table in last:
        print("major updates: unchanged since the last report")
        return
    gh("issue", "comment", number, "--repo", REPO,
       "--body", f"Stand {today}, nur Bericht, kein Code geaendert:\n\n{table}")


def blocking_prs(prs):
    return [pr for pr in prs if pr["headRefName"].startswith(BRANCH_PREFIX)]


def is_stale(pr, now):
    return now - parse_time(pr["createdAt"]) > timedelta(hours=STALE_PR_HOURS)


def fetch_packument(pkg):
    url = "https://registry.npmjs.org/" + urllib.parse.quote(pkg, safe="@")
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            return pkg, json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:  # privates Paket
            return pkg, None
        raise


def fetch_packuments(names):
    with ThreadPoolExecutor(12) as pool:
        docs = dict(pool.map(fetch_packument, sorted(names)))
    missing = sorted(pkg for pkg, doc in docs.items() if doc is None)
    if missing:
        print("not on npm:", ", ".join(missing))
    return {pkg: doc for pkg, doc in docs.items() if doc}


def read_manifests(root):
    tracked = subprocess.run(["git", "ls-files"], cwd=root, check=True, capture_output=True, text=True).stdout
    manifests = {}
    for path in tracked.splitlines():
        if MANIFEST_RE.match(path):
            manifests[path] = json.loads((root / path).read_text()).get("dependencies", {})
    return manifests


def pr_body(result, applied):
    rows = ["## Patch/Minor-Updates", "", "| Workspace | Package | Von | Auf |", "|---|---|---|---|"]
    for path in applied.applied:
        rows += [f"| {path.removesuffix('/package.json')} | {pkg} | {raw} | {new} |"
                 for pkg, raw, new in result.updates[path]]
    rows += ["", f"Nur Releases, die mindestens {MIN_RELEASE_AGE_DAYS} Tage alt sind."]
    if result.held:
        held = ", ".join(f"{pkg}@{version}" for pkg, version in result.held)
        rows += ["", f"Noch zu jung: {held}."]
    if applied.gated:
        rows += ["", "Verworfen wegen junger transitiver Abhaengigkeit: " + ", ".join(applied.gated) + "."]
    if applied.failed:
        rows += ["", "Lockfile fehlgeschlagen:"]
        rows += [f"- {path}: {reason}" for path, reason in applied.failed]
    if result.majors:
        rows += ["", f"Major-Updates stehen im Issue \"{MAJOR_ISSUE_TITLE}\"."]
    rows += ["", "---", "_Erzeugt von `scripts/context7_updater.py` (Timer `context7-updater`)._"]
    return "\n".join(rows)


def publish(root, result, applied, today):
    branch = BRANCH_PREFIX + today
    title = f"chore(deps): update Context7 libraries {today}"
    git(root, "checkout", "-q", "-b", branch)
    for path, lockfile in applied.applied.items():
        git(root, "add", "--", path, str(Path(path).parent / lockfile))
    git(root, "-c", f"user.name={GIT_NAME}", "-c", f"user.email={GIT_EMAIL}", "commit", "-q", "-m", title)
    # Der Namensraum gehoert diesem Job, und run_update hat offene PRs ausgeschlossen:
    # was hier schon liegt, stammt von einem geschlossenen PR desselben Tages.
    git(root, "push", "-q", "-u", "--force", "origin", branch)
    url = gh("pr", "create", "--repo", REPO, "--base", BASE_BRANCH, "--head", branch,
             "--title", title, "--body", pr_body(result, applied)).strip()
    print("opened", url)
    try:
        gh("pr", "merge", url, "--repo", REPO, "--squash", "--auto")
    except RuntimeError as exc:  # auto-enable-automerge.yml setzt das Flag ebenfalls
        print(f"auto-merge not set here: {exc}", file=sys.stderr)


def run_update(root, now, today, exclude, dry_run):
    manifests = read_manifests(root)
    names = {pkg for deps in manifests.values() for pkg, raw in deps.items() if parse_spec(raw)}
    result = scan(manifests, fetch_packuments(names - exclude), now, MIN_RELEASE_AGE, exclude)
    print(f"manifests={len(manifests)} packages={len(names)} workspaces_with_updates={len(result.updates)} "
          f"majors={len(result.majors)} held={len(result.held)} unparsed={len(result.unparsed)}")

    if dry_run:
        print(major_table(result.majors))
    else:
        report_majors(result.majors, today)
    if not result.updates:
        print(f"Daily Context7 check {today}: nothing to update")
        return 0

    open_prs = blocking_prs(json.loads(gh("pr", "list", "--repo", REPO, "--state", "open", "--limit", "100",
                                          "--json", "number,headRefName,createdAt,isDraft")))
    if open_prs:
        stuck = [pr["number"] for pr in open_prs if is_stale(pr, now)]
        print(f"open update PRs {[pr['number'] for pr in open_prs]}, stuck {stuck}", file=sys.stderr if stuck else sys.stdout)
        return 1 if stuck else 0

    applied = apply_updates(root, result.updates, refresh_lockfile)
    for path, ups in result.updates.items():
        state = "applied" if path in applied.applied else "skipped"
        for pkg, raw, new in ups:
            print(f"{state} {path}: {pkg} {raw} -> {new}")
    for path, reason in applied.failed:
        print(f"lockfile failed {path}: {reason}", file=sys.stderr)
    if applied.gated:
        print("release-age gate touched:", ", ".join(applied.gated))
    if applied.applied and not dry_run:
        publish(root, result, applied, today)
    return 1 if applied.failed else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="kein Commit, kein Push, keine GitHub-Schreibzugriffe")
    parser.add_argument("--exclude", action="append", default=[], metavar="PAKET", help="Paket ueberspringen")
    args = parser.parse_args(argv)
    with tempfile.TemporaryDirectory(prefix="context7-updater-") as tmp:
        root = Path(tmp) / "repo"
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--single-branch", "--branch", BASE_BRANCH,
                        CLONE_URL, str(root)], check=True, timeout=COMMAND_TIMEOUT)
        return run_update(root, datetime.now(timezone.utc), date.today().isoformat(),
                          frozenset(args.exclude), args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
