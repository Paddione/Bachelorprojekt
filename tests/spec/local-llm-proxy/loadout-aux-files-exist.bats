#!/usr/bin/env bats
# tests/spec/local-llm-proxy/loadout-aux-files-exist.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T002886
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Der Test
# loest die Pfade mit derselben Mechanik auf, die scripts/llm-proxy/server.mjs
# fuer `resolved` benutzt (modelRoots + existsSync), und wertet deren Rueckgabe
# aus. Er greppt NICHT loadouts.json — ein Pfad im JSON belegt nur, dass Text da
# ist, nicht dass eine Datei existiert.
#
# WARUM ZUSAETZLICH ZU loadout-model-files-exist.bats (T002753): jener Guard
# prueft ausschliesslich `l.model`. Die NEBENDATEIEN — `args.mmprojPath` und
# `speculative.draftModelPath` — laufen an ihm vorbei. Genau dadurch stand in
# gemma26-factory ueber Wochen ein mmprojPath auf 'gemma4/mmproj-F16.gguf', den
# es nicht gibt, waehrend der `notes`-Text derselben Zeile bereits "Kein mmproj"
# sagte. Ein Loadout mit unaufloesbarem mmprojPath startet zwar (server.mjs
# setzt `resolved.mmprojPath` dann auf null), aber OHNE die Faehigkeit, fuer die
# der Eintrag da war — der Fehler ist damit still, und das ist der Grund fuer
# diesen Guard.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LOADOUTS="${REPO_ROOT}/scripts/llm/loadouts.json"
}

# Gibt je deklarierter Nebendatei eine Zeile "<slug> <feld> <OK|MISSING>" aus.
# Loadouts ohne Nebendateien erzeugen keine Zeile.
_resolve_aux() {
  node --input-type=module -e "
    import { readFileSync, existsSync } from 'node:fs';
    import { join } from 'node:path';
    import os from 'node:os';
    const doc = JSON.parse(readFileSync('${LOADOUTS}', 'utf8'));
    const roots = doc.modelRoots.map(r => r.replace(/^~/, os.homedir()));
    const resolve = (rel) => roots.map(r => join(r, rel)).find(existsSync) ?? null;
    for (const l of doc.loadouts) {
      if (l.managed === 'external') continue;
      const aux = [
        ['mmprojPath', l.args?.mmprojPath],
        ['draftModelPath', l.speculative?.draftModelPath],
      ];
      for (const [field, rel] of aux) {
        if (!rel) continue;
        console.log(\`\${l.slug} \${field} \${resolve(rel) ? 'OK' : 'MISSING'}\`);
      }
    }
  "
}

@test "T002886: die Nebendatei-Aufloesung erkennt eine fehlende Datei ueberhaupt" {
  # POSITIV-ANKER (T002356-M1), bewusst ZUERST: die Negativ-Aussage im Test
  # darunter ("kein MISSING") ist trivial wahr, sobald gar nicht aufgeloest
  # wird. Dieser Test belegt unabhaengig von loadouts.json, dass die Mechanik
  # zwischen "da" und "nicht da" unterscheidet — mit BEIDEN Faellen, damit ein
  # kaputtes resolve(), das immer null liefert, ebenfalls auffliegt.
  run node --input-type=module -e "
    import { readFileSync, existsSync } from 'node:fs';
    import { join } from 'node:path';
    import os from 'node:os';
    const doc = JSON.parse(readFileSync('${LOADOUTS}', 'utf8'));
    const roots = doc.modelRoots.map(r => r.replace(/^~/, os.homedir()));
    const resolve = (rel) => roots.map(r => join(r, rel)).find(existsSync) ?? null;
    // Negativfall: garantiert nicht vorhanden.
    console.log(resolve('nirgends/kein-projektor-T002886.gguf') === null ? 'MISSING' : 'OK');
    // Positivfall: der erste modelRoot selbst existiert als Verzeichnis, '.'
    // loest daher immer auf, sofern ueberhaupt ein Root vorhanden ist.
    const anyRoot = roots.some(existsSync);
    console.log(anyRoot ? (resolve('.') ? 'OK' : 'BROKEN') : 'NO_ROOT');
  "
  [ "$status" -eq 0 ]
  local neg pos
  neg=$(echo "$output" | sed -n 1p)
  pos=$(echo "$output" | sed -n 2p)
  echo "Negativfall: $neg | Positivfall: $pos"
  [ "$neg" = "MISSING" ]
  # NO_ROOT ist zulaessig (CI-Runner ohne Modellverzeichnisse); BROKEN nicht.
  [ "$pos" = "OK" ] || [ "$pos" = "NO_ROOT" ]
}

@test "T002886: jede deklarierte mmproj-/draft-Datei loest auf" {
  run _resolve_aux
  [ "$status" -eq 0 ]

  # Kein Loadout deklariert Nebendateien -> nichts zu pruefen. Das ist ein
  # gueltiger Zustand (nach diesem Change deklariert nur gemma12-vision welche),
  # aber er soll SICHTBAR sein statt als stiller Erfolg durchzugehen.
  if [ -z "$output" ]; then
    echo "Hinweis: kein Loadout deklariert mmprojPath oder draftModelPath."
    return 0
  fi

  # Auf einem Runner ohne Modellverzeichnisse kann nichts aufloesen. Dann misst
  # der Test nichts und darf auch nichts behaupten — skip statt Falschalarm.
  # Der Skip haengt am VORHANDENSEIN der Roots, nicht am Ergebnis: sonst
  # verschwaende jeder echte Fehlschlag hinter einem Skip (die Falle aus
  # T002535, wo ein Skip-Guard eine Probe jahrelang stumm schaltete).
  local roots_present
  roots_present=$(node --input-type=module -e "
    import { readFileSync, existsSync } from 'node:fs';
    import os from 'node:os';
    const doc = JSON.parse(readFileSync('${LOADOUTS}', 'utf8'));
    console.log(doc.modelRoots.map(r => r.replace(/^~/, os.homedir())).some(existsSync) ? 'yes' : 'no');
  ")
  [ "$roots_present" = "yes" ] || skip "kein modelRoot im Testumfeld vorhanden (CI-Runner ohne GGUF-Gewichte)"

  local missing
  missing=$(echo "$output" | awk '$3 == "MISSING" { print $1 " (" $2 ")" }')
  # Die Fehlerliste VOR der Assertion ausgeben: ein roter Lauf soll sagen, WAS
  # fehlt, nicht nur DASS etwas fehlt.
  echo "Nebendateien ohne Datei: ${missing:-<keine>}"
  [ -z "$missing" ]
}
