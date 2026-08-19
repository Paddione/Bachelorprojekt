---
title: Design: dsh-harness-integration
ticket_id: T012962
domains: [agents, factory, tooling]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: dsh-harness-integration

## Purpose

Beschreibt, wie der DeepSeek Harness als dritter Harness in unseren SDLC eingehängt wird —
welche Nahtstellen wir benutzen, welche wir bewusst nicht benutzen, und woran der Durchstich
scheitern kann.

## Ausgangslage (belegt)

MESSUNG (2026-08-19, gegen Commit `3c84106fd`):

```bash
cd deepseek-harness && node -v              # v22.23.2
cd deepseek-harness && pnpm run build       # Exit 0
cd deepseek-harness && pnpm dsh --version   # 0.1.0-rc.7
grep -o 'harness: *[a-z]*' docs/agent-guide/registry/tools.yaml | sort | uniq -c
#   9 both / 7 claude / 4 opencode
python3 -c "import json;d=json.load(open('.claude/settings.json'));print({k:len(v) for k,v in d['hooks'].items()})"
#   {'PreToolUse': 2, 'SessionStart': 7}
```

## Die drei Nahtstellen

### N1 — Guards: `tools/pre-execute`

dsh führt jeden Werkzeugaufruf durch eine Waterfall-Kette
(`tool/call → tools/pre-execute → tools/execute → tools/post-execute → tool/result`,
`deepseek-harness/docs/architecture.md:77`). Ein Listener gibt eine typisierte Entscheidung
zurück (`deny`, `ask`) oder delegiert per `next()`.

**Zwei Stufen, bewusst getrennt:**

- **Stufe 1 — Bridge.** `@deepseek-ai/dsh-hooks-claude-code` liest eine Claude-Hook-Konfiguration
  und bildet `PreToolUse → tools/pre-execute` ab. Konfiguriert über eine `cordis.patch.yml`-Zeile
  mit `configPath: ./.claude/settings.json`. Damit läuft `scripts/hooks/worktree-write-guard.sh`
  unter dsh ohne neuen Code — der schnellste ehrliche Nachweis, dass die Integration trägt.
- **Stufe 2 — natives Plugin.** Der README des Bridge-Pakets sagt ausdrücklich, die Bridge sei
  nur ein Kompatibilitätspfad für den abgebildeten Hook-Teilbereich; Eigenes gehöre in ein
  natives Plugin. Unser `repo-guard.mjs` setzt dieselben Regeln typisiert durch und gewinnt
  dabei, was ein Shell-Hook nicht kann: den Grund der Ablehnung als strukturierte Rückgabe statt
  als stderr-Text, und Zugriff auf den Sitzungskontext (`cwd`, Branch) ohne erneutes `git`-Aufrufen.

**Warum beide Stufen und nicht nur eine:** Stufe 1 allein bewiese nur, dass dsh unsere Hooks
tolerieren kann — kein Argument für einen dritten Harness. Stufe 2 allein hätte keinen
Vergleichsmaßstab und keine Rückfallebene, wenn das native Plugin eine Regel anders auslegt als
der Shell-Hook. Nebeneinander sind sie ein Differenztest.

### N2 — Factory-Executor: `FACTORY_EXECUTOR=dsh`

`scripts/factory/dispatcher-bridge.sh:165` wählt den Executor:

```bash
executor="${FACTORY_EXECUTOR:-claude}"
case "$executor" in
  claude|opencode) ;;
  *) echo "dispatcher-bridge: unknown FACTORY_EXECUTOR='$executor' — falling back to claude" >&2
     executor=claude ;;
esac
```

`dsh` kommt als dritter Zweig dazu. `scripts/factory/dsh-exec.sh` folgt `opencode-exec.sh`
Punkt für Punkt, inklusive der Exit-Code-Konvention aus T003275: **jede Ursache bekommt ihren
eigenen Code**, weil gleiche Codes das Journal unlesbar machen.

| Code | Bedeutung |
|---|---|
| 0 | Lauf erfolgreich, Commit vorhanden |
| 2 | `dsh`-Binary/Checkout nicht gefunden (bewusst nicht 127) |
| 6 | Lief, hinterließ aber weder Commit noch Änderung |
| 7 | ohne Branch/Plan abgelehnt, Lauf gar nicht gestartet |
| 8 | für dieses Ticket läuft bereits ein dsh-Prozess |

Die zweite Verteidigungslinie aus `opencode-exec.sh` wird mit übernommen: Ein `LAUNCH_DIR`, das
auf den geteilten Haupt-Checkout zurückfällt, hat am 2026-08-11 den Branch einer fremden Session
umbenannt (T003773). Der Guard gehört in jeden Executor, nicht nur in den ersten.

### N3 — Audit: `session/event`

Das Sitzungs-Log ist append-only und die Quelle des Modellkontexts; „model-visible means logged"
ist eine Laufzeit-Invariante, keine Konvention (`architecture.md`, Abschnitt *Session log*). Ein
Plugin abonniert `session/event` und schreibt Phasenwechsel über `scripts/ticket.sh phase` in
`tickets.factory_phase_events` — **derselbe Kanal, den `opencode-exec.sh` bereits benutzt**, damit
die drei Executor in einer Zeitachse vergleichbar bleiben statt je eigene Tabellen zu füllen.

## Bundle-Aufbau

dsh unterscheidet *Bundle* (was ein Paket beiträgt) und *Profile* (welche Bundles eine
lauffähige Zusammenstellung ergeben). Wir liefern ein Bundle:

```
tools/dsh/
├── package.json          # "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
├── cordis.patch.yml      # eine Zeile je Plugin-Row
├── index.js              # Bundle-Entry: lädt plugins/*.mjs
├── plugins/
│   ├── repo-guard.mjs    # N1 Stufe 2
│   └── audit-log.mjs     # N3
└── README.md
```

**Warum `index.js` die Plugins auflädt statt jede Zeile einzeln in `cordis.patch.yml`:** Die
Patch-Datei würde sonst von jedem Plugin-Vorgang angefasst — bei parallel abgearbeiteten Partials
ist das ein garantierter Konflikt, und eine Patch-Zeile, die auf ein noch nicht geschriebenes
Modul zeigt, bricht den Boot. Mit einem Entry, der vorhandene Module mountet und fehlende
überspringt, bleiben die Partials disjunkt und jeder Zwischenstand bootet.

## Was wir bewusst nicht tun

- **Kein Upstream-Code im Repo.** `deepseek-harness/` bleibt gitignoriert (T012960). Unsere
  Artefakte liegen unter `tools/dsh/` und `scripts/`. Ein Versions-Pin des Harness gehört in die
  Dokumentation, nicht in einen Vendor-Ordner.
- **Kein Ersatz für opencode.** Der Vertrag wird erweitert, nicht umgeschrieben; die vier
  `opencode-*`-Skills bleiben unangetastet.
- **Keine Skill-Portierung.** Unsere `dev-flow-*`-Skills werden in diesem Change nicht
  dsh-tauglich gemacht. Der Executor bekommt einen Prompt, keinen Skill-Baum.

## Risiken

- **R1 — Developer Preview.** dsh kündigt kompatibilitätsbrechende Änderungen an. Gegenmaßnahme:
  Die Version wird in `tools/dsh/README.md` festgehalten, und der BATS-Guard prüft, dass die
  gebaute CLI antwortet, statt eine Version zu unterstellen.
- **R2 — Kein `dist` im frischen Klon.** `pnpm run build` muss vor dem ersten Lauf gelaufen sein;
  ein nicht gebauter Klon liefert sonst denselben Fehler wie ein fehlendes Binary. Der Executor
  unterscheidet beides über Exit 2 mit Ursachenmeldung.
- **R3 — Hook-Bridge deckt nur den abgebildeten Teilbereich.** Nur `type: 'command'`-Hooks laufen;
  `http`/`mcp_tool`/`prompt`/`agent` werden mit Warnung übersprungen. Unsere beiden
  `PreToolUse`-Hooks sind Kommando-Hooks, aber ein später hinzugefügter Hook anderer Bauart liefe
  unter dsh still nicht mit. Der Guard in P7 prüft deshalb die Hook-Typen, nicht nur ihre Anzahl.
- **R4 — `configPath` ist prozessweit.** Die Bridge löst den Pfad einmal beim Laden gegen das
  Start-Verzeichnis auf; es gibt keine Konfiguration je Sitzung. Ein dsh, das mehrere Worktrees
  bedienen soll, braucht je Worktree einen eigenen Prozess.
