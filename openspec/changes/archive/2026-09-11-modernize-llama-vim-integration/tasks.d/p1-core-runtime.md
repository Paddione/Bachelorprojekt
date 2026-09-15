---
title: "p1-core-runtime — Vim FIM core runtime"
ticket_id: T900141
domains: [vim, llm-local-dev]
status: active
partial_id: p1-core-runtime
role: impl
target_files:
  - editor/llama-vim/plugin/llama.vim
  - editor/llama-vim/autoload/llama.vim
  - editor/llama-vim/autoload/llama/config.vim
  - editor/llama-vim/autoload/llama/request.vim
  - editor/llama-vim/autoload/llama/stream.vim
  - editor/llama-vim/autoload/llama/render.vim
depends_on: []
---

# p1-core-runtime — Implementation Plan

_Ticket: T900141 · Rolle: impl · unabhaengiger Core-Partial_

## File Structure

| Datei | Zweck |
|---|---|
| `editor/llama-vim/plugin/llama.vim` | Einmaliger Plugin-Einstieg, Commands, Capability-Guard und plugin-eigene Autocommands |
| `editor/llama-vim/autoload/llama.vim` | Duenne E746-konforme Fassade fuer die oeffentlichen `llama#...`-Funktionen |
| `editor/llama-vim/autoload/llama/config.vim` | Unveraenderliche Defaults, Schema-Validierung, effektive Konfiguration und transaktionaler Reload |
| `editor/llama-vim/autoload/llama/request.vim` | Request-ID-Zustandsmaschine, Vim-Job/curl-Adapter, Cancellation, Fehlerklassifikation und Retry |
| `editor/llama-vim/autoload/llama/stream.vim` | Zustandsbehafteter, aber transport-unabhaengiger SSE-/NDJSON-/Final-JSON-Parser |
| `editor/llama-vim/autoload/llama/render.vim` | Request-eigenes Ghost Text, Render-Coalescing, Annahme und Repetition Guard |

Keine weitere Datei wird in diesem Partial geaendert. Die zusaetzliche Fassade ist erforderlich,
weil Vim Funktionen wie `llama#statusline()` gemaess E746 aus `autoload/llama.vim` laden muss;
`autoload/llama/status.vim` darf nur `llama#status#...` definieren. Insbesondere gehoeren Context-/Ring-Aufbau,
Status/Discovery, der Neovim-Lua-Adapter, Installer, Dokumentation und BATS-Fixtures zu anderen
Partials. Dieses Partial fuehrt seine unten benannten Schnittstellen neu ein; der Plan behauptet
keine bereits vorhandenen Plugin-Symbole. Der gefilterte Intel-Stand enthaelt fuer die fuenf
urspruenglich angefragten Zieldateien weder Symbole noch Call-Graph-Kanten; der Filter nimmt die
nach dem E746-Review ergaenzte Fassade noch nicht in `impact_files` auf, und auch sie existiert
im Ausgangsbaum nicht.

## S1-Budget (Intel-Baseline)

`plan-intel-filter.sh` meldet alle Zieldateien als neu (`loc: 0`, `s1_baseline: null`) und fuer
`.vim` sowohl `s1_limit: 0` als auch `s1_budget: null`; fuer die nach dem Interface-Review neu
aufgenommene Fassade gilt derselbe nicht-baselinete `.vim`-Status. `docs/code-quality/gates.yaml` definiert
keinen `.vim`-S1-Limit-Key. Daher ist der effektive S1-Zeilenbudgetwert **nicht anwendbar**; `0`
ist hier kein Nullbudget, sondern der Intel-Platzhalter fuer eine nicht vom S1-Gate erfasste
Extension. Trotzdem bleiben die Verantwortungen auf sechs Module getrennt und werden nicht in
`plugin/llama.vim` zusammengezogen.

| Datei | Ist | Baseline | Effektives Budget |
|---|---:|---|---|
| `editor/llama-vim/plugin/llama.vim` | 0 | nicht baselined | nicht anwendbar (`.vim` ohne S1-Limit) |
| `editor/llama-vim/autoload/llama.vim` | 0 | nicht baselined | nicht anwendbar (`.vim` ohne S1-Limit) |
| `editor/llama-vim/autoload/llama/config.vim` | 0 | nicht baselined | nicht anwendbar (`.vim` ohne S1-Limit) |
| `editor/llama-vim/autoload/llama/request.vim` | 0 | nicht baselined | nicht anwendbar (`.vim` ohne S1-Limit) |
| `editor/llama-vim/autoload/llama/stream.vim` | 0 | nicht baselined | nicht anwendbar (`.vim` ohne S1-Limit) |
| `editor/llama-vim/autoload/llama/render.vim` | 0 | nicht baselined | nicht anwendbar (`.vim` ohne S1-Limit) |

## Neu einzufuehrende Schnittstellen

### Oeffentliche Fassade

- `llama#fim(manual) -> Dict`, `llama#fim_cancel()`, `llama#fim_accept(mode) -> Dict` und
  `llama#statusline() -> String` werden neu in `autoload/llama.vim` eingefuehrt. Die Fassade
  validiert keine Konfiguration und besitzt keinen Request-/Statuszustand, sondern delegiert an
  `llama#config#eligibility`, `llama#context#build`, `llama#request#...`,
  `llama#render#accept` beziehungsweise `llama#status#statusline`.
- Solange ein Sibling-Modul noch nicht vorhanden ist, liefert die Fassade einen strukturierten,
  nicht-fatalen Fehler bzw. fuer die Statusline einen stabilen leeren String. Dadurch bleibt das
  Package ladbar, ohne die spaeteren Implementierungen vorzutäuschen.

### Konfiguration

- `llama#config#defaults() -> Dict`: gibt stets eine `deepcopy()` der Plugin-Defaults zurueck.
- `llama#config#load() -> Dict`: validiert Defaults, Repo-Profil und `g:llama_config` und liefert
  `{ok, effective, diagnostics, explicit_keys}`. Der Aufrufer darf Eingaben oder Ergebnis nicht
  als gemeinsam mutierbaren Zustand behandeln.
- `llama#config#current() -> Dict`: gibt eine Kopie des zuletzt aktivierten sicheren Snapshots
  zurueck.
- `llama#config#reload() -> Dict`: liefert
  `{ok, effective, diff, diagnostics, auto_allowed}`; ein ungueltiger Kandidat aktiviert keine
  Auto-FIM-Events. `diff` enthaelt mindestens `changed_keys` und die Booleans
  `request_incompatible` sowie `events_changed`.
- `llama#config#eligibility(bufnr, manual) -> Dict`: liefert `{allowed, reason}`. Exkludierte
  normale Filetypes blockieren nur Auto-FIM; unbenannte, spezielle, binaere, nicht modifizierbare
  oder sensitive Buffer blockieren auch manuelle Requests.

### Stream

- `llama#stream#new() -> Dict`: erzeugt einen Parserzustand mit Byte-Rest, erkanntem Framing,
  Abschlussstatus und Diagnostik.
- `llama#stream#feed(state, bytes, eof) -> Dict`: gibt einen neuen Zustand und geordnete Events
  als `{state, events, diagnostics}` zurueck. Events sind ausschliesslich
  `{type: 'delta', text: String}`, `{type: 'done'}` oder
  `{type: 'error', kind: 'protocol', detail: String}`.

### Rendering

- `llama#render#init() -> Dict`: richtet idempotent den Vim-Text-Property-Typ ein und meldet
  fehlende Ghost-Text-Faehigkeiten strukturiert.
- `llama#render#queue(bufnr, request_id, anchor, text, delay_ms) -> Dict`: coalesced Updates pro
  Buffer; ein alter Timer darf nicht rendern, sobald ein neuer Owner gesetzt wurde.
- `llama#render#clear(bufnr, request_id)`: entfernt nur Text-Properties/Timer des passenden
  Owners; `request_id = 0` ist der explizite Clear-all-fuer-diesen-Buffer-Pfad beim Disable.
- `llama#render#accept(bufnr, request_id, mode) -> Dict`: fuegt nur bei explizitem Aufruf und
  passendem Owner Text ein; `mode` ist `all` oder `line`.
- `llama#render#is_repetitive(text, config) -> Bool`: prueft normalisierten akkumulierten Text
  gegen die konfigurierten Token- und Zeilenfolgen-Limits.

### Request-Lebenszyklus

- `llama#request#start(bufnr, payload, opts) -> Dict`: startet genau einen Request im Buffer und
  liefert `{ok, request_id, error}`. `payload` wird sofort tief kopiert und in allen Retries
  unveraendert wiederverwendet; `opts` enthaelt Cursoranker und optional den Adapter-Namen.
- `llama#request#cancel(bufnr, reason)`: markiert zuerst den Record als `cancelled`, stoppt dann
  Debounce-/Retry-/Render-Timer und Transport und leert zuletzt passendes Ghost Text.
- `llama#request#cancel_all(reason)`: wird bei Disable und inkompatiblem Config-Reload verwendet.
- `llama#request#is_current(bufnr, request_id) -> Bool`: prueft Map-Eigentum, Phase,
  `b:changedtick`, kanonischen Pfad und Startanker, ohne Zustand zu veraendern.
- `llama#request#on_data(request_id, bytes)`, `llama#request#on_error(request_id, kind, detail)`
  und `llama#request#on_exit(request_id, result)`: sind die normalisierten Callback-Eingaenge fuer
  Vim und den spaeteren Neovim-Adapter. Jeder Eingang prueft vor Parser-, Render-, Status- oder
  Retry-Aenderungen erneut `is_current`.
- `llama#request#snapshot(bufnr) -> Dict`: read-only Test-/Status-Snapshot ohne Job- oder HTTP-I/O.
- `llama#request#probe(url, timeout_ms, Callback) -> Dict`: ein einzelner begrenzter GET ueber
  denselben curl-Argumentvektor, ohne Request-Record, Retry oder Stream-Parser. Liefert sofort
  `{ok, error}` und ruft `Callback` genau einmal mit `{ok, http_status, body, kind, detail}`.
  Nutzer ist `status.vim` (p2) fuer `/health`, `/props` und `/v1/models`.

### Integrationsvertraege zu anderen Partials

Diese Symbole sind ebenfalls **neu**, werden aber nicht in diesem Partial implementiert:

- Context liefert spaeter `llama#context#build(bufnr, position, config) ->
  {ok, payload, diagnostics}`. Bis dieses Symbol verfuegbar ist, bleibt der automatische Trigger
  fail-closed; `llama#request#start()` selbst nimmt bereits ein fertiges Payload entgegen und
  importiert Context nicht rueckwaerts.
- Status/Discovery nimmt spaeter reine Ereignisse ueber
  `llama#status#record(event, fields)` an und stellt `llama#status#show()` sowie die read-only
  Funktion `llama#status#statusline() -> String` bereit. Core-Aufrufe
  sind mit `exists('*llama#status#record')` optional; fehlender Statuscode darf Requests nicht
  brechen.
- Der Neovim-Partial (p2) stellt `require('llama.transport').start(spec)` und `.stop(handle)`
  sowie `require('llama.buffer').render(bufnr, request_id, anchor, text)` und
  `.clear(bufnr, request_id)` bereit. `request.vim` waehlt unter `has('nvim-0.10')` diesen
  Transport, `render.vim` diese Render-Funktionen. Neovim besitzt weder `job_start()` noch
  Text-Properties: fehlen die Lua-Module, meldet der Capability-Guard den Pfad als nicht
  unterstuetzt und registriert kein Auto-FIM.
- Nach erfolgreichem `:LlamaReloadConfig` und bei `:LlamaEnable` ruft `plugin/llama.vim`, jeweils
  per `exists()` abgesichert, `llama#context#on_config(config)` und `llama#status#start(config)`
  auf. Ein Listener-Register gibt es nicht.
- Verbindliche Namensliste fuer alle Partials: `tasks.md` §Interface contract.

## Tasks

### 1. Schema, sichere Defaults und Reload-Snapshot implementieren (max. 2 h)

- [ ] In `config.vim` getrennte `s:defaults` und `s:repo_profile` einfuehren. Das Repo-Profil
  setzt `endpoint_fim=http://127.0.0.1:8094/infill`, `model_fim=qwen38-220k`, 512 Prefix-Zeilen,
  64 Suffix-Zeilen und 32 Ring-Chunks. Weder Laden noch Reload fuehrt Netzwerk-, Server-,
  Deployment- oder Modellwechsel-Kommandos aus.
- [ ] Key-Namen, Repo-Defaults, Snapshot- und Anker-Formen stehen verbindlich in `tasks.md`
  §Config keys und §Data shapes; p4 testet gegen genau diese Namen.
- [ ] Ein deklaratives Schema fuer die in Core verwendeten Keys einfuehren: Endpoint-/Model-
  Strings, Prefix-/Suffix-/Ring-Limits, `auto_fim`, Filetype-/Pfad-Excludes, Debounce und
  Render-Throttle, curl Connect-/Overall-Timeout, maximale Retry-Versuche, Basis-/Cap-/Jitter-
  Delay sowie Token-/Zeilen-Repetition-Limits. Typ, Wertebereich, `http|https`-Scheme und
  Cross-Field-Regeln (`retry_base_ms <= retry_cap_ms`, endliche positive Timeouts) werden vor
  Aktivierung geprueft.
- [ ] Unbekannte Keys mit einem begrenzten Levenshtein-Abstand vergleichen. Nur ein eindeutig
  naechster Treffer wird vorgeschlagen; `endpiont_fim` diagnostiziert `endpoint_fim`. Keine
  Secret-/Credential-Keys in Schema oder Diagnosewerten aufnehmen.
- [ ] Reload transaktional gestalten: Kandidaten zuerst kopieren/validieren, Diff gegen den
  aktiven Snapshot berechnen, danach committen. Bei Fehlern Auto-FIM abschalten und eine sichere
  manuelle Konfiguration behalten; niemals teilweise mutiertes `g:llama_config` weiterreichen.
- [ ] `request_incompatible` mindestens bei Endpoint, Modell, Timeout, Payload-Budget und
  Retry-Policy setzen; `events_changed` bei Auto-FIM, Excludes oder Debounce. Damit kann der
  Plugin-Einstieg exakt entscheiden, ob Requests abzubrechen bzw. Events neu aufzubauen sind.

Akzeptanz: Defaults entsprechen REQ-VIM-AI-009; Konfigurationsfehler werfen keinen Vimscript-
Stacktrace; ein Reload ersetzt ausschliesslich Plugin-Zustand und ein invalides Schema kann keine
automatischen Requests starten.

### 2. Inkrementellen Framing- und Delta-Parser implementieren (max. 2 h)

- [ ] Vor Implementierung den vom Test-Partial bereitgestellten fokussierten Runner ausfuehren:

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/vim-ai-completion/request-stream.bats
  # expected: FAIL — Core-Dateien/Symbole und beobachtbares Streaming fehlen noch
  ```

- [ ] Sicherstellen, dass die roten Assertions mindestens Split-SSE, Split-NDJSON,
  First-token-before-exit, Supersede/Late-callback, Changedtick-Cancel, Repetition, HTTP 400,
  HTTP 429/503 und Disable-waehrend-Retry adressieren. Dieser impl-Partial veraendert die
  BATS-Datei nicht; fehlt sie beim Start, an den Test-Partial melden statt ausserhalb von
  `target_files` eine Ersatzdatei anzulegen.

- [ ] In `stream.vim` eingehende Vim-Strings als Bytefragmente puffern und erst komplette
  Records dekodieren. Callback-Grenzen duerfen mitten in CRLF, UTF-8-Bytes, JSON oder dem
  SSE-Leerzeilen-Delimiter liegen.
- [ ] SSE mit `\n\n` und `\r\n\r\n`, Kommentarzeilen, mehreren `data:`-Zeilen pro Event und
  `[DONE]` unterstuetzen. NDJSON emittiert genau ein Event pro vollstaendiger JSON-Zeile;
  unvollstaendige Enden verbleiben bis zum naechsten `feed()` im Zustand.
- [ ] Framing und Payload-Normalisierung trennen. Normalisierung erkennt die dokumentierten
  llama.cpp-/OpenAI-kompatiblen Content-Felder (`content`, `completion`,
  `choices[0].delta.content`, `choices[0].text`) und akkumuliert keine Transportmetadaten.
  Unbekannte oder malformed Shapes werden als strukturierte `protocol`-Diagnose geliefert,
  nicht mit `echoerr` oder einer Exception aus dem Callback heraus.
- [ ] Bei `eof=true` genau ein finales nicht-streamendes JSON-Dokument akzeptieren; ein bereits
  abgeschlossenes `[DONE]` oder wiederholtes EOF darf kein Delta doppelt emittieren.

Akzeptanz: beliebige Split-Punkte liefern dieselbe geordnete Delta-Folge wie ein einzelner Chunk;
erste gueltige Deltas stehen dem Renderer vor Prozessende zur Verfuegung; Parsefehler sind
permanent und koennen keine Retry-Schleife ausloesen.

### 3. Request-eigenes, gedrosseltes Ghost Text implementieren (max. 2 h)

- [ ] In `render.vim` einen stabil benannten Highlight-/Property-Typ idempotent anlegen und
  Renderzustand nach Buffer und Request-ID halten. Der Anchor besteht aus Startzeile, Byte-Spalte
  und Changedtick; Ghost Text veraendert nie reale Bufferzeilen.
- [ ] `queue()` auf hoechstens ein Pending-Update pro Buffer coalescen. Der Timer liest beim
  Feuern nochmals den Render-Owner; nach `queue(B)` darf ein Timer von A weder Property noch
  Annahmetext erzeugen. Mehrzeiliger Inhalt wird reproduzierbar aus dem akkumulierten Text
  dargestellt, ohne Cursor oder Insert-Mode zu wechseln.
- [ ] `clear()` und `accept()` strikt nach Owner-ID scopen. `accept(all)` und `accept(line)`
  pruefen Modifizierbarkeit, Anchor und Changedtick erneut, entfernen dann Ghost Text und fuegen
  erst auf den expliziten Benutzerbefehl den ausgewaehlten Text ein.
- [ ] Den Repetition Guard auf normalisiertem Gesamttext implementieren: konfigurierbare
  aufeinanderfolgende Token- und identische Zeilenruns; leere/Whitespace-Fragmente zaehlen nicht.
  Der Guard meldet nur das Ergebnis, waehrend `request.vim` den geordneten Cancel ausfuehrt.
- [ ] Unter `has('nvim')` legt `render.vim` keine Text-Properties an, sondern delegiert den
  Timer-Flush an `require('llama.buffer').render(bufnr, request_id, anchor, text)` und `clear()`
  an `.clear(bufnr, request_id)` aus p2. Owner-Pruefung, Coalescing und Accept bleiben in
  `render.vim`.

Akzeptanz: Das erste Content-Delta wird nach hoechstens `render_throttle_ms` sichtbar, auch wenn
curl noch laeuft; schnelle Fragmente verursachen nicht je einen Render; Cancel/Supersede entfernt
nur den eigenen Hint; ohne Accept bleibt der Buffer byte-identisch.

### 4. Per-Buffer-Zustandsmaschine und Callback-Race-Guards implementieren (max. 2 h)

- [ ] In `request.vim` `s:next_request_id` monoton erhoehen und `s:current_by_buffer` als einzige
  Autoritaet einfuehren. Jeder Record enthaelt ID, Buffer, kanonischen Pfad, Cursoranker,
  Start-Changedtick, immutable Payload-Kopie, Parserzustand, Versuch, Transporthandle,
  Timer-IDs, akkumulierten Text, letzten strukturierten Fehler und Phase.
- [ ] Nur folgende Phasen/Kanten erlauben: `scheduled -> running -> streaming -> complete`,
  `running|streaming -> retry_wait -> running` sowie jeder aktive Zustand nach `cancelled` oder
  terminal nach `failed`. Ungueltige oder doppelte Exit-/Data-Events sind No-ops.
- [ ] `start()` cancelt ausschliesslich den bisherigen Record desselben Buffers; Requests anderer
  Buffer bleiben unabhaengig. `is_current()` prueft vor jeder Mutation Map-ID, nicht-terminale
  Phase, Bufferexistenz, Pfad, Changedtick und Anchor.
- [ ] Cancellation exakt ordnen: Record zuerst terminal markieren, dann Debounce-/Retry-/Render-
  Timer stoppen, dann Transport stoppen, zuletzt den ID-passenden Renderzustand leeren. So sehen
  synchrone oder spaete Stop-/Exit-Callbacks bereits `cancelled` und bleiben wirkungslos.
- [ ] Parser-Events in Reihenfolge anwenden: Delta akkumulieren, Repetition pruefen, dann Render
  queuen; `done` finalisiert erst nach Flush des letzten Deltas. Nach Repetition wird sofort mit
  Reason `repetition` gecancelt und kein weiteres Byte derselben ID gerendert.

Akzeptanz: Wenn A durch B superseded wird, duerfen Daten, Fehler, Exit oder Retry-Timer von A
keinen Parser-, Render- oder Fehlerstatus von B aendern. Eine Textaenderung nach Requeststart hat
denselben Effekt. Zwei Buffer besitzen gleichzeitig je genau einen unabhaengigen aktiven Record.

### 5. Vim-Job/curl-Transport und begrenzte Recovery implementieren (max. 2 h)

- [ ] curl ausschliesslich als Argumentliste an `job_start()` uebergeben: POST-JSON, passende
  Content-/Accept-Header, `--no-buffer`, begrenzte Connect-/Overall-Timeouts und Streaming-Body.
  Payload per Channel-stdin oder sicherer JSON-Argumentuebergabe senden; niemals einen
  interpolierten Shell-Command bauen.
- [ ] Einen request-ID-spezifischen finalen HTTP-Sentinel verwenden und mit einem kleinen
  Adapter-Tailbuffer auch dann sicher entfernen, wenn er ueber Callback-Grenzen geteilt ist.
  Nur der Sentinel liefert den Status; Body-Bytes gehen unveraendert an `stream#feed`.
  stdout, stderr und Exit werden zu den drei normalisierten Callback-Eingaengen zusammengefuehrt.
- [ ] Ergebnisse exakt klassifizieren: bereits markierter Stop=`cancelled`, curl 28=`timeout`,
  sonstiger curl-Fehler=`transport`, HTTP 408/429/5xx=`http_transient`, andere 4xx=
  `http_permanent`, fehlender/ungueltiger Status oder Parserfehler=`protocol`.
- [ ] Retry nur fuer die konfigurierte Menge aus `transport`, `timeout` und `http_transient`
  planen. `retry_max_attempts` zaehlt den Initialversuch mit. Delay ist
  `min(retry_cap_ms, retry_base_ms * 2^(attempt-1)) + bounded_jitter`; vor Timeranlage und beim
  Timerfeuern erneut Original-ID/Bufferzustand pruefen. Payload, Pfad, Cursor und Changedtick
  bleiben die Werte des Originalrequests.
- [ ] Terminale Fehler einmalig im Snapshot/optionalen Statussink speichern. HTTP 400 und
  `protocol` planen keinen Retry; Disable, Reload, Bufferwechsel und Supersede stoppen Pending-
  Timer und koennen keinen weiteren curl-Prozess starten.
- [ ] `probe()` mit demselben Argumentvektor-Builder und derselben Sentinel-/Klassifikationslogik
  umsetzen. Der Body wird bis zu einer festen Obergrenze gepuffert, ein Timeout liefert
  `kind: 'timeout'`, und es wird nie ein zweiter Versuch geplant.

Akzeptanz: 503/429 darf innerhalb des Attempt-Limits erfolgreich recovern; 400 sendet exakt
einen Versuch; offline/timeout endet nach endlicher Zahl und blockiert Vim nicht; kein Callback
schreibt nach einem terminalen Zustand.

### 6. E746-konforme Public-Fassade und Plugin-Wiring implementieren (max. 2 h)

- [ ] `autoload/llama.vim` als einzigen Definitionsort fuer top-level `llama#...`-Symbole
  anlegen. `llama#fim()` holt Eignung und fertiges Context-Payload und uebergibt dieses an
  `llama#request#start()`; `llama#fim_cancel()` und `llama#fim_accept()` sind duenne Forwarder.
- [ ] `llama#statusline()` ausschliesslich an das neu deklarierte
  `llama#status#statusline() -> String` aus dem Status-Partial delegieren. Der Fallback ist
  side-effect-free und startet insbesondere keinen Probe, Job oder Timer.
- [ ] Alle Forwarder muessen fehlende Sibling-Symbole und strukturierte `{ok: 0, error: ...}`-
  Rueckgaben ohne uncaught E117/E746 behandeln. Es wird kein Status-, Config-, Render- oder
  Requestzustand in der Fassade dupliziert.

Akzeptanz fuer die Fassade: `:echo llama#statusline()` laedt unter Vim 9.1 ohne E746; wiederholte
Statusline-Auswertung bleibt read-only; die anderen Public-Funktionen verwenden genau den
Lifecycle des Core-Moduls und keinen zweiten globalen Requestzustand.

- [ ] In `plugin/llama.vim` mit `g:loaded_repo_llama_vim` doppelte Initialisierung verhindern,
  Highlights setzen und Commands genau einmal definieren: `:LlamaEnable`, `:LlamaDisable`,
  `:LlamaFim`, `:LlamaCancel`, `:LlamaAccept`, `:LlamaAcceptLine` und
  `:LlamaReloadConfig`. `:LlamaStatus` nur an den oben deklarierten Statusvertrag delegieren und
  ohne Statusmodul eine klare, nicht-fatale Meldung liefern.
- [ ] Capability-Guard vor Auto-Registrierung, mit Test-Seam `g:llama_capability_override`
  (siehe `tasks.md` §Data shapes): curl, Timer, asynchrone Jobs sowie Vim-Textprops
  oder ein nutzbarer Neovim-Pfad. Ein nicht unterstuetzter Editor behaelt Diagnose-/Reload-
  Commands, registriert aber keine automatischen FIM-Autocommands.
- [ ] Ausschliesslich ein klar benanntes Plugin-Agroup verwalten. `InsertLeavePre`, relevante
  Buffer-/Cursor-/Textaenderungen und `CompleteChanged` invalidieren/canceln nach Buffer; der
  Auto-FIM-Trigger verwendet Config-Eignung und Debounce. Keine globalen User-Autocommands oder
  Mappings loeschen bzw. ueberschreiben.
- [ ] `:LlamaReloadConfig` wendet den Config-Diff an: bei `request_incompatible` erst
  `cancel_all('config_reload')`, bei `events_changed` nur das Plugin-Agroup neu aufbauen und
  danach den gueltigen Snapshot verwenden. Disable cancelt alle Requests/Timer und leert alle
  plugin-eigenen Renders, ohne Serverzustand anzufassen.
- [ ] Manueller FIM-Befehl bleibt fuer normale filetype-exkludierte Buffer moeglich, verwendet
  aber denselben Eligibility-, Context- und Request-Pfad. Special/binary/sensitive/
  nonmodifiable bleibt auch manuell fail-closed.
- [ ] Die Commands rufen fuer FIM, Cancel und Accept ausschliesslich die Public-Fassade in
  `autoload/llama.vim` auf; dadurch bleiben Mappings und Statusline-Nutzer von internen
  Modulnamen entkoppelt.

Akzeptanz: wiederholtes Source/Enable/Reload erzeugt weder doppelte Commands noch Events; ein
offline Endpoint verzoegert Startup nicht; Konfigurationsaenderungen greifen ohne Disable/Enable;
kein Core-Pfad startet, stoppt oder wechselt einen LLM-Server.

### 7. Fokussierte GREEN- und Gate-Verifikation (max. 1,5 h)

- [ ] Syntax/Load zuerst isoliert pruefen:

  ```bash
  vim -Nu NONE -n -es \
    --cmd "set runtimepath^=$PWD/editor/llama-vim" \
    --cmd "runtime plugin/llama.vim" \
    --cmd "call assert_true(exists(':LlamaReloadConfig'))" \
    --cmd "qa!"
  ```

- [ ] Den fokussierten Core-Runner gruen ausfuehren und anschliessend wiederholen, um geleakte
  Jobs/Timer und Reihenfolgeflakiness sichtbar zu machen:

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/vim-ai-completion/request-stream.bats
  tests/unit/lib/bats-core/bin/bats tests/spec/vim-ai-completion/request-stream.bats
  ```

- [ ] In den Ergebnissen explizit belegen: Split-Frames genau einmal; erstes Ghost Text vor Exit;
  A-nach-B-Callbacks ignoriert; Changedtick verwirft; Repetition cancelt; 429/503 bounded retry;
  400 kein Retry; Disable/Reload cancelt Retry; zwei Buffer bleiben isoliert; Vim 9.1 nutzt den
  Job-/Textprop-Pfad ohne installiertes Neovim.
- [ ] Keine S1-Ausnahme und keinen Baseline-Key anfassen. Abschliessend die repo-weiten Gates
  ausfuehren; durch Freshness generierte Aenderungen ausserhalb dieses Partials dem integrierenden
  Plan-Owner uebergeben statt hier zu committen:

  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

## Abgrenzung und Handoff

- `request.vim` besitzt nur den portablen Vim-Transport und die adapterneutrale Lifecycle-
  Autoritaet. Lua-Dateien werden hier nicht erzeugt oder editiert.
- `render.vim` besitzt Ghost Text, aber keinen Context-Ring und keine Status-Probes.
- `config.vim` validiert gemeinsam benoetigte Keys, speichert jedoch weder Bufferinhalt noch
  Server-Capabilities.
- Die BATS-Fixture und Testdatei sind Verify-Abhaengigkeiten, keine `target_files`; fehlende
  Assertions werden an den Test-Partial zurueckgegeben. Dieses Partial erweitert den Scope nicht.
