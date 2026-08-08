#!/usr/bin/env bats
# tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T002729
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Der Test
# ruft findExclusiveConflict() AUS scripts/llm-proxy/loadouts.mjs auf — also die
# Funktion, die der Proxy in server.mjs vor jedem Start befragt — und prueft
# deren Rueckgabe. Ein grep auf das Feld exclusiveGroup in der JSON-Datei wuerde
# nur bestaetigen, dass dort Text steht; ob der zweite Start dadurch tatsaechlich
# durchgeht, sagt allein die Funktion.
#
# WAS HIER GESICHERT WIRD
# Embedding und Reranking sind die zwei Haelften derselben RAG-Abfrage: erst
# Kandidaten holen, dann sortieren. Beide muessen deshalb GLEICHZEITIG
# bereitstehen koennen.
#
# Bis T002729 trugen bge-embed-cpu und bge-rerank-cpu beide
# exclusiveGroup "bge-cpu", worauf der Proxy den zweiten Start mit HTTP 409
# ablehnte:
#
#   {"code":"exclusive_conflict","message":"bge-embed-cpu teilt exclusiveGroup
#    'bge-cpu' mit dem laufenden Loadout bge-rerank-cpu ..."}
#
# exclusiveGroup modelliert VRAM-Exklusivitaet — bei den chat-gpu-Loadouts
# zwingend, weil 16 GB VRAM keine zwei 12B-Modelle fassen. Beide bge-Loadouts
# laufen jedoch mit args.ngl = 0 und env.CUDA_VISIBLE_DEVICES = "" und belegen
# keinerlei VRAM (gesichert in bge-loadout-cpu-bound.bats). Die Serialisierung
# hatte damit keinen Sachgrund.
#
# ABGRENZUNG zu bge-loadout-cpu-bound.bats: jene Datei sichert, dass die
# bge-Loadouts die GPU nicht ANFASSEN. Diese hier sichert, dass sie einander
# nicht BLOCKIEREN. Beides sind eigene Aussagen ueber dieselben Loadouts.
#
# Jeder Negativtest traegt einen Positiv-Anker im selben @test (T002356-M1).
# Der Anker liegt hier bewusst auf einer KONTROLLGRUPPE (zwei chat-gpu-Loadouts,
# die sich weiterhin blockieren MUESSEN) statt auf dem Prueflingsfeld selbst.
# Ein Anker der Form "irgendeine Gruppe ist gesetzt" wuerde die blosse Existenz
# einer Gruppe zur Anforderung machen und genau die Aenderung verhindern, die
# dieses Ticket vornimmt.

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

# Ruft findExclusiveConflict($1 startet, $2 laeuft bereits) auf und gibt
# CONFLICT oder OK aus.
conflict_between() {
  node --input-type=module -e "
    import { parseLoadouts, findExclusiveConflict } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
    import { readFileSync } from 'node:fs';
    const doc = parseLoadouts(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
    console.log(findExclusiveConflict(doc, '$1', ['$2']) ? 'CONFLICT' : 'OK');
  "
}

@test "loadouts: die beiden bge-CPU-Loadouts blockieren einander nicht" {
  # Positiv-Anker: die Funktion erkennt einen echten Gruppenkonflikt ueberhaupt.
  # Ohne diesen Nachweis bestuende die Hauptaussage auch dann, wenn
  # findExclusiveConflict schlicht immer null zurueckgaebe.
  run conflict_between "gptoss-context" "gemma26-factory"
  [ "$status" -eq 0 ]
  [ "$output" = "CONFLICT" ]

  # Hauptaussage, beide Richtungen: keiner der beiden bge-CPU-Server haelt den
  # anderen ab. Beide Richtungen, weil der Aufruf nicht symmetrisch aussieht —
  # das startende Loadout und die Liste der laufenden sind getrennte Parameter.
  run conflict_between "bge-embed-cpu" "bge-rerank-cpu"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]

  run conflict_between "bge-rerank-cpu" "bge-embed-cpu"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "loadouts: die bge-CPU-Loadouts belegen weiterhin verschiedene Ports" {
  # Ohne getrennte Ports waere die aufgehobene Gruppensperre wertlos: der zweite
  # Start scheitert dann an port_busy statt an exclusive_conflict, und der
  # gleichzeitige Betrieb bliebe unmoeglich. Der Positiv-Anker steckt in der
  # Pruefung selbst — beide Ports muessen gesetzt UND verschieden sein.
  run node --input-type=module -e "
    import { parseLoadouts, findLoadout } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
    import { readFileSync } from 'node:fs';
    const doc = parseLoadouts(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
    const a = findLoadout(doc, 'bge-embed-cpu')?.port;
    const b = findLoadout(doc, 'bge-rerank-cpu')?.port;
    console.log(Number.isInteger(a) && Number.isInteger(b) && a !== b ? 'DISTINCT' : \`BAD:\${a}/\${b}\`);
  "
  [ "$status" -eq 0 ]
  [ "$output" = "DISTINCT" ]
}
