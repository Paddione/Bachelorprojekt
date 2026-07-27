---
title: "K6 — Instruktionsdateien korrigieren (CLAUDE.md, AGENTS.md, GEMINI.md)"
ticket_id: "T002305"
plan_ref: "openspec/changes/instruction-files-correction/tasks.md"
domains:
  - "agent-config"
  - "docs"
status: active
date: 2026-07-27
---

# K6 — Instruktionsdateien korrigieren

**Epic:** T002299 · **Ticket:** T002305 · **Vorgänger:** K1 (T002300, PR #3369), K3 (T002302, PR #3361), K4 (T002303, PR #3377), K5 (T002304, PR #3365) — alle `done`.

---

## Purpose

Die drei Instruktionsdateien im Repo-Root steuern das Verhalten der Agenten, die an diesem Repo
arbeiten. Zwei von ihnen enthalten Aussagen, die gegen den Repo-Stand falsch sind — GEMINI.md
massiv, AGENTS.md punktuell. Falsche Instruktionen sind schlimmer als fehlende: ein Agent, der
`task keycloak:sync` liest, sucht nach einem Task, den es nicht gibt, und ein Agent, der
"push-basiert, kein Flux-Reconciler" liest, deployt am primären Pfad vorbei.

Dieser Change korrigiert jede verifizierte Falschaussage und entscheidet die offene Strukturfrage:
Bleibt GEMINI.md eine eigene Datei, oder wird sie ein generierter Auszug aus CLAUDE.md?

**Nicht-Ziel:** Regeln umschreiben, die dem ausführenden Agenten unbequem sind. Der Auftrag ist
Faktenkorrektur, nicht Redaktion. Wo eine Regel inhaltlich fragwürdig erscheint, steht sie unten
unter "Offene Fragen an Patrick" — sie wird nicht eigenmächtig gestrichen.

---

## Befundlage (verifiziert am 2026-07-27 gegen `origin/main` @ `3d91067da`)

Jede Zeile unten wurde mechanisch geprüft (`task --list-all`, Dateiexistenz, Registry-Vergleich),
nicht überflogen.

### GEMINI.md (107 Zeilen) — 10 verifizierte Falschaussagen

| Zeile | Behauptung | Repo-Stand |
|---|---|---|
| 10 | "**Keycloak:** Identity Provider (SSO/OIDC, eigene Realm pro Brand)" | Es ist **Pocket ID** (`ghcr.io/pocket-id/pocket-id`, `k3d/pocket-id.yaml`). Keine Realm-JSONs; Clients liegen in `pocket_id.oidc_clients` und werden vom `pocket-id-client-seed`-Job über die Admin-REST-API provisioniert |
| 17 | "LiveKit … Streaming + Recording" | Per T002184 vollständig entfernt. Zeile ist zwar mit "(removed per T002184)" annotiert, steht aber weiterhin in der Liste der **Core Services** |
| 24 | "**push-basiert** deployt via `task workspace:deploy` — kein Flux/Argo-Reconciler auf dem Cluster" | Falsch seit T002083. Flux ist der **primäre, pull-basierte** Pfad (`ghcr.io/paddione/fleet-manifests`, `flux/clusters/fleet/`); `workspace:deploy` ist Break-Glass-Fallback |
| 43 | `task mcp:deploy` | Existiert nicht. Real: `mcp:check` und `mcp:sync` (seit T002300) |
| 50 | Taskgruppe `wireguard:*` | Existiert nicht — `task --list-all` liefert keinen einzigen `wireguard:`-Task |
| 51 | `keycloak:sync` — "Push realm config … to the live cluster" | Existiert nicht; es gibt keine Realm-Config zu pushen |
| 57 | `task workspace:create-guest` — "Provision a guest account in Keycloak and Nextcloud" | Task existiert nicht |
| 10/51/57/108 | Keycloak durchgängig als aktives System | 4 Erwähnungen, alle falsch |
| 108 | "Markdown sources are located in `k3d/docs-content/`" | Quellen liegen unter `docs/`; `scripts/build-docs.mjs` rendert nach `k3d/docs-content-built/`. `k3d/docs-content/` enthält noch genau einen Eintrag und ist ein Überbleibsel |
| 108 | "Keycloak SSO" als Doku-Kapitel | s. o. |

**Korrekt in GEMINI.md** (geprüft, bleibt gültig): `sealed-secrets:*`, `einvoice-sidecar:*`,
`billing:validate-einvoice`, `workspace:up`, `workspace:office:deploy`,
`workspace:sync-db-passwords`, `workspace:vaultwarden:seed`, `workspace:import-users`,
`workspace:migrate`, `workspace:dsgvo-check`, der monatliche `tls-sync`-CronJob
(`prod/reflector.yaml`, `schedule: "0 3 1 * *"`), der ENV=-Footgun und der
Session-Koordinations-Kontrakt.

### AGENTS.md (153 Zeilen) — 5 verifizierte Falschaussagen

| Zeile | Behauptung | Repo-Stand |
|---|---|---|
| 3 | "Keep this file under 120 lines" | Die Datei hat 153 Zeilen — sie verletzt ihre eigene erste Regel |
| 13 | `gemma-4-12b` = "**Preferred** for all write-capable delegation" | K5-Registry `docs/agent-guide/registry/agents.yaml` führt `gemma-4-12b: write_capable: false`. Write-capable sind laut Registry nur `deepseek-helper` und `orchestrator` |
| 19 | "`task` for write-capable (gemma-4-12b, deepseek-helper)" | Dieselbe Kollision wie Zeile 13 |
| 13–17 | opencode-Agent-Tabelle listet `gemma-4-12b`, `gemma-4-12b-primary`, `deepseek-helper` (+ builtins) | `.opencode/agent-models.jsonc` **und** die K5-Registry kennen zusätzlich `orchestrator` (mode: primary, write_capable: true) — der fehlt in der Tabelle. CLAUDE.md listet ihn korrekt |
| 37/42 | "Prod deploy is decoupled (**push-based**)" / "**Push-based deploy.** Only website auto-deploys via GH Actions" | Derselbe Flux-Fehler wie GEMINI.md Zeile 24 — und ein direkter Widerspruch zu CLAUDE.md Development Rule 1, die den Flux-Pfad korrekt als primär beschreibt |

### CLAUDE.md (203 Zeilen) — 1 verifizierte Falschaussage

| Zeile | Behauptung | Repo-Stand |
|---|---|---|
| Block "Before dispatching any agent" | Beispiel `bash scripts/plan-context.sh infra --with-openspec` | `_role_allowlist()` in `scripts/plan-context.sh` kennt nur die vollen Rollennamen `bachelorprojekt-{website,ops,infra,test,db,security}` plus `orchestrator`. `infra` fällt in den `*)`-Zweig, gibt `WARN: unknown role` aus und liefert `__ALL__` — also **ungefiltert alle Proposals**. Das Beispiel in der Anleitung produziert exakt den Fehlerfall, den das Skript verhindern soll. Betrifft alle Kurzformen gleichermaßen. Erfasst als T002322 |

Der Rest von CLAUDE.md hält der Stichprobe stand: die Agent-Tabelle deckt sich mit den sechs
Dateien in `.claude/agents/` und mit `roles:` in der K5-Registry; die MCP-Endpunkte
(`localhost:18080`, `localhost:13001`) decken sich mit `docs/agent-guide/registry/mcp.yaml`;
die Flux-Beschreibung in Development Rule 1 ist korrekt; `scripts/task-oracle.sh` ist tatsächlich
ein Deprecation-Shim auf `vda.sh oracle`.

### website/CLAUDE.md (76 Zeilen) und VideoVault/CLAUDE.md (270 Zeilen)

Auf Widersprüche zu den Root-Dateien geprüft: **keine gefunden.** Beide beschreiben ihren eigenen
Scope (Astro/Svelte-Content-Modell bzw. client-first VideoVault) und behaupten nichts über
Identity Provider, Deploy-Pfad oder Agent-Routing. Sie bleiben in diesem Change unverändert; der
Plan enthält einen expliziten Prüfschritt, damit dieser Befund nachweisbar statt behauptet ist.

---

## Entscheidung: GEMINI.md bleibt eine eigene Datei — aber als Zeiger, nicht als Spiegel

### Optionen

**A — Hand-gepflegte Vollversion, nur Fehler korrigieren.**
Billigste Änderung. Stellt aber genau den Zustand wieder her, aus dem heraus die zehn Fehler
entstanden sind: eine zweite, von Hand nachgeführte Beschreibung derselben Systeme. Der Beweis
liegt in der Datei selbst — sie behauptet drei Tasks und eine Taskgruppe, die es nie oder nicht
mehr gibt. Verworfen.

**C — Generierter Auszug aus CLAUDE.md (K1-Muster).**
K1 (T002300) hat für MCP-Konfiguration genau das gebaut: `docs/agent-guide/registry/mcp.yaml` als
SSOT, `scripts/mcp-sync.sh` als Generator, `task mcp:check` als Drift-Gate — und es rendert
**bereits** ein Gemini-Artefakt (`~/.gemini/config/mcp_config.json`). Das Muster ist also im Repo
etabliert und für die agy-Harness erprobt.

Es trägt hier trotzdem nicht. Der Unterschied ist die Natur der Quelle: K1 projiziert
**strukturierte Daten** (YAML-Registry → JSON/JSONC-Configs). Ein GEMINI.md-Generator müsste
**Prosa** projizieren — CLAUDE.md ist erzählender, Claude-Code-geformter Fließtext, kein
extrahierbares Datenmodell. Um daraus zu generieren, bräuchte CLAUDE.md Marker-Regionen, und der
Generator wäre ein Textausschnitt-Kopierer mit einem eigenen Format-Vertrag. Das ist neue
Maschinerie mit eigener Drift-Fläche für eine Datei, die **kein einziges Tool im Repo liest**
(verifiziert: außer historischen Specs referenziert nichts GEMINI.md; es existiert kein
`.gemini/`-Verzeichnis im Repo). Verworfen.

**B — Dünner Zeiger + fail-closed Gate. ← gewählt**

GEMINI.md bleibt bestehen, weil die Gemini-CLI (`agy`) eine Root-`GEMINI.md` konventionsgemäß
lädt und agy eine real genutzte Harness ist (K5-Registry führt eine `agy:`-Achse, K1 rendert eine
agy-MCP-Config). Aber sie hört auf, Inhalte zu **spiegeln**, und wird zu dem, was sie in ihrer
eigenen ersten Zeile bereits behauptet zu sein: ein Verweis auf die maßgeblichen Dateien.

Die Auflösung der Frage "was geht dabei verloren?" ist der entscheidende Punkt: **nichts.** Jede
Sektion in GEMINI.md, die nicht ohnehin in CLAUDE.md steht, ist bereits woanders dokumentiert —
verifiziert:

| GEMINI.md-Sektion | Existiert bereits in |
|---|---|
| Session-Koordination (Z. 65–75) | `.claude/skills/references/session-coordination.md` (SSOT laut T000510), plus AGENTS.md "Agent Coordination" |
| ENV=-Footgun (Z. 77–81) | `docs/superpowers/references/gotchas-footguns.md` § Environment targeting — dort ausführlicher |
| coturn/HPB podAffinity (Z. 96–100) | `docs/diagrams/architecture.md` |
| tls-sync-CronJob (Z. 102–105) | `docs/diagrams/architecture.md` |
| Development Conventions (Z. 85–92) | CLAUDE.md § Development Rules |
| Key Task Commands (Z. 37–61) | Widerspricht CLAUDE.md aktiv: dort steht "Never look up or hardcode task commands. Use the task oracle instead." Eine hartkodierte Task-Liste ist genau der Fehler, den diese Regel verbietet |

Die Task-Liste ist damit nicht nur veraltet — sie hätte in dieser Form nie in einer
Instruktionsdatei stehen dürfen. Sie wird ersatzlos gestrichen und durch den Verweis auf
`bash scripts/vda.sh oracle '<goal>'` ersetzt.

Was GEMINI.md dann noch **exklusiv** trägt, ist genau der harness-spezifische Rest: dass agy seine
MCP-Server ausschließlich aus `~/.gemini/config/mcp_config.json` lädt (nicht aus `settings.json`)
und dass diese Datei von `task mcp:sync` aus der K1-Registry generiert wird.

### Warum ein Gate dazugehört

Option B ohne Absicherung ist eine Momentaufnahme — die nächste Session, die "GEMINI.md ist ja
sehr dünn" denkt, schreibt den Spiegel zurück. Deshalb bekommt die Datei ein deterministisches,
fail-closed BATS-Gate in `tests/spec/agent-skills.bats`, analog zum 250-Zeilen-Gate, das K4 für
Skills eingeführt hat:

1. **Zeilenbudget** — GEMINI.md höchstens 40 Zeilen.
2. **Kein Task-Inventar** — kein `task <gruppe>:<name>`-Literal in der Datei (Ausnahme:
   `task mcp:sync`, das die eigene MCP-Config generiert).
3. **Kein Service-Inventar** — die Datei nennt keine Service-Namen aus der Architektur
   (`Nextcloud`, `Vaultwarden`, `Collabora`, `DocuSeal`, `Janus`, `coturn`, `Traefik`), weil das
   die Sektion war, in der die Keycloak- und LiveKit-Fehler saßen.
4. **Kein Keycloak** — in *keiner* der drei Root-Instruktionsdateien. Das ist der billigste
   mögliche Regressionsschutz gegen genau diesen Fehler.

Damit verwandelt sich "GEMINI.md soll nicht wieder zum Spiegel werden" von einer Hoffnung in eine
CI-Prüfung.

### Drift-Schutz für AGENTS.md ↔ CLAUDE.md

Problem B des Tickets ist die Doppelpflege zwischen AGENTS.md (bezeichnet sich als cross-harness
SSOT der OpenSpec-Konventionen) und CLAUDE.md (spiegelt sie). Beide Dateien tragen außerdem die
Agent-Routing-Signale doppelt.

Hier wird **nicht** generiert, sondern der Widerspruch getestet: Das Gate prüft, dass die
Agent-Namen in beiden Tabellen mit den `roles:` der K5-Registry übereinstimmen und dass die
opencode-Runtime-Namen in AGENTS.md mit `runtimes:` übereinstimmen. Die Registry ist bereits
SSOT (T002304) — die Instruktionsdateien müssen nur nachweisbar gegen sie stimmen. Ein
Prosa-Generator für die Routing-Tabellen wäre wieder Option C und scheitert am selben Argument.

---

## Offene Fragen an Patrick (nicht eigenmächtig entschieden)

Diese Punkte sind **nicht** falsch im Sinne des Repo-Stands, aber auffällig. Sie werden bewusst
nicht im Rahmen dieses Changes geändert:

1. **AGENTS.md Zeile 33 nennt vier Branch-Präfixe** (`feature/*`, `fix/*`, `chore/*`, `docs/*`),
   CLAUDE.md Development Rule 7 nur drei (ohne `docs/*`). `scripts/preflight-pr-scope.sh` erzwingt
   Worktrees nur für `feature/*` und `fix/*` und verbietet `docs/*` nicht. Welche der beiden
   Listen ist die gewollte? Der Plan setzt keine der beiden durch, sondern markiert die Divergenz.
2. **AGENTS.md 120-Zeilen-Ziel.** Die Datei ist bei 153 Zeilen. Soll das Ziel auf den Ist-Stand
   angehoben oder die Datei gekürzt werden? Der Plan wählt die konservative Variante — Ziel auf
   einen Wert setzen, den die Datei einhält, und diesen testen — statt Inhalt zu löschen, den
   niemand zum Löschen freigegeben hat.
3. **`task workspace:import-users` beschreibt sich selbst als "Import users from CSV or LDIF into
   Keycloak"** (Taskfile-Description) — der Keycloak-Rest sitzt also auch außerhalb der
   Instruktionsdateien. Ebenso `workspace:admin-users-setup` ("Keycloak workspace realm") und
   `_role_allowlist()` in `scripts/plan-context.sh`, das `keycloak` als Security-Domain-Token
   führt. Außerhalb des K6-Scopes; als eigener Befund zu erfassen.

## Querverweis (nicht Teil dieses Changes)

Von 86 aktiven Proposals trägt genau eines ein `domains:`-Frontmatter, weshalb der Rollenfilter in
`plan-context.sh` praktisch nie greift, selbst wenn der Rollenname korrekt übergeben wird. Das
gehört zu **T002322** und wird hier nicht mitgeplant. Dieser Change korrigiert nur das
Anleitungs-Beispiel, nicht die Datenlage.
