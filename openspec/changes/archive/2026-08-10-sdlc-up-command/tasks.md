---
title: "sdlc:up — Ein Einstiegspunkt für den lokalen SDLC-Stack"
ticket_id: T002655
domains: [infra, scripts, test]
status: plan_staged
---

# sdlc-up-command — Implementation Plan

## File Structure

| Datei | Rolle |
|---|---|
| `taskfiles/Taskfile.sdlc.yml` | Neue Tasks `sdlc:up`, `sdlc:down`, `sdlc:dev` (Orchestrierung) |
| `scripts/sdlc/health-gate.sh` | Neu — prüft Bereitschaft und benennt die fehlschlagende Komponente |
| `tests/spec/sdlc-isolation/sdlc-up-command.bats` | Neu — Nachweis für Namensraum, Orchestrierung und Health-Gate |

Zeilenbudget: `taskfiles/Taskfile.sdlc.yml` steht bei 204 Zeilen; die Endung `.yml` ist in
`docs/code-quality/gates.yaml` unter `s1.limits` **nicht** geführt, das S1-Ratchet erfasst die
Datei also nicht. `scripts/sdlc/health-gate.sh` ist neu und nicht gebaselinet; wirksame Schwelle
ist damit das `.sh`-Limit aus `gates.yaml`. Das Skript ist auf deutlich unter 200 Zeilen
angelegt und hat reichlich Wachstumsreserve.

## Partials

| Partial | Rolle | target_files |
|---|---|---|
| p1 | Taskfile-Orchestrierung | `taskfiles/Taskfile.sdlc.yml` |
| p2 | Health-Gate-Skript | `scripts/sdlc/health-gate.sh` |
| p3 | Tests + Verifikation | `tests/spec/sdlc-isolation/sdlc-up-command.bats` |

Die `target_files` sind disjunkt — keine Datei erscheint in zwei Partials.

<!-- vitest: kein neuer Test nötig, weil der Change ausschließlich Taskfile- und
     Shell-Ebene berührt und keine Datei unter website/src/ anfasst. -->

---

## Task 1 (p3): Failing Tests schreiben

Die Tests entstehen zuerst und sind rot, solange `sdlc:up` fehlt.

Neue Datei `tests/spec/sdlc-isolation/sdlc-up-command.bats` nach der Verzeichnis-Konvention
(ein Verzeichnis pro SSOT-Spec, eine Datei pro Vorgang). Header-Kommentar hält fest, dass gegen
Kommando-Output geprüft wird, nicht gegen Implementierungsquelle.

Abzudeckende Aussagen:

1. **Namensraum-Reservierung.** `task --list-all` enthält `sdlc:up` und `sdlc:down`, und
   enthält weder `dev:up` noch `dev:down`. Positiv-Anker zuerst: die Liste ist nicht leer und
   enthält das bestehende `dev:deploy` — ohne diesen Anker bestünde die Negativ-Aussage auch
   dann, wenn `task --list-all` gar nichts ausgibt.
2. **Reihenfolge der Orchestrierung.** `sdlc:up` ruft `sdlc:cluster:create`, `sdlc:deploy`,
   `llm:proxy:start` und das Health-Gate in dieser Reihenfolge auf, geprüft über einen
   Dry-Run-Lauf (`task --dry sdlc:up`), dessen Ausgabe die Aufrufe in Reihenfolge listet.
3. **Umgekehrte Reihenfolge beim Herunterfahren.** `task --dry sdlc:down` nennt den
   llm-proxy-Stopp vor dem Cluster-Abbau.
4. **Health-Gate benennt die Komponente.** `scripts/sdlc/health-gate.sh` wird mit einer
   Umgebung ausgeführt, in der ein Deployment fehlt; die Ausgabe enthält den Namen der
   fehlenden Komponente und der Exit-Status ist ungleich 0.
5. **Health-Gate meldet Teilstart nicht als Erfolg.** Ist eine der geprüften Komponenten nicht
   bereit, ist der Exit-Status ungleich 0.
6. **`sdlc:up` blockiert nicht.** Der Dry-Run von `sdlc:up` enthält keinen Aufruf des
   Astro-Devservers; `sdlc:dev` existiert separat und trägt `BUILD_TARGET=sdlc`.

Rot-Nachweis vor der Implementierung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/sdlc-up-command.bats
# expected: FAIL — sdlc:up, sdlc:down, sdlc:dev und health-gate.sh existieren noch nicht
```

Syntaxprüfung der neuen Datei (`bash -n` ist für `.bats` unbrauchbar):

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/sdlc-isolation/sdlc-up-command.bats
```

---

## Task 2 (p2): Health-Gate-Skript

Neue Datei `scripts/sdlc/health-gate.sh`, aufrufbar als eigenständiger Befehl und aus dem
Taskfile heraus (erfüllt S4: von `taskfiles/Taskfile.sdlc.yml` aus erreichbar).

Prüfumfang, jeweils mit sprechender Diagnose statt eines Sammelfehlers:

- Cluster-Kontext `k3d-mentolder-dev` ist erreichbar.
- Die Deployments `shared-db`, `pocket-id`, `sdlc-console`, `bge-embed` und `bge-rerank` im
  Namespace `workspace` sind verfügbar. Die Namen stammen aus den `rollout status`-Zeilen von
  `sdlc:deploy`; `bge-embed` und `bge-rerank` sind die Deployment-Namen, `llm-gateway-embed`
  und `llm-gateway-rerank` die zugehörigen Services — die Unterscheidung ist bereits einmal
  falsch gelaufen und im Taskfile kommentiert.
- Der llm-proxy antwortet auf seine Statusabfrage.

Ausgabeformat: je Komponente eine Zeile mit Name und beobachtetem Zustand. Bei Fehlschlag Exit
ungleich 0 und die fehlschlagende Komponente namentlich in der Ausgabe. Kein Erfolgssignal,
solange eine Komponente nicht bereit ist.

Das Skript nimmt ein Timeout-Argument entgegen, damit der Aufruf aus `sdlc:up` nicht unbegrenzt
wartet, und ist wiederholt ausführbar ohne Seiteneffekte.

Keine Brand-Domain-Literale im Skript (S3): Hostnamen kommen aus der Umgebung beziehungsweise
den bestehenden `*.localhost`-Konventionen des SDLC-Stacks.

---

## Task 3 (p1): Taskfile-Orchestrierung

Erweiterung von `taskfiles/Taskfile.sdlc.yml` um drei Tasks. Die bestehenden `sdlc:*`-Tasks
bleiben unverändert; `sdlc:up` ruft sie auf, statt ihre Logik zu wiederholen.

**`sdlc:up`** — Reihenfolge Cluster → Stack → llm-proxy → Health-Gate:

- `sdlc:cluster:create` läuft nur, wenn der Cluster fehlt. Die bestehende Precondition dort
  bricht mit „Cluster existiert bereits" ab; für die geforderte Idempotenz von `sdlc:up` wird
  dieser Fall abgefangen und als übersprungener Schritt gemeldet, nicht als Fehler. Zu beachten
  ist die im Taskfile dokumentierte Shell-Eigenheit: go-task nutzt `mvdan/sh`, wo `! cmd | grep`
  als `(! cmd) | grep` bindet — deshalb die `if`-Form verwenden, wie sie dort bereits steht.
- `sdlc:deploy` unverändert aufrufen.
- `llm:proxy:start` aufrufen, sofern der Proxy nicht bereits läuft (`llm:proxy:status`).
- `scripts/sdlc/health-gate.sh` als abschließenden Schritt; sein Exit-Status ist der von
  `sdlc:up`.
- Der Task terminiert und startet keinen Vordergrundprozess.

**`sdlc:down`** — llm-proxy vor dem Cluster stoppen: `llm:proxy:stop`, danach
`sdlc:cluster:delete`. Ein bereits gestoppter Proxy oder ein fehlender Cluster ist kein Fehler.

**`sdlc:dev`** — blockierender Astro-Devserver mit `BUILD_TARGET=sdlc`. Beim Start die `.env`
in die Umgebung exportieren (`set -a; . ./.env; set +a`), sonst antwortet der Devserver mit
HTTP 500.

Kein Task unter dem Präfix `dev:` — dieser Namensraum bleibt dem Staging-Stack in
`taskfiles/Taskfile.dev-stack.yml` vorbehalten.

---

## Task 4: Grün-Nachweis und Verifikation

Die in Task 1 geschriebenen Tests laufen jetzt grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation/
```

Beide Formen der BATS-Konvention erfassen (Sammeldatei und Verzeichnis sind gleichzeitig
gültig, eine gezielte Suche nach nur einer Form findet die Hälfte):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation*
```

Test-Inventar nach der Test-Änderung regenerieren und mitcommitten:

```bash
task test:inventory
```

Abschließende Pflicht-Verifikation:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
