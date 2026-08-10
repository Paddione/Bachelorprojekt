# Design: llm-proxy-dispatch-capture

## Goals

- Jeder `/v1/*`-POST durch den lokalen Proxy hinterlässt einen nachlesbaren Mitschnitt aus Prompt,
  Antwort und Kopfdaten.
- Der Mitschnitt ist im SDLC-Cockpit ohne Umweg über die Kommandozeile einsehbar, und zwar live.
- Die Erfassung ist für den Transport folgenlos: kein zusätzlicher Ausfallpfad, keine zusätzliche
  Latenz im kritischen Weg.

## Non-Goals

Siehe `proposal.md` → *Non-Goals*. Für das Design am wichtigsten: keine Suche, keine Redaction,
keine Panel-Sanierung.

## Decisions

### D1 — Persistenz in der tickets-DB statt Datei oder Website-DB

Die Mitschnitte gehen in eine neue Tabelle `tickets.llm_proxy_request_log`.

**Begründung.** Der Proxy spricht über `backends.mjs` bereits mit der tickets-DB — dort liegt
`llm_proxy_backends`. Ein zweiter Speicher wäre eine zusätzliche Abhängigkeit ohne Gegenwert.
Entscheidend ist aber der Abfluss: `openspec/specs/sdlc-cockpit.md` verlangt unter *„Realtime-Push
— LISTEN/NOTIFY-SSE statt Polling"* und *„Database changes reach the cockpit as notifications"*
ausdrücklich den Push-Weg. Mit einer Tabelle ist der geschenkt; die Infrastruktur dafür steht
bereits (`website/src/lib/sdlc/cockpit-listen-hub.ts`,
`website/src/db/migrations/20260804_cockpit_notify_triggers.sql`).

**Verworfen: JSONL auf Platte.** Mit `grep`/`jq` direkt auswertbar und ohne DB-Last, aber das
Cockpit müsste pollen — was die Push-Anforderung verletzt — und der Adapter bräuchte einen zweiten
Host, gegen den `sdlc-cockpit.md` unter *„The adapter resolves each endpoint's host separately"*
ohnehin schon Sorgfalt einfordert.

**Verworfen: Erweiterung von `ai_call_log`.** Die Tabelle liegt in der mentolder-DB, gehört
`website` und erfasst website-eigene Workflows (`coaching_chat`, `rag_search`, …). Sie speichert
bewusst **keine** Bodies. Sie taugt als Vorbild für Retention und Fire-and-forget-Insert, nicht als
Zielort — ein Proxy, der in die Website-DB schreibt, verdrahtet zwei Systeme, die heute getrennt
sind.

**Trade-off.** Große Bodies landen in Postgres und werden per TOAST ausgelagert. Deshalb D3
(Kappung) und die harte Regel, dass Listenabfragen die Body-Spalten nicht anfassen (D5).

### D1a — Geschrieben wird gepuffert und gebündelt, nicht je Dispatch

`capture()` legt die Zeile in einen Speicherpuffer; ein Timer schreibt den Puffer alle 5 Sekunden
gebündelt in einem einzigen `factory_psql`-Aufruf weg. Beim Herunterfahren wird der Puffer noch
einmal geleert.

**Begründung.** Der Zugang zur tickets-DB ist kein Client, sondern
`factory_psql() { kubectl exec -i <pod> -n <ns> -- psql … }` (`scripts/factory/lib.sh`) — pro
Aufruf ein Bash- **und** ein kubectl-Spawn. `backends.mjs` erträgt das, weil es damit alle 30
Sekunden einmal die Registry liest. Ein Insert je Dispatch über denselben Weg legte einen
Prozess-Spawn in den Anfragepfad und schöbe den Body durch stdin von `kubectl exec`. Die Bündelung
senkt das auf einen Spawn je Fenster, unabhängig vom Durchsatz.

**Verworfen: direkter `pg`-Client im Proxy.** Naheliegend, aber `scripts/openspec-embed.mjs` geht
genau diesen Weg und ist damit auf dieser Maschine regelmäßig nicht lauffähig — der Post-Commit-
Hook dieses Vorgangs scheiterte dreimal an der belegten Portweiterleitung 15432. Ein
langlaufender Dienst würde sich dieses Ausfallmuster einhandeln, ohne etwas zu gewinnen: die
Bündelung braucht ohnehin keinen dauerhaften Client.

**Trade-off, ausdrücklich in Kauf genommen.** Stürzt der Proxy ab, gehen die Mitschnitte des
laufenden Fensters verloren — höchstens 5 Sekunden. Für Forensik-Aufzeichnungen ist das
vertretbar; dies als Requirement zu benennen ist ehrlicher, als es unerwähnt zu lassen.

### D2 — Ein eigenes Modul statt Einbau in `server.mjs`

Die Erfassung lebt in `scripts/llm-proxy/request-log.mjs` mit der öffentlichen Fläche
`capture(record)` und `truncate(text, limit)`. Das Modul kennt weder `http` noch Request-Objekte;
es nimmt ein fertiges Objekt entgegen.

**Begründung.** `server.mjs` hat 665 Zeilen und trägt bereits Routing, Loadout-Steuerung,
Fixups, Kontextbudget und zwei Antwortpfade. Ein Mitschnitt mit eigener Fehlersemantik und eigener
DB-Anbindung gehört nicht zusätzlich hinein. Als eigenes Modul ist er ohne laufenden Server
testbar — dieselbe Schnittform, die `fixups.mjs`, `models.mjs` und `slot-queue.mjs` bereits haben.

**Berührungspunkte in `server.mjs`** bleiben dadurch auf zwei begrenzt, beide innerhalb `proxyV1`:
nach `readBody()` das Einsammeln der Anfrage, und je einer in den beiden Antwortpfaden.

### D3 — Volle Bodies bis 256 KB je Feld, Kappung wird ausgewiesen

Prompt und Antwort werden ungekürzt gespeichert, bis das Feld 256 KB erreicht. Darüber wird
gekappt, und die Zeile trägt `truncated = true` sowie `original_bytes`.

**Begründung.** Ein stilles Abschneiden wäre genau der Fall, den `sdlc-cockpit.md` unter
*„D13 — Kein stiller Ersatzwert"* untersagt: der Betrachter hielte einen Ausschnitt für das Ganze.
Die 256 KB fassen einen Dispatch mit rund 60k Token Kontext vollständig.

**Aufbewahrung 14 Tage**, geräumt durch einen Task nach dem Vorbild von
`maintenance:ai-log-cleanup`. Größenordnung im Dauerbetrieb: einige hundert MB.

### D4 — Streaming wird mitgeschnitten, über einen passiven Tap

`proxyV1` hat zwei Antwortpfade. Der nicht-streamende puffert ohnehin (`upstream.text()`) — dort
ist die Erfassung trivial. Der streamende pipet roh weiter; dort sammelt ein `PassThrough` die
Chunks **parallel** zum bestehenden Pipe.

**Begründung und Risiko.** Der Code kommentiert die Trennung ausdrücklich als
Sicherheitsentscheidung aus T002609: *„ein zustandsbehafteter Scanner gehört nicht in den Pfad, in
dem ein Fehler die ganze Queue mitreißt"*. Die Warnung gilt einem Scanner, der den Datenstrom
**verändert**; ein Sammler ohne Rückwirkung ist eine schwächere Eingriffsform. Trotzdem bleibt das
die heikelste Stelle des Vorgangs, und deshalb gilt:

- Der Tap liegt vollständig in eigenem `try/catch`. Jeder Fehler verwirft den Mitschnitt und lässt
  den Transport unberührt.
- Der bestehende `upstreamStream.on('error')`-Pfad bleibt unverändert wirksam.
- Bricht das Backend mitten im Stream ab, wird die Zeile mit `stream_incomplete = true`
  geschrieben — **nicht** weggelassen. Eine fehlende Zeile wäre wieder ein stiller Ersatzwert.

Ohne diesen Pfad wäre der Nutzen fraglich: opencode-Dispatches streamen im Regelfall, es fehlte
also voraussichtlich genau die Antwortseite, derentwegen der Mitschnitt gebaut wird.

### D5 — Liste ohne Bodies, Bodies nur im Detail

`GET /sdlc/api/llm-proxy/requests` liefert ausschließlich Kopfdaten (Zeit, Backend, Modell, Dauer,
Status, Token-Zahlen, Korrelationsfelder, `truncated`, `stream_incomplete`). Prompt und Antwort
kommen allein über `GET /sdlc/api/llm-proxy/requests/:id`.

**Begründung.** Andernfalls zöge jeder Panel-Refresh zweistellige MB über die Leitung. Die
NOTIFY-Nutzlast ist zusätzlich auf 8000 Byte begrenzt, trägt also ohnehin nur die ID; das Panel
lädt die Kopfdaten nach und die Bodies erst beim Öffnen des Drawers.

### D6 — Korrelation über Header des Aufrufers, ohne Ersatz bei Fehlen

Der Factory-Dispatch-Pfad setzt `x-slot-id`, `x-dispatch-ticket` und `x-dispatch-partial`. Fehlen
sie, bleiben die Spalten `NULL` und das Panel zeigt einen Strich.

**Begründung.** Eine Alternative wäre die nachträgliche Zuordnung über Zeitfenster gegen
`factory_phase_events`. Bei parallelen Slots ist das eine Vermutung, die falsch sein kann — und ein
Panel, das eine Vermutung wie eine Tatsache darstellt, ist der Ersatzwert aus D13 in seiner
schädlichsten Form: er sieht wie eine Messung aus.

**Offen, und deshalb als Probe geplant.** Ob der opencode-Dispatch-Pfad überhaupt eigene Header
senden kann, ist **nicht belegt**: in `.opencode/agent-models.jsonc` tragen alle Provider
ausschließlich `"options": { "baseURL": … }`; ein `headers`-Feld kommt dort nirgends vor. Belegt
ist es nur für MCP-Server (`.opencode/opencode.jsonc:78`) — eine andere Konfigurationsfläche, aus
der sich nichts über den Provider-Pfad ableiten lässt. Der erste Schritt in `p3` ist deshalb eine
Machbarkeitsprobe: Header eintragen, Dispatch auslösen, im Proxy nachsehen ob er ankommt. Ergebnis
und ausgeführter Befehl werden im Ticket festgehalten (Mess-Konvention T002717). Trägt es nicht,
bleiben die Spalten `NULL` — was der Spec ausdrücklich zulässt — und `p3` setzt die Header nur
dort, wo der Aufrufer sie kontrolliert. Der übrige Vorgang hängt nicht daran.

**Nebeneffekt.** `extractSlotId()` liest `x-slot-id` seit T002483, aber kein Aufrufer sendet ihn.
Die Per-Slot-Semaphore in `slot-queue.mjs` bildet ihren Schlüssel deshalb heute immer aus
`backend.name` allein, womit Slot 0 und Slot 1 einander weiterhin blockieren — genau das, was die
Datei laut ihrem Kopfkommentar verhindern soll. Sobald der Header gesetzt wird, greift die
Isolation wie vorgesehen. Das ist eine Verhaltensänderung am Queue-Verhalten und gehört als solche
in die Verifikation, nicht in eine Fußnote.

## Data flow

```
Factory-Dispatch ──POST /v1/chat/completions──────────────► proxyV1 ──► llama.cpp-Backend
  + x-slot-id                                                 │
  + x-dispatch-ticket                                         │ capture()  (nicht awaited)
  + x-dispatch-partial                                        ▼
                                        tickets.llm_proxy_request_log ──NOTIFY(id)──►
                                                                              │
                            Cockpit-Panel ◄── SSE (cockpit-listen-hub) ◄──────┘
                                  │ Klick auf Zeile
                                  └──► GET /sdlc/api/llm-proxy/requests/:id   (Bodies)
```

## Components

| Einheit | Aufgabe | Abhängigkeiten |
|---|---|---|
| `scripts/llm-proxy/request-log.mjs` | `capture(record)`, `truncate(text, limit)` — puffert und schreibt | tickets-DB-Pool aus `backends.mjs` |
| `scripts/llm-proxy/server.mjs` | zwei Aufrufe in `proxyV1`: Anfrage einsammeln, Antwort abschließen | `request-log.mjs` |
| `scripts/migrations/2026-08-10-llm-proxy-request-log.sql` | Tabelle, Indizes, NOTIFY-Trigger | — |
| Factory-Dispatch-Pfad | setzt die drei Korrelations-Header | — |
| `website/src/pages/sdlc/api/llm-proxy/requests.ts` | Liste, ohne Body-Spalten | tickets-DB |
| `website/src/pages/sdlc/api/llm-proxy/requests/[id].ts` | Detail, mit Bodies | tickets-DB |
| Cockpit-Panel (Svelte) + Adapter-Eintrag | Live-Liste, Drawer | Adapter — **kein** `fetch()` im Panel |
| Cleanup-Task | räumt nach 14 Tagen | — |

Das Panel greift nicht selbst zum Netz: `sdlc-cockpit.md` verlangt unter *„Daten-Adapter — Kein
direkter fetch() aus Panels"* den Weg über den Adapter, und *„D10 — Panel-deklarierte
Refresh-Rate"* sowie *„D11 — Kein Polling unsichtbarer Panels"* gelten für das neue Panel
unverändert mit.

## Error handling

| Fall | Verhalten |
|---|---|
| tickets-DB nicht erreichbar | Proxy läuft unverändert; Mitschnitt entfällt, eine Zeile auf stderr |
| `capture()` wirft | verworfen, nie propagiert — der Aufruf wird nicht awaited |
| Backend bricht im Stream ab | Client behält seinen Teil, Queue lebt weiter, Zeile mit `stream_incomplete = true` |
| Body über 256 KB | gekappt, `truncated = true` plus `original_bytes` |
| Korrelations-Header fehlen | Spalten `NULL`, Panel zeigt einen Strich |

## Testing

Geprüft wird **Kommando-Output und Resultat**, nicht der Quelltext — Repo-Konvention T002448-M4.
Der Kern läuft gegen einen Fake-Backend-Server: echter Request durch den echten Proxy, danach
Prüfung der geschriebenen Zeile.

| Fall | Ort |
|---|---|
| Nicht-streamender Dispatch wird vollständig erfasst | `scripts/llm-proxy/request-log.test.mjs` |
| Streamender Dispatch wird erfasst, Antwort beim Client unverändert | ebd. |
| Backend bricht mitten im Stream ab: Client behält Teil, Queue lebt, `stream_incomplete` gesetzt | ebd. — der wichtigste Fall |
| DB nicht erreichbar: Dispatch gelingt trotzdem | ebd. |
| Kappung setzt `truncated` und `original_bytes` | ebd. |
| Korrelations-Header landen in der Zeile; ohne sie bleibt sie `NULL` | `tests/spec/local-llm-proxy/dispatch-capture.bats` |
| Liste liefert keine Body-Spalten | Vitest, `requests.ts` |
| Detail liefert die Bodies | Vitest, `requests/[id].ts` |

Bestehende Suiten laufen mit: `tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*`
erfasst Sammeldatei **und** Verzeichnis — beide Formen sind gültig, eine Suche nur nach
`tests/spec/local-llm-proxy.bats` fände die Hälfte (T002696).
