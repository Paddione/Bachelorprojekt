---
title: "p2 — Worktree-Schreibschutz als blockierender PreToolUse-Hook"
ticket_id: T002375
domains: [agent-config, devtooling]
status: active
partial_id: p2
role: impl
target_files: ["scripts/hooks/worktree-write-guard.sh", ".claude/settings.json", ".claude/skills/references/ci-fix-loop.md", "tests/spec/dev-flow-plan.bats"]
depends_on: [p1]
---

# p2 — Worktree-Schreibschutz

_Ticket: T002375 · Partial p2 · Mishaps: T002355-M3, T002352-M1, T002351-M3_

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/hooks/worktree-write-guard.sh` | **neu** — lehnt Schreibzugriffe außerhalb des geclaimten Worktrees ab |
| `.claude/settings.json` | Hook-Registrierung unter dem bestehenden `PreToolUse`-Block |
| `.claude/skills/references/ci-fix-loop.md` | `devflow-ci-watch.sh` als synchron aufzurufend markieren |
| `tests/spec/dev-flow-plan.bats` | vier Verhaltensfälle plus Bypass |

## Kontext

`agent-lock.sh` ist **kooperativ**, kein Mandatory Locking. Eine Session, die nicht claimt, sieht
keinerlei Widerstand — weder beim Betreten eines fremd geclaimten Worktrees noch beim Schreiben.
Der `.githooks/pre-commit`-Mutex greift erst beim Commit; bis dahin überschreiben sich zwei
Sessions frei.

T002355-M3 belegt genau das: während `dev-flow-plan` für T002350 lief, arbeitete eine zweite
Claude-Session im selben Worktree `.worktrees/reaper-child-selection` ohne Claim, schrieb dieselben
Dateien (`design.md`, `tasks.md`, `tests/spec/mcp-gateway.bats`) und **pushte**. Entdeckt wurde die
Kollision nur zufällig über einen "File has been modified since read"-Fehler des Write-Tools;
`tasks.md` war zwischen Read und Write von 45 auf 260 Zeilen gewachsen. Aus dem Ticket wörtlich
sinngemäß: hier ging nichts verloren, weil die fremde Session zufällig die Artefakte der ersten
aufgriff statt sie zu ersetzen — das war Glück, keine Absicherung.

T002352-M1 zeigt die zweite Richtung derselben Lücke: der Orchestrator lief

```
cd <worktree> && git checkout -q main || git checkout -q -B archive/<slug> origin/main
```

Bei fehlgeschlagenem `cd` läuft der Fallback im *aktuellen* Verzeichnis weiter — hier im
Hauptcheckout, wo er einen Branch anlegte. `CLAUDE.local.md` verbietet mutierende Chores im
Hauptcheckout ausdrücklich (T001880).

Und T002357-M1 nennt die strukturelle Wurzel: der Wechsel in den Worktree passiert per `cd` und
wirkt **nur auf Bash**. Die Edit- und Write-Tools nehmen absolute Pfade und haben keinerlei Bezug
zum Bash-Arbeitsverzeichnis — ein Pfad, der zu Sessionbeginn korrekt war, bleibt danach
syntaktisch gültig und trifft still die falsche Arbeitskopie.

**Entscheidung (Brainstorming): der Hook blockiert.** Die warnende Variante existiert de facto
bereits als Regel in `dev-flow-plan` und `CLAUDE.local.md` und hat die Vorfälle nicht verhindert.
Herleitung in `design.md` § E2.

## Schritte

- [ ] **RED zuerst.** Die vier Verhaltenstests schreiben und gegen den Stand ohne Hook laufen
      lassen. Sie müssen fehlschlagen, weil `scripts/hooks/worktree-write-guard.sh` noch nicht
      existiert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats
# expected: FAIL (rot — der Hook existiert noch nicht)
```

- [ ] **Schritt 1 — Hook-Skript.** `scripts/hooks/worktree-write-guard.sh` liest die Tool-Eingabe
      auf stdin, zieht den Zielpfad heraus und entscheidet:

      1. Pfad **außerhalb** des Repo-Roots → erlauben. Der Hook ist keine allgemeine
         Dateisystem-Policy.
      2. Session hält einen Branch-Claim mit gesetztem `worktree` → nur Pfade unterhalb dieses
         Worktrees erlauben. Alles andere im Repo-Root ablehnen.
      3. Session hält keinen solchen Claim, aber ein **fremder lebender** Claim deckt den Zielpfad
         → ablehnen und die besitzende Session-ID nennen.
      4. Sonst → erlauben. Ohne Claim ändert sich am bisherigen Ablauf nichts.

      Die Lock-Dateien liegen unter `$(git rev-parse --git-common-dir)/agent-locks/`. Die
      Zuordnung "gehört mir" läuft über `owner_sid` — deshalb hängt dieses Partial an `p1`: erst
      dort wird `owner_sid` über Tool-Call-Grenzen hinweg stabil und `branch`/`worktree`
      zuverlässig befüllt.

- [ ] **Schritt 2 — Ablehnungsmeldung.** Die Meldung nennt drei Dinge: den abgelehnten Pfad, den
      erwarteten Worktree-Präfix und den Namen der Bypass-Variablen. Vorbild sind
      `SKIP_BRANCH_CHECK` und `SKIP_COMMIT_VS_DIFF` in diesem Repo — ein Guard ohne benannten
      Notausgang wird umgangen statt verstanden.

      Konkret soll die Meldung den Fehler aus T002357-M1 direkt beantworten: "der Pfad gehört zum
      Hauptcheckout, dieser Session gehört `<worktree>` — Pfad mit diesem Präfix erneut aufrufen."

- [ ] **Schritt 3 — Registrierung.** Den Hook in `.claude/settings.json` unter dem bereits
      vorhandenen `PreToolUse`-Block auf die dateischreibenden Tools registrieren. Der Block
      existiert (verifiziert: `PreToolUse` und `SessionStart` sind die beiden Schlüssel) — es wird
      ein Eintrag ergänzt, die Datei nicht umgebaut.

- [ ] **Schritt 4 — Tests.** Ein `@test` je Fall aus Schritt 1, plus einer für den Bypass. Die
      Fixtures legen die Lock-Dateien in einem `$BATS_TEST_TMPDIR`-Verzeichnis an und setzen
      `AGENT_LOCK_DIR` — **niemals** in das echte `agent-locks/`-Verzeichnis schreiben. Das ist
      genau der Fehler, den T002347-M1 in `software-factory.bats` beschreibt: ein Test, der ins
      echte Arbeitsverzeichnis schreibt, macht parallele Läufe rot und hinterlässt Müll, wenn er
      abbricht.

      Jeder Negativtest ("wird abgelehnt") braucht im selben Test einen **Positiv-Anker**, der bei
      fehlendem Hook rot wird — sonst besteht er vakuos, weil bei fehlendem Skript gar nichts
      passiert. Konvention aus T002356-M1, in `p6` in `CLAUDE.md` verankert.

- [ ] **Schritt 5 — Background-Monitor-Verbot verankern (T002351-M3).** Der
      `dev-flow-execute`-Prompt enthält die Direktive wörtlich ("KEINE Background-Tasks, auf deren
      Output du in einer Monitor-Schleife wartest"), und der Implementer startete
      `devflow-ci-watch.sh` trotzdem im Hintergrund — die Wiederholung eines Mishaps aus T001969
      trotz expliziter Gegen-Direktive.

      Die Diagnose im Ticket: die Prompt-Direktive konkurriert mit der Skill-Anweisung in
      `dev-flow-execute` Schritt 5.5, die das Skript als aufzurufendes Kommando nennt, **ohne die
      Ausführungsart zu erzwingen**. Deshalb wird `devflow-ci-watch.sh` in
      `.claude/skills/references/ci-fix-loop.md` explizit als synchron-aufzurufend markiert, mit
      dem `timeout`-Aufruf als Kopiervorlage.

      **`scripts/devflow-ci-watch.sh` selbst wird hier nicht angefasst** — die Datei gehört zu
      PR #3400 (T002282).

## Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats
bash -n scripts/hooks/worktree-write-guard.sh
python3 -c "import json;json.load(open('.claude/settings.json'))"
```

Manueller Gegenbeweis: aus einer Session mit Branch-Claim auf einen Worktree eine Datei im
Hauptcheckout schreiben lassen — der Versuch muss abgelehnt werden und die Meldung muss beide
Pfade nennen.

## Abgrenzung

- Der Hook prüft **nicht**, ob überhaupt geclaimt wurde. Eine Session ohne Claim wird nicht zum
  Claimen gezwungen; das wäre eine eigene Entscheidung mit deutlich breiterer Wirkung.
- `scripts/agent-lock.sh` gehört `p1`.
