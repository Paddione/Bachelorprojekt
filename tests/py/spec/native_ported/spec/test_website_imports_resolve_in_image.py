"""Website-Imports loesen im Image-Layout auf, nicht nur im Checkout."""
# (#6965)
# Ergebnis-Test: `COPY components/website/ .` kopiert nur den website-Teilbaum
# nach /app; jeder relative Import, der per '..' aus dem Teilbaum herausklettert
# (POSIX klemmt an der Root), muss durch eine explizite Dockerfile-COPY-Zeile
# abgedeckt sein — sonst UNRESOLVED_IMPORT im Image-Build bei gruenen
# Checkout-Tests. Gemessen wird gegen das nachgebaute Image-Layout unter tmp_path.

import re
from pathlib import Path, PurePosixPath

WEBSITE = Path("components/website")
SRC = WEBSITE / "src"
DOCKERFILE = WEBSITE / "Dockerfile"

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


def _staged_paths(repo_root: Path):
    """Alle im Image vorhandenen Pfade (image-absolut, als '/...'-Strings)."""
    dockerfile = repo_root / DOCKERFILE
    staged = set()
    for srcs, dest in _copy_pairs(dockerfile.read_text(encoding="utf-8")):
        multi = len(srcs) > 1 or dest.endswith("/")
        for src in srcs:
            src_path = repo_root / src
            assert src_path.exists(), f"COPY-Quelle fehlt im Repo: {src}"
            if dest in (".", "./"):
                base = "/app"
            elif dest.startswith("/"):
                base = dest
            else:
                base = "/app/" + dest
            if src_path.is_dir():
                for f in src_path.rglob("*"):
                    if f.is_file():
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

    # POSITIV-ANKER: die dichte SSOT-Datei wird explizit ins Image geholt.
    copy_srcs = [src for srcs, _ in _copy_pairs(dockerfile.read_text(encoding="utf-8")) for src in srcs]
    assert "scripts/lib/dense-embedding.mjs" in copy_srcs, (
        "Dockerfile holt scripts/lib/dense-embedding.mjs nicht ins Image — "
        "Website-Imports darauf waeren UNRESOLVED_IMPORT (#6965)"
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
