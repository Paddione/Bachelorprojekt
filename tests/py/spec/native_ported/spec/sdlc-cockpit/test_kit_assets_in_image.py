"""Native migration of tests/spec/sdlc-cockpit/kit-assets-in-image.bats."""
# (T002466, T002499)
# Ergebnis-Test: die Docker-COPY-Semantik wird nachgebildet (public/ plus die .lavish-COPY-Zeilen
# aus dem Dockerfile, Symlinks dereferenziert), gemessen wird die Aufloesbarkeit der Kit-Assets.
# Staging happens under tmp_path only.

import shutil
from pathlib import Path

ASSETS = ["kit", "cockpit-shell.html", "reference-board.html"]


def _copy_dereferenced(src: Path, target: Path) -> None:
    """Entspricht `rm -rf target; cp -rL src target` (Fehler werden verschluckt wie im Original)."""
    if target.is_symlink() or target.is_file():
        target.unlink()
    elif target.is_dir():
        shutil.rmtree(target)
    try:
        if src.is_dir():
            shutil.copytree(src, target, symlinks=False)
        else:
            shutil.copy2(src, target, follow_symlinks=True)
    except (OSError, shutil.Error):
        pass


def test_t002466_kit_assets_sind_im_image_layout_aufloesbar_nicht_nur_im_checkout(repo_root, tmp_path):
    # POSITIV-ANKER: im Repo-Checkout loesen die Symlinks auf.
    for asset in ASSETS:
        assert (repo_root / "components/website/public/cockpit" / asset).exists(), (
            f"Vorbedingung verletzt: components/website/public/cockpit/{asset} loest im Checkout nicht auf"
        )

    stage = tmp_path / "app"
    stage.mkdir()

    # Simulation von `COPY components/website/ .` — nur public/ (T002499, siehe Original).
    (stage / "public").mkdir(parents=True)
    src_public = repo_root / "components/website/public"
    for item in src_public.iterdir():
        dest = stage / "public" / item.name
        if item.is_symlink():
            dest.symlink_to(item.readlink())
        elif item.is_dir():
            shutil.copytree(item, dest, symlinks=True)
        else:
            shutil.copy2(item, dest)

    # Die .lavish-COPY-Zeilen aus dem Dockerfile.
    dockerfile = repo_root / "components/website/Dockerfile"
    copy_lines = [line for line in dockerfile.read_text(encoding="utf-8").splitlines()
                  if line.startswith("COPY") and line.split(maxsplit=1)[1:] and
                  line.split()[1].startswith(".lavish/")]
    assert copy_lines, "Dockerfile holt .lavish/ nicht ins Image — Kit-Assets waeren tote Symlinks"

    for line in copy_lines:
        parts = line.split()
        if len(parts) < 3:
            continue
        src_rel, dest_rel = parts[1], parts[2]
        target = stage / dest_rel.removeprefix("./")
        target.parent.mkdir(parents=True, exist_ok=True)
        _copy_dereferenced(repo_root / src_rel, target)

    for asset in ASSETS:
        assert (stage / "public/cockpit" / asset).exists(), (
            f"public/cockpit/{asset} ist im Image-Layout NICHT aufloesbar (404 unter /cockpit/{asset})"
        )

    kit_files = [p for p in (stage / "public/cockpit/kit").rglob("*") if p.is_file()]
    assert kit_files, "public/cockpit/kit ist im Image leer"
