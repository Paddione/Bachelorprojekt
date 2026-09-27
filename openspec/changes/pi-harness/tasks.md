---
title: "pi-harness — Implementation Plan"
ticket_id: T900529
domains: [agent-tooling, llm-local-dev]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pi-harness — Implementation Plan

_Ticket: T900529_ · Design: `openspec/changes/pi-harness/design.md` · Specs:
`openspec/changes/pi-harness/specs/pi-harness.md`, `openspec/changes/pi-harness/specs/toolset-registry.md`

## File Structure

```
tests/spec/pi-harness.bats                              (neu, Task 1)
tests/spec/toolset-registry/context-injection.bats      (geaendert, Task 1)
scripts/toolset/check.test.mjs                          (geaendert, Task 1)
scripts/toolset-context.sh                              (geaendert, Task 2)
scripts/toolset/check.mjs                               (geaendert, Task 2)
taskfiles/Taskfile.pi.yml                               (neu, Task 3)
Taskfile.yml                                            (geaendert, Task 3)
scripts/pi-run.sh                                       (neu, Task 4, erweitert Task 4b)
.pi/context.md                                          (neu, Task 4)
.gitignore                                              (geaendert, Task 4)
components/website/src/data/test-inventory.json         (regeneriert, Task 5)
```

S1-Budgets (wirksame Schwelle, `docs/code-quality/gates.yaml` / `baseline.json`):

| Datei | Ist | Budget |
|-------|-----|--------|
| `scripts/toolset-context.sh` | 135 | 665 |
| `scripts/toolset/check.mjs` | 180 | 620 |

`scripts/pi-run.sh` ist neu (`.sh`-Limit 800), Zielgröße unter 200 Zeilen. `Taskfile.yml` und
`.gitignore` haben kein S1-Limit und wachsen um wenige Zeilen. S4: `scripts/pi-run.sh` wird über
`task pi:run` aus `taskfiles/Taskfile.pi.yml` erreichbar.

## Task 1: Failing Tests (RED)

- [x] **1.1** `tests/spec/pi-harness.bats` anlegen. Prüfmodus: command output verification
  (Skript ausführen, `$status`/`$output` prüfen, keinen Quelltext greppen). Fälle:
  1. `taskfiles/Taskfile.pi.yml` parst mit `python3 -c 'import yaml,sys; d=yaml.safe_load(open(sys.argv[1])); assert {"install","status","uninstall","run"} <= set(d["tasks"])'` und die `install`-Zeile enthält `@mariozechner/pi-coding-agent@` gefolgt von einer Versionsnummer.
  2. `scripts/pi-run.sh <plan> --level L0 --dry-run` → Exit 0, Output enthält `--no-context-files`, `--no-skills`, `--no-extensions`, `--tools read,write,edit,bash`, enthält weder `--skill` noch `--append-system-prompt`.
  3. `--level L2 --dry-run` → Output enthält `--tools read,write,edit,bash,grep,find,ls` und `--append-system-prompt`.
  4. `--level L3 --dry-run` mit `TOOLSET_REGISTRY` auf eine Fixture, die `skill:fixture-skill` mit `roles: [pi]` und `skill:shared-skill` mit `roles: [all]` enthält → Output enthält `--skill` mit Pfad `.claude/skills/fixture-skill/SKILL.md`, nicht `shared-skill`.
  5. `--level L9 --dry-run` → Exit 1, Output enthält `L0 L1 L2 L3`.
  6. `PI_LOCAL_BASE_URL=http://127.0.0.1:9` und ein Fake-`pi` im `PATH` (Stub-Skript, das `STARTED` nach `$BATS_TEST_TMPDIR/pi.log` schreibt) → `scripts/pi-run.sh <plan> --level L0` endet mit Exit 2, Output enthält `http://127.0.0.1:9`, `pi.log` existiert nicht.
  Der Plan-Pfad ist eine Fixture-Datei in `$BATS_TEST_TMPDIR`.
- [x] **1.2** `tests/spec/toolset-registry/context-injection.bats`: Fixture um
  `demo-pi: { skill:pi-only-skill: { state: canonical, use_when: "Nur fuer pi", roles: [pi] } }`
  erweitern. Neuer Fall: `run_ctx pi` → Exit 0, Output enthält `skill:pi-only-skill`, enthält
  nicht `mcp:everywhere-server` (Wildcard `all` gilt nicht für `pi`).
- [x] **1.3** `scripts/toolset/check.test.mjs`: neuer Test nach dem Muster des ersten Tests —
  Registry mit einer kanonischen Instanz `roles: [pi]` → `check.mjs` meldet keinen
  `unknown role`-Fehler.
- [x] **1.4** Rot bestätigen — expected: FAIL (Skript, Taskfile und Rolle existieren noch nicht):
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/pi-harness.bats tests/spec/toolset-registry/context-injection.bats
  node --test scripts/toolset/check.test.mjs
  ```

## Task 2: Registry-Rolle `pi`

- [x] **2.1** `scripts/toolset-context.sh`: `pi` in `VALID_ROLES` aufnehmen. Im Node-Filter die
  Wildcard für `pi` ausnehmen:
  ```js
  // Rolle pi bekommt nur explizite Freigaben — mit Wildcard erbte der minimale Harness
  // den vollen Katalog (T900529).
  const grantsAll = role !== "pi" && cfg.roles.includes("all");
  if (!cfg.roles.includes(role) && !grantsAll) continue;
  ```
  Kopfkommentar um einen Satz zur Ausnahme ergänzen.
- [x] **2.2** `scripts/toolset/check.mjs`: `'pi'` in `VALID_ROLES` aufnehmen.
- [x] **2.3** Grün prüfen:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/context-injection.bats
  node --test scripts/toolset/check.test.mjs
  node scripts/toolset/check.mjs
  ```

## Task 3: Installation `taskfiles/Taskfile.pi.yml`

- [x] **3.1** Taskfile anlegen:
  ```yaml
  version: "3"

  # Pi (pi-mono) — minimaler Coding-Harness fuer lokale Modelle (T900529).
  # Isoliert von ~/.pi: jedes Kommando setzt PI_CODING_AGENT_DIR und PI_OFFLINE.
  vars:
    PI_VERSION: '{{.PI_VERSION | default "0.73.1"}}'
    PI_AGENT_DIR:
      sh: 'echo "${XDG_STATE_HOME:-$HOME/.local/state}/pi-harness/agent"'
    PI_LOCAL_BASE_URL: '{{.PI_LOCAL_BASE_URL | default "http://127.0.0.1:1919"}}'

  env:
    PI_CODING_AGENT_DIR: '{{.PI_AGENT_DIR}}'
    PI_OFFLINE: "1"

  tasks:
    install:
      desc: "Pi global installieren (gepinnte Version, Node >= 20.6)"
      cmds:
        - npm install -g @mariozechner/pi-coding-agent@{{.PI_VERSION}}
        - mkdir -p "{{.PI_AGENT_DIR}}"
        - pi --version

    status:
      desc: "Pi-Version, Agent-Verzeichnis und lokalen Endpunkt pruefen"
      cmds:
        - 'command -v pi >/dev/null && pi --version || echo "pi: nicht installiert (task pi:install)"'
        - 'echo "agent dir: {{.PI_AGENT_DIR}}"'
        - 'curl -sS --max-time 3 "{{.PI_LOCAL_BASE_URL}}/v1/models" | head -c 300 && echo || echo "endpoint: {{.PI_LOCAL_BASE_URL}} nicht erreichbar"'

    uninstall:
      desc: "Pi deinstallieren und das isolierte Agent-Verzeichnis entfernen"
      cmds:
        - npm uninstall -g @mariozechner/pi-coding-agent || true
        - rm -rf "{{.PI_AGENT_DIR}}"

    run:
      desc: "Gestagten Plan mit Pi abarbeiten (TARGET=<T-ID|tasks.md> LEVEL=L0..L3)"
      requires:
        vars: [TARGET]
      cmds:
        - bash scripts/pi-run.sh "{{.TARGET}}" --level "{{.LEVEL | default "L1"}}" {{if .MODEL}}--model "{{.MODEL}}"{{end}}
  ```
  Falls `npm install -g` Root-Rechte verlangt (Prefix unter `/usr`), mit `npm config get prefix`
  prüfen. Der Nutzer hat `~/.npm-global` als Prefix (dort liegt `gh-axi`); kein `sudo` einplanen.
- [x] **3.2** `Taskfile.yml`: Include direkt nach dem `openclaw:`-Block ergänzen:
  ```yaml
    # Pi (pi-mono) — minimaler Coding-Harness, Trial-Runner scripts/pi-run.sh (T900529).
    pi:
      taskfile: ./taskfiles/Taskfile.pi.yml
      dir: .
  ```
- [x] **3.3** `task --list | grep 'pi:'` zeigt `pi:install`, `pi:status`, `pi:uninstall`, `pi:run`.

## Task 4: Trial-Runner `scripts/pi-run.sh` und Kontext

- [x] **4.1** `.pi/context.md` anlegen (höchstens 60 Zeilen, deutsch). Inhalt: Arbeite nur im
  aktuellen Worktree. Kein Push auf `main`, kein `git push --force`. Commit-Format
  `<type>(<scope>): <text> [T######]`. Nach jeder Code-Änderung `task test:changed`. Plan-Tasks in
  Reihenfolge abarbeiten und erledigte Checkboxen `- [x]` setzen. Bei unklarem Plan anhalten und
  die Frage ausgeben statt zu raten. Keine Secrets lesen (`environments/.secrets/`).
- [x] **4.2** `scripts/pi-run.sh` anlegen (`set -euo pipefail`). Ablauf:
  1. Argumente: `<target>` (Pflicht), `--level L0|L1|L2|L3` (Default `L1`), `--model <id>`,
     `--dry-run`. Unbekannte Stufe: `echo "FEHLER: unbekannte Stufe '<x>' — gueltig: L0 L1 L2 L3"`, Exit 1.
  2. Plan auflösen: Beginnt `<target>` mit `T` gefolgt von Ziffern, dann
     `plan="$(bash scripts/ticket.sh get --id "$target" | jq -r '.plan_ref // empty' | sed -n 's/.*plan=\([^ ]*\).*/\1/p')"`;
     leer → Exit 2 mit `FEHLER: Ticket <id> hat keinen FACTORY-PLAN-REF`. Sonst ist `<target>` der
     Pfad; fehlende Datei → Exit 2.
  3. Umgebung: `export PI_CODING_AGENT_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/pi-harness/agent" PI_OFFLINE=1`,
     `BASE="${PI_LOCAL_BASE_URL:-http://127.0.0.1:1919}"`.
  4. Argumentliste als Bash-Array aufbauen:
     `--mode json --no-session --no-context-files --no-skills --no-extensions --no-prompt-templates --no-themes --provider local`.
     Tools: L0/L1 `read,write,edit,bash`, L2/L3 `read,write,edit,bash,grep,find,ls` → `--tools <liste>`.
     Ab L1: `--append-system-prompt "$(cat "$REPO_ROOT/.pi/context.md")"`.
     L3: `bash "$REPO_ROOT/scripts/toolset-context.sh" pi --json | jq -r '.[] | select(.instance|startswith("skill:")) | .instance | sub("^skill:";"")'`
     → je Name `--skill "$REPO_ROOT/.claude/skills/<name>/SKILL.md"`, wenn die Datei existiert.
     Die Form der `--json`-Ausgabe vor der Implementierung mit einem Aufruf prüfen und den
     `jq`-Pfad daran anpassen.
  5. `--dry-run`: Modell-ID ist `--model` oder der Platzhalter `<auto>`. Die Kommandozeile mit
     `printf '%q '` ausgeben, danach Exit 0, ohne Endpunkt-Probe und ohne Pi-Aufruf. Der Plan-Text
     wird dabei als `@<plan-pfad>` dargestellt.
  6. Echter Lauf:
     - `command -v pi` fehlt → Exit 2 mit `FEHLER: pi nicht installiert — task pi:install`.
     - `models_json="$(curl -fsS --max-time 5 "$BASE/v1/models")"` scheitert oder
       `jq -r '.data[]?.id // empty'` liefert nichts (Fallback `.models[]?.model`, weil llama.cpp
       beide Formen ausgibt) → Exit 2 mit `FEHLER: lokaler Endpunkt $BASE/v1/models nicht erreichbar oder ohne Modell`.
       Kein Ausweichen auf einen anderen Provider.
     - `models.json` nach `$PI_CODING_AGENT_DIR/models.json` schreiben: Provider `local`,
       `baseUrl "$BASE/v1"`, `api "openai-completions"`, `apiKey "local"`,
       `compat {supportsDeveloperRole:false, supportsReasoningEffort:false}`, Modelle = alle IDs.
       Das Schema steht in `docs/models.md` des Pi-Pakets (`npm pack`); vorher gegen die
       installierte Version prüfen.
     - Modell = `--model` oder die erste ID.
     - Log `$REPO_ROOT/.pi/runs/<label>-<level>-$(date +%Y%m%dT%H%M%S).jsonl`, `<label>` = Ticket-ID
       oder Basename des Plan-Ordners.
     - `pi "${args[@]}" --model "$model" -p "$(cat "$plan")" > "$log"`, Exit-Code merken, ohne
       Abbruch durch `set -e`.
     - `changed="$(git -C "$REPO_ROOT" diff --name-only HEAD | wc -l)"`, danach
       `task test:changed` mit gemerktem Exit-Code.
     - Bericht (eine Zeile pro Wert: Stufe, Modell, pi-Exit, geänderte Dateien, test:changed-Exit,
       Log-Pfad) auf stdout. Bei Ticket-ID zusätzlich
       `bash scripts/ticket.sh add-comment --id <id> --body "<bericht>"` (Flags vorher mit
       `bash scripts/ticket.sh add-comment --help` prüfen).
     - Exit-Code des Runners ist der pi-Exit-Code.
- [x] **4.3** `.gitignore`: `.pi/runs/` ergänzen.
- [x] **4.4** Grün prüfen:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/pi-harness.bats
  shellcheck scripts/pi-run.sh
  ```

## Task 4b: Endpunkt-Verbund und Aufrufer-Vertrag (Nachtrag 2026-09-27, Design D5/D6)

- [x] **4b.1** RED: `tests/spec/pi-harness.bats` um Fälle mit zwei Stub-Endpunkten
  (`python3 -m http.server`, statische `v1/models`) erweitern: `--list-models` über zwei
  erreichbare und einen stummen Endpunkt; `--model` wird zum zweiten Endpunkt geroutet (Stub-`pi`
  protokolliert Argumente und `models.json`); unbekanntes Modell → Exit 2 ohne Pi-Start;
  `--json --skip-tests` liefert ein JSON-Objekt mit `test_exit: null`; das Agent-Verzeichnis des
  Laufs existiert danach nicht mehr.
- [x] **4b.2** GREEN: `scripts/pi-run.sh` um `PI_ENDPOINTS`, `--list-models`, `--json`,
  `--skip-tests` und das Agent-Verzeichnis je Lauf erweitern. `.pi/context.md` nennt den
  Endpunkt-Verbund statt nur `PI_LOCAL_BASE_URL`.
- [x] **4b.3** `taskfiles/Taskfile.pi.yml`: `models`-Task (`--list-models`), `status` fragt den
  ganzen Verbund ab, `run` reicht `ENDPOINTS` als `PI_ENDPOINTS` durch.
- [x] **4b.4** Grün prüfen: `bats tests/spec/pi-harness.bats`, `shellcheck scripts/pi-run.sh`.

## Task 5: Installation und Smoke-Lauf

- [x] **5.1** `task pi:install`, dann `task pi:status`. Ist `:1919` erreichbar, einen Smoke-Lauf mit
  einem Wegwerf-Plan in `$TMPDIR` (eine Aufgabe: Datei `hello.txt` mit Inhalt `ok` anlegen) auf L0
  starten. Den Bericht in die PR-Beschreibung übernehmen. Ist `:1919` offline, das im PR notieren.
  Das ist kein Blocker, weil die BATS-Tests ohne Endpunkt laufen.
- [x] **5.2** `task test:inventory` für den neuen BATS-Test.

## Task 6: Finale Verifikation

- [x] **6.1**
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/pi-harness.bats tests/spec/toolset-registry/context-injection.bats
  node --test scripts/toolset/check.test.mjs
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
