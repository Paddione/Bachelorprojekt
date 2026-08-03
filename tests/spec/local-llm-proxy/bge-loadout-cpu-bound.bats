#!/usr/bin/env bats
# tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T002607
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Der Test
# laedt scripts/llm/loadouts.json durch DEN PARSER, den auch das Werkzeug
# benutzt (scripts/llm-proxy/loadouts.mjs), und prueft die geparsten Werte.
# Ein grep auf die JSON-Datei wuerde ein Feld bestaetigen, das der Parser
# verwirft — genau der Fehler, den die kanonische Serialisierung erzeugen kann.
#
# WAS HIER GESICHERT WIRD
# Auf dem Client soll das VRAM der RTX 5070 Ti (16 GB) fuer Finetuning frei
# bleiben (T002587). Embedding und Reranking duerfen deshalb ausschliesslich
# CPU nutzen.
#
# ZWEI Bedingungen, nicht eine — das ist der Kern dieses Guards:
#
#   args.ngl = 0                    verhindert das Auslagern der Layer
#   env.CUDA_VISIBLE_DEVICES = ""   verhindert die Allokation eines CUDA-Kontexts
#
# `-ngl 0` allein genuegt NICHT. llama.cpp allokiert trotzdem einen
# CUDA-Kontext von rund 600 MB je Prozess — gemessen in T002538, wo aus genau
# diesem Grund das env-Feld ins Loadout-Schema kam. Der Kommentar dort nennt
# "die CPU-gebundenen bge-Server" als Anwendungsfall; die Loadouts selbst
# fehlten bis T002607. Ein Guard, der nur ngl prueft, wuerde 600 MB je Server
# durchgehen lassen und dabei gruen melden.
#
# Der Guard greift ueber ein Namensmuster statt ueber eine feste Liste: ein
# spaeter hinzugefuegtes bge-Loadout ist sonst genau das, was durchrutscht.
#
# Jeder Negativtest traegt einen Positiv-Anker im selben @test (T002356-M1).

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

# Gibt die Slugs aller bge-Loadouts aus, geparst wie vom Werkzeug.
bge_slugs() {
  node --input-type=module -e "
    import { parseLoadouts } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
    import { readFileSync } from 'node:fs';
    const doc = parseLoadouts(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
    for (const l of doc.loadouts) {
      if (/bge|embed|rerank/i.test(l.slug) || /bge/i.test(l.model)) console.log(l.slug);
    }
  "
}

@test "loadouts: es gibt ueberhaupt bge-Loadouts (sonst waere jede Aussage darueber vakuos)" {
  # Positiv-Anker fuer die gesamte Datei: der Parser akzeptiert sie und liefert
  # Loadouts. Ohne diesen Check koennte ein kaputtes Dokument alle folgenden
  # Tests still bestehen lassen, weil die Kandidatenliste leer bleibt.
  run node --input-type=module -e "
    import { parseLoadouts } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
    import { readFileSync } from 'node:fs';
    const doc = parseLoadouts(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
    console.log(doc.loadouts.length);
  "
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  run bge_slugs
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'bge-embed-cpu'
  echo "$output" | grep -qx 'bge-rerank-cpu'
}

@test "loadouts: jedes bge-Loadout setzt args.ngl auf 0" {
  run bge_slugs
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  for slug in $output; do
    run node --input-type=module -e "
      import { parseLoadouts, findLoadout } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
      import { readFileSync } from 'node:fs';
      const doc = parseLoadouts(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
      console.log(JSON.stringify(findLoadout(doc, '${slug}').args?.ngl));
    "
    [ "$status" -eq 0 ]
    [ "$output" = "0" ]
  done
}

@test "loadouts: jedes bge-Loadout blendet die GPU zusaetzlich per CUDA_VISIBLE_DEVICES aus" {
  run bge_slugs
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  for slug in $output; do
    # Der eigentliche Punkt dieses Guards: ngl=0 allein laesst rund 600 MB
    # CUDA-Kontext je Prozess stehen (T002538).
    run node --input-type=module -e "
      import { parseLoadouts, findLoadout } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
      import { readFileSync } from 'node:fs';
      const doc = parseLoadouts(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
      const l = findLoadout(doc, '${slug}');
      console.log(JSON.stringify(l.env?.CUDA_VISIBLE_DEVICES));
    "
    [ "$status" -eq 0 ]
    [ "$output" = '""' ]
  done
}

@test "loadouts: bge-Loadouts stehen nicht in der GPU-Gruppe der Chat-Modelle" {
  run bge_slugs
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  for slug in $output; do
    run node --input-type=module -e "
      import { parseLoadouts, findLoadout } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
      import { readFileSync } from 'node:fs';
      const doc = parseLoadouts(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
      console.log(findLoadout(doc, '${slug}').exclusiveGroup ?? 'null');
    "
    [ "$status" -eq 0 ]
    # Positiv-Anker: eine Gruppe ist ueberhaupt gesetzt — sonst bestuende der
    # Test auch bei einem Loadout ohne jede Gruppenzuordnung.
    [ "$output" != "null" ]
    [ "$output" != "chat-gpu" ]
  done
}

@test "loadouts: die Datei ist nach den Ergaenzungen weiterhin kanonisch serialisiert" {
  # Sonst normalisiert der naechste regulaere Schreibvorgang jede Zeile (T002553).
  run node "${REPO_ROOT}/scripts/llm/loadouts-format.mjs" --check "${REPO_ROOT}/scripts/llm/loadouts.json"
  [ "$status" -eq 0 ]
}
