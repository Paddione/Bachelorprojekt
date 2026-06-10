# Spec: „Auswahl ans Terminal" — Submit-Knopf für alle Companion-Encounter

**Ticket:** _(wird von dev-flow-plan gesetzt)_
**Branch:** `feature/brainstorm-submit-to-terminal`
**Datum:** 2026-06-10
**Status:** design-approved
**Verwandt:** PR #1524 (WSL-Bridge), `reference_brainstorm_bridge_wsl`, `feedback_grilling_html_form`, `project_collab_brainstorm_tunnel`

---

## 1. Vision & Goal

**`/goal`:** In **jedem** Brainstorm-/Grilling-Encounter des superpowers Visual Companions kann der Nutzer seine **komplette** Auswahl (markierte Optionen + Formularfelder) per **einem Knopf** in der HTML-Maske zurück in den Terminal geben — ohne manuelles Markdown-Kopieren.

**Nutzer-Fluss (bestätigt):** Nutzer markiert in der Maske → drückt „✓ Auswahl ans Terminal" → die Auswahl landet in der Windows-Zwischenablage → Nutzer fügt mit **Strg+V** im Terminal ein (vorausgefüllt) und drückt **Enter** (bestätigt = sendet). Parallel wird die Auswahl strukturiert in `state/submission.json` abgelegt, die ich (der Agent) beim nächsten Zug ziehen kann.

## 2. Scope-Entscheidungen

| Dimension | Entscheidung | Begründung |
|---|---|---|
| Rückkanal-Modus | **Clipboard-primär + strukturierte Datei** | Vom Owner gewählt; lokal 1× Strg+V, plus maschinenlesbare `submission.json` |
| Erfassungsumfang | **Komplette Maske** — alle `.selected` (Options/Cards) + alle nativen Felder (input/textarea/select, radio/checkbox) + Frage-Überschrift | „während *aller* Encounter", beliebige Maskeninhalte |
| Knopf-Platzierung | **helper.js-injizierter, schwebender Knopf** (nicht frame-template) | helper.js wird in JEDEN Screen injiziert (frame-umhüllt **und** Full-Document); frame-template fehlt bei Full-Docs |
| **Autorisierung** | **Kanal-Isolation: separater, nur an `127.0.0.1` gebundener HTTP-Listener, NICHT in `tailscale serve/funnel` gemappt** | Strukturelle read-only-Garantie übers Funnel — **kein zirkulierendes Geheimnis** (siehe §5) |
| **Remote-gekko-Submit** | **OUT — bleibt read-only** (erzwungen) | Ein Schreibkanal auf dem öffentlichen Board bräche die Härtung; lokaler Owner-Submit ist sicher, remote nicht |
| Board-Server (`server.cjs` WS/HARDEN_PUBLIC) | **unangetastet** | Submit läuft über separaten Listener → keine Origin-/HARDEN_PUBLIC-/Anker-Kollision mit dem harden-Patch |
| Auslieferung | **Eigenes Patch-Skript** `scripts/superpowers-submit-patch.sh` (Marker `brainstorm-submit v1`) | harden-Skript überspringt bereits gemarkerte Dateien → neue PATCHES dort würden NIE angewandt |
| Clipboard-/Datei-Format | **Sentinel-Block** `«BRAINSTORM-AUSWAHL» … «ENDE»` | Eindeutig vom restlichen Prompt-Text abgrenzbar → verlustfrei parsebar |

## 3. Architektur-Überblick

```
 Windows-Browser (Owner)                          WSL-Host (Node server.cjs, gepatcht)
 ┌───────────────────────────┐                    ┌──────────────────────────────────────┐
 │ http://localhost:47600  ──────── GET / ───────► │ Board-Listener 0.0.0.0:47600 (PUBLIC)  │
 │  (read-only Board + helper)│                    │  • via tailscale funnel öffentlich     │
 │                            │ ◄── reload (WS) ─── │  • WS bleibt read-only (HARDEN_PUBLIC) │
 │ [✓ Auswahl ans Terminal]   │                    │                                        │
 │   POST /submit ───────────────────────────────► │ Submit-Listener 127.0.0.1:47601 (LOKAL)│
 └───────────────────────────┘  (nur loopback,     │  • NICHT funnel-gemappt                │
                                  http→http,        │  • Origin-Allowlist (CSRF)             │
   Strg+V ◄── Windows-Clipboard ◄── clip.exe ────── │  • schreibt submission.json + events   │
                                                    │  • pusht Markdown → clip.exe           │
 Remote gekko (https://magicdns/) ── GET / ───────► │  (read-only; Submit-Knopf rendert NICHT:│
                                                    │   https + nicht-localhost → kein Submit)│
                                                    └──────────────────────────────────────┘
```

**Warum das übers Funnel strukturell read-only bleibt:**
1. `tailscale funnel/serve --https=443 http://127.0.0.1:47600` proxyt **nur den Board-Port**. Der Submit-Port 47601 ist **nicht** gemappt → von außen unerreichbar.
2. Der Submit-Listener bindet **`127.0.0.1`** (nicht `0.0.0.0`) → nicht mal über die Tailnet-/LAN-IP erreichbar, nur same-host loopback (WSL mirrored mode teilt 127.0.0.1 mit Windows).
3. Der Submit-Knopf **rendert nur**, wenn `location.protocol === 'http:'` **und** Hostname `localhost`/`127.0.0.1`. Die öffentliche Funnel-Seite ist `https://magicdns` → Knopf erscheint nicht; ein `fetch` von `https://` nach `http://localhost` wäre ohnehin **Mixed-Content-blockiert**. Doppelte Absicherung.
4. **Kein Token** als Vertraulichkeits-Anker nötig → kein Leak-Risiko über Logs/HTML/Broadcast.

## 4. Komponenten-Design

### 4.1 `server.cjs`-Patch (via `superpowers-submit-patch.sh`, Marker `brainstorm-submit v1`)

Additiv, **ohne** den Board-WS-Pfad / `handleMessage` / `HARDEN_PUBLIC` anzufassen:

- **Submit-Port:** `let submitPort = null;` (modul-level); `const SUBMIT_PORT_PREF = Number(process.env.BRAINSTORM_SUBMIT_PORT) || (Number(PORT) + 1);`
- **Submit-Listener** in `startServer()` (nach dem Board-`server.listen`): `http.createServer(handleSubmit).listen(SUBMIT_PORT_PREF, '127.0.0.1', …)`; bei `EADDRINUSE` nächsten freien loopback-Port wählen; gebundenen Port in `submitPort` schreiben.
- **`handleSubmit(req,res)`:**
  - `OPTIONS` → CORS-Preflight beantworten (ACAO = anfragende Origin **nur wenn** in Allowlist, `Allow-Methods: POST`, `Allow-Headers: content-type`).
  - `POST /submit`:
    1. **Origin-Allowlist** (CSRF): `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}` (Board-Port). Sonst 403. Kein Origin → 403.
    2. Body lesen mit **hartem Größen-Cap** (z.B. 32 KB); JSON-parse in try/catch.
    3. **Nonce-Dedupe:** `event.nonce` gegen `lastNonce` — Duplikat → 200 (idempotent), kein erneuter Seiteneffekt.
    4. **`submission.json` atomar schreiben:** tmp + `rename`, `{mode:0o600}`; Inhalt `{v:1, ts, seq, screen, question, selected:[{choice,label}], fields:{…}, markdown}`.
    5. **`events` anhängen** (eine Zeile, längen-gecappt analog `HARDEN_MAX_EVENT`): `{"type":"submit","ts":…,"nonce":…,"choice":"<primär-selected||'submit'>", …}` — hält `brainstorm-extract-choice.sh` (greppt `"choice":"X"`) funktionsfähig.
    6. **`clip.exe`-Push:** `spawn('clip.exe')` (Fallback `/mnt/c/Windows/System32/clip.exe`), `markdown` (längen-gecappt) auf stdin; try/catch, ENOENT → no-op (echtes Linux). **Niemals** ein Datei-/Pfadbestandteil aus dem Payload.
    7. 200 JSON `{ok:true}`.
- **`submission.json`-Clear:** im `screen-added`-Zweig (Anker: der `events`-`unlinkSync`-Block, count=1) **zusätzlich** `submission.json` löschen; **und** beim Server-Start (stale aus voriger Laufzeit).
- **Port-Injektion in `/`-HTML:** im Inject-Block (`html.includes('</body>')`, count=1) zusätzlich `<script>window.__BRAINSTORM_SUBMIT_PORT=${submitPort||0};</script>` einspeisen. **Nicht-geheim** (nur eine Portnummer; öffentlich erreichbar ist der Port trotzdem nicht).

### 4.2 `helper.js`-Patch (angehängter IIFE, Vorbild: collab-Block)

- Eigener Marker `brainstorm-submit v1` + Doppel-Injektions-Guard `if (window.__brainstormSubmit) return; window.__brainstormSubmit = true;`.
- **Render-Gate:** nur wenn `location.protocol === 'http:' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1') && window.__BRAINSTORM_SUBMIT_PORT`. Sonst nichts (Funnel/remote bleibt knopflos).
- **Schwebender Knopf**, vollständig **inline-gestylt** (frame-unabhängig: eigene Farben, `position:fixed; bottom:12px; left:12px; z-index:99999` — getrennt vom collab-Panel unten-rechts). Erzeugung DOM-basiert (kein `innerHTML` mit Inhalt), nach `DOMContentLoaded`/`readyState`-Guard (Full-Docs ohne `</body>` → helper läuft evtl. vor fertigem DOM).
- **`gatherSelection()`** (reines DOM-Lesen):
  - `.options .selected, .cards .selected` → `{choice: dataset.choice, label: (h3||textContent).trim().slice(0,200)}`.
  - `input, textarea, select` → key `name||id`; radio/checkbox nur `.checked`; sonst `.value`.
  - Frage: `h2 ?? h1 ?? document.title`.
  - **Leer-Guard:** keine Auswahl & keine Felder → Inline-Warnung „Nichts ausgewählt", **kein** Submit (kein Leer-Prompt).
- **`renderMarkdown(sel)`** → Sentinel-Block (siehe §4.4).
- **Submit:** `fetch('http://localhost:'+port+'/submit', {method:'POST', headers, body: JSON.stringify({...sel, markdown, nonce})})`. **Kein** `eventQueue`/Reconnect-Replay (eigener fetch, nicht über `sendEvent`). Erfolg → Knopf ~1.5 s disablen + Feedback „✓ kopiert — jetzt Strg+V im Terminal". Fehler/Netz → „nur lokal verfügbar".
- `window.brainstorm = Object.assign(window.brainstorm || {}, { submit: … })` — **kein** String-Replace am bestehenden Objekt.

### 4.3 `brainstorm-bridge.sh`

- Neues Subcommand **`submission`** → `cmd_submission()` druckt `${s}state/submission.json` (roh). Bestehendes `choice` unangetastet.
- **Kein** Token-Druck nötig (kein Token im Design). URL-Menü bleibt; optional eine Hinweiszeile „Submit-Knopf nur über die localhost-URL".
- **`service install` + `cmd_start`:** nach `brainstorm-companion-harden.sh` **zusätzlich** `superpowers-submit-patch.sh` aufrufen (idempotent), damit der Dauer-Service den Submit-Code trägt.

### 4.4 Format (Clipboard **und** `submission.json.markdown`)

```
«BRAINSTORM-AUSWAHL»
Frage: <Frage-Text>
- Auswahl: B — "Variante mit X"
- Auswahl: D — "…"            (mehrere Zeilen bei Multi-Select)
- Feld[projektname]: Acme
- Feld[budget]: 5000
«ENDE»
```

`submission.json`: `{"v":1,"ts":<ms>,"seq":<n>,"nonce":"<rand>","screen":"<dateiname>","question":"…","selected":[{"choice":"B","label":"…"}],"fields":{"projektname":"Acme"},"markdown":"<derselbe Sentinel-Block>"}`.

## 5. Sicherheitsmodell (aus 3-Dimensionen-Adversarial-Review)

| Bedrohung | Schutz |
|---|---|
| Öffentlicher Funnel-Besucher sendet Submit | **Kanal-Isolation**: Submit-Listener `127.0.0.1`, nicht funnel-gemappt; Knopf rendert nur auf http-localhost; https→http-localhost mixed-content-blockiert |
| Lokale CSRF (andere Browser-Seite POSTet an `127.0.0.1:47601`) | **Origin-Allowlist** (nur Board-Origins); kein Origin → 403 |
| clip.exe als Host-Seiteneffekt / Prozess-Spawn-DoS | **Nonce-Dedupe** + Client-Debounce + Größen-Cap am clip-stdin; clip nur bei akzeptiertem Submit |
| Clipboard→Strg+V→Enter = Prompt-Injection in den Agenten | Inhalt als **untrusted** behandeln; **kein Auto-Send** — Owner sieht den eingefügten Text und drückt selbst Enter (menschliches Gate) |
| Datei-/Pfad-/JSON-Injektion | submission-Pfad **hartkodiert**, nie aus Payload; `JSON.stringify` statt Concat |
| `submission.json`/`events`/state world-readable | `state/` `mode 700`, Dateien `mode 600`; state nie über `/files/` erreichbar (Invariante testen) |
| Stale-/Race-Submission | atomar tmp+rename; Clear gemeinsam mit `events` im `screen-added`-Zweig + bei Start; `screen`-Feld zum Verwerfen veralteter Submissions |

**Bewusst NICHT load-bearing:** Origin-Check & (verworfenes) Token sind Defense-in-Depth — die read-only-Garantie übers Funnel ruht allein auf der **Kanal-Isolation** (loopback-Port nicht gemappt).

## 6. Out of Scope

- **Remote-Submit (gekko über Funnel)** — bleibt read-only (Sicherheit). Falls je gewünscht: separater, authentifizierter Remote-Kanal als eigenes Feature.
- Token-basierte Autorisierung (durch Kanal-Isolation überflüssig).
- Änderungen am Board-WS-/HARDEN_PUBLIC-Pfad oder am bestehenden `choice`-Workflow.
- frame-template.html-Edit (Knopf kommt JS-floating).

## 7. Risiken & offene Punkte

- **clip.exe aus systemd --user-Service:** Windows-Interop-PATH evtl. nicht gesetzt → Fallback auf absoluten Pfad `/mnt/c/Windows/System32/clip.exe`; falls auch das fehlt, degradiert sauber (nur Datei-Pfad, kein Clipboard). Im Plan verifizieren.
- **Mirrored vs. NAT networking:** Design nimmt mirrored mode an (Doc bestätigt). In NAT-Mode forwardet WSL2 localhost ebenfalls → bleibt funktionsfähig; Tailnet-IP-Bind wäre dann aber anders — daher strikt `127.0.0.1`.
- **Port 47601 belegt:** Listener wählt freien loopback-Port + injiziert ihn → Knopf nutzt den echten Port.
- **Plugin-Update:** Patches sind marker-guarded + re-anwendbar; `--check`-Modus für CI/SessionStart wie bei collab/harden.

## 8. Teststrategie

- **bats** für `superpowers-submit-patch.sh`: idempotent (2× apply = 1× Effekt), `--check` Exit-Codes, Anker-Eindeutigkeit (Abbruch bei Drift), Marker-Skip.
- **Node-Smoke** (offline): Submit-Listener lokal starten, `POST /submit` mit gültiger/ungültiger Origin → 200/403; `submission.json` (mode 600) + `events`-Zeile geschrieben; Leer-Submit-Guard; Nonce-Dedupe.
- **Manuell:** localhost-Board → markieren → Knopf → Feedback → Strg+V im Terminal zeigt Sentinel-Block; Funnel-Seite → Knopf fehlt; `brainstorm-bridge.sh submission` druckt JSON.
- `task test:all` lokal grün (inkl. der neuen bats), `freshness:check` falls Artefakte betroffen.

## 9. Referenzen

- Quelle: `~/.claude/plugins/cache/.../skills/brainstorming/scripts/{server.cjs,helper.js,frame-template.html}`
- Muster: `scripts/superpowers-collab-patch.sh` (+ `scripts/superpowers-collab/helper-collab.js`), `scripts/brainstorm-companion-harden.sh`
- Bridge: `scripts/brainstorm-bridge.sh`, `scripts/brainstorm-extract-choice.sh`, `scripts/wsl-open.sh`
- Doc: `docs/superpowers/references/brainstorm-bridge-wsl.md`
