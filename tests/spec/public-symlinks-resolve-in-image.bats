#!/usr/bin/env bats
#
# Prüfmodus: ERGEBNIS-Test (Test-Resultats-Konvention T002448-M4).
#
# Hintergrund [T002498-M4] (Verallgemeinerung von T002466): Jeder Symlink unter
# einem `*/public/`-Verzeichnis, der AUS dem vom Dockerfile kopierten Teilbaum
# HERAUSZEIGT, hat dieselbe Eigenschaft: lokal grün, im Image tot. `pnpm dev` und
# ein lokaler Build servieren aus dem Checkout (Symlinks intakt), das Dockerfile
# kopiert aber nur den App-Teilbaum — die relativen Ziele außerhalb davon
# existieren im Image nicht. Genau diese Divergenz misst der Test: er baut die
# COPY-Semantik des Dockerfiles nach und prüft die Auflösbarkeit am Ergebnis,
# statt nach bestimmten COPY-Zeilen zu greppen.
#
# Die spezifischen Cockpit-Assets prüft tests/spec/sdlc-cockpit/kit-assets-in-image.bats;
# dieser Test ist der generische Wächter über ALLE Apps mit Dockerfile+public/.
# Konkrete Pfade werden hier wörtlich geführt (auch in Kommentaren), damit
# find-changed-tests.sh per grep-Probe diesen Test bei Änderungen an
# website/public/cockpit/, website/.lavish/ oder website/Dockerfile selektiert
# (T002345).

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  cd "$REPO" || return 1
}

# Bildet `COPY <app>/ .` (WORKDIR /app) nach: der public/-Teilbaum landet im Ziel,
# Symlinks werden als Symlinks übernommen. Nur public/, nicht die ganze App —
# sonst zöge der Test in CI node_modules mit (T002499).
_simulate_public_copy() {
  local dest="$1" app="$2"
  mkdir -p "$dest/public"
  cp -r "$app/public/." "$dest/public/" 2>/dev/null || true
}

# Prüft, ob ein relativer Symlink-Pfad aus dem Teilbaum herauszeigt: zählt die
# `..`-Segmente gegen die Verzeichnistiefe. Genau das bestimmt, ob ein `COPY`
# des public/-Teilbaums das Ziel mitnimmt oder nicht.
_escapes_root() {
  local target="$1"
  case "$target" in
    /*) return 0 ;;        # absolutes Ziel → außerhalb des Teilbaums
  esac
  local up=0 dirs=0 seg
  IFS='/' read -r -a segs <<<"$target"
  for seg in "${segs[@]}"; do
    if [ "$seg" = ".." ]; then up=$((up + 1)); elif [ -n "$seg" ]; then dirs=$((dirs + 1)); fi
  done
  [ "$up" -gt "$dirs" ]   # mehr .. als verbleibende Verzeichnisse → raus
}

@test "T002498-M4: public/-Symlinks bleiben im Docker-Image-Layout auflösbar" {
  local apps=()
  local app dockerfile
  for dockerfile in */Dockerfile; do
    [ -f "$dockerfile" ] || continue
    app="${dockerfile%%/*}"
    [ -d "$app/public" ] || continue
    apps+=("$app")
  done
  [ ${#apps[@]} -gt 0 ] || { echo "keine App mit Dockerfile+public/ gefunden"; return 1; }

  local failures=0
  for app in "${apps[@]}"; do
    dockerfile="$app/Dockerfile"
    # Baukontext bestimmen: referenziert das Dockerfile `COPY <app>/`, baut es
    # auf dem Repo-Root auf; sonst auf dem App-Root (z.B. brett: COPY src ...).
    local context="$app"
    if grep -qE "^COPY[[:space:]]+${app}/" "$dockerfile"; then context="."; fi

    while IFS= read -r link; do
      [ -n "$link" ] || continue
      local target
      target="$(readlink "$link")"
      _escapes_root "$target" || continue

      # Positiv-Anker (T002356-M1): im Checkout MÜSSEN die Symlinks auflösen —
      # sonst wäre die Aussage vakuos (Symlink schlicht gelöscht).
      [ -e "$link" ] || { echo "Vorbedingung verletzt: $link löst im Checkout nicht auf"; failures=$((failures + 1)); continue; }

      local stage="$BATS_TEST_TMPDIR/${app}-app"
      mkdir -p "$stage"
      _simulate_public_copy "$stage" "$app"

      # COPY-Zeilen (ohne --from, das ist eine spätere Build-Stage) nachfahren,
      # um das Ergebnis zu messen statt es zu unterstellen. Format:
      # COPY <src> <dest>, src relativ zum Baukontext, dest relativ zu WORKDIR.
      local _prev line
      while IFS= read -r line; do
        case "$line" in
          COPY[[:space:]]--from=*) continue ;;
          COPY[[:space:]]*) ;;
          *) continue ;;
        esac
        set -- $line; shift  # "COPY"
        local src dest
        src="$1"; dest="$2"
        [ -n "$src" ] && [ -n "$dest" ] || continue
        # src gegen den Baukontext auflösen
        local src_path
        if [ "$context" = "." ]; then src_path="$REPO/$src"; else src_path="$context/$src"; fi
        [ -e "$src_path" ] || continue
        # dest "." = der gesamte public/-Teilbaum wurde oben schon kopiert.
        if [ "$dest" = "." ] || [ "$dest" = "./" ]; then continue; fi
        local target_path="$stage/${dest#./}"
        mkdir -p "$(dirname "$target_path")"
        rm -rf "$target_path"
        cp -rL "$src_path" "$target_path" 2>/dev/null || true
      done < <(grep -E '^COPY[[:space:]]' "$dockerfile")

      # Die eigentliche Aussage: nach der COPY-Simulation auflösbar.
      local link_rel
      link_rel="${link#"$app"/}"
      if [ ! -e "$stage/$link_rel" ]; then
        echo "FAIL: $link ($app) zeigt auf $target — im Image-Layout NICHT auflösbar (kopierter Teilbaum: $context)"
        failures=$((failures + 1))
      fi
    done < <(find "$app/public" -type l 2>/dev/null)
  done

  [ "$failures" -eq 0 ]
}
