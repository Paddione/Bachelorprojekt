#!/usr/bin/env bats
# tests/spec/repo-structure/release-please-paths.bats — release-please schreibt nur
# in existierende Paketpfade [T012406]
#
# PRUEFMODUS: Quelltext-Inspektion der beiden JSON-Konfigurationen (T002448-M4-Ausnahme
# fuer CI-/Release-Konfiguration). Ein Laufzeit-Beleg gaebe es erst beim naechsten
# Release — also genau dann, wenn der Schaden schon im Repo steht.
#
# BELEGTER VORFALL: T006999 (Commit de4c5be7c, 2026-08-15) verschob brett/ und website/
# nach components/. release-please-config.json behielt die alten Pfade. Beim naechsten
# Release (Commit 14939835c, "chore: release main" #4751, 2026-08-18) legte
# release-please brett/CHANGELOG.md und website/CHANGELOG.md auf Top-Level NEU an und
# brach damit die Guards aus T006999 und components-group.bats.
#
# Zwei Eigenschaften machten das teuer:
#   1. Es faellt nicht beim Verschieben auf, sondern erst beim naechsten Release —
#      Tage spaeter, in einem Commit, der mit dem Verschieben nichts zu tun hat.
#   2. main blieb GRUEN. Der Shard-Job waehlt auf push-to-main diff-skopiert aus;
#      gegen main selbst ist der Diff leer, die Guards liefen dort also gar nicht.
#      Rot wurde jeder PR mit echtem Diff — und dort sah es nach einem Fehler des
#      PRs aus.
#
# Dieser Guard prueft die Ursache statt des Symptoms: die Pfade in der Konfiguration.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CFG="${REPO_ROOT}/release-please-config.json"
  MAN="${REPO_ROOT}/.release-please-manifest.json"
}

_cfg_paths() {
  python3 -c "
import json,sys
print('\n'.join(json.load(open(sys.argv[1]))['packages'].keys()))" "$CFG"
}

_man_paths() {
  python3 -c "
import json,sys
print('\n'.join(json.load(open(sys.argv[1])).keys()))" "$MAN"
}

@test "release-please: beide Konfigurationen sind lesbar und nennen Pakete" {
  # Positiv-Anker [T002356-M1]: Ohne ihn bestuenden alle Aussagen unten ueber der
  # leeren Menge — eine kaputte oder umbenannte Konfiguration waere "fehlerfrei".
  [ -f "$CFG" ]
  [ -f "$MAN" ]

  cfg_count="$(_cfg_paths | grep -c .)"
  man_count="$(_man_paths | grep -c .)"
  echo "Anker: config-Pakete=${cfg_count} manifest-Eintraege=${man_count}"
  [ "$cfg_count" -gt 0 ]
  [ "$man_count" -gt 0 ]
}

@test "release-please: jeder konfigurierte Paketpfad existiert im Repo" {
  # Das ist der Kern. Ein Pfad, den es nicht gibt, ist fuer release-please kein
  # Fehler — es LEGT IHN AN. Deshalb kann diese Fehlklasse nicht durch einen
  # fehlgeschlagenen Release auffallen, sondern nur durch einen Guard wie diesen.
  missing=""
  checked=0
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    checked=$((checked + 1))
    [ -d "${REPO_ROOT}/${p}" ] || missing="${missing} ${p}"
  done < <(_cfg_paths)

  echo "Anker: gepruefte Paketpfade=${checked}"
  [ "$checked" -gt 0 ]

  if [ -n "$missing" ]; then
    echo "release-please-config.json nennt nicht existierende Paketpfade:${missing}" >&2
    echo "release-please wuerde sie beim naechsten Release ANLEGEN statt zu scheitern." >&2
    false
  fi
}

@test "release-please: Manifest und Konfiguration nennen dieselben Pfade" {
  # Beide Dateien tragen die Pfade getrennt. Wird nur eine umgehaengt, sucht
  # release-please die letzte Version unter einem Schluessel, den es nicht kennt,
  # und faengt bei 1.0.0 an — ein stiller Versionssprung statt eines Fehlers.
  cfg_sorted="$(_cfg_paths | sort)"
  man_sorted="$(_man_paths | sort)"

  echo "config:   $(printf '%s' "$cfg_sorted" | tr '\n' ' ')"
  echo "manifest: $(printf '%s' "$man_sorted" | tr '\n' ' ')"
  [ -n "$cfg_sorted" ]
  [ -n "$man_sorted" ]

  if [ "$cfg_sorted" != "$man_sorted" ]; then
    echo "Pfade von release-please-config.json und .release-please-manifest.json weichen ab" >&2
    false
  fi
}

@test "release-please: kein Paketpfad zeigt auf eine verschobene Top-Level-Wurzel" {
  # Namensgleiche Alt-Wurzeln sind der konkrete Rueckfall: 'brett' und 'website'
  # liegen seit T006999 unter components/. Ein Pfad ohne Praefix ist deshalb kein
  # Tippfehler, sondern der alte Zustand.
  bad=""
  while IFS= read -r p; do
    case "$p" in
      brett|website|brett/*|website/*) bad="${bad} ${p}" ;;
    esac
  done < <(_cfg_paths; _man_paths)

  if [ -n "$bad" ]; then
    echo "Paketpfad(e) zeigen auf die vor T006999 gueltige Top-Level-Wurzel:${bad}" >&2
    echo "Richtig sind components/brett bzw. components/website." >&2
    false
  fi
}

@test "release-please: die Paket-Version steht auf dem Manifest-Wert" {
  # Nach dem Vorfall standen Manifest (0.41.2/1.284.2, Tags existierten) und
  # package.json (0.41.1/1.284.1) auseinander: release-please hatte die Version am
  # falschen Pfad gesucht und deshalb nicht gehoben. Das faellt sonst erst auf,
  # wenn jemand die Version einer gebauten Komponente liest.
  checked=0
  drift=""
  for pkg in components/brett components/website; do
    pj="${REPO_ROOT}/${pkg}/package.json"
    [ -f "$pj" ] || continue
    checked=$((checked + 1))
    want="$(python3 -c "
import json,sys
print(json.load(open(sys.argv[1])).get(sys.argv[2], ''))" "$MAN" "$pkg")"
    have="$(python3 -c "
import json,sys
print(json.load(open(sys.argv[1])).get('version',''))" "$pj")"
    [ -n "$want" ] || continue
    [ "$want" = "$have" ] || drift="${drift} ${pkg}(manifest=${want} package.json=${have})"
  done

  echo "Anker: gepruefte Pakete=${checked}"
  [ "$checked" -gt 0 ]

  if [ -n "$drift" ]; then
    echo "Versions-Drift zwischen Manifest und package.json:${drift}" >&2
    false
  fi
}
