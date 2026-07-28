---
ticket_id: T002394
plan_ref: null
status: active
date: 2026-07-28
---

# LLM-Loadout-UI — Design

Ein einfaches Web-UI im bestehenden `llm-proxy`, mit dem lokale GGUF-Modelle ausgewählt,
mit eigenen Einstellungen als **Loadout** gespeichert und als WSL-native `llama-server`-Prozesse
gestartet, gestoppt und erneut gestartet werden können.

## Problem

Die Steuerung der lokalen LLM-Server ist heute auf drei Orte verteilt, von denen nur zwei eine
Registry haben:

| Ebene | Registry | API | UI |
|---|---|---|---|
| Routing (`tickets.provider_config`) | Postgres | `/api/admin/ki/providers` | `/admin/ki-konfiguration` |
| Proxy-Backends (`tickets.llm_proxy_backends`) | Postgres | `/api/admin/llm-proxy/backends` | **keins** (API ohne Oberfläche) |
| **Loadout** (wie ein Modell startet) | **keine** — Code in `scripts/llm/start-*.ps1` | — | — |

Die Loadout-Parameter (Modellpfad, `-c`, `-ngl`, `-ctk`, `-np`, Port) existieren nur als
PowerShell-Code, und zwar **doppelt**: einmal in `start-<modell>-server.ps1`, einmal in
`register-scheduled-tasks.ps1`. Diese Duplikation hat bereits einen Produktionsfehler erzeugt
(T002274: der Bonsai-Scheduled-Task zeigte auf eine nicht existierende Datei und nutzte den
falschen Build). Es fehlt die Registry, aus der beide Seiten abgeleitet werden könnten.

## Nicht-Ziele

- **Keine Steuerung der Windows-Server.** Das UI verwaltet ausschließlich WSL-native
  `llama-server`-Prozesse. Die Windows-Seite bleibt bei PowerShell-Skripten und Scheduled Tasks.
  Grund: der WSL-Interop war zuletzt vollständig defekt (`Invalid argument` bei jedem `.exe`),
  eine Agent-Architektur pro Host wäre unverhältnismäßig.
- **Keine Astro-Admin-Seite.** Die Website läuft im Cluster (Namespace `website`) und kann
  keinen Prozess auf dem WSL-Host starten. Sie bleibt für datenbankgestützte Konfiguration
  (`provider_config`) zuständig.
- **Kein Modell-Download aus dem UI.** Modelle werden weiterhin per `hf download` geholt.
- **Keine Autostart-Verwaltung.** Persistenz über Reboots ist ein späterer Schritt.

## Architekturentscheidungen

### E1 — Das UI lebt im `llm-proxy`

`llm-proxy` ist der einzige vorhandene Dienst, der eine HTTP-Fläche hat **und** auf demselben
Host läuft wie die zu startenden Server (systemd-User-Unit, `127.0.0.1:18235`,
`WorkingDirectory=/home/patrick/Bachelorprojekt`). Er hat mit `/admin/state` und `/admin/reload`
bereits Admin-Routen.

Der ausschlaggebende Vorteil: nach einem Start kann direkt `discovery.probeNow()` aufgerufen
werden. Ein externer Dienst müsste den Proxy per HTTP anstoßen und die Race zwischen „Unit
gestartet" und „Server antwortet" selbst behandeln — bei einem als ungesund markierten Backend
kämen zusätzlich 15 s `BACKOFF_MS` dazu.

### E2 — Loadouts liegen in einer versionierten Datei, nicht in Postgres

`scripts/llm/loadouts.json`, im Git verwaltet.

Postgres scheidet aus, obwohl `llm_proxy_backends` dort liegt: die Backend-Registry wird per
`kubectl exec … psql` gelesen, und die Unit dokumentiert selbst, dass beim Kaltstart ohne
erreichbaren Cluster der Stand **leer** ist. Für eine Routing-Tabelle ist das verschmerzbar. Für
Loadouts wäre es fatal — das Werkzeug zum Hochfahren lokaler Inferenz hinge dann an der
Erreichbarkeit eines Kubernetes-Clusters. Hinzu kommt, dass `llm_proxy_backends` **pro Brand
doppelt** existiert, während Loadouts brandneutral sind.

### E3 — Prozesse laufen als transiente systemd-User-Units

`systemd-run --user --unit=llama-<slug> --collect -- llama-server …`

Damit sind Supervision, Logs (journald), sauberes Stoppen und Statusabfrage vorhanden, statt
nachgebaut zu werden. Entscheidend ist die **Nicht-Kind-Beziehung**: der Serverprozess hängt
nicht am Proxy. Der Proxy hat `Restart=always` und wird bewusst nicht per Healthcheck überwacht;
als Kindprozesse würden geladene Modelle bei jedem Proxy-Neustart mitgerissen — bei 12 GB
Gewichten rund eine halbe Minute Nachladezeit pro Vorfall.

`--collect` ist nicht optional: ohne das Flag bleiben fehlgeschlagene transiente Units im
Zustand `failed` und blockieren den Unit-Namen, sodass der nächste Startversuch mit
„unit already exists" scheitert, obwohl nichts läuft.

Voraussetzung erfüllt: `systemctl --user is-system-running` meldet `running`, `systemd-run` ist
vorhanden, und es laufen bereits sieben User-Units (u. a. `llm-proxy`, `factory-mcp`).

### E4 — `--fit` entscheidet über Kontext und Layer-Offload, nicht das UI

**Dies ist die wichtigste Entscheidung des Designs und beruht auf einer Messung.**

llama.cpp b10155 hat `--fit` standardmäßig auf `on`: „whether to adjust **unset** arguments to
fit in device memory". Dazu `-fitt` (Zielmarge pro Gerät, Default 1024 MiB) und `-fitc`
(Mindestkontext, Default 4096). `-ngl` hat den Default `auto`.

Weil `--fit` nur *ungesetzte* Argumente anfasst, schaltet jedes explizit gesetzte `-c` oder
`-ngl` die eingebaute Anpassung für diesen Parameter ab. Ein Vorab-Prototyp
(`tmp/claude-scratch/llm/llm-code-server.sh`) hat genau das getan — GGUF-`block_count` gelesen,
freies VRAM gemessen, `-ngl` selbst berechnet — und dadurch messbar geschadet:

| Variante | Kontext | decode |
|---|---:|---:|
| handgesetzt `-ngl 19 -c 65536` | 65.536 | 30,9 tok/s |
| `--fit on -fitt 2400`, `ngl`/`ctx` ungesetzt | 104.960 | 145,8 / 152,7 tok/s |

**Faktor 4,9 bei gleichzeitig 60 % mehr Kontext**, gemessen am 2026-07-28 mit
`gpt-oss-20b-Q8_0` auf RTX 5070 Ti bei ~11 GB freiem VRAM. Ursache: `--fit` kennt die
tatsächlichen Puffergrößen zur Ladezeit, eine Vorabformel nur die Gewichtsgröße.

Verschärfend kommt hinzu, dass die Handrechnung `block_count` aus dem GGUF-Header liest — das
sind die regulären Layer **ohne** MTP-/nextn-Draft-Blöcke. Upstream-Fix #26147 zählt diese
inzwischen in `n_gpu_layers` mit; wer `--fit` umgeht, holt sich den Fehler zurück. Zwei der
vorgesehenen Modelle (`Qwopus3.5-9B-Coder-MTP`, `Qwopus3.6-35B-A3B-Coder-MTP`) sind betroffen.

Konsequenz für das Datenmodell: **`null` bedeutet „llama.cpp entscheidet", eine Zahl bedeutet
„gepinnt".** `-fitt` ersetzt jede eigene VRAM-Reserve-Logik. Die Koexistenz mit `bge-m3` (:8095)
und `bge-reranker` (:8096) wird über die Zielmarge ausgedrückt, nicht über Vorabprüfungen.

Anmerkung: `-fitt` ist ein Ziel, keine Garantie. Bei `-fitt 2400` blieben gemessen 354 MiB frei.
Der Wert ist ein Erfahrungswert und gehört ins Loadout, nicht in eine globale Konstante.

## Datenmodell

`scripts/llm/loadouts.json`:

```json
{
  "version": 1,
  "modelRoots": [
    "~/models/gguf",
    "/mnt/c/Users/PatrickKorczewski/.lmstudio/models"
  ],
  "defaults": { "host": "0.0.0.0" },
  "loadouts": [
    {
      "slug": "gptoss-context",
      "label": "gpt-oss-20b · maximaler Kontext",
      "model": "gptoss20/gpt-oss-20b-Q8_0.gguf",
      "port": 8098,
      "fit": { "enabled": true, "targetMarginMib": 2400, "minCtx": 16384 },
      "args": {
        "ctx": null,
        "ngl": null,
        "parallel": 1,
        "cacheTypeK": "q8_0",
        "cacheTypeV": "q8_0",
        "loadMode": "mmap",
        "flashAttention": true,
        "jinja": true,
        "metrics": true,
        "reasoning": "auto",
        "reasoningBudget": null
      },
      "speculative": { "draftHfRepo": null, "draftNgl": null },
      "mcp": { "serversConfig": null },
      "extraArgs": [],
      "notes": "MXFP4-nativ: alle Quants 11,5–12,1 GB, Q8_0 ist praktisch gratis"
    }
  ]
}
```

Festlegungen:

- **`model` ist relativ zu `modelRoots`.** Portabel, und im Diff steht der Modellname statt
  eines 80-Zeichen-Pfads.
- **`args` ist getippt, `extraArgs` ist die Fluchtluke.** Das UI bietet Formularfelder für die
  gängigen Parameter, ohne seltene Flags zu verbauen.
- **`loadMode`** bildet `-lm {none,mmap,mlock,mmap+mlock,dio}` ab. `--mlock`, `--no-mmap` und
  `--direct-io` sind in b10155 deprecated. Relevant bei MoE-CPU-Offload, wo mmap vs. mlock über
  Swapping entscheidet.
- **`speculative` und `mcp`** decken `--spec-draft-*` bzw. `--mcp-servers-config` /
  `--mcp-servers-json` ab.
- **`fit.enabled: false` zusammen mit `ctx: null` ist ungültig** und wird von `loadouts.mjs`
  abgelehnt. Ohne `--fit` bedeutet ein ungesetztes `-c` den llama.cpp-Default `0` („aus dem
  Modell laden"), was bei Modellen mit sehr großem deklariertem Kontext sofort in ein OOM läuft.
  Wer `--fit` abschaltet, muss `ctx` und `ngl` explizit setzen.
- **Kein Laufzeitzustand in der Datei.** Was läuft, wird bei jedem Aufruf aus `systemctl --user`
  und `/health` bzw. `/props` gelesen. Zwei Quellen für „läuft es?" driften auseinander.
- **`slug` ist dreifach belegt:** Unit-Name (`llama-<slug>.service`), `--alias` des Servers und
  damit Modell-ID in `/v1/models`. Ein gestartetes Loadout ist unter seinem Slug sofort über den
  Proxy anfragbar, ohne zusätzliche Zuordnungstabelle.

## Komponenten

`server.mjs` hat bereits ~220 Zeilen; das Repo trennt schon in `backends.mjs`, `discovery.mjs`
und `fixups.mjs`. Vier neue Module im selben Muster:

| Modul | Verantwortung | Abhängigkeiten |
|---|---|---|
| `scripts/llm-proxy/loadouts.mjs` | `loadouts.json` lesen, validieren, schreiben. Einziger Ort, der die Datei anfasst. | `node:fs` |
| `scripts/llm-proxy/models.mjs` | `modelRoots` nach `*.gguf` scannen, Header lesen (Architektur, `block_count`, Quant, Größe). Einziger Ort, der GGUF versteht. | `node:fs` |
| `scripts/llm-proxy/runner.mjs` | argv bauen, `systemd-run --user` starten, `systemctl --user stop/show`. Einziger Ort, der Prozesse anfasst. | `node:child_process` |
| `scripts/llm-proxy/ui/index.html` | Eine eigenständige Seite. Kein Build-Schritt, kein Framework. | — |

`server.mjs` bekommt nur Routen und verdrahtet die vier; es bleibt der dünne HTTP-Layer.

Der Schnitt ist auf Testbarkeit ausgelegt: `loadouts.mjs`, `models.mjs` und die
argv-Konstruktion in `runner.mjs` laufen ohne GPU und ohne Prozess.

## Datenfluss

```
Seite laden
  GET /admin/models            → models.mjs scannt modelRoots, liest GGUF-Header
  GET /admin/loadouts          → loadouts.mjs liest die Datei
  GET /admin/loadouts/status   → runner.mjs: systemctl --user show llama-*.service
                                 + /health und /props je laufendem Port

Start
  POST /admin/loadouts/<slug>/start
    1. runner.mjs baut argv — null-Felder werden WEGGELASSEN (sonst ist --fit tot)
    2. Port-Kollision prüfen                        → 409 wenn belegt
    3. systemd-run --user --unit=llama-<slug> --collect -- llama-server …
    4. auf /health warten (max. 240 s)
    5. Tool-Call-Smoke-Test
    6. discovery.probeNow()
  → 201 { unit, port, chosenCtx, chosenNgl, toolCallOk }

Stop
  POST /admin/loadouts/<slug>/stop → systemctl --user stop llama-<slug>.service
```

Vor dem Start findet **keine** VRAM-Prüfung statt (siehe E4). Das UI zeigt nach dem Start an,
was `--fit` gewählt hat.

## Fehlerbehandlung

Oberste Regel: der Proxy liegt auf dem kritischen Pfad der Factory — jede Anfrage von
`pipeline.js`, dev-flow und den Agenten läuft über `:18235`. Fehler im Loadout-Teil dürfen das
Routing nie beeinträchtigen. `loadouts.mjs` wird lazy geladen, Fehler bleiben auf `/admin/*`
begrenzt.

| Fall | Verhalten |
|---|---|
| `loadouts.json` fehlt oder ist ungültig | `/admin/*` → 500 mit Parse-Fehler und Zeilennummer. `/v1/*` unberührt. |
| Port belegt | 409 vor dem Start, mit Namen des belegenden Loadouts falls bekannt |
| Unit läuft bereits | 409 „läuft bereits" — kein stiller Neustart, der ein geladenes Modell wegreißt |
| Server startet nicht | Unit stoppen, letzte 30 Zeilen `journalctl --user -u llama-<slug>` zurückgeben |
| Health ok, Tool-Call scheitert | 201 **mit Warnung**, kein Fehler. Hinweis auf `--jinja`. |
| Modelldatei verschwunden | Beim Scan als „fehlend" markiert, Start → 422 |
| Datei extern geändert | mtime-Vergleich vor dem Schreiben → 409, damit Handbearbeitung nicht überschrieben wird |

## Tests

- **`models.mjs`** — GGUF-Parser gegen eine minimale Beispieldatei: korrekter `block_count`,
  Nicht-GGUF-Datei, abgeschnittene Datei. (Der Parser ist erprobt: er las `block_count = 24`
  korrekt aus einer noch unvollständig heruntergeladenen Datei.)
- **`loadouts.mjs`** — Schema-Validierung: Slug-Kollision, unbekanntes Feld, `ctx: null` bleibt
  `null` und wird nicht zu `0`, Round-Trip lesen→schreiben ist idempotent.
- **`runner.mjs`** — argv-Konstruktion ohne Ausführung: **`null`-Felder erscheinen nicht in
  argv**, `extraArgs` landen am Ende, Unit-Name folgt dem Slug.
- **`server.test.mjs`** — existiert bereits; neue Routen kommen dort dazu.

Der `null`-Test ist der wichtigste: er kodiert genau den Fehler aus E4. Würde `ctx: null` als
`-c 0` serialisiert, wäre das Argument gesetzt und `--fit` für den Kontext abgeschaltet — der
Server startet und antwortet trotzdem, die Regression bliebe unbemerkt.

Ein Rauchtest „Start → Health → Tool-Call → Stop" braucht Hardware und bleibt manuell.

## Folgearbeiten (nicht Teil dieses Designs)

- `tmp/claude-scratch/llm/llm-code-server.sh` trägt den in E4 beschriebenen Fehler und muss
  dieselbe Korrektur erhalten oder durch das UI abgelöst werden.
- Aus `loadouts.json` ließen sich die Windows-Startargumente generieren und damit die
  T002274-Duplikation zwischen `start-*.ps1` und `register-scheduled-tasks.ps1` auflösen.
- `/api/admin/llm-proxy/backends` hat CRUD, aber keine Oberfläche — eine offene Fläche.
