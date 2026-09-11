---
title: "p4-tests — Offline-BATS-Suite und Fake-Server fuer vim-ai-completion"
ticket_id: T900141
domains: [vim, llm-local-dev]
status: pending
partial_id: p4-tests
role: tests
target_files:
  - tests/fixtures/llama-vim/fake-server.mjs
  - tests/spec/vim-ai-completion/request-stream.bats
  - tests/spec/vim-ai-completion/install-config.bats
  - tests/spec/vim-ai-completion/context-status.bats
depends_on: []
---

# p4-tests — Implementation Plan

_Ticket: T900141 · Rolle: tests · entsteht vor p1–p3 (RED zuerst)_

## File Structure

| Datei | Zweck | Deckt ab |
|---|---|---|
| `tests/fixtures/llama-vim/fake-server.mjs` | Deterministischer llama.cpp-Ersatz (nur `node:http`), Szenarien per Pfad, Request-Zaehler | alle Dateien |
| `tests/spec/vim-ai-completion/request-stream.bats` | Parser, Streaming, Ghost Text, Request-Lebenszyklus, Fehler/Retry | REQ-VIM-AI-002, 003, 004 |
| `tests/spec/vim-ai-completion/install-config.bats` | Installer, Konfigvalidierung, Reload, Repo-Defaults | REQ-VIM-AI-001, 005, 009 |
| `tests/spec/vim-ai-completion/context-status.bats` | Kontextaufbau, Ring-Isolation, Discovery, Status | REQ-VIM-AI-006, 007, 008 |

Keine weitere Datei wird geaendert. Die Suite ruft ausschliesslich die in `tasks.md` verbindlich
genannten Schnittstellen von p1–p3 sowie Vim-Builtins (`prop_list()`, `job_info()`,
`timer_info()`, `autocmd_get()`, `reltime()`) auf. Helfer bleiben dateilokal, weil ein gemeinsames
Helper-Modul ausserhalb von `target_files` laege.

## S1-Budget

| Datei | Ist | Baseline | Wirksame Schwelle / Budget |
|---|---:|---|---|
| `tests/fixtures/llama-vim/fake-server.mjs` | 0 (neu) | nicht-baselined | `.mjs`-Limit 800, Budget 800; Ziel unter 300 Zeilen |
| `tests/spec/vim-ai-completion/request-stream.bats` | 0 (neu) | nicht-baselined | nicht anwendbar (`.bats` ohne S1-Limit) |
| `tests/spec/vim-ai-completion/install-config.bats` | 0 (neu) | nicht-baselined | nicht anwendbar (`.bats` ohne S1-Limit) |
| `tests/spec/vim-ai-completion/context-status.bats` | 0 (neu) | nicht-baselined | nicht anwendbar (`.bats` ohne S1-Limit) |

Gemessen mit `yq '.s1.limits' docs/code-quality/gates.yaml` und
`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json`.

## Gemeinsame Testmechanik

**Guards (in `setup()`, vor jeder Arbeit):** `command -v vim` sonst `skip "vim fehlt"`;
`vim -Nu NONE -i NONE -n -es -c 'if has("job") && has("timers") && has("textprop") && has("channel") | qa! | else | cq | endif'`
ungleich 0 sonst `skip` mit Featurename; `command -v node` und `command -v curl` sonst `skip`.
Neovim-Faelle: `nvim --headless -u NONE -c 'lua os.exit(vim.fn.has("nvim-0.10")==1 and 0 or 1)'`
ungleich 0 oder fehlendes `nvim` sonst `skip "Neovim >= 0.10 nicht installiert (Lua-Adapter nicht pruefbar)"`.
Die Installer-Tests brauchen nur `bash` und `sha256sum`; nur ihre Lade-Assertion verlangt Vim.

**Isolation:** `export HOME="$BATS_TEST_TMPDIR/home"`; `REPO` aus `$BATS_TEST_DIRNAME/../../..`.
Vim startet immer als
`timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" --cmd "let g:llama_config = {...}" -S "$BATS_TEST_TMPDIR/case.vim"`.
`case.vim` laedt `runtime plugin/llama.vim`, schreibt Ergebnisse als `key=value`-Zeilen per
`writefile()` nach `$BATS_TEST_TMPDIR/result.txt` und endet mit `qa!`. Jede Assertion prueft
zuerst `[ -s result.txt ]` (Positiv-Anker gegen stilles Vim-Abbrechen), dann Werte wie
`grep -qx 'first_before_exit=1' result.txt`. Keine Assertion liest Quelldateien.

**Warten ohne Rennen:** `case.vim` definiert `WaitUntil(expr, timeout_ms)`: Schleife aus
`eval(expr)` und `sleep 10m` (verarbeitet Job-/Timer-Callbacks) bis wahr oder `reltimefloat()`
das Limit erreicht; das Ergebnis `timed_out=0|1` landet im Result-File. Aeussere Grenze ist
`timeout 40`. Fixe `sleep` ohne Obergrenze gibt es nicht.

**Netzwerk- und Seiteneffekt-Schutz:** Ein `PATH`-Shim-Verzeichnis in `$BATS_TEST_TMPDIR/bin`
enthaelt (a) `curl`: haengt argv an `curl.log`, bricht bei URLs mit `:8094` mit Exit 7 ab, sonst
`exec` des echten curl; (b) Protokoll-Shims `systemctl docker kubectl task lms llama-server
nvidia-smi ssh pwsh powershell.exe`, die nur nach `mgmt.log` schreiben. Damit wird Port 8094 nie
kontaktiert, auch wenn das Plugin beim Laden die Defaults probt. Echtes `~`, `~/.unsloth` und
`~/opt/llama.cpp-src` werden nie beschrieben.

**Fake-Server-Lebenszyklus:** `setup()` startet
`node "$REPO/tests/fixtures/llama-vim/fake-server.mjs" --port-file "$BATS_TEST_TMPDIR/port" &`,
merkt `FAKE_PID` und wartet hoechstens 5 s auf eine nicht-leere Portdatei, sonst
`fail "fake-server nicht gestartet"`. `teardown()` sendet immer `kill -TERM "$FAKE_PID"` und wartet
begrenzt. Endpoint im Test: `http://127.0.0.1:$PORT/s/<szenario>/infill`.

## Messbarkeit nicht-deterministischer Aussagen

| Aussage | Messung |
|---|---|
| Erstes Ghost Text vor Prozessende | 10-ms-Poll in `case.vim`: erster Zeitpunkt mit `prop_list()`-Eintrag mit `text` (`t_first`), dabei `len(filter(job_info(), {_, j -> job_status(j) ==# 'run'}))`; `t_exit` = erster Poll mit terminaler Phase in `llama#request#snapshot()`. Assert `jobs_running_at_first>=1`, `t_first < t_exit`, `t_exit - t_first >= 800` bei Szenario `slow` |
| Kein Retry | `GET /__stats/<szenario>` liefert `infill`-Zaehler; Messfenster laenger als die konfigurierte Backoff-Obergrenze; Assert Zaehler exakt 1 |
| Statusline ohne I/O | Vor/nach 100 Auswertungen von `llama#statusline()`: `len(job_info())`, `len(timer_info())`, `llama#status#snapshot()`, `llama#request#snapshot(bufnr)`, Server-Zaehler, `curl.log`-Zeilen gleich; Anker: Statusline nicht leer |
| Supersede | Server-Zaehler trennt A (1. Request) und B (2. Request); danach direkte Injektion `llama#request#on_data(idA, …)` / `on_exit(idA, …)`; Ghost-Text-Inhalt vor/nach gleich |
| Kein Server-Management | `mgmt.log` leer; Anker: `curl.log` enthaelt mindestens einen `/health`-Aufruf |
| Keine Retry-Schleife offline | `/health`-Zeilen in `curl.log` nach Status `unreachable` und nach weiteren 3 s unveraendert |

## Requirement-Zuordnung

| REQ | Scenario | @test |
|---|---|---|
| 001 | First installation preserves personal configuration | `REQ-VIM-AI-001 first install backs up existing vimrc before adding loader` |
| 001 | Repeated installation is idempotent | `REQ-VIM-AI-001 repeated install creates no duplicate loader block or backup` |
| 001 | Removal leaves upstream examples untouched | `REQ-VIM-AI-001 remove deletes only managed artifacts and keeps example copies` und `REQ-VIM-AI-001 real external example copies unchanged across install and remove` |
| 002 | Superseded response cannot replace current ghost text | `REQ-VIM-AI-002 superseded request A cannot update ghost text of request B` |
| 002 | Vim fallback remains functional without Neovim | `REQ-VIM-AI-002 Vim job and textprop adapter runs full lifecycle without Neovim` |
| 002 | Unsupported editor fails closed | `REQ-VIM-AI-002 editor without required capability registers no auto-FIM autocmds` |
| 003 | Partial frames are reassembled | `REQ-VIM-AI-003 parser emits split SSE NDJSON and final JSON deltas exactly once` und `REQ-VIM-AI-003 split SSE stream renders ordered accumulated ghost text` |
| 003 | First tokens become visible before request exit | `REQ-VIM-AI-003 first ghost text is visible before the curl job exits` |
| 003 | Repetition guard terminates a bad completion | `REQ-VIM-AI-003 repetition guard cancels request and freezes ghost text` |
| 004 | Transient failure recovers | `REQ-VIM-AI-004 HTTP 503 then success retries and renders completion` und `REQ-VIM-AI-004 HTTP 429 then success recovers within attempt limit` |
| 004 | Permanent failure is not retried | `REQ-VIM-AI-004 HTTP 400 exposes http_permanent and schedules no retry` |
| 004 | Disabling cancels delayed retry | `REQ-VIM-AI-004 LlamaDisable and FIM-disabling reload cancel pending retry` |
| 005 | Typo receives an actionable warning | `REQ-VIM-AI-005 typo endpiont_fim blocks auto-FIM and suggests endpoint_fim` |
| 005 | Excluded filetype never triggers automatic FIM | `REQ-VIM-AI-005 excluded markdown sends no auto request while manual FIM stays available` |
| 005 | Reload updates event registration | `REQ-VIM-AI-005 LlamaReloadConfig applies new exclusion and debounce without re-enable` |
| 006 | Enclosing function is retained within budget | `REQ-VIM-AI-006 enclosing function signature retained beyond static prefix window` |
| 006 | LSP definition receives priority | `REQ-VIM-AI-006 LSP definition chunk ranked before ring chunks within budget` |
| 006 | Missing LSP does not block completion | `REQ-VIM-AI-006 missing LSP still builds bounded context without fatal error` |
| 007 | Two windows retain independent requests | `REQ-VIM-AI-007 two buffers keep independent requests and ghost text` |
| 007 | Returning to a file reuses safe context | `REQ-VIM-AI-007 returning to a file reuses deduplicated file-keyed chunk` |
| 007 | Secret-like buffer is never retained | `REQ-VIM-AI-007 secret-like buffer is never stored in ring or sent as extra` |
| 008 | Offline startup remains usable | `REQ-VIM-AI-008 offline endpoint keeps startup responsive and settles unreachable without retry loop` |
| 008 | Explicit model wins over discovery | `REQ-VIM-AI-008 explicit model_fim stays selected while discovery enriches metadata` |
| 008 | Compatible model is auto-selected | `REQ-VIM-AI-008 positively marked FIM model auto-selected and unmarked list keeps default` |
| 009 | Defaults target the declared local loadout | `REQ-VIM-AI-009 effective defaults target loopback 8094 qwen38-220k 512 64 32` |
| 009 | Enable does not mutate server state | `REQ-VIM-AI-009 enable and health probe run no server-management command` |

Zusaetzlich: `REQ-VIM-AI-004 error classes cancelled transport timeout protocol are distinguished`,
`REQ-VIM-AI-002 nvim 0.10 adapter ignores superseded request` (skip ohne Neovim),
`REQ-VIM-AI-001 dry-run install and remove write nothing`,
`REQ-VIM-AI-008 statusline performs no I/O and LlamaStatus shows port and model`.

## Tasks

### 1. Fake-Server-Fixture schreiben (max. 1,5 h)

- [ ] `fake-server.mjs` nur mit `node:http`, `node:fs`, `node:url`. CLI:
  `--port-file <pfad>` (bindet `127.0.0.1:0`, schreibt den gewaehlten Port) und
  `--closed-port-file <pfad>` (bindet Port 0, schliesst ihn, schreibt die Nummer, beendet sich;
  liefert einen garantiert unbenutzten Offline-Port ohne feste Portwahl, WSL2 reserviert u. a.
  49152–49251). `SIGTERM` schliesst Server und offene Streams und beendet mit Exit 0.
- [ ] Routing `/s/<szenario>/<rest>` mit `rest` in `infill`, `health`, `props`, `v1/models`.
  Zaehler je Szenario und Route; `GET /__stats/<szenario>` liefert
  `{requests: {...}, closed_early, first_write_ms, end_ms}`.
- [ ] Szenarien:

  | Szenario | Verhalten |
  |---|---|
  | `sse-split` | Ein SSE-Record ueber mehrere `write()`-Aufrufe, Split mitten in JSON und im `\n\n`; ein Event mit zwei `data:`-Zeilen; Kommentarzeile; `data: [DONE]` |
  | `ndjson-split` | Drei JSON-Zeilen, Grenzen mitten im Objekt und im `\n` |
  | `slow` | Delta `one` bei 0 ms, `two` bei 600 ms, `three` plus Ende bei 1200 ms |
  | `repeat` | Alle 20 ms dieselbe Zeile bis 200 Records oder Client-Abbruch; Abbruch zaehlt `closed_early` |
  | `http-400` | Immer 400 mit JSON-Fehlerkoerper |
  | `http-429-once`, `http-503-once` | Erster `infill` mit Status, jeder weitere liefert `sse-split`-Erfolg |
  | `http-503-always` | Immer 503 (Retry-Timer bleibt planbar) |
  | `malformed` | 200 mit `data: {kaputt` und Ende |
  | `stall` | 200-Header, danach keine Bytes bis `SIGTERM` |
  | `final-json` | Nicht-streamendes `{"content": "..."}` |
  | `supersede` | Request 1 streamt `AAA`-Deltas alle 100 ms fuer 1500 ms; Request 2 liefert sofort `BBB` und `[DONE]` |
  | `models-fim`, `models-nofim` | `/v1/models` mit drei Modellen (`plain-chat`, `fim-a`, `fim-b`) mit bzw. ohne positive FIM-Kennzeichnung; `/props` mit `n_ctx` 24576; `/health` 200 |

- [ ] Fixture manuell pruefen (kein `@test`, die Fixture ist Testinfrastruktur):

  ```bash
  d=$(mktemp -d); node tests/fixtures/llama-vim/fake-server.mjs --port-file "$d/p" & pid=$!
  for i in $(seq 50); do [ -s "$d/p" ] && break; sleep 0.1; done
  curl -sN -X POST "http://127.0.0.1:$(cat "$d/p")/s/http-503-once/infill" -o /dev/null -w '%{http_code}\n'
  curl -s "http://127.0.0.1:$(cat "$d/p")/__stats/http-503-once"; kill -TERM "$pid"; wait "$pid"
  ```

Akzeptanz: erster Aufruf 503, Stats zeigen `infill: 1`, Prozess endet mit Exit 0.

### 2. request-stream.bats schreiben (max. 2 h)

- [ ] Header-Kommentar: `# Pruefmodus: Output-Verifikation (Result-Files aus headless Vim, Fake-Server-Zaehler); kein Source-Grep.`
- [ ] Guards, Shims, Fake-Server-Lebenszyklus und `WaitUntil` gemaess „Gemeinsame Testmechanik".
- [ ] Parser-Test ohne Server: dieselbe SSE-, NDJSON- und Final-JSON-Eingabe einmal als Ganzes und
  an jedem Byte-Split durch `llama#stream#feed()` fuehren; Assert gleiche geordnete `delta`-Folge,
  genau ein `done`; Anker: Delta-Folge nicht leer. `malformed` liefert ein `error`-Event mit
  `kind` `protocol`.
- [ ] Streaming-Tests ueber `llama#context#build()` + `llama#request#start()` bzw. `:LlamaFim`;
  sichtbares Ghost Text wird ueber `prop_list()`-Eintraege mit `text` gelesen.
- [ ] Repetition: Szenario `repeat`; Assert Phase terminal/cancelled, `closed_early>=1`, Ghost-Text
  unveraendert ueber 500 ms nach Cancel; Anker: `llama#render#is_repetitive()` liefert 1 fuer den
  Wiederholungstext und 0 fuer variierten Text.
- [ ] Retry: `http-503-once`/`http-429-once` mit kleinem Basis-Delay: `infill`-Zaehler 2, Ghost Text
  enthaelt Erfolgstext, kein terminaler Fehler. `http-400`: Messfenster groesser als Backoff-Cap,
  Zaehler exakt 1, strukturierter Fehler `http_permanent` (Anker: Fehler vorhanden). Disable-Test:
  `http-503-always` mit grossem Basis-Delay, warten bis Phase `retry_wait` (Anker), dann
  `:LlamaDisable` bzw. Reload auf FIM-deaktivierte Konfiguration; Zaehler nach Fenster weiter 1.
- [ ] Fehlerklassen: `stall` mit kurzem Overall-Timeout → `timeout`; Offline-Port aus
  `--closed-port-file` → `transport`; `llama#request#cancel()` → `cancelled`; `malformed` → `protocol`.
- [ ] Capability-Test in drei Faellen: `g:llama_capability_override = {'job': 0}`, dann
  `{'textprop': 0}`, dann `PATH` auf ein leeres Verzeichnis (curl fehlt); jeweils `:LlamaEnable`.
  Assert `len(autocmd_get())` unveraendert und `v:errmsg`/`execute('messages')` nicht leer.
  Anker: gleicher Ablauf ohne Override und mit Shim-`PATH` erhoeht die Autocmd-Anzahl.
- [ ] Vim-Adapter-Test: `has('nvim')==0`, Lebenszyklus start → streaming → sichtbar → cancel →
  keine Props und kein laufender Job; `execute('scriptnames')` enthaelt keinen `lua/llama`-Pfad.
- [ ] Neovim-Test mit `nvim --headless -u NONE -i NONE`, gleichem runtimepath und Szenario
  `supersede`; skip ohne Neovim 0.10+.

### 3. install-config.bats schreiben (max. 1,5 h)

- [ ] Header-Kommentar mit Pruefmodus wie oben.
- [ ] Installer-Tests rufen `bash "$REPO/scripts/vim/install-llama.sh"` unter isoliertem `HOME` auf
  und messen per `sha256sum`, nicht ueber Markertexte:
  - Erstinstallation: vorhandene `.vimrc` mit bekanntem Inhalt; nach `--install` existiert unter
    `$HOME` genau eine Datei mit dem Original-Hash (Sicherung), `.vimrc` hat einen anderen Hash,
    `$HOME/.vim/pack/bachelorprojekt/opt/llama-vim/plugin/llama.vim` existiert. Lade-Assertion
    (nur mit Vim): `vim -N -u "$HOME/.vimrc" -i NONE -n -es` mit `packadd llama-vim` setzt
    `g:loaded_repo_llama_vim`.
  - Idempotenz: zweites `--install`; `.vimrc`-Hash und Anzahl der Sicherungsdateien unveraendert.
    Anker: nach dem ersten Lauf unterscheidet sich der Hash vom Original.
  - Removal: Fake-Kopien `$HOME/.unsloth/llama.cpp/examples/llama.vim` und
    `$HOME/opt/llama.cpp-src/examples/llama.vim` anlegen; `--install`, `--remove`; Assert Paket
    fehlt, `.vimrc` hat wieder den Original-Hash, beide Kopien byte-identisch (Hash vor/nach).
  - Echte Kopien: realen Home-Pfad in `setup_file` vor dem `HOME`-Override sichern; existieren beide
    Dateien nicht, `skip`. Sonst nur `sha256sum` vor Install und nach Remove (read-only).
  - Dry-run: Baumliste plus Hashes von `$HOME` vor/nach `--install --dry-run` und
    `--remove --dry-run` gleich; Anker: Exit 0 und Ausgabe nicht leer.
- [ ] Konfigtests (Vim): `endpiont_fim` → `llama#config#load().diagnostics` enthaelt Substring
  `endpoint_fim`, `llama#config#reload().auto_allowed==0`; Anker: korrekter Key liefert
  `auto_allowed==1`. Markdown-Ausschluss: `llama#config#eligibility(bufnr, 0).allowed==0` und
  `eligibility(bufnr, 1).allowed==1`; Auto-Events in Markdown → `infill`-Zaehler 0, dieselben
  Events in `text`-Buffer → Zaehler >=1 (Anker). Reload: erst ohne Ausschluss Zaehler >=1, dann
  `g:llama_config` aendern, `:LlamaReloadConfig`, Zaehler-Delta 0, `diff.events_changed==1`,
  eine vorher definierte Nutzer-Augroup behaelt ihre `autocmd_get()`-Anzahl.
- [ ] Defaults: ohne Overrides `llama#config#load().effective` mit Endpoint
  `http://127.0.0.1:8094/infill`, Modell `qwen38-220k`, Prefix 512, Suffix 64, Ring 32.
  Server-Management: `:LlamaEnable` gegen Offline-Port; `mgmt.log` leer, `curl.log` enthaelt `/health`.

### 4. context-status.bats schreiben (max. 2 h)

- [ ] Header-Kommentar mit Pruefmodus wie oben.
- [ ] Kontext: TypeScript-Datei mit 40 Fuellzeilen, Funktion `function fooBar(a, b) {` ab Zeile 41,
  Cursor in Zeile 70, Prefix-Zeilenlimit 10. `payload.input_prefix` enthaelt die Signatur (ein
  statisches 10-Zeilen-Fenster enthielte sie nicht) und keine Zeile nach dem Cursor.
  LSP-Prioritaet: Ring-Chunk aus Buffer B per `llama#context#remember()`, Definition-Chunk per
  `llama#context#add_extra()`; in `input_extra` steht der Definition-Marker vor dem Ring-Marker und
  `payload.usage` bleibt im Budget. Fehlendes LSP: `ok==1`, Prefix enthaelt die Cursorzeile.
- [ ] Multi-Buffer: zwei Buffer, Szenario `slow`, Cancel in Buffer 1; Buffer 2 bleibt aktiv und
  rendert, Buffer 1 hat keine Props. Wiederkehr: `remember(A)` zweimal → `llama#context#stats()`
  zaehlt einmal; Build in B enthaelt den A-Marker mit kanonischem Pfad (`resolve()`). Secret:
  `$HOME/proj/.env` mit Marker, `remember()` plus `BufEnter`/`BufLeave`; Stats unveraendert, Marker
  nicht in `input_extra`, `eligibility(bufnr, 1).allowed==0`; Anker: normaler Datei-Marker ist
  enthalten und Stats wuchsen.
- [ ] Status: Offline-Port; Zeit von `runtime plugin/llama.vim` bis Rueckkehr von `:LlamaEnable`
  unter 500 ms; `WaitUntil` bis `llama#status#snapshot()` den Zustand `unreachable` meldet;
  `/health`-Zeilen in `curl.log` >=1 und 3 s spaeter unveraendert. Discovery mit `models-fim`
  und explizitem `qwen38-220k`: Modell bleibt, Kontextkapazitaet 24576 erscheint. Ohne explizites
  Modell: `fim-a` gewaehlt; mit `models-nofim`: Default bleibt, Diagnostik nicht leer.
  Statusline-Test gemaess Messbarkeitstabelle; `execute('LlamaStatus')` enthaelt Port und Modell.

### 5. RED-Gate ausfuehren (max. 1 h)

- [ ] Gesamte Suite rot laufen lassen, bevor p1–p3 existieren:

  ```bash
  tests/unit/lib/bats-core/bin/bats -r --formatter tap tests/spec/vim-ai-completion/ | tee "$(mktemp)"
  # expected: FAIL — editor/llama-vim/ und scripts/vim/install-llama.sh existieren noch nicht
  ```

- [ ] Rotursache je Datei belegen:
  - `request-stream.bats`: `runtime plugin/llama.vim` laedt nichts, `llama#stream#feed()` und
    `llama#request#start()` enden mit E117; die Result-Files fehlen oder melden `ok=0`.
  - `install-config.bats`: Installer fehlt (Exit 127), `llama#config#*` endet mit E117.
  - `context-status.bats`: `llama#context#*` und `llama#status#*` enden mit E117.
- [ ] Skips duerfen nicht als rot zaehlen. Lokal sind Vim 9.1 mit `+job +timers +textprop +channel`,
  Node 22 und curl vorhanden. Erlaubt sind nur der Neovim-Test und, falls die realen Kopien
  fehlen, der Test fuer echte Kopien. Pruefung: jede Zeile mit `# skip` in der TAP-Ausgabe gehoert
  zu einem dieser Namen, alle uebrigen Tests sind `not ok`. Ein unerwartet gruener oder
  geskippter Feature-Test ist ein Befund am Test und wird vor der Uebergabe korrigiert.
- [ ] Fixture-Fehler ausschliessen: kein `fake-server nicht gestartet` in der Ausgabe.

### 6. Verify nach p1–p3 (max. 1 h)

- [ ] GREEN zweimal hintereinander ausfuehren, um Flakiness und geleakte Jobs/Timer zu sehen;
  Testanzahl je Datei bestaetigen; Inventar regenerieren. Erwartete generierte Aenderung:
  `components/website/src/data/test-inventory.json`.

  ```bash
  tests/unit/lib/bats-core/bin/bats -r tests/spec/vim-ai-completion/
  tests/unit/lib/bats-core/bin/bats -r tests/spec/vim-ai-completion/
  tests/unit/lib/bats-core/bin/bats --count tests/spec/vim-ai-completion/request-stream.bats
  tests/unit/lib/bats-core/bin/bats --count tests/spec/vim-ai-completion/install-config.bats
  tests/unit/lib/bats-core/bin/bats --count tests/spec/vim-ai-completion/context-status.bats
  task test:inventory
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

- [ ] Nach jedem Lauf pruefen: `git status` zeigt keine Aenderung ausserhalb der vier Zieldateien
  und des Inventars; der reale Home-Pfad erhielt keine neuen Dateien unter `.vim/pack/bachelorprojekt`.

## Risiken

- R1 CI skippt die Vim-Suite: `.github/workflows/ci.yml` laeuft auf `ubuntu-latest` mit Node 22 und
  installiert kein vim; das Ubuntu-24.04-Runner-Readme listet kein vim. Nur die Installer-Tests
  ohne Lade-Assertion laufen dort. Die Plugin-Verifikation ist damit lokal gebunden. Ein
  `ci.yml`-Edit gehoert nicht in dieses Partial und wird dem Plan-Owner uebergeben.
- R2 `task test:changed` braucht GNU `parallel` (lokal vorhanden); ohne es laeuft nichts.
- R3 Zeitgrenzen (500 ms Startup, 800 ms Streaming-Abstand) koennen auf ausgelasteten Maschinen
  knapp werden; die Szenario-Abstaende sind deshalb deutlich groesser als die Poll-Aufloesung.

## Festgelegte Schnittstellen

Die frueheren Luecken L1–L9 sind im Index-Review geschlossen. Verbindlich sind `tasks.md`
§Config keys und §Data shapes; die Suite verwendet ausschliesslich diese Namen:

- Request- und Status-Snapshot-Felder, Phasen, `last_error {kind, detail, http_status}`.
- Config-Keys inklusive `n_prefix`/`n_suffix`/`ring_n_chunks`, Retry-, Timeout-, Repetition- und
  `path_exclude`-Keys; `auto_fim: v:false` schaltet FIM beim Reload ab.
- Fixture markiert FIM-faehige Modelle ueber `capabilities: ['infill']` in `/v1/models`; ein
  Eintrag ohne diese Liste ist mehrdeutig.
- Probe-URLs sind Origin von `endpoint_fim` plus `/health`, `/props`, `/v1/models`.
- Auto-FIM-Tests loesen `doautocmd TextChangedI` bzw. `CursorMovedI` aus.
- Der Capability-Test setzt `g:llama_capability_override = {'job': 0}` und separat
  `{'textprop': 0}` und deckt damit beide Zweige ab; fehlendes curl bleibt ein dritter Fall.
- Chunk-`source`-Werte `lsp_definition`, `lsp_reference`, `ring` fuer die Ranking-Assertion.
- `position {lnum, col}`, `opts.anchor {lnum, col, changedtick}` und
  `on_exit`-`result {exit_code, http_status}` fuer die Late-Callback-Injektion.
