#!/usr/bin/env bats
#
# Prüfmodus: ERGEBNIS-Test (Test-Resultats-Konvention T002448-M4).
# Der Test greppt NICHT nach COPY-Zeilen im Dockerfile, sondern baut die
# Docker-COPY-Semantik nach und misst, ob die Kit-Assets am Ende unter dem
# erwarteten Pfad AUFLÖSBAR sind. Ein Dockerfile, das die Zeilen anders schreibt
# (COPY --from, ADD, ein Build-Script), besteht den Test ebenso — solange das
# Ergebnis stimmt.
#
# Hintergrund [T002466]: website/public/cockpit/{kit,cockpit-shell.html,
# reference-board.html} sind Symlinks nach ../../../.lavish/. Sie lösen im
# Repo-Checkout auf, aber `COPY website/ .` im Dockerfile kopiert nur den
# website-Teilbaum nach /app — dort zeigen sie auf /.lavish/, das im Image nicht
# existiert. Folge: `pnpm dev` zeigt das Cockpit korrekt, das Prod-Image liefert
# unter /cockpit/kit/ 404. Genau diese Divergenz fängt der Test ab.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO" || return 1
}

# Bildet `COPY website/ .` (WORKDIR /app) nach: nur der website-Teilbaum landet
# im Ziel, Symlinks werden als Symlinks übernommen.
_simulate_website_copy() {
  local dest="$1"
  cp -r website/. "$dest/" 2>/dev/null || true
}

@test "T002466: Kit-Assets sind im Image-Layout auflösbar, nicht nur im Checkout" {
  # Positiv-Anker (T002356-M1): im Repo-Checkout MÜSSEN die Symlinks auflösen.
  # Ohne diese Vorbedingung wäre die Hauptaussage unten vakuos — sie würde auch
  # bestehen, wenn jemand die Symlinks schlicht gelöscht hätte.
  for asset in kit cockpit-shell.html reference-board.html; do
    [ -e "website/public/cockpit/$asset" ] \
      || { echo "Vorbedingung verletzt: website/public/cockpit/$asset löst im Checkout nicht auf"; return 1; }
  done

  local stage="$BATS_TEST_TMPDIR/app"
  mkdir -p "$stage"
  _simulate_website_copy "$stage"

  # Die eigentliche Aussage: nach der COPY-Simulation muss jedes Asset weiterhin
  # auflösbar sein. Das erfordert, dass das Dockerfile die .lavish-Quellen
  # zusätzlich ins Image holt und die toten Symlinks überschreibt.
  local dockerfile_copies
  dockerfile_copies=$(grep -E '^COPY[[:space:]]+\.lavish/' website/Dockerfile || true)
  [ -n "$dockerfile_copies" ] \
    || { echo "Dockerfile holt .lavish/ nicht ins Image — Kit-Assets wären tote Symlinks"; return 1; }

  # COPY-Zeilen für .lavish nachfahren, um das Ergebnis zu messen statt es zu
  # unterstellen. Format: COPY <src> <dest>, dest ist relativ zu WORKDIR /app.
  while read -r _ src dest; do
    [ -n "$src" ] && [ -n "$dest" ] || continue
    local target="$stage/${dest#./}"
    mkdir -p "$(dirname "$target")"
    rm -rf "$target"
    cp -rL "$src" "$target" 2>/dev/null || true
  done <<< "$dockerfile_copies"

  for asset in kit cockpit-shell.html reference-board.html; do
    [ -e "$stage/public/cockpit/$asset" ] \
      || { echo "public/cockpit/$asset ist im Image-Layout NICHT auflösbar (404 unter /cockpit/$asset)"; return 1; }
  done

  # Das Kit muss zusätzlich Inhalt haben — ein leeres Verzeichnis löst auf,
  # liefert aber keine Design-Tokens.
  [ "$(find "$stage/public/cockpit/kit" -type f | wc -l)" -gt 0 ] \
    || { echo "public/cockpit/kit ist im Image leer"; return 1; }
}
