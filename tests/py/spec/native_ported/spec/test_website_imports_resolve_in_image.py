"""Website-Imports loesen im Image-Layout auf, nicht nur im Checkout."""
# (#6965)
# Ergebnis-Test: `COPY components/website/ .` kopiert nur den website-Teilbaum
# nach /app; jeder relative Import, der per '..' aus dem Teilbaum herausklettert
# (POSIX klemmt an der Root), muss durch eine explizite Dockerfile-COPY-Zeile
# abgedeckt sein — sonst UNRESOLVED_IMPORT im Image-Build bei gruenen
# Checkout-Tests. Gemessen wird gegen das nachgebaute Image-Layout unter tmp_path.

import fnmatch
import re
from pathlib import Path, PurePosixPath

WEBSITE = Path("components/website")
SRC = WEBSITE / "src"
DOCKERFILE = WEBSITE / "Dockerfile"
DOCKERIGNORE = Path(".dockerignore")

_IMPORT_RE = re.compile(r"""(?:from\s+|import\s*\()\s*['"](\.[^'"]+)['"]""")
_EXTS = (".ts", ".tsx", ".mts", ".mjs", ".js", ".json", ".css", ".astro")


def _resolve_image_stack(importer_rel: PurePosixPath, spec: str):
    """Import-Specifier in Image-Koordinaten aufloesen. /app = website-Teilbaum,
    '..' ueber /app hinaus klettert Richtung / und klemmt an der Root."""
    stack = ["app", *importer_rel.parent.parts]
    for seg in PurePosixPath(spec).parts:
        if seg == "..":
            if stack:
                stack.pop()
        elif seg not in (".", ""):
            stack.append(seg)
    return stack


def _copy_pairs(dockerfile_text: str):
    """Explizite COPY-Zeilen als (srcs, dest); --from-Stages und Flags ignoriert."""
    pairs = []
    for line in dockerfile_text.splitlines():
        line = line.strip()
        if not line.startswith("COPY "):
            continue
        if "--from=" in line or "--from " in line:
            continue  # Multi-Stage-COPY aus anderem Image, kein Repo-Kontext
        tokens = [t for t in line.split()[1:] if not t.startswith("--")]
        pairs.append((tokens[:-1], tokens[-1]))
    return pairs


def _dockerignore_rules(repo_root: Path):
    """Root-.dockerignore als (negiert, pattern)-Liste. Vereinfachte
    Docker-Semantik: letzter Treffer gewinnt; Verzeichnis-Pattern deckt
    Kinder ab; '*' per fnmatch (deckt auch '/' ab wie mobys patternmatcher)."""
    rules = []
    ignore_file = repo_root / DOCKERIGNORE
    if not ignore_file.is_file():
        return rules
    for line in ignore_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        negated = line.startswith("!")
        pattern = line[1:] if negated else line
        pattern = pattern.lstrip("/")
        rules.append((negated, pattern))
    return rules


def _is_ignored(rel_posix: str, rules):
    """True wenn der Pfad nach letzter-Treffer-Regel aus dem Kontext faellt."""
    ignored = False
    for negated, pattern in rules:
        if (rel_posix == pattern or rel_posix.startswith(pattern.rstrip("/") + "/")
                or fnmatch.fnmatchcase(rel_posix, pattern)):
            ignored = not negated
    return ignored


def _staged_paths(repo_root: Path):
    """Alle im Image vorhandenen Pfade (image-absolut, als '/...'-Strings)."""
    dockerfile = repo_root / DOCKERFILE
    rules = _dockerignore_rules(repo_root)
    staged = set()
    for srcs, dest in _copy_pairs(dockerfile.read_text(encoding="utf-8")):
        multi = len(srcs) > 1 or dest.endswith("/")
        for src in srcs:
            src_path = repo_root / src
            assert src_path.exists(), f"COPY-Quelle fehlt im Repo: {src}"
            # COPY-Quelle muss den Build-Kontext ueberleben (.dockerignore).
            assert not _is_ignored(src.rstrip("/"), rules), (
                f"COPY-Quelle '{src}' wird von {DOCKERIGNORE} aus dem Build-Kontext "
                f"entfernt — COPY liefe ins Leere (#6965)"
            )
            if dest in (".", "./"):
                base = "/app"
            elif dest.startswith("/"):
                base = dest
            else:
                base = "/app/" + dest
            if src_path.is_dir():
                for f in src_path.rglob("*"):
                    if f.is_file() and not _is_ignored(f.relative_to(repo_root).as_posix(), rules):
                        staged.add(base.rstrip("/") + "/" + f.relative_to(src_path).as_posix())
            elif multi:
                staged.add(base.rstrip("/") + "/" + src_path.name)
            else:
                staged.add(base)
    return staged


def _exists_in_image(staged: set, stack):
    """Exakte Datei oder TS-Index-Variante vorhanden?"""
    cands = ["/" + "/".join(stack)]
    cands += ["/" + "/".join(stack) + ext for ext in _EXTS]
    cands += ["/" + "/".join(stack) + "/index" + ext for ext in _EXTS]
    return any(c in staged for c in cands)


def test_website_imports_loesen_im_image_layout_auf(repo_root):
    dockerfile = repo_root / DOCKERFILE
    assert dockerfile.is_file(), "Vorbedingung verletzt: components/website/Dockerfile fehlt"

    # POSITIV-ANKER: die dichte SSOT-Datei wird explizit ins Image geholt
    # UND ueberlebt .dockerignore (zweite Haelfte von #6965).
    copy_srcs = [src for srcs, _ in _copy_pairs(dockerfile.read_text(encoding="utf-8")) for src in srcs]
    assert "scripts/lib/dense-embedding.mjs" in copy_srcs, (
        "Dockerfile holt scripts/lib/dense-embedding.mjs nicht ins Image — "
        "Website-Imports darauf waeren UNRESOLVED_IMPORT (#6965)"
    )
    rules = _dockerignore_rules(repo_root)
    assert not _is_ignored("scripts/lib/dense-embedding.mjs", rules), (
        f"{DOCKERIGNORE} entfernt scripts/lib/dense-embedding.mjs aus dem Build-Kontext — "
        "COPY liefe ins Leere (#6965)"
    )

    staged = _staged_paths(repo_root)
    offenders = []
    checked = 0
    for f in sorted((repo_root / SRC).rglob("*")):
        if not f.is_file() or f.suffix not in (".ts", ".tsx", ".mts", ".mjs", ".astro"):
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        importer_rel = PurePosixPath(f.relative_to(repo_root / WEBSITE).as_posix())
        for spec in sorted(set(_IMPORT_RE.findall(text))):
            stack = _resolve_image_stack(importer_rel, spec)
            if stack[0] == "app":
                continue  # im Teilbaum: durch `COPY components/website/ .` vorhanden
            checked += 1
            if not _exists_in_image(staged, stack):
                offenders.append(f"{f.relative_to(repo_root)}: {spec} -> /{'/'.join(stack)}")
    assert checked > 0, "Kein teilbaumescape-Import gefunden — Test waere taub"
    assert not offenders, (
        "Relative Imports entkommen dem website-Teilbaum ohne Dockerfile-COPY:\n" + "\n".join(offenders)
    )
