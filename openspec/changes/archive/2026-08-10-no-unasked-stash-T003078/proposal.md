# Proposal: no-unasked-stash-T003078

## Why

Zwei Stellen im Repo mutieren den Haupt-Checkout per `git stash`, ohne zu prüfen, ob ein
anderer Prozess dort gerade arbeitet:

1. `.claude/skills/dev-flow-chore/SKILL.md` Schritt 0 (`git stash && git pull --rebase
   origin main && git stash pop`).
2. `scripts/worktree-create.sh` Zeilen 166–214 (Divergence-Guard: `git stash push` →
   `git pull --rebase origin main` → `_wc_stash_pop_or_warn`).

Beide beobachtet am 2026-08-09 (T003055): zum Ausführungszeitpunkt liefen drei fremde
Agent-Sessions (2× `claude --dangerously-skip-permissions`, 1× `opencode`) mit sieben
uncommitteten Dateien im Haupt-Checkout, lokales `main` lag zwei Commits hinter
`origin/main`. `git stash` auf einem Arbeitsbaum, den ein anderer Prozess offen hält, ist
eine Mutation ohne Einverständnis des Halters — schreibt die fremde Session zwischen
`stash` und `pop` weiter, kollidiert der `pop`, und die Auflösung ist manuell
(Datenverlustrisiko: der `stash pop`-Konflikt kann uncommittete Änderungen der fremden
Session überschreiben oder als Konflikt-Marker im Arbeitsverzeichnis der fremden Session
hinterlassen).

Beide Stellen setzen implizit voraus, der Haupt-Checkout gehöre der ausführenden Session
allein. `worktree-create.sh` ist gegen den **eigenen** fehlgeschlagenen `stash pop` bereits
abgesichert (T002673 entfernte die stillen `|| true`) — es kennt aber keinen Begriff davon,
dass der Arbeitsbaum einem ANDEREN Prozess gehören könnte.

**Root-Cause-Verifikation (Symptom vs. Hypothese, T002448-M5):** Symptom (Fakt, per
Prozessliste/Datei-mtimes belegt): drei fremde Sessions mit offenen uncommitteten
Änderungen liefen gleichzeitig im Haupt-Checkout, während der Divergence-Guard bzw.
Schritt 0 gefeuert hätte. Hypothese (bestätigt durch Quelltextlesen beider Stellen): weder
`dev-flow-chore` Schritt 0 noch `worktree-create.sh` prüfen vor dem `stash`, ob der
Arbeitsbaum einem fremden Prozess gehört — beide Codepfade laufen unbedingt.

**Prior Art (Schritt 0.7):** `openspec/specs/active-sessions-hub.md` (Zeilen ~300–345)
dokumentiert bereits einen `main-checkout`-Lock mit `reclaim-main-checkout` und der
Unterscheidung "Bookkeeping-Label" (`auto: pre-commit self-claim`, per Pre-Commit-Hook
selbst-geclaimt) vs. "deliberate" (fremder, expliziter Claim). Dieser Lock wird aber erst
beim ERSTEN COMMIT einer Session gesetzt (`_self_claim_main_checkout` läuft im
Pre-Commit-Hook) — T003098 belegt am selben Vorfall, dass `agent-lock.sh list` für eine
Session ohne Commit **leer** bleibt, obwohl sie aktiv im Arbeitsbaum schreibt. Der
bestehende Lock-Mechanismus ist also kein hinreichendes Erkennungskriterium für "fremder
Prozess arbeitet hier" — er ergänzt die hier vorgeschlagene Prüfung, ersetzt sie aber nicht.

## What

Ein gemeinsames Skript `scripts/lib/main-checkout-foreign-guard.sh` (Bibliotheksdatei, von
beiden Stellen gesourct) stellt eine Funktion `mc_foreign_activity_detected` bereit, die
**zwei unabhängige, in der Beobachtung verlässliche Signale** kombiniert:

1. **Prozessliste (`ps`):** Ein `claude`- oder `opencode`-Prozess (Kommandozeile via
   `ps -eo pid,comm,args`), dessen `cwd` (`/proc/<pid>/cwd`) auf den Haupt-Checkout
   zeigt UND dessen PID nicht die eigene Session-PID/Parent-Kette ist.
2. **Dirty Arbeitsbaum (`git status --porcelain`):** nicht leer.

Beide Signale müssen zutreffen, damit der Guard den Stash überspringt — ein dirty
Arbeitsbaum allein ist der Normalfall eigener Arbeit (WIP), und ein fremder `claude`-Prozess
allein (z.B. eine reine Lese-Session) rechtfertigt noch keinen Eingriff. Erst die
Kombination aus "fremder Prozess mit cwd hier" UND "uncommittete Änderungen liegen vor"
begründet die Annahme, dass ein Stash reale fremde Arbeit gefährdet.

**Warum `ps` + mtime nicht dabei ist:** Die Beobachtung bei T003055 zeigte Datei-mtimes als
zusätzliches Signal (kürzlich beschriebene Dateien). Datei-mtimes allein sind aber
mehrdeutig — ein `git pull`/`checkout` der EIGENEN Session ändert ebenfalls mtimes, und ohne
Prozess-Zuordnung lässt sich "fremd" nicht von "gerade selbst gemacht" unterscheiden. `ps`
mit `cwd`-Zuordnung ist das schärfere Signal und deckt den beobachteten Fall vollständig ab;
mtime-Heuristik wird deshalb NICHT übernommen (Vereinfachung, kein Informationsverlust
gegenüber der Beobachtung).

**Bei erkannter Fremdaktivität:** Der Stash wird übersprungen, eine Warnung ausgegeben
(`main-checkout: dirty UND fremder Prozess erkannt — Sync übersprungen, siehe <Hinweis>`),
und:

- `dev-flow-chore` Schritt 0 überspringt `git pull --rebase origin main` komplett (der
  Skill braucht ohnehin nur `origin/main` als Referenz für den anschließenden
  `worktree-create.sh`-Aufruf).
- `worktree-create.sh` überspringt NUR den Sync von lokalem `main` (stash/pull/pop) und
  fährt mit `BASE=origin/main` fort (Zeile 226 — der Worktree wird ohnehin von
  `origin/main` aus angelegt, der lokale `main`-Sync ist reine Hygiene, keine
  Korrektheitsvoraussetzung).

Der bestehende Guard gegen den EIGENEN fehlgeschlagenen `stash pop` (T002673,
`_wc_stash_pop_or_warn`) bleibt unverändert — er greift weiterhin, wenn der neue
Fremdaktivitäts-Guard NICHT anschlägt und ein Stash tatsächlich stattfindet.

### Nicht-Ziele

- Kein genereller Multi-Session-Locking-Mechanismus für den Haupt-Checkout (das leistet
  bereits `active-sessions-hub.md` / `agent-lock.sh main-checkout`).
- Keine Änderung am `main-checkout`-Lock selbst — er wird nur referenziert, nicht erweitert.
- Kein Eingriff in den Divergence-Guard-Fehlerfall "wirklich divergiert" (Zeile ~224ff.) —
  betroffen ist nur der Sync-Pfad "local main liegt hinter origin/main".

_Ticket: T003078, T003097_
