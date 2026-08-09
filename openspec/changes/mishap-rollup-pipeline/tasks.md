---
title: "mishap-rollup-pipeline — Implementation Plan"
ticket_id: T002783
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-rollup-pipeline — Implementation Plan

## File Structure

| Datei | Art | Zeilen jetzt | Wirksame Schwelle | Restbudget | Anmerkung |
|---|---|---|---|---|---|
| `tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats` | vorhanden (RED) | 62 | — | — | `.bats` ungated; liegt bereits im Branch |
| `scripts/ticket.sh` | ändern | 1017 | — | — | steht auf `s1.ignore` in `docs/code-quality/gates.yaml` — bewusst nicht gemessen |
| `scripts/ticket-mcp/go/internal/tools/mishap.go` | ändern | 435 | — | — | `.go` ist ungated und unbaselined → S1 nicht anwendbar |
| `scripts/ticket-mcp/go/internal/tools/mishap_test.go` | ändern | 195 | — | — | `.go` ungated |
| `scripts/worktree-create.sh` | ändern | 480 | 800 | 320 | Zuwachs erwartet ~60 Zeilen |
| `scripts/factory/mishap-rollup.sh` | ändern | 272 | 800 | 528 | Zuwachs erwartet ~20 Zeilen |
| `.claude/skills/mishap-tracker/SKILL.md` | ändern | 132 | 250 | 118 | Branch-Konvention an die Implementierung angleichen |

Alle Restbudgets sind komfortabel; kein Verkleinerungsschritt nötig. Die beiden leeren
Budget-Felder wurden gegengeprüft und bedeuten „nicht anwendbar", nicht „ungemessen
durchgefallen": `ticket.sh` ist s1-ignoriert (verifiziert über `_is_s1_ignored`), `.go`
liefert Schwelle 0 ohne Baseline-Eintrag. Positiv-Kontrolle: ein gemessenes Shell-Skript
(agent-lock) gibt unter demselben Aufruf 265 zurück, der Messpfad funktioniert also.

## Partials

| # | Rolle | Zieldateien |
|---|---|---|
| 1 | Gesamt (Fix, ein Vorgang) | alle oben gelisteten |

## Tasks

### 1. RED bestätigen — der failing Test liegt bereits vor

Der Test wurde vor diesem Plan geschrieben und ist Teil des Stage-Commits. Vor jeder
Implementierung erneut ausführen, um die Ausgangslage zu belegen:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats
```

expected: FAIL — beide Tests scheitern, und zwar an der inhaltlichen Aussage, nicht am
Positiv-Anker. Test 1 durchläuft den Anker (`stage-plan` steht in der `Commands:`-Zeile)
und fällt auf `rollup-container`. Test 2 durchläuft die Vorbedingung (Branch ≠ main) und
fällt auf `[ "$status" -eq 0 ]`, weil `worktree-create.sh --help` heute mit `rc=1` am
main-Guard stirbt. Sieht man einen anderen Fehlschlagpunkt, stimmt die Annahme nicht mehr
und der Plan ist vor der Umsetzung zu prüfen.

### 2. Gemeinsame Container-Auflösung in `scripts/ticket.sh`

Neues Subkommando `rollup-container`:

- Flags: `--brand <brand>` (Pflicht, wie bei den übrigen Subkommandos).
- Verhalten: sucht Tickets mit `type=chore` und dem Titel `Mishap Rollup — fortlaufende
  Sammlung`, **eingeschränkt auf offene Status** (`triage`, `backlog`, `planning`,
  `plan_staged`, `in_progress`). `done` und `archived` sind ausgeschlossen.
- Determinismus: bei mehreren Treffern gewinnt der **älteste** offene Container
  (`ORDER BY created_at ASC LIMIT 1`) — der älteste ist der, an dem die bisherige Historie
  hängt; der jüngste wäre bei einem versehentlichen Doppel-Anlegen der leere.
- Fehlt jeder offene Container, wird einer angelegt (`status=plan_staged`, `severity=minor`,
  Beschreibung wie bisher in `buildCreateRollupTicketArgs`) und dessen `external_id`
  ausgegeben.
- Ausgabe: **nur** die `external_id` auf stdout, damit Aufrufer sie direkt verwenden können.
  Diagnostik gehört auf stderr.
- In die `Commands:`-Zeile der Usage aufnehmen — Test 1 prüft genau diese Zeile.

### 3. Go-Seite auf die gemeinsame Auflösung umstellen

In `scripts/ticket-mcp/go/internal/tools/mishap.go`:

- `findOrCreateRollupTicket` ruft künftig `ticket.sh rollup-container --brand <brand>` über
  denselben Runner auf, der schon für `list`/`create` benutzt wird, und gibt dessen Ausgabe
  zurück.
- `buildFindAnyRollupTicketArgs`, `buildFindRollupTicketArgs`, `buildCreateRollupTicketArgs`
  und `findRollupTicketByTitle` entfallen, sofern kein anderer Aufrufer sie nutzt — vor dem
  Löschen mit `grep -rn` im Go-Paket prüfen.
- `ROLLUP_BRANCH` in Zeile 25 wird an den Wert angeglichen, den `mishap-rollup.sh`
  tatsächlich verwendet. Zwei abweichende Konstanten für denselben Branch sind Teil des
  Befunds.
- In `mishap_test.go` die Tests der entfallenden Arg-Builder durch einen Test des neuen
  Builders ersetzen: er MUSS `rollup-container` und `--brand <brand>` enthalten. Der
  bestehende `TestRollupConstants` wird an den angeglichenen Branchnamen angepasst.

### 4. `--help` und `--unattended` in `scripts/worktree-create.sh`

- `--help` wird **vor** allen Guards behandelt und beendet mit Status 0. Heute existiert
  kein `--help`-Zweig (`grep -c -- '--help'` liefert 0), weshalb schon die Hilfe am
  main-Guard stirbt. Der Hilfetext listet alle Optionen einschließlich `--unattended`.
- `--unattended` setzt zwei Dinge aus:
  - die Vorbedingung „Haupt-Checkout steht auf main" (beide Fundstellen: Zeile ~38 und
    ~138 — die zweite wird leicht übersehen, sie trägt eine abweichende Schreibweise der
    Meldung),
  - die Ticket-ID-Pflicht der Namenskonvention, **aber nur** für Branches aus einer
    ausdrücklichen Allowlist im Skript. Der Rollup-Branch ist deren erster Eintrag. Ein
    beliebiger ticketloser Branch bleibt abgelehnt.
- `WT_SKIP_NAME_CHECK` bleibt unverändert als Notfall-Bypass bestehen; `--unattended` ist
  keine Umbenennung davon, sondern die eng gefasste, allowlistete Variante.
- Alles Übrige — git-crypt-Behandlung, `node_modules`-Verlinkung, Anker-Commit — bleibt
  unangetastet. Das ist der Grund, diesen Weg der Eigenimplementierung im Rollup vorzuziehen.

### 5. `scripts/factory/mishap-rollup.sh` auf beides umstellen

- Die eigene Container-SQL (Zeilen ~46–58) entfällt; stattdessen
  `CONTAINER_ID="$(bash "$REPO/scripts/ticket.sh" rollup-container --brand "$BRAND")"`.
- Liefert der Aufruf leer oder scheitert er, ist das ein **Fehler**: Meldung auf stderr und
  `exit 1`. Der Zustand ist nach Task 2 nicht mehr regulär erreichbar, denn die gemeinsame
  Auflösung legt notfalls an — er zeigt dann einen echten Defekt an. Der bestehende
  No-op-Pfad („keine Content-Kommentare → nichts zu tun, exit 0") bleibt davon unberührt
  und muss in der Ausgabe unterscheidbar bleiben.
- Der `worktree-create.sh`-Aufruf bekommt `--unattended`.

### 6. Skill-Dokumentation angleichen

`.claude/skills/mishap-tracker/SKILL.md` beschreibt unter „Branch-Naming-Konvention" die
Form `chore/mishap-<ext-id>`. Nach Task 4 ist der Rollup-Branch ein allowlisteter
Sonderfall ohne Ticket-ID. Den Abschnitt so ergänzen, dass beide Fälle benannt sind —
Rollup-Container-Branch (persistent, allowlistet) gegenüber Einzel-Mishap-Branch (mit
großer Ticket-ID). Ohne diese Angleichung widerspricht die Dokumentation der
Implementierung, und genau diese Diskrepanz hat den Defekt mitverursacht.

### 7. Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup*
cd scripts/ticket-mcp/go && go test ./internal/tools/ && cd -
task test:spec:changed
task test:changed
task freshness:regenerate
task freshness:check
```

Der erste Befehl erfasst bewusst **beide** Formen der BATS-Konvention (Sammeldatei und
Verzeichnis, T002696) — eine gezielte Suche nach `tests/spec/mishap-rollup.bats` fände nur
die Hälfte. Erwartung: die zwei Tests aus Task 1 sind grün.

Abschließend der Ende-zu-Ende-Nachweis, der in diesem Vorgang dreimal fehlschlug:

```bash
BRAND=mentolder bash scripts/factory/mishap-rollup.sh
```

Erwartung: der Container wird aufgelöst, der Worktree entsteht auch dann, wenn der
Haupt-Checkout nicht auf main steht, und der Lauf endet mit einem gestagten Plan. Der Lauf
ist ausdrücklich Teil der Verifikation und nicht optional — alle drei Blocker traten
nacheinander hervor, jeder erst nachdem der vorige beseitigt war.
