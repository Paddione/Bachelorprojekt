# Proposal: brain-ingest-loadout-swap

## Why

Der Brain-Ingest laeuft heute am eigens dafuer gebauten Loadout vorbei und laesst
gemessenen Durchsatz liegen:

1. `taskfiles/Taskfile.brain.yaml` setzt fuer `ingest:run`, `ingest:pilot` und
   `ingest:dry` den Default `LM_STUDIO_URL=http://127.0.0.1:8089` mit
   `LM_MODEL=gemma12-vision` — und **ueberschreibt damit eine bestehende
   Entscheidung**: `scripts/brain-ingest.sh:50` traegt bereits
   `LM_URL="${LM_STUDIO_URL:-http://localhost:8100}"`, und das Requirement
   "Loadout-Ports und lokale Port-Forwards sind disjunkt" verlangt ausdruecklich,
   dass Loadout, Skript-Default und Backend-Migration denselben Port nennen
   (Guard: `tests/spec/local-llm-proxy/brain-ingest-port.bats`). Der Guard prueft
   den Skript-Default, nicht den Taskfile-Override, und ist deshalb gruen,
   waehrend der tatsaechliche Lauf am Loadout vorbeigeht.

   Das Loadout `brain-ingest` auf Port 8100 traegt dasselbe Modell
   (Gemma 4 12B QAT), aber die fuer den Ingest gemessenen Parameter:
   `ctx 65536`, `q8_0` KV, `reasoningBudget: 0` und **kein** mmproj. Das
   Vision-Loadout auf 8089 haelt stattdessen 262144 Kontext mit `f16` KV und
   einen geladenen Vision-Head — beides ist fuer eine reine Text-Transformation
   belegter VRAM ohne Gegenwert.
2. Alle drei Tasks setzen `MAX_PARALLEL=1`, obwohl beide Loadouts mit
   `parallel: 3` laufen. Die Messung in `scripts/llm/loadouts.json`
   (`scripts/llm/measurements/2026-08-19-gemma12-slots.md`) nennt 307-489 tok/s
   gesamt bei drei Slots gegen 255 tok/s bei einem.
3. Ein Voll-Ingest laeuft ueber Stunden. Wechselt in dieser Zeit jemand das
   Loadout — ein Klick in der Proxy-UI, ein `curl` auf die Admin-Route, eine
   opencode-Session, die ihr Default-Modell startet — stirbt der Ingest mitten
   im Lauf, weil sein Backend unter ihm weggezogen wird. Die
   `exclusiveGroup`-Pruefung des Proxys verhindert das nicht: sie lehnt nur den
   *Start* eines zweiten Mitglieds ab, waehrend ein `stop` gefolgt von einem
   `start` jederzeit durchgeht.

Der vorhandene `scripts/gpu-lock.sh` loest 3 nicht. Seine Semantik ist "die GPU
ist fuer ein Training belegt, alle lokalen GPU-Backends sind tabu": er markiert
in `scripts/llm-proxy/gpu-lock.mjs` die Kinds `llamacpp` und `lmstudio` als
draining und stoppt beim `acquire` genau die `chat-gpu`-Gruppe, in der
`brain-ingest` selbst liegt. Ein Ingest, der diesen Lock nimmt, sperrt sich
selbst aus.

## What

Ein neuer **Loadout-Pin** im `llm-proxy` und ein **Swap-Wrapper** um den
Ingest-Task.

**Pin (Proxy).** Neue Routen `POST /admin/loadouts/pin`,
`DELETE /admin/loadouts/pin` und `GET /admin/loadouts/pin`. Ein gehaltener Pin
nennt Slug, Besitzer-PID, Grund und ein Token. Solange er haelt, antworten
`POST /admin/loadouts/<slug>/start` und `/stop` allen Aufrufern ohne gueltiges
Token mit `423` und dem Code `locked_by_pin`. Der Pin ist an die Besitzer-PID
gebunden und wird — wie der GPU-Lock — verworfen, sobald diese PID nicht mehr
lebt; das verhindert, dass ein abgestuerzter Ingest die Modellwahl dauerhaft
einfriert. Unlesbarer oder unparsbarer Pin-Zustand gilt als gehalten
(fail-closed, analog `gpu-lock.mjs`).

**Swap-Wrapper (`scripts/brain-ingest-swap.sh`).** Er umschliesst den
bestehenden `scripts/brain-ingest.sh` und macht in dieser Reihenfolge:

1. Aktuell laufendes `chat-gpu`-Loadout aus `GET /admin/loadouts/status`
   (`running: true`) merken.
2. Pin auf `brain-ingest` setzen.
3. Bounded drain auf `inflight == 0` ueber `GET /admin/state` — dieselbe
   Mechanik wie `gpu-lock.sh` `_poll_inflight_zero`, mit Deckel. Laufende
   Requests werden nicht abgebrochen. Laeuft die Frist ab, bricht der Swap ab,
   loest den Pin und startet den Ingest gar nicht erst.
4. Fremdes Loadout stoppen, `brain-ingest` starten, auf Gesundheit warten.
5. Ingest mit `LM_STUDIO_URL=http://127.0.0.1:8100`, `LM_MODEL=gemma-4-12b-qat`
   und `MAX_PARALLEL=3` ausfuehren.
6. In einem `trap`, der auf `EXIT`, `INT` und `TERM` greift: `brain-ingest`
   stoppen, das gemerkte Loadout wieder starten, Pin loesen. Die
   Wiederherstellung laeuft auch dann, wenn der Ingest mit Fehler endet oder der
   Operator abbricht.

Die drei `brain:ingest:*`-Tasks rufen kuenftig den Wrapper. Die bisherigen
Env-Defaults bleiben ueberschreibbar, damit ein Lauf gegen ein anderes Backend
weiterhin moeglich ist.

**Ersetzte Entscheidung:** T013042 ("default Brain ingest tasks to local Gemma settings") hatte
die sieben Task-Defaults eingefuehrt, abgesichert durch
`tests/spec/brain-ingest-task-defaults.bats`. Der Zweck war Bequemlichkeit — Aufrufer sollten die
funktionierenden lokalen Einstellungen nicht wiederholen muessen —, und die Werte wurden dafuer
vom damaligen Ist-Zustand abgeschrieben, mitsamt des Port-Widerspruchs. Drei davon entfallen hier
(`LM_STUDIO_URL`, `LM_MODEL`, `MAX_PARALLEL`); die Zusicherung, dass vorgesetzte Werte gegen jeden
Default gewinnen, bleibt und wird weiterhin geprueft.

**Nicht Teil dieser Aenderung:** die Wahl des Ingest-Modells selbst
(Gemma 4 12B QAT bleibt, belegt durch den Spike in T012905) und ein
Cloud-Fallback fuer den Ingest.

_Ticket: T013593_
