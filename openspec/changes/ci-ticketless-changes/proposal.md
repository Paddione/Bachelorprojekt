# Proposal: ci-ticketless-changes

## Why

Der Required Check `Factory + OpenSpec + Guards` ist dauerhaft rot. Shard 4 der Spec-Suite
meldet `.ticket`-lose OpenSpec-Changes ohne Vermerk in `evaluation.md` — am 2026-08-09
sieben Stück, Tendenz steigend. Dadurch sind Merges blockiert (zuerst beobachtet an PR #3936).

Die Ursache liegt nicht im Register, sondern in zwei zusammenwirkenden Fehlern:

**1. Der Guard hat sein Mandat überschritten.** `tests/spec/openspec-ticket-links-evaluation.bats`
Test 1 sichert das Bewertungsprotokoll aus T002573 ab — eine **Momentaufnahme** über 41
Altlast-Changes, laut Kopfzeile „Erstellt 2026-08-03". Test 2 respektiert das und prüft eine
statisch einkodierte 41er-Liste. Test 1 dagegen iteriert über `openspec/changes/*/` und erfasst
damit auch jeden künftigen Change. Aus einem abgeschlossenen Protokoll wurde so ein dauerhaft
von Hand nachzupflegendes Register. Zeile 42 (`context-guard-T002585`) ist bereits ein solcher
Nachtrag — derselbe Vorgang, den jetzt sieben weitere Changes auslösen.

**2. Der empfohlene Propose-Weg erfüllt die eigene SSOT-Spec nicht.**
`openspec/specs/openspec-workflow.md` verlangt im Requirement „Propose erstellt vollständiges
Change-Skeleton" ausdrücklich eine `.ticket`-Datei. `scripts/openspec.sh propose` erzwingt
`--ticket` und schreibt sie. Der von CLAUDE.md als **primär** bezeichnete Weg `/opsx:propose`
kennt das Konzept nicht: in keiner der drei gespiegelten Anweisungsdateien
(`.claude/skills/openspec-propose/SKILL.md`, `.claude/commands/opsx/propose.md`,
`.opencode/commands/opsx-propose.md`) kommt `.ticket` auch nur vor. CLAUDE.md nennt beide Wege
„equivalent fallbacks" — sie sind es nicht.

Alle sieben Fehler-Slugs stammen aus regulär gemergten PRs (#3901, #3902, #3907 …), also aus
korrekt durchgeführter Arbeit über den empfohlenen Pfad. 37 der 77 Changes sind bereits
`.ticket`-los.

Der Folgeschaden reicht über CI hinaus: `scripts/openspec.sh` liest `.ticket` an drei Stellen —
`apply` setzt darüber den Ticket-Status (Z. 200f.), `archive` prüft ihn (Z. 224ff.), `validate`
warnt (Z. 316). Ohne die Datei läuft der Lifecycle-Sync still ins Leere, und die Changes sammeln
sich genau so an wie die 41 Altlasten.

## What

Vier Eingriffe mit getrennten Zuständigkeiten:

1. **Guard-Mandat einfrieren.** Test 1 iteriert über die Altbestands-Slugliste statt über das
   Verzeichnis und prüft je Slug: noch live → dann muss ein Vermerk existieren. Die Slugliste
   wird gemeinsame Konstante beider Tests, statt nur in Test 2 einkodiert zu liegen. Am Register
   selbst wird keine Zeile ergänzt.

2. **Neuer fail-closed Guard.** Jeder Change **außerhalb** des Altbestands muss eine
   `.ticket`-Datei tragen. Eigene Datei nach der Verzeichniskonvention (T002416), mit
   Positiv-Anker (T002356-M1), damit der Test bei leerer Kandidatenliste nicht vakuos besteht.

3. **Quelle reparieren.** Alle drei gespiegelten `/opsx:propose`-Anweisungen schreiben die
   `.ticket`-Datei; CLAUDE.md löst den „equivalent fallbacks"-Widerspruch auf.

4. **Die sieben Bestands-Changes abschließen.** `.ticket` nachrüsten, dann archivieren — alle
   sieben Tickets (T002768–T002774) sind `done/fixed`. `archive` ist ihr korrekter Abschluss und
   vermeidet die `apply`-Falle: ein späterer `apply` würde über die nachgerüstete `.ticket`-Datei
   ein abgeschlossenes Ticket auf `plan_staged` zurückwerfen.

## Abgrenzung

- Die 20 Altlasten des Rest-Vermerks bleiben unangetastet — ihre Archivierung erfordert
  `--create-new` und ist eigene Arbeit.
- Test 2 (statische 41er-Liste) bleibt inhaltlich unverändert; er wird nur an die gemeinsame
  Slug-Konstante angeschlossen.
- Keine Änderung an bestehenden Migrationen des Bewertungsprotokolls oder an `evaluation.md`.

_Ticket: T002836_
