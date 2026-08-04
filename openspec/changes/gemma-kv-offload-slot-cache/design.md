---
ticket_id: T002482
plan_ref: openspec/changes/gemma-kv-offload-slot-cache/tasks.md
status: active
date: 2026-08-03
---

# Design: KV-Offload + Slot-Save/Restore fuer Guardrail-Caches (T002482)

## Purpose

`scripts/llm/start-gemma-server.ps1` startet den Gemma-4-12B-Server auf :8091 heute mit KV-Cache
komplett im VRAM. Zwei Faehigkeiten des llama.cpp-Builds bleiben ungenutzt:

1. **KV im CPU-RAM** (`-nkvo` / `--no-kv-offload`) — gibt VRAM frei, das der Sockel (Gewichte,
   MTP-Head, mmproj-Tower, Compute-Buffer) sonst mit dem KV-Cache teilen muss.
2. **Persistente Slot-Caches** (`--slot-save-path` + `POST /slots/{id}?action=save|restore`) —
   der fixe Guardrail-Praefix (AGENTS.md-Regeln, Toolset-Block) bleibt ueber Ticketgrenzen
   hinweg erhalten, statt bei jedem Factory-Lauf neu geprefillt zu werden.

Beides ist der erste Implementierungs-Baustein des Epics T002370 (slot-gebundener Kontextraum);
die Slot-Kopplung an `pipeline_slot` ist ausdruecklich ein anderes Kind-Ticket.

## Verifizierte Ausgangslage (2026-08-03)

- Der eingesetzte Fork-Build kennt beide Flags. Beleg aus `llama-server.exe --help` desselben
  Builds (`C:\Users\PatrickKorczewski\llama-bonsai-cuda13.3\bin`):
  - `-kvo, --kv-offload, -nkvo, --no-kv-offload`
  - `--slot-save-path PATH   path to save slot kv cache (default: disabled)`
  - zusaetzlich vorhanden und fuer Punkt 2 relevant: `--swa-full`, `-ctxcp/--ctx-checkpoints`.
- `scripts/llm/start-gemma-server.ps1` ist 329 Zeilen, reines ASCII, CRLF-Zeilenenden.
- `scripts/llm/kv-budget.sh` modelliert die RAM/VRAM-Rechnung bereits inklusive
  `--no-kv-offload`. Die Inline-Schaetzung im PowerShell-Skript (`$needMiB`) muss dieselbe
  Fallunterscheidung treffen, damit beide Rechner nicht auseinanderlaufen.
- Die bestehenden Guards fuer dieses Skript liegen in `tests/spec/llm-pipeline.bats`
  (grep-basiert, Zeilen 493-592). Neue Guards gehoeren laut T002416 in ein eigenes
  Verzeichnis: `tests/spec/llm-pipeline/kv-offload.bats`.

## Offene technische Frage, die der Plan zuerst klaert

Gemma 4 nutzt Sliding-Window-Attention (1024er-Fenster; im Skriptkopf dokumentiert). In
llama.cpp ist die Serialisierung eines Sequenz-States bei SWA-Modellen eingeschraenkt — der
uebliche Ausweg ist `--swa-full` (voller SWA-Cache statt Ringpuffer), was aber zusaetzlichen
Speicher kostet. Ob dieser Build Slot-Save mit SWA ohne `--swa-full` beherrscht, ist aus dem
Hilfetext nicht ableitbar und liess sich auch nicht aus dem Binary belegen.

**Konsequenz fuer den Plan:** Der erste Task ist eine Kapabilitaets-Probe am Live-Host mit
schriftlich festgehaltenem Ergebnis. Erst danach steht fest, ob `-SlotSavePath` allein reicht
oder `-SwaFull` als gekoppelter Schalter noetig ist. Der Plan schreibt die Probe als
Entscheidungs-Gate, nicht als Formalie — die Alternative waere, eine Annahme zu implementieren
und sie erst im Betrieb zu widerlegen.

## Entwurfsentscheidungen

### E1 — Zwei getrennte Schalter statt eines Profils

`-KvOffload` (Switch, Default aus) und `-SlotSavePath` (String, Default leer = aus) sind
unabhaengig. Begruendung: die beiden Faehigkeiten loesen verschiedene Probleme (VRAM-Druck vs.
Prefill-Kosten) und haben verschiedene Risiken. Ein kombiniertes `-GuardrailProfile` haette sie
gekoppelt und die Regression von Akzeptanzkriterium 3 schwerer nachweisbar gemacht.

Trade-off: zwei Schalter mehr in einem Skript, das schon acht Parameter hat. Akzeptiert, weil
beide echte Betriebsmodi abbilden und einzeln abschaltbar bleiben muessen.

### E2 — Default bleibt der VRAM-Pfad

Beide Schalter sind per Default aus. Ohne sie muss `$Params` unveraendert bleiben. Das ist die
Bedingung, unter der die bestehenden Guards in `tests/spec/llm-pipeline.bats` gruen bleiben und
das Loadout `gemma-factory` in `scripts/llm/loadouts.json` unberuehrt bleibt.

### E3 — Die VRAM-Warnung muss den Modus kennen

Der Block um `$needMiB` addiert heute `$Ctx * $perTokMiB` auf den Sockel. Mit `-KvOffload`
wandert genau dieser Anteil in den Host-RAM. Bliebe die Rechnung unveraendert, warnte das Skript
im KV-Offload-Modus vor VRAM-Mangel, den es gerade beseitigt — eine Fehlwarnung, die den Modus
unbrauchbar erscheinen liesse. Also: bei `-KvOffload` faellt der KV-Term aus der VRAM-Rechnung
heraus und erscheint stattdessen als CPU-RAM-Hinweis.

### E4 — Slot-Save ist eine Server-Faehigkeit, kein Skript-Workflow

Das Skript aktiviert `--slot-save-path` und legt das Verzeichnis an; das Speichern und
Wiederherstellen selbst geschieht per REST durch den Aufrufer. Das Skript bekommt **keinen**
Save/Restore-Client. Begruendung: der Zeitpunkt des Speicherns haengt am Factory-Lebenszyklus,
nicht am Serverstart; ein Client im Startskript waere an der falschen Stelle. Die Aufrufsequenz
gehoert als dokumentierter Ablauf in den `.DESCRIPTION`-Block.

### E5 — Pruefmodus der Tests: statisches Grep, bewusst und dokumentiert

Die Repo-Konvention verlangt Output-Verifikation (T002448-M4). Sie ist hier nicht erreichbar:
`start-gemma-server.ps1` laeuft nur unter Windows-PowerShell auf dem GPU-Host, CI laeuft auf
Linux ohne PowerShell und ohne GPU. Der Ausnahmefall "Ergebnis manifestiert sich ausschliesslich
im Quelltext" greift, und die Testdatei dokumentiert das im Kopfkommentar — so schreibt es die
Konvention selbst vor. Jeder Negativtest bekommt einen Positiv-Anker im selben `@test`
(T002356-M1), sonst besteht er vakuos, solange die Implementierung fehlt.

Die Laufzeit-Akzeptanzkriterien 1 und 2 des Tickets werden dadurch nicht von BATS abgedeckt.
Sie werden als manueller Verifikations-Runbook-Task am GPU-Host gefahren und mit gemessenen
Zahlen im Ticket-Kommentar belegt.

### E6 — Randbedingung Kodierung

`.ps1`-Dateien im Repo sind CRLF und muessen reines ASCII bleiben: PowerShell 5.1 liest UTF-8
ohne BOM als CP1252, ein Em-Dash wird dann zu Mojibake. BATS-Regexes duerfen deshalb nicht auf
`$` ankern — `\r` zaehlt zu `[[:space:]]`, also `[[:space:]]*$` verwenden. Beides gehoert in den
Plan, nicht in die Erinnerung des Implementierers.

## Ergebnis der Kapabilitaets-Probe

Durchgefuehrt 2026-08-04 auf dem GPU-Host (WSL2, RTX 5070 Ti, 16 GiB VRAM). Der im Plan
genannte Bonsai-Build (`llama-bonsai-cuda13.3`) ist auf dem Host nicht mehr vorhanden; die Probe
wurde mit dem lokalen Upstream-Build `llama.cpp` (Commit 22dc605) und dem Modell
`gemma-4-12b-it-Q4_K_M.gguf` gefahren. Relevant ist die llama.cpp-Core-Faehigkeit
(SWA-State-Serialisierung), nicht die Build-Variante. Probe-Konfiguration: `-c 4096`,
`--slot-save-path /tmp/kv-probe-slots`, `-np 1`, `--jinja`, CPU-only (VRAM war durch den
Unsloth-Studio-Server belegt); Testserver auf Port 8094, Produktivserver :8091 unberuehrt.

Rohausgabe, Durchgang 1 (ohne `--swa-full`):

    POST /slots/0?action=save    -> 200, {"n_saved":523,"n_written":179961312}
    POST /slots/0?action=restore -> 200, {"n_restored":523,"n_read":179961312}
    Zweiter Completion-Call mit identischem Prompt:
      usage.prompt_tokens_details.cached_tokens = 0
      prompt eval time = 3384 ms / 374 tokens   (voller Re-Prefill)

Rohausgabe, Durchgang 2 (mit `--swa-full`):

    POST /slots/0?action=save    -> 200, {"n_saved":523,"n_written":179961312}
    POST /slots/0?action=restore -> 200, {"n_restored":523,"n_read":179961312}
    Zweiter Completion-Call mit identischem Prompt:
      usage.prompt_tokens_details.cached_tokens = 373 von 374
      prompt eval time = 261 ms / 1 token       (kein Re-Prefill)

**Eingetretener Fall: Zeile 2 der Gate-Tabelle.** Save/Restore laufen zwar in beiden Durchgaengen
fehlerfrei durch (HTTP 200, n_saved == n_restored), aber nur mit `--swa-full` wird der
wiederhergestellte KV-Zustand beim Folge-Call als Cache-Treffer genutzt: ohne `--swa-full`
re-evaluiert der Server den kompletten Prompt (cached_tokens=0), mit `--swa-full` bleiben 373 von
374 Tokens gecacht. Das Ticket-Akzeptanzkriterium 2 ("Kontext ohne Re-Prefill vorhanden") ist
also NUR mit `--swa-full` erfuellt. Ursache ist die in llama.cpp dokumentierte Einschraenkung der
Sequenz-State-Serialisierung bei SWA-Modellen (Ringpuffer vs. voller Cache).

**Konsequenz fuer Task 4:** `-SlotSavePath` wird zusammen mit `-SwaFull` implementiert; beide
Schalter sind gekoppelt — `-SlotSavePath` ohne `-SwaFull` bricht mit erklaerender Meldung ab
(fail-loud statt eines Servers, der Save-Aufrufe erst zur Laufzeit ins Leere laufen laesst).

**Hinweis:** Die Laufzeit-Akzeptanz (Akzeptanzkriterium 1: VRAM-Differenz ~1,9 GB) und die
Regression (Akzeptanzkriterium 3) bleiben wie im Plan vorgesehen der manuellen Verifikation in
Task 5 vorbehalten.

## Abgrenzung

- Keine Aenderung an `pipeline_slot` oder der Slot-Kopplung (eigenes Kind-Ticket von T002370).
- Keine Aenderung der KV-Quantisierung; `q4_0` bleibt Default (T002296).
- Keine Aenderung an `scripts/llm/loadouts.json` — der Linux-Loadout-Pfad bekommt die Schalter
  erst, wenn die Probe aus Task 1 sie als tragfaehig ausweist.
- Kein Save/Restore-Client im Startskript (siehe E4).

## Akzeptanz (aus dem Ticket, unveraendert uebernommen)

1. Server startet mit `-KvOffload` bei grossem Kontext und `q4_0`; `/props` meldet healthy, die
   VRAM-Belegung sinkt um den KV-Anteil.
2. Guardrail-Prompt laden, Slot speichern, Slot wiederherstellen — Kontext ist ohne Re-Prefill
   vorhanden.
3. Start ohne die neuen Schalter verhaelt sich unveraendert.
4. `task test:changed` und die BATS-Guards sind gruen.
