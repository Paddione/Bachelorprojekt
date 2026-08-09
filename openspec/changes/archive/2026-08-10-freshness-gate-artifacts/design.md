---
ticket_id: T003075
plan_ref: null
status: active
date: 2026-08-09
---

# Design: freshness-gate-artifacts

## Root-Cause-Analyse (Brainstorming-Ergebnis)

### Symptom vs. Hypothese (T002448-M5-Trennung)

| Beobachtung | Symptom (beobachtet) | Hypothese (Ursache) | Verifiziert? |
|---|---|---|---|
| T003075 | 4/4 offene PRs scheitern am CI-Freshness-Gate; `test-inventory.json` nie mitregeneriert | Der bereits existierende pre-commit-Hook-Mechanismus (T001388/T001973), der `task freshness:regenerate` vor jedem Commit ausführt, ist "Best-effort" und blockiert nicht, wenn der Regen-Schritt scheitert | **Ja** — Commit `68982b4c5` (PR #4046/T002925) fügt zwei neue `.bats`-Dateien hinzu, enthält aber keine begleitende Änderung an `website/src/data/test-inventory.json`. `scripts/build-test-inventory.sh` scannt den Arbeitsbaum per `find`, findet also neue Dateien unabhängig vom Git-Index — wäre der Regen-Lauf erfolgreich gewesen, hätte er die Änderung erzeugt und der Hook hätte sie automatisch mitgestaged. Da das nicht geschah, lief der Regen-Schritt entweder nicht oder scheiterte; in beiden Fällen ließ der Hook den Commit unbeanstandet durch (`.githooks/pre-commit` Zeilen 84–117: der `else`-Zweig bei `task freshness:regenerate`-Fehlschlag gibt nur eine Warnung aus, kein `exit 1`). |

### Warum das die 100 %-Verletzungsquote erklärt

Der Hook ist an zwei Stellen fail-open, aber nur eine ist beabsichtigt:

1. **Beabsichtigt fail-open:** `task`/`node` fehlen komplett im PATH → der äußere `if`
   überspringt den gesamten Block. Das ist die dokumentierte Ausnahme für Umgebungen ohne
   Toolchain (z. B. bestimmte CI-Bot-Commit-Pfade).
2. **Unbeabsichtigt fail-open (der eigentliche Bug):** `task` ist vorhanden, der Block wird
   betreten, aber der `task freshness:regenerate`-Aufruf selbst schlägt fehl — z. B. weil ein
   frischer Worktree (wie er bei jedem `dev-flow-plan`/`dev-flow-execute`-Lauf entsteht) noch
   kein `node_modules` hat und `npm ci` innerhalb des Hooks entweder einen Netzwerkfehler wirft
   oder länger dauert als das Timeout/die Geduld der aufrufenden Automatisierung erlaubt. In
   diesem Fall druckt der Hook nur eine Warnzeile auf stderr — die in einer nicht-interaktiven
   Agenten-Session leicht im übrigen Commit-Output untergeht — und lässt den Commit trotzdem zu.

Fall 2 ist nicht hypothetisch: er ist exakt der Fall, den der belegte Commit zeigt. Da alle vier
betroffenen PRs von Agenten-Sessions stammen, die neue `.bats`-Dateien in einem Plan-Stage-Commit
hinzufügen (derselbe Workflow-Schritt wie im Beleg-Commit), ist eine gemeinsame Ursache über alle
vier PRs hinweg plausibel, ohne dass jeder einzeln verifiziert werden musste — der belegte Fall
reicht als Repräsentant, weil der Mechanismus (Best-effort-Warnung statt Blockade) unabhängig vom
konkreten PR-Inhalt gleich wirkt.

## Entscheidung: Fehlerzweig wird blockierend, Werkzeug-Fehlen bleibt fail-open

Erwogene Richtungen:

- **(a) Gesamten Freshness-Block blockierend machen (auch bei fehlendem `task`/`node`)** —
  verworfen: das bricht den dokumentierten Bot-Commit-Fall und alle lokalen Umgebungen ohne
  volle Toolchain, ohne den eigentlichen Bug zu treffen. Der Bug ist nicht "Werkzeug fehlt",
  sondern "Werkzeug vorhanden, Lauf scheitert".
- **(b) `task freshness:check` zusätzlich im Hook laufen lassen** (die im Ticket selbst
  genannte "mögliche Auflösung, nicht entschieden") — verworfen als *zusätzlicher* Schritt:
  `freshness:check` ist bereits das CI-Äquivalent und würde nur denselben Zustand ein zweites
  Mal prüfen, den `freshness:regenerate` unmittelbar zuvor herstellen sollte. Das eigentliche
  Problem — ein scheiternder `regenerate`-Lauf, der nur warnt — bliebe bestehen, `check` würde
  im selben Best-effort-Stil denselben Fehler nur redundant erneut ignorieren, wenn man ihn nicht
  ebenfalls blockierend macht. Der direktere Fix ist, den bereits vorhandenen Lauf blockierend zu
  machen, statt einen zweiten Lauf danebenzustellen.
- **(c) Fehlerzweig von `task freshness:regenerate` (Werkzeug vorhanden, Lauf scheitert) wird
  blockierend (`exit 1`), Werkzeug-Fehlen bleibt fail-open** — **gewählt.** Trifft exakt die
  belegte Ursache, ändert nichts am dokumentierten Bot-Ausnahmefall, ist eine lokale Änderung
  von zwei Zeilen (Warnung → `exit 1` mit Bypass) im bereits vorhandenen `else`-Zweig.

**Gewählt: (c).** Zusätzlich ein Notfall-Bypass `SKIP_FRESHNESS_REGEN=1`, damit ein echter,
vom Autor bewusst akzeptierter Ausnahmefall (z. B. Offline-Arbeit ohne npm-Registry-Zugriff)
nicht strukturell blockiert bleibt — analog zu den bestehenden `SKIP_BRANCH_CHECK`,
`SKIP_BONSAI_GUARD`, `SKIP_MAIN_COMMIT_GUARD` im selben Hook.

## Edge Cases

- **Timeout durch `npm ci` in frischem Worktree:** bleibt weiterhin langsam (das behebt dieser
  Fix nicht), aber ein tatsächlicher Fehlschlag wird jetzt sichtbar blockierend statt lautlos
  durchgelassen. Geschwindigkeit ist ein separates, hier nicht behandeltes Anliegen.
- **CI-Bot-Commits (`freshness-regen.yml`, Release-Please):** laufen über die GitHub Actions API
  bzw. eigene Checkouts, nicht über den lokalen `core.hooksPath`-Mechanismus dieses Repos —
  bleiben unberührt.
- **T003105 (Rebase verliert Artefakte durch `merge=ours`):** bewusst nicht Teil dieses Fixes
  (siehe `proposal.md` → "Out of Scope"). Ein blockierender Pre-Commit-Hook verhindert nicht,
  dass ein späterer, bereits erfolgreicher `git rebase` die im Commit enthaltenen Artefakte durch
  den Merge-Treiber wieder verwirft — andere Fehlerklasse, anderer Zeitpunkt, anderer Fix-Ort.
