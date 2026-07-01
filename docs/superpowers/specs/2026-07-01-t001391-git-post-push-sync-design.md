---
ticket_id: T001391
plan_ref: null
status: active
date: 2026-07-01
---

# T001391 — Post-Push origin/main-Sync (Divergenz-Guard)

## Root-Cause

Ausgangs-Mishap (Herkunft T001373 M1): Ein lokaler Entwickler-Branch (`main`) amendete
und re-pushte einen Commit — Auslöser war ein doppelter `freshness:regenerate`-Lauf.
Zwischen dem ersten und zweiten Push lief der GitHub-Actions-Workflow
`.github/workflows/freshness-regen.yml` (`on: push: branches: [main]`), der bei
Artefakt-Drift selbstständig einen `chore: auto-regenerate freshness artifacts
[skip ci]`-Commit **direkt auf `origin/main`** committet und pusht (Bot-Identität
`github-actions[bot]`). Kombiniert mit einem zuvor bereits erfolgten Squash-Merge
eines anderen PRs entstand ein Fall, in dem der lokale `main` einen Commit enthielt,
dessen Inhalt bereits vollständig im Squash-Merge-Commit auf `origin/main` aufgegangen
war — aber mit anderer SHA (Squash erzeugt neue History). Ergebnis: `git status` zeigte
„diverged" (weder Fast-Forward noch Ahead/Behind), obwohl inhaltlich kein Konflikt
vorlag. Aufgelöst wurde das manuell mit `git reset --hard origin/main` (sicher, weil der
lokale Commit-Inhalt bereits im Squash-Merge steckte — verifiziert per Diff-Vergleich
vor dem Reset).

**Kernproblem:** Es gibt in Git **kein natives „post-push"-Hook-Event**. `pre-push`
läuft *vor* der Netzwerk-Übertragung und kann daher den tatsächlichen Post-Push-Zustand
von `origin/main` nicht beobachten — insbesondere nicht Server-seitige Nacharbeiten wie
den freshness-regen-Bot-Commit, der Sekunden bis Minuten nach dem eigenen Push auf
`origin/main` landet.

## Fix-Ansatz

Zwei Bausteine, kein einzelner Hook reicht:

1. **Lokaler Divergenz-Guard nach Push auf `main`** — da Git keinen post-push-Hook
   kennt, wird der Sync-Check als expliziter Wrapper-Schritt um `git push` ergänzt
   (nicht in `.githooks/pre-push`, das läuft zu früh). Kandidat: eine neue Funktion in
   `scripts/git-safe-push.sh` (neu) bzw. eine Ergänzung in der `git-workflow`-Skill-
   Anleitung, die nach `git push` **nur wenn Zielbranch `main` ist**:
   - `git fetch origin main --quiet`
   - prüft, ob `origin/main` jetzt divergiert (`git merge-base --is-ancestor` in beide
     Richtungen negativ)
   - **nur** bei Divergenz: prüft per `git patch-id` / `git diff <local>..<remote>
     --stat`, ob der lokale Commit-Inhalt bereits vollständig in der neuen
     `origin/main`-History (z. B. durch Squash) enthalten ist (Inhalts-Äquivalenz, nicht
     SHA-Gleichheit)
   - **nur bei bestätigter Inhalts-Äquivalenz** automatisches `git reset --hard
     origin/main` (mit Log-Ausgabe, welcher lokale Commit verworfen wurde)
   - bei Divergenz **ohne** bestätigte Äquivalenz: nur lauter Warn-Hinweis + manuelle
     Anleitung (`git log origin/main..HEAD`), **kein** automatischer Reset — echte
     Divergenz mit eigenständigem Inhalt darf nie automatisch verworfen werden.

2. **Race-Fenster mit dem freshness-regen-Bot minimieren** — dokumentieren, dass nach
   jedem Push auf `main` ein kurzes Zeitfenster existiert, in dem der Bot ggf. nachzieht;
   der Guard aus (1) deckt das ab, wenn er *vor* dem nächsten lokalen Commit/Push erneut
   ausgeführt wird (z. B. als fester erster Schritt jedes `git-workflow`-Push-Zyklus,
   nicht nur einmalig).

**Explizit NICHT automatisiert:** Ein blindes `git reset --hard origin/main` bei jeder
Divergenz ohne Inhalts-Check — das würde bei einer *echten* Divergenz (z. B. zwei
Entwicklern mit unterschiedlichen, nicht gemergten main-Commits) stillschweigend Arbeit
verlieren.

## Betroffene Subsysteme

- `.githooks/pre-push` (Referenz/Dokumentation — kein funktionaler Eingriff, da zeitlich
  zu früh für Post-Push-Zustand)
- Neuer Wrapper: `scripts/git-safe-push.sh` (oder äquivalent benannt) für Pushes auf
  `main`
- `.claude/skills/git-workflow/SKILL.md` — Push-Schritt referenziert künftig den neuen
  Guard statt rohem `git push`
- `.github/workflows/freshness-regen.yml` — nur als Kontext/Trigger-Quelle relevant,
  keine Änderung am Workflow selbst geplant (Bot-Verhalten bleibt)

## Edge Cases

1. **Echte Divergenz (kein Squash-Fall):** zwei unabhängige main-Commits lokal und
   remote → Guard warnt, resettet NICHT automatisch.
2. **Guard läuft auf Feature-/Fix-Branch statt main:** Guard ist auf `main`-Pushes
   scoped (per Ticket-Vorschlag) — Feature-Branches divergieren erwartungsgemäß von
   `origin/main` und dürfen nicht angefasst werden.
3. **Netzwerk-Timeout beim Post-Push-Fetch:** darf den eigentlichen Push nicht rückgängig
   machen oder blockieren — Fetch-Fehler nur als Warnung loggen, nie als Fehler
   exiten (Push selbst ist bereits erfolgreich abgeschlossen).
4. **Dirty Working Tree beim Reset-Kandidaten:** `git reset --hard` nur ausführen, wenn
   `git status --porcelain` leer ist — sonst nur warnen (kein Datenverlust an
   uncommitted Changes).
5. **CI/Bot-Kontext (github-actions[bot] selbst pusht):** Guard ist ein lokales
   Dev-Tooling-Skript, läuft nicht in der CI-Pipeline des Bots selbst — kein
   rekursiver Trigger.
6. **`SKIP_CI_CHECK=1`-Bypass-Konvention:** analog zum bestehenden pre-push-Bypass sollte
   der neue Guard einen eigenen Opt-out (`SKIP_PUSH_SYNC=1`) für Notfälle unterstützen,
   ohne bestehende Bypass-Variable zu überladen.

## Entscheidung

Wrapper-Skript-Ansatz (Baustein 1) statt Versuch, dies über einen nicht-existenten
„post-push"-Git-Hook zu lösen. Auto-Reset ist **inhaltsgebunden** (Patch-Äquivalenz),
nicht bedingungslos — Sicherheit vor Bequemlichkeit, wie im ursprünglichen manuellen
Vorgehen aus T001373 M1 bereits demonstriert.
