# Proposal: worktree-status-check-existence

## Why

Der Vorcheck in `.claude/skills/references/repo-hygiene-ops.md` §1 entscheidet, ob ein
Worktree entfernt werden darf. Er läuft als Pipe:

```bash
git -C <path> status --porcelain | cut -c4- | grep -Ev '…'
```

Fehlt das Verzeichnis physisch — Registrierung noch in `.git/worktrees`, Verzeichnis weg —
schreibt git `fatal: cannot change to '<pfad>'` nach stderr und endet mit 128. Die Pipe
verwirft den Exit-Code; übrig bleibt eine leere Ausgabe, und leer heißt in dieser Form
„sauber". Der Fehlerfall ist damit vom Gesundfall nicht unterscheidbar und wird zur
Freigabe zum Entfernen.

Nachgemessen am 2026-08-10 im Hauptcheckout:

```bash
git -C /nicht/vorhanden status --porcelain 2>/dev/null | wc -l   # -> 0
git -C /nicht/vorhanden status --porcelain >/dev/null 2>&1; echo $?   # -> 128
git -C /home/patrick/Bachelorprojekt status --porcelain | wc -l  # -> 0
```

Real aufgetreten an `.worktrees/update-status-guard-T002876`; aufgefallen nur, weil
`fatal:` in einem ungepipeten Aufruf sichtbar mitlief.

Das ist dieselbe Fehlerklasse, die sich am 2026-08-10 mehrfach gezeigt hat: **eine Prüfung,
die bei fehlender Substanz still besteht.** Verwandte, am selben Tag belegte Instanzen sind
T003109 (`all()` über die leere Liste ist wahr) und T003278 (`bats` endet mit 0 auf einer
nicht existierenden Datei). §0 und §3 des Runbooks führen die Regel „eine leere Antwort ist
kein Urteil" bereits; §1 ist der einzige Abschnitt, der nicht dagegen gehärtet ist. Dieser
Change löst ausdrücklich nur den Worktree-Fall — die Verwandtschaft wird benannt, nicht
mitbehoben.

## What

**Entscheidung: Prüfung in ein Skript ziehen, nicht nur den Runbook-Text schärfen.**

Gegen den reinen Textfix sprechen drei Dinge:

1. Die gehärtete Form ist keine Zeile mehr, sondern eine Sequenz aus Existenzprüfung,
   Exit-Code-Auswertung und Allowlist-Filter. Eine mehrzeilige Kopiervorlage im Runbook
   wird beim Abtippen gekürzt — genau die Kürzung, die den Defekt erzeugt hat.
2. §1 hat für ausführbare Vorchecks bereits die Form eines Skriptaufrufs
   (`bash scripts/worktree-git-op-guard.sh`); ein zweiter Guard fügt sich ein.
3. Der bestehende Guard aus T003121 muss die dokumentierte Form heute per `awk` aus dem
   Markdown schneiden, um sie überhaupt ausführen zu können. Gegen ein Skript ist die
   Zusicherung direkt prüfbar statt über eine Textextraktion.

Dagegen steht das ehrliche Gegenargument: **ein Guard wirkt nur, wenn er ausgeführt wird.**
Ein Skript, das niemand aufruft, ist schwächer als eine Zeile, die im Runbook steht. Deshalb
ist die Aufrufstelle Teil des Fixes und wird eigens abgesichert: §1 nennt den Skriptaufruf
als operativen Vorcheck, und ein BATS-Block prüft genau diese Nennung.

Umfang:

- Neu `scripts/worktree-clean-check.sh <path>` — Existenz zuerst, dann `git status` mit
  ausgewertetem Exit-Code, dann der Allowlist-Filter aus §1. Drei unterscheidbare
  Exit-Codes: 0 sauber, 1 Befund, 2 nicht prüfbar.
- `.claude/skills/references/repo-hygiene-ops.md` §1: operativer Vorcheck wird der
  Skriptaufruf. Der bestehende Allowlist-Block bleibt als Erklärung des Filters stehen —
  er ist die Bezugsstelle des T003121-Guards und beschreibt weiterhin, *welche* Pfade
  folgenlos sind.
- Neu `tests/spec/repo-hygiene/worktree-clean-check-existence.bats` (Konvention T002416).

Nicht im Umfang: die Allowlist selbst. SSOT bleibt `ALLOWLIST=` in
`scripts/branch-reaper.sh`; das neue Skript spiegelt sie mit einem Verweis, wie §1 es heute
schon tut.

_Ticket: T002932_
