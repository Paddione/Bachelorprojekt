#!/usr/bin/env bats
# T002753 — Jedes Loadout muss seine Modelldatei tatsaechlich haben.
#
# PRUEFMODUS: Output-Verifikation (T002448-M4). Der Test RUFT die kanonische
# Aufloesung resolveModelPath() aus scripts/llm-proxy/models.mjs AUF und wertet
# deren Rueckgabe aus (absoluter Pfad oder null). Er greppt NICHT die
# Modellpfade aus loadouts.json — ein Pfad im JSON belegt nur, dass Text da ist,
# nicht dass eine Datei existiert. Genau diese Luecke liess vier Loadouts ohne
# Gewichte seit dem 2026-08-03 unbemerkt im Repo stehen, waehrend
# .opencode/agent-models.jsonc die zugehoerigen Provider-Bloecke laengst
# entfernt hatte.
#
# ABGRENZUNG: Loadouts mit "managed": "external" (unsloth-studio) tragen keinen
# Dateipfad, sondern eine Kennung — sie werden von einem fremden Prozess
# gestartet und sind hier ausgenommen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LOADOUTS="${REPO_ROOT}/scripts/llm/loadouts.json"
}

# Gibt je Zeile "<slug> <OK|MISSING>" aus, indem es die echte Aufloesung fahrt.
_resolve_all() {
  node --input-type=module -e "
    import { resolveModelPath } from '${REPO_ROOT}/scripts/llm-proxy/models.mjs';
    import { readFileSync } from 'node:fs';
    const doc = JSON.parse(readFileSync('${LOADOUTS}', 'utf8'));
    for (const l of doc.loadouts) {
      if (l.managed === 'external') continue;
      console.log(l.slug + ' ' + (resolveModelPath(doc, l) ? 'OK' : 'MISSING'));
    }
  "
}

@test "T002753: jedes Loadout loest seine Modelldatei auf" {
  # [T012414] UMGEBUNGS-GATE VOR der Messung: sind ueberhaupt alle deklarierten
  # modelRoots da? 'modelRoots' enthaelt '~/models/gguf', und '~' ist
  # benutzerabhaengig. Der CI-Job laeuft als Runner-User ('ghrunner',
  # HOME=/opt/actions-runner) — dieser Root existiert dort nicht, waehrend der
  # zweite (LM-Studio unter /mnt/c) existiert und GGUFs enthaelt. Die Aufloesung
  # lieferte deshalb ein paar Treffer (ok_count > 0, also kein Skip) und meldete
  # gleichzeitig JEDES Modell unter dem fehlenden Root als MISSING: der Guard war
  # fuer den CI-User dauerhaft rot, ohne dass ein Modell gefehlt haette.
  #
  # Das Gate haengt an der UMGEBUNG, nicht am ERGEBNIS (Warnung aus T002535):
  # ein Host mit vollstaendigen Roots, bei dem eine Datei fehlt, wird rot.
  local roots_ok
  roots_ok=$(node --input-type=module -e "
    import { readFileSync, existsSync } from 'node:fs';
    import os from 'node:os';
    const doc = JSON.parse(readFileSync('${LOADOUTS}', 'utf8'));
    const resolved = doc.modelRoots.map(r => r.replace(/^~/, os.homedir()));
    console.log(resolved.every(existsSync) ? 'yes' : 'no');
  ")
  [ "$roots_ok" = "yes" ] || skip "modelRoots im Testumfeld unvollstaendig (z. B. CI-Job als anderer Benutzer: '~' zeigt woandershin)"

  run _resolve_all
  [ "$status" -eq 0 ]

  # POSITIV-ANKER (T002356-M1) ZUERST: ohne ihn bestuende der Test vakuos,
  # sobald die Aufloesung gar nichts liefert — "0 MISSING in einer leeren Liste"
  # ist trivial wahr. Erst belegen, dass ueberhaupt aufgeloest WIRD.
  local ok_count
  ok_count=$(echo "$output" | grep -c ' OK$' || true)
  if [ "$ok_count" -eq 0 ]; then
    skip "keine Modelldateien im Testumfeld vorhanden (Runner ohne GGUF-Gewichte)"
  fi

  # POSITIV-ANKER (T002356-M1) ZUERST: ohne ihn bestuende der Test vakuos,
  # sobald die Aufloesung gar nichts liefert — "0 MISSING in einer leeren Liste"
  # ist trivial wahr. Erst belegen, dass ueberhaupt aufgeloest WIRD.
  [ "$ok_count" -ge 1 ]

  local missing
  missing=$(echo "$output" | awk '$2 == "MISSING" { print $1 }')
  echo "Loadouts ohne Modelldatei: ${missing:-<keine>}"

  # Und dass ein konkretes, nachweislich vorhandenes Loadout durchlaeuft.
  echo "$output" | grep -qx 'gptoss-context OK'

  [ -z "$missing" ]
}

@test "T002753: die Aufloesung erkennt eine fehlende Datei ueberhaupt" {
  # Gegenprobe zum Test darueber: haette resolveModelPath() einen Bug und gaebe
  # immer einen Pfad zurueck, liefe jene Pruefung dauerhaft gruen. Hier wird ein
  # garantiert nicht existierendes Loadout durchgeschickt — es MUSS als MISSING
  # herauskommen.
  run node --input-type=module -e "
    import { resolveModelPath } from '${REPO_ROOT}/scripts/llm-proxy/models.mjs';
    import { readFileSync } from 'node:fs';
    const doc = JSON.parse(readFileSync('${LOADOUTS}', 'utf8'));
    const fake = { slug: 'gibt-es-nicht', model: 'nirgends/kein-modell-T002753.gguf' };
    console.log(resolveModelPath(doc, fake) === null ? 'MISSING' : 'OK');
  "
  [ "$status" -eq 0 ]
  [ "$output" = "MISSING" ]
}
