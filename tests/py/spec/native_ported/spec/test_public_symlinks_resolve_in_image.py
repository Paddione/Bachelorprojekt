"""Native migration of tests/spec/public-symlinks-resolve-in-image.bats."""

import glob
import os
import re
import shutil
from pathlib import Path


def _escapes_root(target: str) -> bool:
    """Zeigt ein relativer Symlink-Pfad aus dem Teilbaum heraus (mehr '..' als Verzeichnisse)?"""
    if target.startswith("/"):
        return True
    up = dirs = 0
    for seg in target.split("/"):
        if seg == "..":
            up += 1
        elif seg != "":
            dirs += 1
    return up > dirs


def _simulate_public_copy(dest: Path, app: Path) -> None:
    """cp -r <app>/public/. <dest>/public/ (Symlinks bleiben Symlinks), Fehler ignoriert."""
    (dest / "public").mkdir(parents=True, exist_ok=True)
    try:
        shutil.copytree(app / "public", dest / "public", symlinks=True, dirs_exist_ok=True)
    except (shutil.Error, OSError):
        pass


def _cp_rl(src: Path, target: Path) -> None:
    """cp -rL src target (nach rm -rf target), Fehler ignoriert."""
    if target.is_symlink() or target.is_file():
        target.unlink()
    elif target.is_dir():
        shutil.rmtree(target)
    try:
        if src.is_dir():
            shutil.copytree(src, target, symlinks=False)
        else:
            shutil.copy2(src, target, follow_symlinks=True)
    except (shutil.Error, OSError):
        pass


def test_t002498_m4_public_symlinks_bleiben_im_docker_image_layout_aufloesbar(repo_root, tmp_path):
    # Apps unter */Dockerfile und components/*/Dockerfile mit public/-Verzeichnis.
    apps = []
    for pattern in ("*/Dockerfile", "components/*/Dockerfile"):
        for dockerfile in sorted(glob.glob(pattern, root_dir=str(repo_root))):
            df = repo_root / dockerfile
            if not df.is_file():
                continue
            app = str(Path(dockerfile).parent)
            if not (repo_root / app / "public").is_dir():
                continue
            apps.append(app)
    assert apps, "keine App mit Dockerfile+public/ gefunden"

    failures = 0
    for app in apps:
        dockerfile = repo_root / app / "Dockerfile"
        text = dockerfile.read_text(encoding="utf-8")
        # Baukontext: referenziert das Dockerfile `COPY <app>/`, baut es auf dem Repo-Root auf.
        context = app
        if re.search(rf"^COPY[ \t]+{re.escape(app)}/", text, re.MULTILINE):
            context = "."

        links = sorted(p for p in (repo_root / app / "public").rglob("*") if p.is_symlink())
        for link in links:
            link_str = str(link.relative_to(repo_root))
            target = os.readlink(link)
            if not _escapes_root(target):
                continue

            # Positiv-Anker (T002356-M1): im Checkout muessen die Symlinks aufloesen.
            if not link.exists():
                print(f"Vorbedingung verletzt: {link_str} loest im Checkout nicht auf")
                failures += 1
                continue

            stage = tmp_path / f"{app}-app"
            stage.mkdir(parents=True, exist_ok=True)
            _simulate_public_copy(stage, repo_root / app)

            # COPY-Zeilen (ohne --from) nachfahren; Format: COPY <src> <dest>.
            for line in text.splitlines():
                if not re.match(r"^COPY[ \t]", line):
                    continue
                if re.match(r"^COPY[ \t]--from=", line):
                    continue
                words = line.split()
                if len(words) < 3:
                    continue
                src, dest = words[1], words[2]
                if not src or not dest:
                    continue
                src_path = repo_root / src if context == "." else repo_root / context / src
                if not src_path.exists():
                    continue
                if dest in (".", "./"):
                    continue
                rel = dest[2:] if dest.startswith("./") else dest
                target_path = stage / rel.lstrip("/")
                target_path.parent.mkdir(parents=True, exist_ok=True)
                _cp_rl(src_path, target_path)

            # Die eigentliche Aussage: nach der COPY-Simulation aufloesbar.
            link_rel = link_str[len(app) + 1:]
            if not (stage / link_rel).exists():
                print(f"FAIL: {link_str} ({app}) zeigt auf {target} — im Image-Layout NICHT aufloesbar "
                      f"(kopierter Teilbaum: {context})")
                failures += 1

    assert failures == 0, f"{failures} nicht aufloesbare public/-Symlinks"
