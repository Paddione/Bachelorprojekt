#!/usr/bin/env bats

# public-assets-no-server-code.bats — kein Server-Code unter website/public/ (T002528)
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert, aber auf
# dem Dateisystem statt auf einem Kommando-Output. Geprueft wird, WAS unter
# website/public/ tatsaechlich erreichbar ist — nicht, wie die Symlinks
# konfiguriert sind. Das ist der Unterschied, der hier zaehlt: der Defekt
# entstand, ohne dass jemand einen Symlink veraendert hat.
#
# Hintergrund: website/public/cockpit/kit war ein Symlink auf .lavish/kit —
# angelegt fuer die Browser-Assets (CSS, adapter.js, panel*.js). Seit K2 liegt
# unter .lavish/kit/ auch daemon/ mit dem TypeScript-Quellcode des Daemons.
# Astro loest Symlinks beim Build auf und kopiert den GESAMTEN Zielbaum nach
# dist/. Ergebnis, live verifiziert am 2026-08-01:
#
#   curl -sL https://mentolder.de/cockpit/kit/daemon/lib/token.ts  -> HTTP 200
#
# Kein Secret-Leak (der Schreib-Token entsteht zur Laufzeit), aber die
# vollstaendige innere Architektur inklusive der kubectl-Kommandozeilen mit
# --context fleet und Namespaces.
#
# ENTSCHEIDEND ist das `-L` bei find: ohne die Option folgt find dem Symlink
# nicht und meldet nichts — der Test waere gruen, waehrend die Dateien
# ausgeliefert werden. Genau diese Blindheit hat den Defekt so lange getragen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  PUBLIC_DIR="$REPO/website/public"
  KIT_DIR="$REPO/.lavish/kit"
}

@test "T002528 Kein TypeScript-Quellcode unter website/public/ erreichbar [Negativtest + Positiv-Anker]" {
  [ -d "$PUBLIC_DIR" ]

  # POSITIV-ANKER: find -L findet ueber Symlinks hinweg ueberhaupt Dateien.
  # Ohne diese Zusicherung waere die Negativ-Aussage unten trivial erfuellt,
  # falls der Pfad falsch oder das Verzeichnis leer waere.
  local reachable
  reachable=$(find -L "$PUBLIC_DIR" -type f 2>/dev/null | wc -l)
  [ "$reachable" -ge 10 ] || {
    echo "nur $reachable Dateien unter public/ erreichbar — Anker verfehlt" >&2
    false
  }

  # GEGENPROBE zum Anker: die Kit-Assets, die dort hingehoeren, sind wirklich da.
  find -L "$PUBLIC_DIR/cockpit/kit" -maxdepth 1 -name 'adapter.js' | grep -q . || {
    echo "adapter.js ist unter public/cockpit/kit/ nicht erreichbar" >&2
    false
  }

  # NEGATIVTEST: keine .ts/.tsx-Datei. `-L` folgt Symlinks — ohne das Flag
  # bliebe der Defekt unsichtbar.
  local offenders
  offenders=$(find -L "$PUBLIC_DIR" -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null)
  [ -z "$offenders" ] || {
    echo "Server-Code unter website/public/ erreichbar:" >&2
    echo "$offenders" >&2
    false
  }
}

@test "T002528 Kein daemon-Verzeichnis unter website/public/ erreichbar" {
  # Auch ohne .ts-Dateien haette ein verlinktes daemon/ dort nichts zu suchen:
  # tsconfig.json, package-Metadaten und kuenftige .js-Builds gehoeren genauso
  # wenig in den oeffentlichen Baum.
  local dirs
  dirs=$(find -L "$PUBLIC_DIR" -type d -name 'daemon' 2>/dev/null)
  [ -z "$dirs" ] || {
    echo "daemon-Verzeichnis unter public/ erreichbar: $dirs" >&2
    false
  }
}

@test "T002528 Jedes Kit-Browser-Asset ist unter public/cockpit/kit/ erreichbar" {
  # Der Gegen-Guard zum Negativtest oben. Weil public/cockpit/kit/ jetzt
  # einzelne Datei-Symlinks fuehrt statt eines Verzeichnis-Symlinks, faellt ein
  # neu angelegtes Asset sonst still durch: die Seite laedt es nicht, und kein
  # Test schlaegt an. Dieser Test macht das Vergessen sichtbar.
  local missing=""
  local checked=0

  while IFS= read -r src; do
    [ -n "$src" ] || continue
    local base; base="$(basename "$src")"
    checked=$((checked + 1))
    if [ ! -e "$PUBLIC_DIR/cockpit/kit/$base" ]; then
      missing="${missing} ${base}"
    fi
  done < <(find "$KIT_DIR" -maxdepth 1 -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) | sort)

  # POSITIV-ANKER: es gibt ueberhaupt Assets zu pruefen.
  [ "$checked" -ge 5 ] || {
    echo "nur $checked Kit-Assets gefunden — Anker verfehlt" >&2
    false
  }

  [ -z "$missing" ] || {
    echo "Kit-Assets ohne Verknuepfung unter public/cockpit/kit/:${missing}" >&2
    echo "Anlegen mit: ln -s ../../../.lavish/kit/<datei> website/public/cockpit/kit/<datei>" >&2
    false
  }
}
