#!/usr/bin/env python3
"""scripts/vendor-sync.py — Extern bezogene Skills und Plugins aller Harnesses aktuell halten.

SSOT der Herkunft: docs/agent-guide/registry/vendor-lock.json
Runbook:           docs/runbooks/vendor-sync.md

Kommandos
  status   Gelockter Stand vs. neueste Upstream-Version je Eintrag (schreibt nichts).
  update   Hebt jeden Eintrag auf die neueste Release (bzw. Branch-HEAD) an.
           Vendor-Skills werden dateiweise 3-Wege-gemergt (Basis = gelockter Upstream-
           Commit, ours = Repo-Kopie, theirs = neuer Upstream) — lokale Anpassungen
           bleiben erhalten, echte Konflikte landen als Marker in der Datei und im Report.
  check    Integrationsvertrag (fail-closed, Exit 1 bei Befund):
             - jede `<plugin>:<skill>`-Referenz in unseren Flows existiert im gepinnten
               Plugin-Release (z. B. superpowers:writing-plans),
             - jeder Vendor-Skill hat SKILL.md, passenden `name:` und keine Konfliktmarker,
             - Lock und Inventar (skills.yaml, provenance: vendor) decken sich,
             - jeder Git-Pin steht in allen deklarierten Pin-Dateien.

Optionen
  --root DIR      Repo-Wurzel (Default: Elternverzeichnis dieses Skripts; Env VENDOR_SYNC_ROOT)
  --only ID       nur diesen Eintrag (mehrfach erlaubt)
  --report FILE   Maschinenlesbarer JSON-Report (update/status)
  --no-network    check: nur lokale Prüfungen (keine Plugin-Referenzauflösung)

Exit-Codes: 0 sauber, 1 Befund/Konflikt, 2 Nutzungs- oder Umgebungsfehler.
Cache der Upstream-Klone: ${VENDOR_SYNC_CACHE:-${XDG_CACHE_HOME:-~/.cache}/vendor-sync}
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

LOCK_REL = "docs/agent-guide/registry/vendor-lock.json"
INVENTORY_REL = "docs/agent-guide/registry/skills.yaml"
# Verzeichnisse, deren Referenzen historisch sind und nicht mehr aufgelöst werden müssen.
REF_EXCLUDES = (
    "openspec/changes/archive/",
    "docs/superpowers/plans/",
    "docs/superpowers/specs/",
    "CHANGELOG.md",
)
CONFLICT_RE = re.compile(r"^(<<<<<<< |>>>>>>> )", re.M)


def die(msg, code=2):
    print("vendor-sync: " + msg, file=sys.stderr)
    sys.exit(code)


def run(cmd, cwd=None, check=True, text=True, input=None):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=text, input=input)
    if check and p.returncode != 0:
        err = p.stderr if text else p.stderr.decode("utf-8", "replace")
        die("Befehl fehlgeschlagen: %s\n%s" % (" ".join(cmd), err.strip()))
    return p


# ── Upstream-Repos ───────────────────────────────────────────────────────────

def repo_url(spec):
    if re.match(r"^[\w.-]+/[\w.-]+$", spec):
        return "https://github.com/%s" % spec
    return spec


def cache_dir():
    base = os.environ.get("VENDOR_SYNC_CACHE")
    if not base:
        base = os.path.join(os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")), "vendor-sync")
    os.makedirs(base, exist_ok=True)
    return base


_fetched = {}


def upstream(spec):
    """Bare-Klon des Upstreams im Cache, einmal pro Lauf aktualisiert."""
    url = repo_url(spec)
    if url in _fetched:
        return _fetched[url]
    d = os.path.join(cache_dir(), hashlib.sha1(url.encode()).hexdigest()[:16])
    if not os.path.isdir(d):
        run(["git", "clone", "-q", "--bare", url, d])
    run(["git", "-C", d, "fetch", "-q", "--prune", "--tags", "--force", url,
         "+refs/heads/*:refs/heads/*"])
    _fetched[url] = d
    return d


def semver_key(v):
    m = re.match(r"^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$", v)
    if not m:
        return None
    return tuple(int(x or 0) for x in m.groups())


def resolve_latest(entry):
    """-> (sha, version|None). track=release: höchste stabile SemVer-Tag, sonst Branch."""
    d = upstream(entry["repo"])
    if entry.get("track", "release") == "release":
        prefix = entry.get("tag_prefix", "")
        best = None
        for tag in run(["git", "-C", d, "tag", "--list"]).stdout.split():
            if not tag.startswith(prefix):
                continue
            key = semver_key(tag[len(prefix):])
            if key is not None and (best is None or key > best[0]):
                best = (key, tag)
        if best:
            sha = run(["git", "-C", d, "rev-parse", best[1] + "^{commit}"]).stdout.strip()
            return sha, best[1]
    ref = entry.get("branch") or "HEAD"
    sha = run(["git", "-C", d, "rev-parse", ref + "^{commit}"]).stdout.strip()
    return sha, None


def tree_files(d, sha, path):
    """{relpfad: (mode, blob)} unterhalb von path im Commit sha."""
    out = run(["git", "-C", d, "ls-tree", "-r", "-z", sha, "--", path.rstrip("/") + "/"]).stdout
    files = {}
    for rec in out.split("\0"):
        if not rec:
            continue
        meta, p = rec.split("\t", 1)
        mode, typ, blob = meta.split()
        if typ == "blob":
            files[os.path.relpath(p, path)] = (mode, blob)
    return files


def blob(d, sha):
    return run(["git", "-C", d, "cat-file", "blob", sha], text=False).stdout


# ── 3-Wege-Merge eines Skill-Verzeichnisses ─────────────────────────────────

def is_binary(b):
    return b is not None and b"\0" in b[:8000]


def norm(b):
    return None if b is None or is_binary(b) else b.replace(b"\r\n", b"\n")


def read_local(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except (FileNotFoundError, IsADirectoryError, NotADirectoryError):
        return None


def merge_text(ours, base, theirs):
    """-> (merged_bytes, konflikt?)"""
    with tempfile.TemporaryDirectory() as t:
        paths = []
        for name, data in (("ours", ours), ("base", base or b""), ("theirs", theirs)):
            p = os.path.join(t, name)
            with open(p, "wb") as f:
                f.write(data)
            paths.append(p)
        p = subprocess.run(["git", "merge-file", "-p", "-L", "lokal", "-L", "basis", "-L", "upstream"] + paths,
                           capture_output=True)
        if p.returncode < 0 or p.returncode > 127:
            die("git merge-file fehlgeschlagen: " + p.stderr.decode("utf-8", "replace"))
        return p.stdout, p.returncode > 0


def merge_skill(root, sid, entry, new_sha):
    d = upstream(entry["repo"])
    dest = os.path.join(root, entry["dest"])
    base_files = tree_files(d, entry["ref"], entry["path"]) if entry.get("ref") else {}
    new_files = tree_files(d, new_sha, entry["path"])
    if not new_files:
        return {"id": sid, "status": "upstream-removed",
                "detail": "%s fehlt im Upstream-Stand %s" % (entry["path"], new_sha[:12])}

    local = set()
    for dp, _, fns in os.walk(dest):
        for fn in fns:
            local.add(os.path.relpath(os.path.join(dp, fn), dest))

    res = {"id": sid, "status": "updated", "added": [], "modified": [], "deleted": [],
           "conflicts": [], "kept_local": []}
    for rel in sorted(set(base_files) | set(new_files) | local):
        target = os.path.join(dest, rel)
        b_raw = blob(d, base_files[rel][1]) if rel in base_files else None
        t_raw = blob(d, new_files[rel][1]) if rel in new_files else None
        o_raw = read_local(target)
        b, t, o = norm(b_raw), norm(t_raw), norm(o_raw)
        binary = any(is_binary(x) for x in (b_raw, t_raw, o_raw))
        if binary:
            b, t, o = b_raw, t_raw, o_raw

        if t == b:                      # Upstream unverändert -> lokaler Stand gilt
            if o != b:
                res["kept_local"].append(rel)
            continue
        if o == b:                      # lokal unverändert -> Upstream übernehmen
            if t is None:
                os.remove(target)
                res["deleted"].append(rel)
            else:
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "wb") as f:
                    f.write(t)
                if new_files[rel][0] == "100755":
                    os.chmod(target, 0o755)
                res["added" if o is None else "modified"].append(rel)
            continue
        if o == t:                      # beide Seiten identisch geändert
            continue
        # beide Seiten verschieden geändert
        if binary or t is None or o is None:
            why = ("binär" if binary else "upstream gelöscht, lokal geändert" if t is None
                   else "lokal gelöscht, upstream geändert")
            res["conflicts"].append({"file": rel, "reason": why})
            continue
        merged, conflict = merge_text(o, b, t)
        with open(target, "wb") as f:
            f.write(merged)
        res["modified"].append(rel)
        if conflict:
            res["conflicts"].append({"file": rel, "reason": "Textkonflikt (Marker in Datei)"})

    res["frontmatter"] = frontmatter_changes(d, entry, new_sha)
    res["upstream_log"] = run(["git", "-C", d, "log", "--oneline", "--no-decorate", "-n", "40",
                               "%s..%s" % (entry["ref"], new_sha), "--", entry["path"]],
                              check=False).stdout.splitlines() if entry.get("ref") else []
    if res["conflicts"]:
        res["status"] = "conflict"
    return res


def parse_frontmatter(text):
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text or "", re.S)
    fm = {}
    if m:
        for line in m.group(1).splitlines():
            mm = re.match(r"^([\w-]+):\s*(.*)$", line)
            if mm:
                fm[mm.group(1)] = mm.group(2).strip().strip("'\"")
    return fm


def frontmatter_changes(d, entry, new_sha):
    def at(sha):
        if not sha:
            return {}
        p = run(["git", "-C", d, "show", "%s:%s/SKILL.md" % (sha, entry["path"].rstrip("/"))], check=False)
        return parse_frontmatter(p.stdout if p.returncode == 0 else "")
    old, new = at(entry.get("ref")), at(new_sha)
    return {k: {"from": old.get(k), "to": new.get(k)}
            for k in sorted(set(old) | set(new)) if old.get(k) != new.get(k)}


# ── Plugins ─────────────────────────────────────────────────────────────────

def update_npm(root, cfg, report, dry):
    manifest = os.path.join(root, cfg["manifest"])
    with open(manifest, encoding="utf-8") as f:
        pkg = json.load(f)
    deps = pkg.get("dependencies", {})
    changed = False
    for name, meta in cfg["packages"].items():
        cur = deps.get(name)
        item = {"id": name, "kind": "npm", "from": cur}
        if meta.get("track") == "pinned":
            item.update(status="pinned", reason=meta.get("reason", ""))
            report.append(item)
            continue
        p = run(["npm", "view", name, "version"], check=False)
        latest = p.stdout.strip()
        if p.returncode != 0 or not latest:
            item.update(status="error", detail=p.stderr.strip()[-300:])
            report.append(item)
            continue
        m = re.match(r"^([\^~]?)(\d[\w.\-+]*)$", cur or "")
        prefix, curv = (m.group(1), m.group(2)) if m else ("^", None)
        if curv == latest:
            item.update(status="current", to=cur)
        else:
            new = prefix + latest
            ck, lk = semver_key(curv or ""), semver_key(latest)
            item.update(status="available" if dry else "updated", to=new,
                        # SemVer: unter 0.x ist jede Minor-Stufe potenziell brechend
                        major=bool(ck and lk and (lk[0] != ck[0] or (ck[0] == 0 and lk[1] != ck[1]))))
            if not dry:
                deps[name] = new
                changed = True
        report.append(item)
    if changed:
        with open(manifest, "w", encoding="utf-8") as f:
            json.dump(pkg, f, indent=2)
            f.write("\n")
    return changed


def update_git_plugin(root, pid, entry, report, dry):
    sha, version = resolve_latest(entry)
    item = {"id": pid, "kind": "git", "from": entry.get("version") or entry["ref"][:12],
            "from_ref": entry["ref"], "to_ref": sha, "to": version or sha[:12]}
    if sha == entry["ref"]:
        item["status"] = "current"
        report.append(item)
        return False
    d = upstream(entry["repo"])
    sd = entry.get("skills_dir", "skills")
    old = set(os.path.dirname(p) for p in tree_files(d, entry["ref"], sd) if p.endswith("SKILL.md"))
    new = set(os.path.dirname(p) for p in tree_files(d, sha, sd) if p.endswith("SKILL.md"))
    item.update(skills_removed=sorted(old - new), skills_added=sorted(new - old),
                skills_changed=sorted(set(
                    p.split("/", 2)[1] for p in run(["git", "-C", d, "diff", "--name-only", entry["ref"], sha,
                                                     "--", sd]).stdout.split() if p.count("/") >= 2)),
                upstream_log=run(["git", "-C", d, "log", "--oneline", "--no-decorate", "-n", "40",
                                  "%s..%s" % (entry["ref"], sha)], check=False).stdout.splitlines())
    item["status"] = "available" if dry else "updated"
    if not dry:
        for rel in entry.get("pins", []):
            p = os.path.join(root, rel)
            if rel.endswith("package-lock.json"):
                # Nicht textuell ersetzen: version/integrity blieben sonst auf dem alten
                # Stand und `npm ci` bricht mit Integritätsfehler. Eintrag verwerfen,
                # der anschließende `npm install --package-lock-only` löst neu auf.
                with open(p, encoding="utf-8") as f:
                    lockdoc = json.load(f)
                pk = lockdoc.get("packages", {})
                for k in [k for k, v in pk.items() if entry["ref"] in str(v.get("resolved", ""))]:
                    del pk[k]
                with open(p, "w", encoding="utf-8") as f:
                    json.dump(lockdoc, f, indent=2)
                    f.write("\n")
                continue
            with open(p, encoding="utf-8") as f:
                txt = f.read()
            with open(p, "w", encoding="utf-8") as f:
                f.write(txt.replace(entry["ref"], sha))
        entry["ref"], entry["version"] = sha, version
    report.append(item)
    return not dry


# ── Kommandos ───────────────────────────────────────────────────────────────

def load_lock(root):
    p = os.path.join(root, LOCK_REL)
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        die("Lock fehlt: %s" % p)
    except ValueError as e:
        die("Lock unlesbar: %s (%s)" % (p, e))


def save_lock(root, lock):
    with open(os.path.join(root, LOCK_REL), "w", encoding="utf-8") as f:
        json.dump(lock, f, indent=2, ensure_ascii=False)
        f.write("\n")


def selected(ids, only):
    return [i for i in ids if not only or i in only]


def cmd_update(root, args, dry):
    lock = load_lock(root)
    report = {"skills": [], "plugins": []}
    for sid in selected(sorted(lock.get("skills", {})), args.only):
        entry = lock["skills"][sid]
        sha, version = resolve_latest(entry)
        if sha == entry.get("ref"):
            report["skills"].append({"id": sid, "status": "current", "version": version or sha[:12]})
            continue
        if dry:
            report["skills"].append({"id": sid, "status": "available", "from": entry.get("version") or
                                     (entry.get("ref") or "")[:12], "to": version or sha[:12]})
            continue
        res = merge_skill(root, sid, entry, sha)
        res.update({"from": entry.get("version") or (entry.get("ref") or "")[:12], "to": version or sha[:12]})
        if res["status"] != "upstream-removed":
            entry["ref"], entry["version"] = sha, version
        report["skills"].append(res)

    plugins = lock.get("plugins", {})
    for pid in selected(sorted(plugins.get("git", {})), args.only):
        update_git_plugin(root, pid, plugins["git"][pid], report["plugins"], dry)
    npm = plugins.get("npm")
    npm_changed = False
    if npm and (not args.only or set(args.only) & set(npm["packages"])):
        cfg = dict(npm)
        if args.only:
            cfg["packages"] = {k: v for k, v in npm["packages"].items() if k in args.only}
        npm_changed = update_npm(root, cfg, report["plugins"], dry)
    git_changed = any(p.get("kind") == "git" and p["status"] == "updated" for p in report["plugins"])
    if not dry and npm and (npm_changed or git_changed):
        mdir = os.path.dirname(os.path.join(root, npm["manifest"]))
        p = run(["npm", "install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
                cwd=mdir, check=False)
        report["lockfile"] = {"manifest": npm["manifest"], "ok": p.returncode == 0,
                              "detail": (p.stderr or "").strip()[-500:]}
    if not dry:
        save_lock(root, lock)

    if args.report:
        with open(args.report, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
            f.write("\n")
    print_summary(report)
    bad = [s for s in report["skills"] if s["status"] in ("conflict", "upstream-removed")]
    bad += [p for p in report["plugins"] if p["status"] == "error"]
    if report.get("lockfile") and not report["lockfile"]["ok"]:
        bad.append(report["lockfile"])
    return 1 if bad else 0


def print_summary(report):
    for s in report["skills"]:
        line = "skill  %-32s %-16s" % (s["id"], s["status"])
        if s.get("to") and s["status"] != "current":
            line += " %s -> %s" % (s.get("from"), s["to"])
        if s.get("conflicts"):
            line += "  KONFLIKTE: " + ", ".join(c["file"] for c in s["conflicts"])
        if s.get("detail"):
            line += "  " + s["detail"]
        print(line)
    for p in report["plugins"]:
        line = "plugin %-32s %-16s" % (p["id"], p["status"])
        if p["status"] in ("updated", "available"):
            line += " %s -> %s" % (p.get("from"), p.get("to"))
            if p.get("major"):
                line += "  (MAJOR)"
            if p.get("skills_removed"):
                line += "  ENTFERNTE SKILLS: " + ", ".join(p["skills_removed"])
        print(line)
    lf = report.get("lockfile")
    if lf:
        print("lockfile %s %s" % (lf["manifest"], "ok" if lf["ok"] else "FEHLER: " + lf["detail"]))


def inventory_vendor_ids(root):
    p = os.path.join(root, INVENTORY_REL)
    if not os.path.exists(p):
        return None
    ids, cur = [], None
    with open(p, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^  - id:\s*(\S+)", line)
            if m:
                cur = m.group(1)
            elif cur and re.match(r"^    provenance:\s*vendor\s*$", line):
                ids.append(cur)
    return ids


def tracked_files(root):
    p = run(["git", "-C", root, "ls-files", "-z"], check=False)
    if p.returncode != 0:          # kein Git-Repo (Fixture) -> Dateibaum
        out = []
        for dp, dns, fns in os.walk(root):
            dns[:] = [x for x in dns if x not in (".git", "node_modules")]
            out += [os.path.relpath(os.path.join(dp, fn), root) for fn in fns]
        return out
    return [x for x in p.stdout.split("\0") if x]


def cmd_check(root, args):
    lock = load_lock(root)
    findings = []

    for sid, e in sorted(lock.get("skills", {}).items()):
        dest = os.path.join(root, e["dest"])
        skill_md = os.path.join(dest, "SKILL.md")
        if not os.path.isfile(skill_md):
            findings.append("vendor-skill-missing: %s (%s/SKILL.md fehlt)" % (sid, e["dest"]))
            continue
        with open(skill_md, encoding="utf-8", errors="replace") as f:
            name = parse_frontmatter(f.read()).get("name")
        if name != sid:
            findings.append("vendor-skill-name-mismatch: %s (frontmatter name=%r)" % (sid, name))
        for dp, _, fns in os.walk(dest):
            for fn in fns:
                fp = os.path.join(dp, fn)
                data = read_local(fp)
                if data and not is_binary(data) and CONFLICT_RE.search(data.decode("utf-8", "replace")):
                    findings.append("unresolved-conflict: %s" % os.path.relpath(fp, root))

    inv = inventory_vendor_ids(root)
    if inv is not None:
        locked = set(lock.get("skills", {}))
        for sid in sorted(set(inv) - locked):
            findings.append("lock-missing: %s ist in %s als vendor geführt, aber nicht gelockt" % (sid, INVENTORY_REL))
        for sid in sorted(locked - set(inv)):
            findings.append("inventory-missing: %s ist gelockt, fehlt aber als vendor in %s" % (sid, INVENTORY_REL))

    files = None
    for pid, e in sorted(lock.get("plugins", {}).get("git", {}).items()):
        for rel in e.get("pins", []):
            txt = read_local(os.path.join(root, rel))
            if txt is None or e["ref"].encode() not in txt:
                findings.append("pin-drift: %s@%s steht nicht in %s" % (pid, e["ref"][:12], rel))
        pat = e.get("reference_pattern")
        if not pat or args.no_network:
            continue
        if files is None:
            files = [f for f in tracked_files(root) if not f.startswith(REF_EXCLUDES)]
        refs = {}
        rx = re.compile(pat)
        for rel in files:
            if os.path.islink(os.path.join(root, rel)):
                continue            # Symlink-Projektionen zeigen auf bereits gescannte Dateien
            data = read_local(os.path.join(root, rel))
            if not data or is_binary(data):
                continue
            for m in rx.finditer(data.decode("utf-8", "replace")):
                refs.setdefault(m.group(1), set()).add(rel)
        d = upstream(e["repo"])
        sd = e.get("skills_dir", "skills")
        avail = set(os.path.dirname(p) for p in tree_files(d, e["ref"], sd) if p.endswith("SKILL.md"))
        for skill in sorted(set(refs) - avail):
            findings.append("dangling-plugin-reference: %s:%s existiert nicht in %s@%s (referenziert in %s)"
                            % (pid, skill, pid, e.get("version") or e["ref"][:12],
                               ", ".join(sorted(refs[skill])[:5])))

    for f in findings:
        print(f)
    if findings:
        print("vendor-sync check: %d Befund(e)" % len(findings), file=sys.stderr)
        return 1
    print("vendor-sync check: sauber")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("command", choices=["status", "update", "check"])
    ap.add_argument("--root", default=os.environ.get("VENDOR_SYNC_ROOT") or
                    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--only", action="append")
    ap.add_argument("--report")
    ap.add_argument("--no-network", action="store_true")
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    if args.command == "check":
        sys.exit(cmd_check(root, args))
    sys.exit(cmd_update(root, args, dry=(args.command == "status")))


if __name__ == "__main__":
    main()
