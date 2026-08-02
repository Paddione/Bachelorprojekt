#!/usr/bin/env bats
# tests/spec/local-llm-proxy/model-path-large-file.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T002536
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Geprueft
# wird der Rueckgabewert von resolveModelPath() gegen echte Dateien im
# Dateisystem — kein grep auf Script-Interna.
#
# Hintergrund: resolveModelPath() pruefte die Existenz der Modelldatei mit
#   readFileSync(candidate, { flag: 'r', encoding: null, length: 0 })
# readFileSync kennt keine Option 'length' (die gehoert zu fs.read), las also
# die komplette Datei. Node wirft ab 2 GiB ERR_FS_FILE_TOO_LARGE, das leere
# catch verschluckte es, der Loadout-Start meldete 'model_missing'. Damit war
# der Start fuer JEDES Chat-Modell kaputt — die sind praktisch alle groesser.
#
# Die Testdatei wird spaerlich angelegt (truncate), belegt also keinen realen
# Plattenplatz. Ihre Groesse liegt bewusst UEBER 2 GiB, weil genau dort die
# alte Implementierung umkippte; eine kleinere Datei wuerde den Fehler nicht
# reproduzieren und der Test liefe vakuos gruen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMPROOT="$(mktemp -d)"
  mkdir -p "$TMPROOT/sub"
  truncate -s 3G "$TMPROOT/sub/gross.gguf"
  truncate -s 1M "$TMPROOT/sub/klein.gguf"
}

teardown() {
  [ -n "$TMPROOT" ] && rm -rf "$TMPROOT"
}

# Ruft resolveModelPath fuer <relPath> auf und gibt den Rueckgabewert aus
# ('null' wenn nicht gefunden).
_resolve() {
  node --input-type=module -e "
    const { resolveModelPath } = await import('file://$REPO/scripts/llm-proxy/models.mjs');
    const doc = { modelRoots: ['$TMPROOT'] };
    console.log(String(resolveModelPath(doc, { model: '$1' })));
  "
}

@test "resolveModelPath findet ein Modell ueber 2 GiB" {
  # Der eigentliche Gegenstand: mit readFileSync warf Node hier
  # ERR_FS_FILE_TOO_LARGE und die Funktion gab null zurueck.
  run _resolve "sub/gross.gguf"
  echo "$output"
  [ "$status" -eq 0 ]
  [ "$output" = "$TMPROOT/sub/gross.gguf" ]
}

@test "resolveModelPath findet auch kleine Dateien weiterhin" {
  # Positiv-Anker (T002356-M1): Waere die Aufloesung generell kaputt, wuerde
  # der Test darueber nichts ueber die Dateigroesse aussagen. Dieser belegt,
  # dass der Pfad ueberhaupt funktioniert.
  run _resolve "sub/klein.gguf"
  echo "$output"
  [ "$status" -eq 0 ]
  [ "$output" = "$TMPROOT/sub/klein.gguf" ]
}

@test "resolveModelPath gibt null fuer eine fehlende Datei" {
  # Gegenprobe: die Funktion darf nicht einfach immer einen Pfad melden.
  run _resolve "sub/gibtsnicht.gguf"
  echo "$output"
  [ "$status" -eq 0 ]
  [ "$output" = "null" ]
}

@test "resolveModelPath gibt null fuer ein Verzeichnis gleichen Namens" {
  # statSync wirft bei einem Verzeichnis nicht — ohne isFile()-Pruefung wuerde
  # ein Verzeichnis als Modell durchgehen und llama-server erst beim Start
  # scheitern.
  mkdir -p "$TMPROOT/sub/verzeichnis.gguf"
  run _resolve "sub/verzeichnis.gguf"
  echo "$output"
  [ "$status" -eq 0 ]
  [ "$output" = "null" ]
}
