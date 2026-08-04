---
title: "gpu-arbitrierung-trainings-vorrang — Implementation Plan"
ticket_id: T002628
domains: [local-llm-proxy, gpu-ops, ci-cd]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gpu-arbitrierung-trainings-vorrang — Implementation Plan

_Ticket: T002628_

## File Structure

```
scripts/gpu-lock.sh
scripts/llm-proxy/gpu-lock.mjs
scripts/llm-proxy/gpu-lock.test.mjs
scripts/llm-proxy/discovery.mjs
scripts/llm-proxy/server.mjs
scripts/llm-proxy/loadouts.mjs
scripts/llm-proxy/loadouts.test.mjs
scripts/llm/loadouts.json
Taskfile.finetune.yml
tests/spec/local-llm-proxy/gpu-lock.bats
website/src/data/test-inventory.json
```

Budgets (gemessen): `discovery.mjs` 170 Zeilen, `server.mjs` 479, `loadouts.mjs` 250 — alle drei
werden um wenige Zeilen ergaenzt und bleiben deutlich unter der S1-Schwelle. Keine der
Dateien steht in `docs/code-quality/baseline.json`; die dortige Baseline fuehrt
ausschliesslich Dateien unter `website/src/`. Die groesste Neudatei ist
`scripts/gpu-lock.sh` mit einem Budget von 220 Zeilen. Ein Verkleinerungsschritt ist
nicht erforderlich.

## Kontext fuer den Implementierer

Lies zuerst `design.md` im selben Ordner — dort steht, welche fuenf Bausteine bereits
existieren und nicht neu gebaut werden. Die verbindlichen Aussagen stehen in
`specs/local-llm-proxy.md`.

Die drei Punkte, an denen dieser Vorgang typischerweise falsch umgesetzt wird:

1. **Draining gibt kein VRAM frei.** Ein llama.cpp ohne neue Requests haelt seine
   Gewichte weiter. Draining schuetzt den laufenden Request; erst der Stop schafft
   Speicher. Beide Schritte werden gebraucht, in dieser Reihenfolge.
2. **Die Erfolgsbedingung ist eine Messung.** Nicht „Units gestoppt". Alle Loadouts
   laufen mit `--fit on`, das still Layer ins RAM auslagert — zu wenig VRAM scheitert
   deshalb nicht, es wird langsam.
3. **`draining` ist nicht `unhealthy`.** Kein Backoff, keine unhealthy-Zeile. Sonst wird
   der Arbitrierungs-Mechanismus zur Fehlerquelle in der Diagnose.

## Tasks

- [ ] **Failing-Test-Step (RED).** Lege `tests/spec/local-llm-proxy/gpu-lock.bats` an und
      schreibe die Tests gegen `scripts/gpu-lock.sh`, bevor das Skript existiert:
      `acquire` schreibt eine Lock-Datei mit PID, `release` entfernt sie, `status`
      unterscheidet gehalten von frei, und ein Lock einer toten PID gilt als abwesend.
      Lock-Pfad ueber `GPU_LOCK_FILE` setzbar, damit gegen Fixtures statt gegen den
      echten Lock geprueft wird.

      Pruefmodus: Output-Verifikation — die Tests rufen das Skript auf und pruefen
      `$status` sowie den Dateizustand danach. Kein `grep` auf den Quelltext.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/gpu-lock.bats
# expected: FAIL (rot — scripts/gpu-lock.sh existiert noch nicht)
```

- [ ] **Pruefschritt: Studio-API erkunden.** Stelle fest, ob Unsloth Studio auf `:8888`
      eine Schnittstelle bietet, ueber die sich sein Inferenz-Server geordnet beenden
      laesst (`curl -s http://127.0.0.1:8888/` und die erreichbaren Pfade sichten). Das
      Ergebnis entscheidet den naechsten Punkt und wird in `design.md` unter „Der externe
      Halter" nachgetragen. Ergibt die Erkundung keine brauchbare Schnittstelle, bleibt
      es beim Melden — es wird kein Signal gesendet.

- [ ] **`scripts/gpu-lock.sh` schreiben.** Verben `acquire`, `release`, `status`.
      Lock-Datei als JSON mit `pid`, `started_at`, `reason`; Pfad ueber `GPU_LOCK_FILE`
      ueberschreibbar. `acquire` in der Reihenfolge aus `design.md`: Lock schreiben,
      auslaufen lassen, stoppen, messen, entscheiden.

      Auslaufen heisst: `/admin/state` pollen bis `inflight` aller Backends mit
      `kind=llamacpp` auf 0 steht. Nichts wird gekappt. Ein Deckel (Vorgabe 300 s)
      verhindert ewiges Haengen; bei Ablauf bricht `acquire` ab und gibt seinen Lock
      wieder frei, statt einen Request abzubrechen.

      Stoppen heisst: fuer jedes Loadout der Gruppe `chat-gpu`
      `POST /admin/loadouts/<slug>/stop`. Externe Loadouts (`managed: external`) werden
      dabei uebersprungen.

      Messen heisst: `nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits`.
      Der benoetigte Wert ist ueber `GPU_LOCK_REQUIRED_MIB` einstellbar; die Abfrage
      selbst ueber `GPU_LOCK_NVIDIA_SMI` ersetzbar, damit die Tests ohne GPU laufen.
      Fehlt `nvidia-smi`, bricht `acquire` mit klarer Meldung ab — raten ist schlechter
      als scheitern.

      Reicht der Speicher nicht, nennt die Fehlermeldung den verbliebenen Halter mit PID,
      Port und Modell, und der Lock wird freigegeben.

- [ ] **`scripts/llm-proxy/gpu-lock.mjs` schreiben.** Liest die Lock-Datei, prueft die
      PID-Liveness und meldet, ob ein Lock gilt. Tote PID: Lock verworfen und Datei
      entfernt. Unlesbare oder unparsbare Datei: gilt als gehalten, mit deutlicher
      Log-Zeile. Diese Richtung ist Absicht — fail-open wuerde einen laufenden
      Trainingslauf zerstoeren, fail-closed kostet nur Deepseek-Tokens.

- [ ] **Draining in die Backend-Auswahl einziehen.** In `discovery.mjs` wird `draining`
      ein dritter Zustand neben `healthy` und `unhealthy`. Drainende Backends werden
      nicht gewaehlt, kommen nicht in den Backoff und erzeugen keine unhealthy-Zeile. Je
      eine Log-Zeile beim Eintritt und beim Austritt, die das Backend und den Lock als
      Ursache nennt.

      Betroffen sind Backends mit `kind` aus `llamacpp` und `lmstudio` — ueber `kind`
      entschieden, niemals ueber eine Liste von Backend-Namen.

- [ ] **`/admin/state` und `/health` anpassen.** `/admin/state` gibt den
      Draining-Zustand und die Lock-Information mit aus. `/health` bleibt gruen, solange
      irgendein Backend bedienen kann: der Kommentar bei `server.mjs` haelt fest, dass
      `/health` Readiness beantwortet, und waehrend des Drainings wird ueber deepseek
      bedient.

- [ ] **Externen Halter aufnehmen.** In `scripts/llm/loadouts.json` einen Eintrag fuer
      den Unsloth-Studio-Server anlegen: Port 45013, `exclusiveGroup: chat-gpu`,
      `managed: external`. In `loadouts.mjs` die Liveness externer Loadouts ueber Port
      und Prozess bestimmen statt ueber Unit-Status — die Auswertung darf an einem
      fehlenden Unit nicht scheitern. `findExclusiveConflict` muss den Eintrag danach
      genauso als Gruppenmitglied melden wie ein unit-gestuetztes Loadout.

- [ ] **Proxy-Tests ergaenzen.** `scripts/llm-proxy/gpu-lock.test.mjs` neu, plus
      Ergaenzungen in `loadouts.test.mjs` fuer den externen Eintrag. Konvention des
      Verzeichnisses: `node:test`, Funktionen werden aufgerufen und ihre Rueckgabe
      geprueft. Abgedeckt: gehaltener Lock nimmt llamacpp aus der Auswahl, tote PID gilt
      als kein Lock, unlesbare Datei gilt als Lock, Draining erzeugt keine
      unhealthy-Zeile, `findExclusiveConflict` meldet den externen Eintrag.

```bash
node --test scripts/llm-proxy/gpu-lock.test.mjs scripts/llm-proxy/loadouts.test.mjs
```

- [ ] **Taskfile verdrahten.** In `Taskfile.finetune.yml` umschliesst das `train`-Target
      den `train.py`-Aufruf mit `scripts/gpu-lock.sh acquire` und gibt den Lock per
      `trap` wieder frei — auch wenn das Training abbricht. Nach `release` werden die
      zuvor gestoppten Loadouts wieder gestartet.

- [ ] **Gruen sehen.** Beide Testebenen laufen durch:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/gpu-lock.bats
node --test scripts/llm-proxy/
```

- [ ] **Test-Inventar regenerieren.** Neue Testdateien bedeuten neue Eintraege; CI
      vergleicht die committete Datei gegen den Neulauf.

```bash
task test:inventory
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
