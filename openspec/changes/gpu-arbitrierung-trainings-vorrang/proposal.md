# Proposal: gpu-arbitrierung-trainings-vorrang

## Why

Die 16 GB VRAM der RTX 5070 Ti tragen Training und Inferenz nicht gleichzeitig. Heute
gibt es keine Arbitrierung: ein Trainingslauf startet in eine Karte hinein, auf der die
Inferenz-Backends bereits ihre Gewichte halten. Gemessen am 2026-08-04 waren 15.521 von
16.303 MiB belegt, ohne dass ein Trainingslauf lief.

Die Entscheidung aus Grilling G2 lautet: Training hat Vorrang, ein Trainingslauf wird
niemals von einem Factory-Tick unterbrochen. Es fehlt der Mechanismus, der das durchsetzt.

**Was bereits existiert und nicht neu gebaut werden muss.** Die Backend-Registry
(`tickets.llm_proxy_backends`) fuehrt lokale Backends auf Prioritaet 1 und `deepseek`
(`kind=openai-remote`) auf Prioritaet 2. Fallen die lokalen weg, greift die vorhandene
Prioritaetskette von selbst — der API-Fallback ist gebaut. `inflightOf()` weiss pro
Backend, wie viele Anfragen laufen; `/admin/state` gibt das bereits aus. Die
Exklusivgruppe `chat-gpu` in `scripts/llm/loadouts.json` fasst alle sechs GPU-Loadouts
zusammen, und `findExclusiveConflict` ist laut T002616 die eine geteilte Definition von
Konflikt.

**Was fehlt, ist das kontrollierte Raeumen — und zwar echtes Raeumen.** Ein Backend, das
keine neuen Anfragen mehr annimmt, haelt seine Gewichte weiterhin im VRAM. Draining
allein verschafft einem Training null Speicher. Noetig ist der Stopp der Loadouts, und
die Erfolgsbedingung ist gemessenes freies VRAM, nicht die Zahl gestoppter Units.

**Der groesste Halter steht ausserhalb der Reichweite des Proxy.** Ein `llama-server` aus
`~/.unsloth/llama.cpp/` (gemma-4-26B, Port 45013, rund 14,4 GB) laeuft als Kind von
Unsloth Studio (`unsloth studio -p 8888`) im `/init.scope`, also nicht unter systemd. Er
steht in keinem Loadout und in keiner Backend-Zeile. Ein Lock, der nur die
Proxy-Loadouts stoppt, raeumt unter einem Gigabyte frei und laeuft anschliessend in einen
CUDA-OOM.

Erschwerend: alle Loadouts laufen mit `--fit on`. Der Kommentar in `loadouts.mjs` haelt
fest, dass `--fit` still Layer ins RAM auslagert. Zu wenig VRAM scheitert damit nicht
sichtbar, sondern wird zaeh — ein Fehlschlag, den man erst Stunden spaeter am Durchsatz
bemerkt.

## What

Ein Trainings-Lock, der die GPU nachweislich raeumt, und ein Proxy, der das geordnet
mittraegt.

**Lock und Raeumung.** `scripts/gpu-lock.sh` mit `acquire` / `release` / `status`. Die
Lock-Datei traegt `pid`, `started_at` und `reason`. `acquire` laeuft in fuenf Schritten:
Lock schreiben, laufende Anfragen auslaufen lassen (nichts wird gekappt), Loadouts der
Gruppe `chat-gpu` ueber den vorhandenen Stop-Weg beenden, freies VRAM messen, und bei
unzureichendem Speicher mit einer Meldung abbrechen, die den verbliebenen Halter samt
PID, Port und Modell benennt. Freigabe und Wiederanlauf ueber `release`, im Taskfile per
`trap` gebunden.

**Draining im Proxy.** `draining` wird ein eigener Zustand neben `healthy` und
`unhealthy` — kein Backoff, kein `unhealthy`-Log (das T002638 gerade eingedaemmt hat),
eine eigene Uebergangszeile. Der Unterschied ist beabsichtigt-frei gegenueber gestoert,
und wer spaeter ins Log sieht, muss beides unterscheiden koennen. `/health` bleibt gruen,
solange irgendein Backend bedienen kann: der Kommentar in `server.mjs` legt fest, dass
`/health` Readiness beantwortet, und waehrend des Drainings kann bedient werden — ueber
deepseek.

**Der externe Halter wird aufgenommen.** Der Studio-Server bekommt einen Eintrag in
`loadouts.json` mit `exclusiveGroup: chat-gpu` und der Kennzeichnung `managed: external`.
Erkannt wird er ueber Port und Prozess statt ueber Unit-Status, damit
`findExclusiveConflict` ihn als vollwertiges Gruppenmitglied sieht. Beendet wird er in
zwei Stufen: geordnet ueber die Studio-API auf `:8888`, sofern diese das hergibt — das
ist im Plan ein ausdruecklicher Pruefschritt, keine Annahme — andernfalls Abbruch mit
benanntem Halter statt eines blinden `kill`.

**Verwaister Lock.** Erkennung ueber PID-Liveness bei jedem Poll. Eine unlesbare oder
beschaedigte Lock-Datei gilt als gesetzt (fail-closed) und wird laut gemeldet: der
umgekehrte Weg riskiert, einen mehrstuendigen Trainingslauf zu zerstoeren, waehrend
fail-closed nur Deepseek-Tokens kostet, weil der Fallback funktioniert.

**Abgrenzung.** Embeddings sind nicht betroffen — `bge-embed-cpu` und `bge-rerank-cpu`
stehen in der Gruppe `bge-cpu` und halten kein VRAM. Damit entsteht auch keine
Fallback-Frage, die ADR-004 (fail-closed, kein Cross-Space-Fallback) verbieten wuerde.
Die Modell-Registry ist E6 (T002629) und nicht Teil dieses Change.

_Ticket: T002628_
