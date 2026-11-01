#!/usr/bin/env python3
"""scripts/version_watchdog.py — eigener Versions-Watchdog (Issue statt Renovate).

Laeuft modellfrei ueber den User-Timer version-watchdog.timer (taeglich 06:30,
dotfiles, ~/.config/systemd/user). Ersetzt Renovate: scannt Images
(k3d/prod*/dev-local), GitHub-Actions (inkl. Digest-Pins) und npm-Pakete
(read-only, c7-Logik, keine Anwendung) und pflegt genau ein fortlaufendes
Issue. Das Issue ist die Handoff-Stelle Richtung /setgoal.

Ablauf: liest origin/main (fetch, keine Arbeitskopie-Aenderung), fragt
Registries/APIs, schreibt das Issue via Host-gh. Dry-Run schreibt nichts.

Regeln, die hier stehen, weil sie nicht aus dem Code folgen:
- Release-Age: nur Releases ab 3 Tagen Alter werden als Update gelistet
  (Analogie zur bewaehrten Renovate-/c7-Regel). Ohne bekanntes Alter wird
  der Kandidat mit Alter "?" gelistet statt verworfen — ein Watchdog, der
  schweigt, ist nutzlos; die Einschaetzung bleibt beim Leser.
- 0.x: dort darf ein Minor brechen, deshalb zaehlt es als Major-Hinweis
  (Analogie zu c7, nur gemeldet).
- Pin-Politik: SHA-gepinnte Actions werden nicht verglichen (Pin bleibt),
  nur gemeldet, wenn das Tag weiter ist — die Entscheidung faellt im Goal.
- Exit 1 ist das Alarmsignal (Analogie zu c7): harte Fehler statt stillem Gruen.

Usage: version_watchdog.py [--dry-run] [--repo PFAD]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import context7_updater as c7  # noqa: E402  (Geschwister-Modul, Timer + pytest)

REPO = "Paddione/Bachelorprojekt"
BASE_BRANCH = "main"
ISSUE_TITLE = "Version-Watchdog: fällige Updates"
ISSUE_LABEL = "dependencies"
ISSUE_MARKER = "<!-- version-watchdog -->"
MIN_RELEASE_AGE = timedelta(days=3)
COMMAND_TIMEOUT = 600

IMAGE_TREES = ("k3d", "prod", "prod-mentolder", "prod-korczewski", "prod-fleet", "dev-local")
IMAGE_RE = re.compile(r"^\s*(?:-\s*)?image:\s*['\"]?(\S+?)['\"]?\s*(?:#.*)?$")
USES_RE = re.compile(r"^\s*-\s*uses:\s*([^\s#]+)")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
TAG_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def parse_image_ref(ref):
    """registry, repo, tag|None, digest|None (Docker-Hub-Kurzform inklusive)."""
    digest = None
    if "@" in ref:
        ref, digest = ref.split("@", 1)
    if "/" not in ref or ("/" in ref and "." not in ref.split("/")[0] and ":" not in ref.split("/")[0]
                          and ref.split("/")[0] != "localhost"):
        registry, repo = "docker.io", ref
    else:
        first, rest = ref.split("/", 1)
        registry, repo = first, rest
    if registry == "docker.io" and "/" not in repo:
        repo = "library/" + repo
    tag = None
    if ":" in repo:
        repo, tag = repo.rsplit(":", 1)
    return registry, repo, tag, digest


def parse_action_ref(uses):
    """(owner/repo, ref, sha_gepinnt). Lokale Actions (./...) -> None."""
    if uses.startswith("./"):
        return None
    repo, _, ref = uses.partition("@")
    return repo, ref, bool(SHA_RE.match(ref))


def parse_tag_version(tag):
    match = TAG_RE.match(tag or "")
    return tuple(int(part) for part in match.groups()) if match else None


def select_candidate(current, candidates, now, min_age):
    """Waehlt unter (tag, published|None): (update|held|none, version, age_days|None).

    Ohne Datum kein Zurueckhalten: neuer Tag ohne bekanntes Alter wird als
    Update mit unbekanntem Alter gemeldet (Anzeige "?"), nie verworfen.
    """
    best = None
    for tag, published in candidates:
        version = parse_tag_version(tag)
        if version is None or version <= current:
            continue
        age = (now - published).days if published else None
        kind = "update" if published is None or now - published >= min_age else "held"
        if best is None or (kind == "update" and best[0] != "update") or \
                (kind == best[0] and version > best[1]):
            best = (kind, version, age)
    if best is None:
        return "none", None, None
    return best


def render_issue_body(sections, held, unknown, today, run_url, skipped=0):
    rows = [ISSUE_MARKER, f"# {ISSUE_TITLE}", "",
            f"Stand {today}, nur Bericht, kein Code geaendert. Lauf: {run_url}", ""]
    rows += ["## Images", "",
             "| Manifest | Aktuell | Neu | Alter (Tage) |", "|---|---|---|---|"]
    for path, current, new, age in sections["images"]:
        rows.append(f"| {path} | {current} | {new} | {age} |")
    rows += ["", "## GitHub Actions", "",
             "| Workflow | Action | Aktuell | Neu | Alter (Tage) |", "|---|---|---|---|---|"]
    for path, repo, current, new, age in sections["actions"]:
        rows.append(f"| {path} | {repo} | {current} | {new} | {age} |")
    rows += ["", "## npm", "",
             "| Workspace | Package | Von | Auf |", "|---|---|---|---|"]
    for path, pkg, raw, new in sections["npm"]:
        rows.append(f"| {path} | {pkg} | {raw} | {new} |")
    if held:
        rows += ["", "Noch zu jung (< 3 Tage): " + ", ".join(f"{name}@{version}" for name, version in held) + "."]
    if skipped:
        rows += ["", f"Uebersprungen (Env-Platzhalter, nicht aufloesbar): {skipped}."]
    if unknown:
        rows += ["", "Nicht automatisch bewertbar:"]
        rows += [f"- {name}: {reason}" for name, reason in unknown]
    rows += ["", "---",
             "_Erzeugt von `scripts/version_watchdog.py` (Timer `version-watchdog`). "
             "Handoff: Befund per `/setgoal` ins naechste Goal._"]
    return "\n".join(rows)


def gh(*args):
    result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=COMMAND_TIMEOUT)
    if result.returncode:
        raise RuntimeError(f"gh {' '.join(args[:2])}: {result.stderr.strip()}")
    return result.stdout


def http_json(url, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def origin_files(repo_root):
    subprocess.run(["git", "fetch", "-q", "origin", BASE_BRANCH], cwd=repo_root,
                   check=True, timeout=COMMAND_TIMEOUT)
    out = subprocess.run(["git", "ls-tree", "-r", f"origin/{BASE_BRANCH}", "--name-only"],
                         cwd=repo_root, check=True, capture_output=True, text=True,
                         timeout=COMMAND_TIMEOUT).stdout
    return out.splitlines()


def blob(repo_root, path):
    out = subprocess.run(["git", "show", f"origin/{BASE_BRANCH}:{path}"],
                         cwd=repo_root, check=True, capture_output=True, text=True,
                         timeout=COMMAND_TIMEOUT).stdout
    return out


def scan_images(repo_root, files):
    found = {}
    for path in files:
        if not path.endswith(".yaml") or not path.split("/")[0] in IMAGE_TREES:
            continue
        for line in blob(repo_root, path).splitlines():
            match = IMAGE_RE.match(line)
            if match:
                found.setdefault(path, set()).add(match.group(1))
    return {path: sorted(refs) for path, refs in found.items()}


def docker_hub_tags(repo):
    data = http_json(f"https://registry.hub.docker.com/v2/repositories/{repo}/tags?page_size=100")
    if not data:
        return []
    return [(row["name"], c7.parse_time(row["last_updated"])) for row in data.get("results", [])
            if row.get("last_updated")]


def ghcr_tags(repo):
    """user- oder org-Pakete via Host-gh; leere Liste, wenn nicht abfragbar."""
    parts = repo.split("/", 1)
    scope = f"users/{parts[0]}" if len(parts) == 2 else "users/paddione"
    try:
        versions = json.loads(gh("api", f"{scope}/packages?package_type=container&per_page=100"))
    except RuntimeError:
        return None
    match = next((v for v in versions if (v.get("name") or "").endswith("/" + parts[-1])
                  or v.get("name") == parts[-1]), None)
    if not match:
        return []
    tags = []
    for version in (match.get("metadata", {}).get("container", {}).get("tags", []) or []):
        tags.append((version, None))
    return tags


def fetch_image_candidates(registry, repo):
    if registry == "docker.io":
        return docker_hub_tags(repo)
    if registry == "ghcr.io":
        return ghcr_tags(repo)
    return []


def scan_actions(repo_root, files):
    found = {}
    for path in files:
        if not path.startswith(".github/workflows/") or not path.endswith(".yml"):
            continue
        for line in blob(repo_root, path).splitlines():
            match = USES_RE.match(line)
            if match:
                parsed = parse_action_ref(match.group(1))
                if parsed:
                    found.setdefault(path, []).append(parsed)
    return found


def action_tags(repo):
    """(tag, published|None) aus Releases (mit Datum) plus Tags (ohne Datum)."""
    out = []
    seen = set()
    try:
        releases = json.loads(gh("api", f"repos/{repo}/releases?per_page=30"))
    except RuntimeError:
        releases = []
    for rel in releases or []:
        tag, published = rel.get("tag_name"), rel.get("published_at")
        if tag and tag not in seen:
            seen.add(tag)
            out.append((tag, c7.parse_time(published) if published else None))
    try:
        refs = json.loads(gh("api", f"repos/{repo}/git/matching-refs/tags?per_page=100"))
    except RuntimeError:
        refs = []
    for ref in refs or []:
        tag = ref.get("ref", "").removeprefix("refs/tags/")
        if tag and tag not in seen:
            seen.add(tag)
            out.append((tag, None))
    return out


def display(version, age):
    text = ".".join(map(str, version)) if version else "?"
    return text if age is None else f"{text} ({age}d)"


def collect_updates(repo_root, now, min_age):
    files = origin_files(repo_root)
    images, actions = {"images": [], "actions": [], "npm": []}, []
    held, unknown, seen_unknown, skipped = [], [], set(), 0
    seen_updates = set()

    def note_unknown(name, reason):
        if name not in seen_unknown:
            seen_unknown.add(name)
            unknown.append((name, reason))
    for path, refs in sorted(scan_images(repo_root, files).items()):
        for ref in refs:
            if "$" in ref:
                skipped += 1
                continue
            registry, repo, tag, digest = parse_image_ref(ref)
            current = c7.parse_stable((tag or "").lstrip("v")) if tag else None
            if current is None:
                if digest:
                    note_unknown(ref, "nur Digest, kein Tag verfolgbar")
                else:
                    note_unknown(ref, "Tag nicht vergleichbar (z. B. latest)")
                continue
            candidates = fetch_image_candidates(registry, repo)
            if not candidates:
                if registry in ("docker.io", "ghcr.io"):
                    note_unknown(ref, "keine Registry-Daten")
                else:
                    note_unknown(f"{registry}/{repo}", "Registry ohne Abfrage")
                continue
            kind, version, age = select_candidate(current, candidates, now, min_age)
            new = display(version, age) + (" + Repin" if digest else "")
            if kind == "update":
                key = (path, ref)
                if key not in seen_updates:
                    seen_updates.add(key)
                    images["images"].append((path, ref, new, age if age is not None else "?"))
            elif kind == "held":
                held.append((ref, display(version, age)))
    for path, uses in sorted(scan_actions(repo_root, files).items()):
        for repo, ref, pinned in uses:
            if pinned:
                continue
            current = c7.parse_stable(ref.lstrip("v"))
            if current is None:
                note_unknown(f"{repo}@{ref}", "Major-Tag, folgt Upstream-Major")
                continue
            kind, version, age = select_candidate(current, action_tags(repo), now, min_age)
            if kind == "update":
                key = (path, repo)
                if key not in seen_updates:
                    seen_updates.add(key)
                    actions.append((path, repo, ref, display(version, age), age if age is not None else "?"))
            elif kind == "held":
                held.append((f"{repo}@{ref}", display(version, age)))
    manifests = {}
    for path in files:
        if c7.MANIFEST_RE.match(path):
            try:
                manifests[path] = json.loads(blob(repo_root, path)).get("dependencies", {})
            except (json.JSONDecodeError, subprocess.CalledProcessError):
                pass
    names = {pkg for deps in manifests.values() for pkg, raw in deps.items() if c7.parse_spec(raw)}
    docs = c7.fetch_packuments(names)
    result = c7.scan(manifests, docs, now, min_age, frozenset())
    for path, ups in sorted(result.updates.items()):
        for pkg, raw, new in ups:
            images["npm"].append((path.removesuffix("/package.json"), pkg, raw, new))
    for path, pkg, raw, gap in result.majors:
        images["npm"].append((path.removesuffix("/package.json"), pkg, raw, gap + " (major)"))
    for pkg, version in result.held:
        held.append((pkg, version))
    print(f"refs_uebersprungen_platzhalter={skipped}")
    return images, actions, held, unknown, skipped


def publish_issue(body, dry_run):
    issues = json.loads(gh("issue", "list", "--repo", REPO, "--state", "open", "--limit", "100",
                           "--json", "number,title"))
    match = next((i for i in issues if i["title"] == ISSUE_TITLE), None)
    if dry_run:
        print(body)
        print("dry-run: kein Issue geschrieben")
        return
    if match:
        gh("issue", "edit", str(match["number"]), "--repo", REPO, "--body", body)
        print(f"issue aktualisiert: {match['number']}")
        return
    out = gh("issue", "create", "--repo", REPO, "--title", ISSUE_TITLE, "--label", ISSUE_LABEL,
             "--body", body)
    print("issue angelegt:", out.strip())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="kein Issue-Schreibzugriff")
    parser.add_argument("--repo", default=str(Path.home() / "Bachelorprojekt"),
                        help="lokaler Checkout (wird nur gelesen + gefetcht)")
    args = parser.parse_args(argv)
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    repo_root = Path(args.repo)
    images, actions, held, unknown, skipped = collect_updates(repo_root, now, MIN_RELEASE_AGE)
    total = len(images["images"]) + len(actions) + len(images["npm"])
    print(f"images={len(images['images'])} actions={len(actions)} npm={len(images['npm'])} "
          f"held={len(held)} unknown={len(unknown)} skipped={skipped}")
    run_url = "manueller Dry-Run" if args.dry_run else "systemd-Timer version-watchdog"
    body = render_issue_body({"images": images["images"], "actions": actions, "npm": images["npm"]},
                             held, unknown, today, run_url, skipped)
    if total == 0 and not held and not unknown:
        print(f"Version-Watchdog {today}: nichts faellig")
        return 0
    publish_issue(body, args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
