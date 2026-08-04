---
ticket_id: T002628
plan_ref: openspec/changes/gpu-arbitrierung-trainings-vorrang/tasks.md
status: active
date: 2026-08-04
---

# Design: gpu-arbitrierung-trainings-vorrang

_Ticket: T002628_

## Leitgedanke

Das Ticket beschreibt „Draining", aber Draining ist nur die halbe Bewegung. Ein Backend,
das keine neuen Anfragen mehr annimmt, haelt seine Gewichte weiterhin im VRAM. Wer davon
ausgeht, die GPU sei danach frei, hat sie lediglich stillgelegt. Der Vorgang besteht
deshalb aus zwei getrennten Schritten mit zwei getrennten Zwecken: **Draining schuetzt
den laufenden Request**, **Stop schafft den Speicher**. Und die einzige ehrliche
Erfolgsmeldung ist eine Messung, keine Zaehlung gestoppter Units.

## Vorhandene Bausteine

Der Change baut ueberwiegend auf Bestehendem auf. Wer ihn umsetzt, sollte zuerst diese
fuenf Stellen kennen:

| Baustein | Ort | Wofuer |
|---|---|---|
| Prioritaetskette | `tickets.llm_proxy_backends` | lokale Backends prio 1, `deepseek` prio 2 — der Fallback ist bereits gebaut |
| `inflightOf(name)` | `scripts/llm-proxy/slot-queue.mjs` | sagt, ob noch ein Request laeuft |
| `/admin/state` | `scripts/llm-proxy/server.mjs` | gibt `inflight` je Backend bereits aus |
| `exclusiveGroup: chat-gpu` | `scripts/llm/loadouts.json` | fasst alle sechs GPU-Loadouts zusammen |
| `findExclusiveConflict` | `scripts/llm-proxy/loadouts.mjs` | laut T002616 die EINE geteilte Konfliktdefinition |

Neu sind im Kern nur: die Lock-Datei, ihre Auswertung im Proxy, der `draining`-Zustand
und die VRAM-Messung.

## Komponenten

```
scripts/gpu-lock.sh                    acquire | release | status
scripts/llm-proxy/gpu-lock.mjs         Lock lesen, PID-Liveness, betroffene Backends
scripts/llm-proxy/discovery.mjs        draining als dritter Zustand in der Auswahl
scripts/llm-proxy/server.mjs           /admin/state um draining erweitern; /health bleibt gruen
scripts/llm-proxy/loadouts.mjs         externe Loadouts: Liveness ueber Port statt Unit
scripts/llm/loadouts.json              Eintrag fuer den Studio-Server
Taskfile.finetune.yml                  train-Target mit acquire + trap-release
```

## Ablauf von `acquire`

```
1. Lock schreiben              {pid, started_at, reason}
2. Auslaufen lassen            warten bis inflightOf(kind=llamacpp) == 0
                               kappt nichts; gedeckelt, damit es nicht ewig haengt
3. Stoppen                     Loadouts der Gruppe chat-gpu ueber /admin/loadouts/<slug>/stop
4. MESSEN                      freies VRAM per nvidia-smi
5. Entscheiden                 genug  -> Erfolg, Lock bleibt
                               zu wenig -> Abbruch, Halter benennen, Lock freigeben
```

Schritt 4 ist der Kern. Alle Loadouts laufen mit `--fit on`; der Kommentar in
`loadouts.mjs` haelt fest, dass `--fit` still Layer ins RAM auslagert. Ohne Messung
scheitert ein zu grosses Training also nicht sichtbar, sondern wird zaeh — und das faellt
erst Stunden spaeter am Durchsatz auf. Eine Erfolgsmeldung aus Schritt 3 waere eine
Meldung ohne Deckung.

## Warum `draining` ein eigener Zustand ist

Nicht `unhealthy` wiederverwenden. `unhealthy` bedeutet gestoert und zieht einen Backoff
sowie eine Log-Zeile nach sich, deren Wiederholung T002638 gerade eingedaemmt hat.
Draining bedeutet absichtlich frei. Wer spaeter ins Log sieht, muss „ich trainiere
gerade" von „das Backend ist kaputt" unterscheiden koennen — sonst wird aus dem
Arbitrierungs-Mechanismus eine Fehlerquelle in der Diagnose.

Die Auswahl der betroffenen Backends laeuft ueber `kind`, nicht ueber Namen. Ein spaeter
hinzugefuegtes lokales Backend ist damit automatisch erfasst; eine Namensliste waere
genau die Sorte handgepflegter Aufzaehlung, die still veraltet.

`/health` bleibt gruen. Der Kommentar in `server.mjs` legt fest, dass `/health` Readiness
beantwortet — „kann ich bedient werden". Waehrend des Drainings kann bedient werden, ueber
deepseek. Ein rotes `/health` waere genau die Taeuschung, die dieser Kommentar verhindern
will.

## Der externe Halter

Der groesste VRAM-Halter ist ein `llama-server` aus `~/.unsloth/llama.cpp/` auf Port
45013 — ein Kind von `unsloth studio -p 8888`, laufend im `/init.scope`. Er hat keine
systemd-Unit, und das Loadout-System steuert heute ausschliesslich `llama-<slug>.service`.

Er wird als Loadout mit `managed: external` aufgenommen. Zwei Konsequenzen:

1. **Liveness ueber Port und Prozess** statt ueber Unit-Status. `loadouts.mjs` darf an
   einem fehlenden Unit nicht scheitern.
2. **Kein Signal aus dem Lock-Pfad.** Beendet wird er, wenn ueberhaupt, ueber die
   Studio-API auf `:8888`. Ob diese das hergibt, ist im Plan ein ausdruecklicher
   Pruefschritt — nicht angenommen. Gibt sie es nicht her, bricht `acquire` ab und nennt
   ihn. Ein Halter, den das Werkzeug nicht besitzt, wird gemeldet und nicht getoetet:
   sonst zieht ein Trainingsstart einem laufenden Studio-Chat den Boden weg.

   **Pruefschritt-Ergebnis (2026-08-04):** Die Studio-API auf `:8888` ist dokumentiert
   (`/openapi.json`, `Unsloth UI Backend`), aber jeder `/api/inference/*`-Endpunkt
   verlangt Authentifizierung (`{"detail":"Not authenticated"}`). Einen anonymen,
   geordneten Stop des Inferenz-Servers gibt es nicht; `/api/inference/cancel` wirkt
   nur auf aktive Generationen, nicht auf den Serverprozess. Der `llama-server` selbst
   auf `:45013` beantwortet `POST /shutdown` mit 404. **Konsequenz: Es bleibt beim
   Melden — `acquire` sendet kein Signal an den externen Halter, sondern bricht ab und
   nennt ihn (PID, Port, Modell), wenn das VRAM nach dem Stoppen der Managed Loadouts
   nicht reicht.**

## Fehlerbehandlung

| Fall | Verhalten | Warum |
|---|---|---|
| Lock-Datei unlesbar | gilt als gesetzt, laute Meldung | fail-closed kostet Deepseek-Tokens; fail-open kostet einen mehrstuendigen Trainingslauf |
| PID tot | Lock verworfen, Datei entfernt | ein abgestuerztes Training darf die GPU nicht dauerhaft blockieren |
| Auslauf-Deckel erreicht | Abbruch, Lock freigegeben | die Wahl war „nichts kappen" — also scheitert der Start, nicht der Request |
| VRAM reicht nicht | Abbruch, Halter benannt, Lock freigegeben | ein Abbruch mit Namen ist brauchbar, ein CUDA-OOM zwei Minuten spaeter nicht |
| `nvidia-smi` fehlt | Abbruch mit klarer Meldung | ohne Messung gibt es keine belastbare Aussage; raten waere schlimmer als scheitern |

## Tests

Der Proxy testet mit `node:test` (`*.test.mjs` neben der Quelle) — dieser Konvention
folgen die neuen Proxy-Tests. `scripts/gpu-lock.sh` bekommt BATS-Tests unter
`tests/spec/local-llm-proxy/`, nach der Verzeichniskonvention aus T002416 in einer
eigenen Datei.

Beide Ebenen pruefen Verhalten, nicht Quelltext (T002448-M4): die Skript-Tests rufen
`gpu-lock.sh` auf und pruefen `$status` und Dateizustand, die Proxy-Tests rufen die
Auswahlfunktionen mit gesetztem Lock auf und pruefen das gewaehlte Backend. Damit das
ohne echte GPU und ohne echten Lock geht, sind Lock-Pfad und VRAM-Abfrage ueber
Umgebungsvariablen ueberschreibbar.

## Abgrenzung

Nicht Teil dieses Change: die Modell-Registry (E6, T002629), weitere GPU-Verbraucher wie
ComfyUI, ein Umbau von Unsloth Studio selbst, und jede Aenderung an den
Embedding-Loadouts — `bge-embed-cpu` und `bge-rerank-cpu` stehen in der Gruppe `bge-cpu`
und halten kein VRAM. Deshalb entsteht auch keine Fallback-Frage, die ADR-004 beruehrt.
