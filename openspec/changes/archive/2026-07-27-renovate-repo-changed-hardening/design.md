---
ticket_id: T002249
plan_ref: openspec/changes/renovate-repo-changed-hardening/tasks.md
status: active
date: 2026-07-27
---

# Design: Renovate gegen bewegtes `main` härten

_Ticket: T002249 · Spec-Parent: `openspec/specs/ci-cd.md`_

## Root-Cause

Renovate liest die Base-Branch-SHA beim Klonen und prüft sie vor dem Schreiben erneut
(optimistic concurrency). Weicht sie ab, verwirft es den gesamten Repo-Lauf mit
`result=repository-changed` — **ohne Retry und mit Exit-Code 0**.

Gemessen an Run `30238038240` (2026-07-27 04:48 UTC):

| Phase | Dauer | Inhalt |
|---|---|---|
| Klon + Init | ~30 s | — |
| Dependency-Extraktion | 30 s | 192 Dateien, 983 Deps, 8 Manager |
| Lookup | 127 s | Datasource-Abfragen |
| **Gesamt** | **157 s** | dann Abbruch |

Dem steht die Schreibrate auf `main` gegenüber: der `factory-tick` läuft alle ~5–6 Minuten,
dazu Freshness-Bot-Commits (21 an einem Tag) und Auto-Merges — 103 Commits allein am
2026-07-26. Ein driftfreies 157-Sekunden-Fenster ist während aktiver Stunden faktisch
nicht zu erwischen. Seit Einführung (T000898, 2026-06-17) hat Renovate **null** PRs erzeugt.

### Der eigentliche Defekt ist die Stille

Der Abbruch beendet den Prozess mit Exit-Code 0. Alle zehn letzten Runs stehen deshalb auf
`success`, während nichts passiert. Das Monitoring-Signal ist invertiert: der Workflow meldet
Erfolg genau dann, wenn er seine Aufgabe nicht erfüllt hat. Diese Eigenschaft ist unabhängig
von der Drift-Häufigkeit ein Defekt und wird zuerst behoben.

## Verworfene Ansätze

| Ansatz | Warum verworfen |
|---|---|
| `enabledManagers`-Split auf mehrere kurze Jobs | Renovate schließt Branches für Deps, die es nicht mehr findet. Ein Teil-Lauf würde die PRs der jeweils anderen Manager als verwaist einstufen und wegräumen. |
| `ignorePaths` für `.worktrees/**` | `.worktrees/` ist gitignored (`.gitignore:82`) — existiert im Renovate-Klon nicht. Toter Eintrag. |
| `ignorePaths` für `openspec/changes/archive/**` | Enthält 0 Dateien mit `kind:`. Zudem träfe `ignorePaths` nur die 30-s-Extraktion; die teuren 127 s hängen an *eindeutigen* Deps, nicht an der Dateizahl. |
| Gemeinsame `concurrency`-Gruppe mit `freshness-regen.yml` | Deckt `gh pr merge --auto` nicht ab — den Merge führt GitHub selbst aus, ohne Workflow. Als alleinige Maßnahme unzureichend. Bewusst außerhalb dieses Scopes. |
| Lauf gegen einen gepinnten SHA / eingefrorenen Branch | PRs brauchen einen bewegten Branch als Base. Ein eingefrorener Base-Branch verlagert das Problem in einen Retarget-Schritt. |

## Gewählter Ansatz

### 1. Sichtbarkeit + Retry (behebt den Defekt)

`renovatebot/github-action` wird durch ein direktes, gepinntes `docker run` in einer
Bash-Retry-Schleife ersetzt. Die Action macht wenig mehr als genau dieses `docker run`;
eine echte Schleife ist lesbarer als eine `if:`-Kette gestaffelter Steps.

- Bis zu **3 Versuche**, **ohne Backoff**. Warten hilft nicht — die Schreiblast ist über die
  Zeit verteilt, nicht gebündelt. Der zweite Versuch profitiert stattdessen vom warmen Cache
  und ist damit kürzer, also weniger kollisionsanfällig.
- Nach dem letzten erfolglosen Versuch beendet der Job **rot** statt still grün.

**Erkennung über Log-Grep, nicht über das Report-JSON.** Die Zeile `"result": "repository-changed"`
ist im Log von Run 30238038240 empirisch belegt; das Schema von `RENOVATE_REPORT_TYPE=file` ist
es nicht. Ein falsch geratener JSON-Pfad würde stumm nie matchen — der Retry griffe nie und der
Job wäre wieder grün, also exakt der Fehler, den wir beheben. Das Report-JSON wird trotzdem
geschrieben und als Debug-Artefakt hochgeladen, aber es ist nicht das Gate.

### 2. Laufzeit senken (senkt die Häufigkeit)

`RENOVATE_REPOSITORY_CACHE=enabled` mit `RENOVATE_CACHE_DIR` unter `/tmp`, persistiert über
`actions/cache` mit Rolling-Key (`renovate-cache-<run_id>` + `restore-keys: renovate-cache-`).
Das trifft die 127-s-Lookup-Phase. Der bestehende `--volume /tmp:/tmp` macht den Cache ohne
zusätzlichen Mount host-seitig sichtbar.

**Footgun:** Die vom Container geschriebenen Cache-Dateien können root-owned sein; der
`actions/cache`-Post-Step läuft als `runner` und scheitert dann beim Packen. Ein `chown` nach
dem Lauf ist Pflicht.

### Restrisiko

Der Cache verkleinert das Fenster, schließt es nicht. Der Retry ist der Fix, der Cache die
Wahrscheinlichkeitsreduktion. Bleiben alle drei Versuche erfolglos, ist der Job rot und die
Ursache sichtbar — statt wie bisher unsichtbar.

## Nebenbefunde (nicht in diesem Scope)

- **Cron-Drift:** Die vier bisherigen scheduled Runs starteten um 10:14, 10:30, 08:35 und
  08:42 UTC statt der konfigurierten 07:00. GitHub verzögert Cron-Trigger unter Last. Die
  Annahme „Montag 07:00 UTC = ruhiges Fenster" trägt nicht; der Spec-Wortlaut
  („montags 07:00 UTC") beschreibt die Konfiguration, nicht die Realität.
- **`fetch-depth: 0`:** Der Kommentar in `renovate.yml:53` begründet den vollen Klon damit,
  den Abbruch zu verhindern, und markiert sich selbst als `[TBD]`. Die Logs widerlegen ihn —
  der Abbruch tritt weiter auf. Renovate klont im Container ohnehin eigenständig; der
  Checkout liefert nur `renovate.json5`. Eine Rückstufung auf `fetch-depth: 1` würde
  Checkout-Zeit sparen, braucht aber eigene Verifikation und bleibt hier außen vor.
