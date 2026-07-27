---
ticket_id: T002282
plan_ref: openspec/changes/mishap-ci-scripts/tasks.md
status: active
---

# mishap-ci-scripts — Fix-Design

_Ticket: T002282 (Mishap-Bundle, 3 Einträge)_

Autonome Sitzung ohne interaktiven User (dev-flow-plan im Auftrag des Orchestrators
durchgefahren) — Fragen wurden selbst beantwortet, Annahmen sind unten explizit markiert.

## Bundle-Bewertung (Vorbedingung laut Auftrag)

Jeder der 3 Einträge wurde gegen `main`@`1d8c4284b` verifiziert, BEVOR er in den Plan
aufgenommen wurde:

| # | Eintrag | Status | Befund |
|---|---------|--------|--------|
| 1 | `devflow-ci-watch.sh` DIRTY-Rebase ohne freshness-Regeneration | **plan-relevant** | Zeilen 19-35: Rebase + `git push --force-with-lease` laufen ohne jeden Aufruf von `task freshness:regenerate`. Bug ist unverändert vorhanden. |
| 2 | `openspec.sh archive` / `plan-archive-steps.md` regeneriert `openspec-status.json` nicht vollständig | **plan-relevant** | `cmd_archive` (scripts/openspec.sh:154-156) ruft `openspec-status-map.sh` zwar NACH dem `mv` auf und schreibt `website/src/data/openspec-status.json` neu — aber `plan-archive-steps.md` Schritt 4 (`git add openspec/changes/ openspec/changes/archive/`) staged diese Datei nie. Der Archiv-Commit trägt sie also nie mit; genau der beobachtete Stale-Fehler ist strukturell weiterhin möglich. |
| 3 | Ticket-Status-Race (`agent-lock.sh` umgangen) | **plan-relevant, aber Root-Cause verschärft** | `grep -rn agent-lock scripts/vda/ticket/ scripts/ticket.sh` → 0 Treffer. Keine der ticket.sh-Mutationen (allen voran `update-status`) prüft je einen aktiven Lock-Claim. Der im Mishap als "UNVERIFIED — Identität des konkurrierenden Akteurs" beschriebene Vorfall lässt sich nicht mehr rekonstruieren, aber die STRUKTURELLE Lücke (keine Durchsetzung) ist zu 100% verifizierbar und real — das ist der Fix-Gegenstand, nicht die Forensik des einen Vorfalls. |

Kein Eintrag ist bereits behoben, dupliziert oder "kein Bug" — alle drei fließen in den Plan ein.

## Root-Cause je Eintrag

### 1. devflow-ci-watch.sh
Das Skript rebased selbstständig gegen `origin/main`, sobald `mergeStateStatus=DIRTY`
gemeldet wird (Zeilen 22-34), um den CI-Poll-Loop nicht ins Leere laufen zu lassen (CI
startet nie auf einem DIRTY-PR). Ein Rebase verschiebt HEAD aber auf einen neuen
Basis-Commit — jeder generierte Artefakt-Snapshot (repo-index.json, openspec-status.json,
test-inventory.json, …), der zum Zeitpunkt des letzten eigenen Commits aktuell war, kann
gegenüber der neuen Basis stale sein. `task freshness:check` (CI-Gate) regeneriert
selbst und diff't gegen den Commit-Stand (Taskfile.yml:1040-1091) — schlägt also fehl,
wenn niemand vorher regeneriert UND committed hat.

### 2. plan-archive-steps.md / openspec.sh archive
Zwei Stellen erzeugen den finalen Dateizustand nacheinander in derselben Working
Copy, aber nur eine davon wird gestaged: `scripts/openspec.sh cmd_archive` (Zeile
154-156) läuft `openspec-status-map.sh` NACH `mv "$dir" "$dest"` — das schreibt
`website/src/data/openspec-status.json` mit dem POST-Archiv-Zustand ins Arbeitsverzeichnis.
`plan-archive-steps.md` Schritt 4 committed danach aber nur
`openspec/changes/` + `openspec/changes/archive/` (Zeile 59) — die regenerierte
JSON-Datei bleibt unstaged und geht beim nächsten `git status`-unabhängigen Workflow
unter, bis CI sie als stale meldet.

### 3. agent-lock.sh / ticket.sh
`agent-lock.sh` ist ein rein **advisory** Lock-Registry (Kommentar Zeile 9-13: "lets
each session claim ... so the others see who is doing what and refuse to duplicate
work"). Es gibt zwei Kategorien von Konsumenten:
- **Dispatch-Gates** (factory dispatcher/prep, babysit-prs) fragen VOR dem Dispatch
  `agent-lock.sh check ticket <id>` ab und überspringen ein bereits gehaltenes Ticket.
- **Schreib-Pfad** (`scripts/ticket.sh update-status` und andere Mutationen in
  `scripts/vda/ticket/*.sh`) hat NULL Bezug zu `agent-lock.sh` — jeder Aufrufer,
  ob Mensch, Factory oder eine zweite parallele Session, kann den Status jederzeit
  überschreiben, unabhängig davon, wer den Lock hält.

Das erklärt den beobachteten Rückschritt: ein zweiter Akteur (Ursache nicht mehr
rekonstruierbar) konnte `status=awaiting_deploy` schreiben, OBWOHL diese Session den
Ticket-Lock für T002270 durchgehend hielt — weil der Schreib-Pfad den Lock nie prüft.

## Fix-Ansatz je Eintrag

### 1. devflow-ci-watch.sh
Nach erfolgreichem `git rebase origin/main` und VOR `git push --force-with-lease`:
`task freshness:regenerate` ausführen; falls das einen Diff erzeugt, die bekannten
Freshness-Artefakte stagen und als zusätzlichen Commit `chore(ci): regenerate freshness
artifacts after auto-rebase [<ticket-id-falls-bekannt>]` anhängen (kein `--amend`, um den
gerade rebased Commit nicht erneut zu mutieren). Kein Diff → kein Extra-Commit, Push
läuft wie bisher. Muss idempotent sein: `task freshness:regenerate` läuft bereits
mehrfach in anderen Flows und ist als No-Op bei sauberem Stand dokumentiert.

**Edge-Case:** `TICKET_ID` ist im Skript bereits als `$1` vorhanden — kann für die
Commit-Message wiederverwendet werden, falls belegt; sonst generischer Text.

### 2. plan-archive-steps.md
Schritt 4 vor `git add` um einen expliziten `task freshness:regenerate`-Aufruf ergänzen
(macht die implizite Teil-Regeneration in `cmd_archive` redundant, aber schadet nicht —
beide sind idempotent) und die `git add`-Zeile um die bekannten Freshness-Ziele
erweitern statt nur die openspec-Pfade zu stagen. Referenz auf dieselbe Dateiliste wie
Taskfile `freshness:check` Phase 1 (T002252-Konvention), damit keine zweite, abweichende
Quelle für "welche Dateien sind generiert" entsteht.

**Annahme (da kein User verfügbar):** Es ist ausreichend, den Doku-Schritt
(`plan-archive-steps.md`) zu korrigieren — es gibt keinen separaten
`scripts/openspec-archive-commit.sh`, der Schritt 4 automatisiert; der Text IST die
ausführbare Prozedur (Copy-Paste-Bash-Block), der von jeder Session direkt ausgeführt
wird. Ein Test kann diesen Bash-Block daher nur als Konventions-Check absichern
(grep auf die erwarteten Kommandos in der .md-Datei), nicht als Ende-zu-Ende-Test des
tatsächlichen Archiv-Laufs (der bereits durch bestehende BATS-Tests für
`scripts/openspec.sh archive` abgedeckt ist, soweit vorhanden).

### 3. agent-lock.sh-Durchsetzung in ticket.sh
Neuer Guard-Helper `_ticket_lock_guard` in `scripts/vda/ticket/_ticket-core.sh`:
ruft `bash scripts/agent-lock.sh check ticket "$id"` auf.
- Exit 0 + Ausgabe `free` oder `mine` → weiter, kein Blocker.
- Exit 3 (Ausgabe `held`) → Abbruch mit klarer Fehlermeldung ("Ticket $id ist durch
  eine andere Session gesperrt (agent-lock) — Status-Schreibvorgang verweigert."),
  außer ein expliziter Override ist gesetzt.

**Override / Kompatibilität (Annahme, da kein User verfügbar):**
- `TICKET_OFFLINE=1` (bestehender Bypass für alle DB-Writes) überspringt den Guard
  automatisch mit — konsistent zu jedem anderen Write-Pfad in diesem Skript.
- Neuer Escape-Hatch `TICKET_LOCK_OVERRIDE=1` für Automationspfade, die absichtlich
  keinen persönlichen Claim halten (Factory-interne Übergänge, die bereits VOR dem
  Dispatch per `agent-lock.sh check` gated wurden, siehe dispatcher-prep.sh /
  factory-prep-bridge.sh — ein zweiter Check im Schreibpfad wäre für sie redundant,
  aber nicht schädlich; der Override existiert nur für den Fall, dass ein Automations-
  Pfad legitim eine Statusänderung auslösen muss, während zufällig ein (fremder,
  reapable-naher) Lock-Rest existiert).
- Guard gilt NUR für `update-status` (das Kernstück des gemeldeten Vorfalls). Andere
  Mutationen (`set-touched-files`, `phase`, …) bleiben in diesem Fix unangetastet —
  Scope-Erweiterung wäre ein separates Ticket, kein Bundle-Fix.
- Kein Lock-File vorhanden (`free`) → Schreiben bleibt erlaubt wie bisher (keine
  Verhaltensänderung für den Normalfall ohne aktiven Claim — z.B. Solo-Sessions ohne
  Worktree-Claim, ältere Workflows, die update-status ohne vorherigen `claim ticket`
  aufrufen).

## Betroffene Dateien

- `scripts/devflow-ci-watch.sh` — DIRTY-Rebase-Zweig (Zeilen ~22-35)
- `.claude/skills/references/plan-archive-steps.md` — Schritt 4 (Zeilen ~58-72)
- `scripts/vda/ticket/_ticket-core.sh` — neuer `_ticket_lock_guard`-Helper
- `scripts/vda/ticket/update-status.sh` — ruft den Guard vor dem `_exec_sql`-Write
- Tests: `tests/spec/software-factory.bats` (oder passendes Spec-File) für alle drei
  Fixes je ein `@test` mit `expected: FAIL` auf dem aktuellen Branch

## Testing

- Test 1 (devflow-ci-watch.sh): stubbed `gh`/`git`, simuliert DIRTY→erfolgreicher
  Rebase, prüft, dass `task freshness:regenerate` (stub) aufgerufen wird, BEVOR
  `git push` (stub) läuft.
- Test 2 (plan-archive-steps.md): grep-basierter Konventions-Test, dass die
  `git add`-Zeile in Schritt 4 mindestens `website/src/data/openspec-status.json`
  (oder die volle Freshness-Dateiliste) enthält UND ein `task freshness:regenerate`
  vor dem `git commit` in Schritt 4 steht.
- Test 3 (ticket.sh lock guard): BATS-Test mit gestubbtem `agent-lock.sh`, das
  `held`/Exit 3 zurückgibt → `update-status` muss non-zero exiten und darf
  `_exec_sql` NICHT aufrufen (Spy/Mock zählt Aufrufe). Gegenprobe: `free`/`mine`
  → Write läuft durch wie bisher. `TICKET_OFFLINE=1` → Guard komplett übersprungen.

## Nicht im Scope

- Forensik, WER bei T002270 den Status zurückgesetzt hat (laut Mishap selbst
  UNVERIFIED und aus dieser Session heraus nicht rekonstruierbar).
- Lock-Erzwingung für andere `ticket.sh`-Subcommands außer `update-status`.
- Änderung der `agent-lock.sh`-Reap-Heuristik selbst (nicht Teil des gemeldeten Bugs).
