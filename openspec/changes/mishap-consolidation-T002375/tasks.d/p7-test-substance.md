---
title: "p7 — Test-Substanz: Tests prüfen wieder Verhalten und den ausgeführten Pfad"
ticket_id: T002375
domains: [test, devtooling]
status: active
partial_id: p7
role: tests
target_files: ["scripts/factory/pipeline.js", "scripts/factory/eval-replay.mjs", "docs/code-quality/gates.yaml", "tests/spec/software-factory.bats", "tests/spec/mcp-gateway.bats", "tests/spec/llm-pipeline.bats", "website/src/data/test-inventory.json"]
depends_on: [p1, p2, p3, p4, p5, p6]
---

# p7 — Test-Substanz

_Ticket: T002375 · Partial p7 · Mishaps: T002372-M3, T002364-M1, T002356-M1, T002338-M2, T002351-M2_

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/factory/pipeline.js` | **gelöscht** — tote Dublette |
| `scripts/factory/eval-replay.mjs` | einziger Abhänger, auf `pipeline.mjs` umgestellt |
| `docs/code-quality/gates.yaml` | `s1.ignore`-Eintrag für `pipeline.js` entfällt |
| `tests/spec/software-factory.bats` | `PIPELINE_SCRIPT`/`PJS` auf `pipeline.mjs`; Scheintest durch Verhaltensprüfung ersetzen |
| `tests/spec/mcp-gateway.bats` | Positiv-Anker vor jeder Negativ-Assertion |
| `tests/spec/llm-pipeline.bats` | CRLF-tolerante `$`-Anker |
| `website/src/data/test-inventory.json` | regeneriert |

## Kontext

Dieses Partial behandelt eine einzige Fehlerklasse in vier Ausprägungen: **Tests, die grün sind,
ohne das zu prüfen, was sie zu prüfen behaupten.**

### T002372-M3 — die Kontrakttests prüfen die nicht ausgeführte Datei

Verifiziert: `scripts/factory/pipeline.js` (33907 Bytes) und `scripts/factory/pipeline.mjs`
(35448 Bytes) existieren parallel und enthalten beide denselben Code. Dispatcht wird
**ausschließlich** `pipeline.mjs`:

- `scripts/factory/dispatcher-bridge.sh:98` → `Workflow({scriptPath:".../pipeline.mjs"})`
- `scripts/factory/run-pipeline.mjs:136` → `import(path.join(REPO, 'scripts/factory/pipeline.mjs'))`

`tests/spec/software-factory.bats` setzt aber auf Dateiebene:

```
:10   PIPELINE_SCRIPT="scripts/factory/pipeline.js"
:20   PJS="$BATS_TEST_DIRNAME/../../scripts/factory/pipeline.js"
:95   PIPELINE="${REPO_ROOT}/scripts/factory/pipeline.js"
:480  PIPELINE_SCRIPT="scripts/factory/pipeline.js"
```

Alle Kontrakttests, die über diese Variablen laufen, prüfen die **nicht ausgeführte** Datei. Eine
Änderung an `pipeline.mjs` kann jeden dieser Tests grün lassen, und eine Regression in
`pipeline.mjs` bleibt unentdeckt. Umgekehrt hält ein grüner Test fälschlich die Zusicherung
aufrecht, das Verhalten sei abgesichert.

Beide Dateien stehen auf der `s1.ignore`-Liste in `docs/code-quality/gates.yaml:61-68`, mit dem
Kommentar "pipeline.mjs is the ESM twin of pipeline.js" — die Dublette ist bekannt und sanktioniert,
die Test-Konsequenz offenbar nicht bedacht.

**Entscheidung: löschen** (Herleitung in `design.md` § E4). Einziger echter Abhänger ist
`scripts/factory/eval-replay.mjs:87`.

### T002364-M1 — ein Kommentar erfüllt den Test

Der Test `T002350: reaper derives its own pid from /proc/self, not from $$` prüft
`pg_container_args | grep -Eq '/proc/self/stat'`. Der funktionale Code nutzt aber
`read -r SELF_PID _ < "$_root/self/stat"` — der literale String kommt dort nicht vor. Der
Implementer setzte daraufhin einen Doku-Kommentar mit dem literalen String über das `read`,
damit der Test grün wird.

Der funktionale Code blieb korrekt. Aber: **ersetzte jemand die `read`-Zeile durch `SELF_PID=$$`,
bliebe der Test grün, solange der Kommentar stehen bleibt.** Das ist exakt die Fehlerklasse, gegen
die T002350 angetreten ist — im selben Change reproduziert, eine Ebene tiefer.

Aus dem Ticket wörtlich sinngemäß: ein Scheintest ist schlechter als kein Test, weil er Sicherheit
vortäuscht.

### T002356-M1 — Negativtests ohne Positiv-Anker

Beim Schreiben der RED-Tests für T002350 bestanden zwei Negativtests grün, obwohl die geprüfte
Funktion `list_reap_candidates` gar nicht existierte: bei fehlender Funktion ist die
Kandidatenliste leer, und "1 ist nicht in []" gilt trivial.

Verschärfend ein wirkungsloser Guard: `got="$(selected_pids "$fixture" 19)"; rc=$?` liest den
Exit-Status des letzten Pipe-Glieds (`sed`), nicht den `return 127` der Ladefunktion. `[ "$rc" -ne
127 ]` konnte deshalb nie greifen.

Behoben wurde es durch einen `assert_selection_alive`-Helfer: die Tests verlangen erst, dass das
erwartete Child in der Liste steht, bevor sie die Negativ-Aussage prüfen. Danach 10 von 11 Tests
rot statt 8 von 11.

### T002352-M2 — Substring-Grep über das ganze SSOT-Dokument

Test 28 in `tests/spec/mcp-gateway.bats` prüfte, dass `openspec/specs/mcp-gateway.md` nirgends
`dekommissioniert|decommissioned` enthält. Beim Archivieren merged `openspec.sh` das Delta in die
SSOT — und der GIVEN-Text des archivierten Scenarios lautet "…trug die Notiz, der Monolith sei
dekommissioniert, während…". Das Wort landet also durch die **Beschreibung des behobenen Zustands**
wieder im Dokument.

Behoben in PR #3398. Bemerkenswert am Fix-Verlauf und deshalb hier festgehalten: der erste
Filterversuch beendete Scenario-Blöcke erst bei der nächsten `#`-Überschrift und verschluckte damit
den gesamten Dateirest nach dem letzten Scenario — der Test wäre unbemerkt **dauerhaft grün**
gewesen. Aufgefallen ist das nur durch eine explizite Negativ-Probe.

## Schritte

> ## ⚠️ BEFUND: Schritte 1–4 und 8 sind BLOCKIERT — als T002393 erfasst
>
> Die Prämisse dieses Partials („`pipeline.js` und `pipeline.mjs` enthalten beide denselben
> Code", „einziger echter Abhänger ist `eval-replay.mjs:87`") ist **widerlegt**:
>
> | | `pipeline.js` (getestet) | `pipeline.mjs` (**dispatcht**) |
> |---|---|---|
> | Zeilen | 603 | 623 |
> | letzter Commit | `344d58432` [T002286] | `0269e403f` [T002361] |
> | `setupWorktree` / `read-partials` / Partial-Fanout (T002074) | ja | **nein** |
> | guard-overwrite (T002286) | ja | **nein** |
> | Dry-Run-Livelock-Zähler (T002361) | nein | ja |
>
> 288 Diff-Zeilen. Die Dateien sind **auseinandergelaufen**, nicht dupliziert. Ein
> `git rm scripts/factory/pipeline.js` würde damit Funktionalität vernichten statt toten Code
> entfernen. Ebenso trifft „einziger Abhänger" nicht zu: `grep -rl 'pipeline.js'` liefert über
> zehn Dateien (Taskfile.yml, Taskfile.factory.yml, ticket-reclaim.sh, dispatcher.js,
> watchdog.sh, qa-lens.mjs, pipeline-runner.js, pipeline-decompose.cjs,
> scout-quality-check.cjs, eval-replay.mjs).
>
> Auch das Umstellen von `PIPELINE_SCRIPT`/`PJS` auf `pipeline.mjs` (RED-Schritt) ist damit
> nicht durchführbar: die Kontrakttests würden reihenweise rot, weil dem dispatchten Pfad die
> geprüften Blöcke schlicht fehlen. Dieses Partial selbst verbietet ausdrücklich, den Test an
> das Verhalten anzupassen — richtig ist, den Unterschied erst zu verstehen.
>
> **Erfasst als T002393** (type=bug, Priorität hoch) mit dem Vorschlag: erst die fehlenden
> Blöcke nach `pipeline.mjs` portieren und den dispatchten Pfad verifizieren, DANN die Dublette
> entfernen und die Tests umstellen — mit eigenem RED/GREEN-Nachweis, nicht als Nebenschritt
> eines Mishap-Bundles.
>
> Umgesetzt wurden die davon unabhängigen Schritte **5, 6 und 7**.


- [ ] **RED zuerst.** Die Umstellung von `PIPELINE_SCRIPT`/`PJS` auf `pipeline.mjs` vornehmen und
      die Suite **vor** allen anderen Änderungen laufen lassen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — die Kontrakttests laufen erstmals gegen den tatsaechlich dispatchten pipeline.mjs)
```

      **Wichtig für die Bewertung des Ergebnisses:** Wird hier ein Test rot, ist das **kein Fehler
      des Umbaus**, sondern eine echte, bislang unentdeckte Regression in `pipeline.mjs` — genau
      der Befund, den dieses Partial sichtbar machen soll. Jeder solche Fall wird **protokolliert
      und als eigener Befund gemeldet**; der Test wird **nicht** angepasst, bis der Unterschied
      verstanden ist. Ein Test an das Verhalten anzupassen, das er prüfen soll, ist dieselbe
      Fehlerklasse noch einmal.

- [ ] **Schritt 1 — `eval-replay.mjs` umstellen.** Zeile 87 auf `pipeline.mjs` zeigen lassen. Das
      ist die Vorbedingung fürs Löschen, nicht die Folge.

- [ ] **Schritt 2 — `pipeline.js` löschen.** `git rm scripts/factory/pipeline.js`. Vorher
      absichern, dass keine weitere Referenz existiert:

```bash
grep -rn 'pipeline\.js' --include='*.sh' --include='*.mjs' --include='*.js' --include='*.cjs' \
  --include='*.bats' --include='*.yaml' --include='*.yml' --include='*.md' . | grep -v '\.worktrees/'
# erwartet: nur noch Treffer in openspec/changes/** (dieser Plan) und CLAUDE.md
```

      **`CLAUDE.md` nennt `pipeline.js` im Abschnitt "Merge = Abschluss"** — diese Datei gehört
      `p6` und wird dort **nicht** angefasst. Der Verweis bleibt vorerst stehen und wird als
      Folgebefund notiert; ihn hier zu ändern verletzt D1.

- [ ] **Schritt 3 — `gates.yaml` bereinigen.** Den `s1.ignore`-Eintrag für `pipeline.js` samt
      seinem Kommentar entfernen (Zeilen 61–68 tragen beide Einträge; nur der `pipeline.js`-Teil
      entfällt). Der `pipeline.mjs`-Eintrag bleibt mit angepasstem Kommentar — er ist weiterhin
      ein monolithisches Workflow-Skript.

- [ ] **Schritt 4 — Scheintest ersetzen (T002364-M1).** Den Test
      `T002350: reaper derives its own pid from /proc/self, not from $$` durch eine
      **Verhaltensprüfung** ersetzen: die Funktion in einer Subshell gegen ein Fixture laufen
      lassen, in dem `$PROC_ROOT/self/stat` auf eine bestimmte PID zeigt, und prüfen, dass genau
      diese PID nicht selektiert wird.

      Damit ist die Selbstermittlung geprüft statt ihrer Erwähnung. Der Kommentar mit dem literalen
      String darf im Zielskript stehen bleiben — er ist als Doku legitim, nur nicht als
      Testgegenstand.

      Negativ-Probe zwingend: die `read`-Zeile im Fixture testweise durch `SELF_PID=$$` ersetzen
      und prüfen, dass der neue Test **rot** wird. Ohne diese Probe ist "grün" nicht von "prüft
      nichts" unterscheidbar.

- [x] **Schritt 5 — Positiv-Anker in `mcp-gateway.bats` (T002356-M1).** Jede Negativ-Assertion
      bekommt im selben `@test` einen Positiv-Anker, der bei fehlender Implementierung rot wird.
      Der `assert_selection_alive`-Helfer aus T002350 ist die Vorlage.

      Ebenfalls prüfen: Konstrukte der Form `got="$(fn …)"; rc=$?` hinter einer Pipe. Der
      Exit-Status ist der des letzten Pipe-Glieds — korrekt ist `${PIPESTATUS[0]}`.

- [x] **Schritt 6 — Abwesenheits-Tests gegen SSOT-Dokumente (T002352-M2).** Prüfen, ob weitere
      Tests ein Spec-Dokument per Substring auf Abwesenheit eines Begriffs testen, ohne
      `#### Scenario:`-Blöcke auszunehmen. Solche Tests sind nach dem Archivieren des zugehörigen
      Changes **garantiert** rot.

      Der bereits in PR #3398 behobene Fall bleibt die Referenzimplementierung. Jeder gefundene
      weitere Fall bekommt dieselbe Behandlung **plus Negativ-Probe** — der Fix-Verlauf von #3398
      zeigt, warum: der erste Filterversuch verschluckte den halben Dateirest und wäre unbemerkt
      dauerhaft grün geblieben.

- [x] **Schritt 7 — CRLF-Anker (T002338-M2).** In `tests/spec/llm-pipeline.bats` die Guards auf
      `scripts/llm/*.ps1` auf `[[:space:]]*$` statt `$` umstellen. Die Dateien sind durchgehend
      CRLF (verifiziert im Ursprungs-Ticket: 118 von 118 Zeilen).

      Bereits im Ursprungs-Ticket geprüft und hier nur zu bestätigen: der einzige andere
      `$`-Anker-Guard in derselben Datei (Zeile 330) zielt auf eine `.sh`-Datei mit LF und ist
      unbedenklich. Ein `$`-Anker kann außerdem nur falsch-**rot** werden, nie falsch-grün — es
      gibt keinen stillen Schaden, nur die Falle für künftige Guards auf Windows-Skripte.

- [ ] **Schritt 8 — Inventar regenerieren.** `task test:inventory`, dann
      `website/src/data/test-inventory.json` committen. Der CI-Job vergleicht die generierte gegen
      die committete Fassung und schlägt bei Abweichung fehl.

## Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats tests/spec/llm-pipeline.bats
tests/unit/lib/bats-core/bin/bats --count tests/spec/software-factory.bats   # Syntax-Check, nicht bash -n
git ls-files scripts/factory/pipeline.js    # muss leer sein
node --check scripts/factory/eval-replay.mjs
task test:inventory && task freshness:check
```

## Abgrenzung

- **`tests/spec/software-factory.bats:3436`** schreibt ins echte `openspec/` statt in ein
  Temp-Verzeichnis (T002347-M1) — das gehört zum bereits gestagten Plan von **T002347** und wird
  hier **nicht** angefasst. Sollte T002347 vor diesem Change mergen, rebased `p7` darauf.
- **`CLAUDE.md`** gehört `p6` (siehe Schritt 2).
- **T002351-M1** (sporadische CI-Fehlschläge bei `preflight-pr-scope.bats` und dem
  agent-lock-Reap-Test) bleibt offen: drei Hypothesen wurden bereits geprüft und widerlegt, die
  Diagnoseausgabe aus dem Ursprungs-Ticket bleibt stehen, bis ein weiteres Auftreten auswertbar
  ist. Kein Fix in diesem Change.
