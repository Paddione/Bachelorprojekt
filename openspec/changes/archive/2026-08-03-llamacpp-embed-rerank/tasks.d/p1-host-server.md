# p1 — Host-Server, Persistenz und Äquivalenzmessung

**Rolle:** impl
**target_files:** `scripts/llm/start-embed-server.ps1`, `scripts/llm/start-rerank-server.ps1`,
`scripts/llm/start-bonsai-server.ps1`, `scripts/llm/register-scheduled-tasks.ps1`,
`scripts/llm/measure-embedding-equivalence.mjs`, `scripts/llm-host-setup.sh`, `Taskfile.llm.yml`

Alle Dateien bis auf `scripts/llm-host-setup.sh` (Ist 80, Budget 420) sind neu. PowerShell-Dateien
unterliegen keinem S1-Extension-Limit; `measure-embedding-equivalence.mjs` hat als `.mjs`-Datei
ein Limit von 500 Zeilen und wird mit deutlicher Reserve darunter geschnitten.

## Task 1.1 — Startskript für den Embedding-Server

Neu: `scripts/llm/start-embed-server.ps1`.

Der Skriptinhalt startet `llama-server.exe` aus dem neuesten Build. Der Binärpfad ist
`C:\Users\PatrickKorczewski\llama-b10090-13.3\llama-server.exe` — in diesem Build liegt die
Executable **flach im Wurzelverzeichnis**, nicht unter `bin\` wie bei `llama-b9957-cuda13.3`.

Verbindliche Parameter:

| Parameter | Wert | Begründung |
| --- | --- | --- |
| `-m` | `C:\Users\PatrickKorczewski\.lmstudio\models\gpustack\bge-m3-GGUF\bge-m3-Q8_0.gguf` | vorhandene Q8_0-Datei |
| `--embedding` | gesetzt | schaltet den Embedding-Modus frei |
| `--pooling` | `cls` | **zwingend** — der abgelöste TEI meldet `pooling: cls`; ohne das Flag greift der GGUF-Modell-Default |
| `--embd-normalize` | `2` (Default, explizit setzen) | L2, deckt sich mit `normalize: true` des TEI |
| `-c` | `8192` | entspricht `max_input_length` des TEI |
| `-ngl` | aus `$env:LLM_EMBED_NGL`, Default `99` | VRAM-Notausstieg: `0` legt das Modell auf CPU-RAM |
| `-fa` | `on` | Flash Attention |
| `--host` | `0.0.0.0` | direkte Erreichbarkeit über wg-gpu, kein socat |
| `--port` | `8095` | |

Das Skript liest `LLM_EMBED_NGL` mit Default `99` und reicht den Wert an `-ngl` durch. Es
offloadet **nicht** automatisch bei VRAM-Druck — automatisches Offloading würde die Latenz ohne
Vorwarnung um Größenordnungen verschlechtern.

**Step:** Skript ausführen und den Endpunkt prüfen:

```bash
curl -s http://127.0.0.1:8095/v1/embeddings \
  -H 'Content-Type: application/json' \
  -d '{"model":"bge-m3","input":["Hallo Welt"]}' | jq '.data[0].embedding | length'
# erwartet: 1024
```

## Task 1.2 — Startskript für den Rerank-Server

Neu: `scripts/llm/start-rerank-server.ps1`.

Zweiter, getrennter Prozess — llama.cpp kann Embedding-Pooling (`CLS`) und Rerank-Pooling (`RANK`)
nicht in einem Server bedienen.

| Parameter | Wert |
| --- | --- |
| `-m` | `C:\Users\PatrickKorczewski\.lmstudio\models\gpustack\bge-reranker-v2-m3-GGUF\bge-reranker-v2-m3-Q8_0.gguf` |
| `--reranking` | gesetzt |
| `-c` | `8192` |
| `-ngl` | aus `$env:LLM_RERANK_NGL`, Default `99` |
| `-fa` | `on` |
| `--host` | `0.0.0.0` |
| `--port` | `8096` |

Dieses Skript setzt **kein** `--embedding` und **kein** `--pooling`.

**Step:** Endpunkt prüfen:

```bash
curl -s http://127.0.0.1:8096/v1/rerank \
  -H 'Content-Type: application/json' \
  -d '{"model":"bge-reranker-v2-m3","query":"capital of germany","documents":["paris","berlin","hamburg","munich"]}' \
  | jq '.results | sort_by(-.relevance_score) | .[0].index'
# erwartet: 1  (berlin)
```

## Task 1.3 — Startskript für den Bonsai-Server mit vier Slots

Neu: `scripts/llm/start-bonsai-server.ps1`. Der Server läuft heute ohne Skript rein aus der
Shell-History mit:

```
-m …\Ternary-Bonsai-8B-TQ2_0.gguf -c 65536 -np 1 --cache-ram 24576 -ngl 99 -fa on
-ctk q4_0 -ctv q4_0 --jinja --temp 0.7 --top-p 0.95 --top-k 20 --min-p 0
--host 0.0.0.0 --port 8093
```

Das Skript übernimmt diese Parameter, hebt `-np` auf `4` und `-c` auf den gemessenen Zielwert.
llama.cpp teilt `-c` gleichmäßig auf die Slots auf — `-np 4` bei `-c 65536` ergäbe nur 16k pro
Slot und würde Factory-Prompts von rund 37k abschneiden. Mindestanforderung: `-c / 4 >= 32768`,
also `-c >= 131072`.

**Step — VRAM-Messreihe.** Der konkrete `-c`-Wert wird gemessen, nicht geschätzt:

1. Nach Start der Server aus 1.1 und 1.2 die Belegung erfassen:
   ```bash
   /mnt/c/Windows/System32/nvidia-smi.exe --query-gpu=memory.used,memory.free --format=csv
   ```
2. Bonsai mit `-np 4` und `-c 131072` starten, Belegung messen. Bei ausreichender Reserve auf
   `196608`, danach auf `262144` erhöhen und jeweils erneut messen.
3. Das größte `-c` wählen, bei dem die Gesamtbelegung **≤ 15000 MiB** bleibt (rund 1300 MiB
   Reserve auf den 16303 MiB der RTX 5070 Ti).
4. Den gewählten Wert samt Messreihe als Kommentar im Skript festhalten.

Rollback ist ein Ein-Zeilen-Rücksprung auf `-np 1 -c 65536`.

## Task 1.4 — Äquivalenzmessung gegen den alten TEI-Endpunkt

Neu: `scripts/llm/measure-embedding-equivalence.mjs`.

Das Skript schickt ein fixes Textsample durch beide Endpunkte und berechnet die paarweise
Kosinus-Ähnlichkeit. Anforderungen:

- Mindestens 20 Texte, gemischt deutsch und englisch, kurze und lange Passagen.
- Alter Endpunkt: `POST http://127.0.0.1:9081/embed` mit `{"inputs": [...]}` (TEI-Dialekt).
- Neuer Endpunkt: `POST http://127.0.0.1:8095/v1/embeddings` mit `{"model","input"}`.
- Ausgabe: Mittelwert, Minimum und Anzahl der Paare unterhalb `0.99`.
- Exit-Code `0` bei Mittelwert `>= 0.99`, sonst `1`.
- Beide Endpunkt-URLs über Umgebungsvariablen überschreibbar, damit das Skript auch nach dem
  Abschalten des TEI gegen zwei beliebige Endpunkte laufen kann.

**Step:**

```bash
node scripts/llm/measure-embedding-equivalence.mjs
```

**Gate:** Bei Mittelwert `>= 0.99` geht es mit p3 weiter. Liegt der Wert darunter, wird der
Cutover **nicht** durchgeführt: `LLM_EMBED_URL` bleibt auf dem TEI-Service, das Messergebnis wird
in `design.md` festgehalten, und es wird ein Folgeticket für den pgvector-Reindex angelegt. Der
TEI-Container bleibt in jedem Fall laufen, bis diese Messung bestanden ist — er ist bis dahin die
einzige Referenz.

## Task 1.5 — Registrierung der Scheduled Tasks

Neu: `scripts/llm/register-scheduled-tasks.ps1`.

Registriert je einen Windows Scheduled Task für die drei Server aus 1.1 bis 1.3:

- Trigger: `At system startup`
- Principal: `RunAs SYSTEM`, `RunLevel Highest`
- Settings: `RestartCount 3`, `RestartInterval PT1M`
- **Idempotent:** vorhandene Tasks werden erkannt und aktualisiert statt dupliziert; ein zweiter
  Lauf endet erfolgreich ohne Doppeleinträge.

Auf dem Host existiert heute keinerlei Autostart — kein Scheduled Task, kein Dienst, kein
Startup-Eintrag. Ohne diesen Schritt wäre die Verfügbarkeit nach dem Umzug schlechter als beim
bisherigen systemd-verwalteten TEI-Docker.

**Step:** Registrierung ausführen, dann ein zweites Mal ausführen und prüfen, dass keine
Duplikate entstehen:

```bash
/mnt/c/Windows/System32/schtasks.exe /query /fo LIST | grep -ci 'llama'
```

Anschließend Reboot-Test: Host neu starten und prüfen, dass `:8093`, `:8095` und `:8096` ohne
manuellen Eingriff antworten.

## Task 1.6 — `scripts/llm-host-setup.sh` auf llama.cpp umstellen

`scripts/llm-host-setup.sh` — Ist 80 Zeilen, Budget 420.

Der TEI-Docker-Abschnitt (Image `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9`, HF-Cache
`/var/lib/llm/hf-cache`, Ports `9081`/`9083`) wird durch einen Verweis auf die neuen PS1-Skripte
und die Scheduled-Task-Registrierung ersetzt. Die socat-Einrichtung entfällt vollständig, da beide
neuen Server direkt auf `0.0.0.0` binden.

## Task 1.7 — Neue Skripte im Taskfile verankern (S4)

`Taskfile.llm.yml` enthält bereits `bootstrap-host`, `preload-embeddings`, `status`,
`proxy:start` und weitere Einstiegspunkte.

Das S4-Gate (`scripts/code-quality/gates/s4-orphans.mjs`) verlangt, dass jedes neue Skript unter
`scripts/` von Taskfile, CI, Dokumentation oder einem anderen Skript aus erreichbar ist. Ohne
diesen Schritt wären `measure-embedding-equivalence.mjs` und die vier PS1-Skripte Orphans.

Zu ergänzen sind Einstiegspunkte für:

- die Äquivalenzmessung (`node scripts/llm/measure-embedding-equivalence.mjs`)
- die Scheduled-Task-Registrierung (Aufruf von `register-scheduled-tasks.ps1`)

Die drei Startskripte werden zusätzlich von `scripts/llm-host-setup.sh` (Task 1.6) referenziert.

## Task 1.8 — Host-Aufräumung (Runbook, kein Repo-Diff)

Erst **nach** bestandenem Gate aus 1.4 und erfolgreichem Cutover aus p3:

```bash
sudo systemctl disable --now tei-embed tei-rerank tei-socat tei-rerank-socat lmstudio-socat
docker rm -f $(docker ps -q --filter 'ancestor=ghcr.io/huggingface/text-embeddings-inference:cpu-1.9')
```

Diese Schritte werden in `design.md` als Cutover-Runbook dokumentiert, nicht als Code committet.
