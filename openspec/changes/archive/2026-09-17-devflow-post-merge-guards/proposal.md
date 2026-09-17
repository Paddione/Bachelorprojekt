# Proposal: devflow-post-merge-guards

## Why

Beim Finalisieren von T900078 (PR #5508, 2026-09-09) zeigte
`scripts/devflow-post-merge-finalize.sh` zwei Defekte mit Datenverlust-Potenzial:
(1) Schritt 10 löscht den `plan_ref`-Branch per `branch -D`, ohne zu prüfen, ob er
Commits außerhalb von `main` trägt — ein nie gemergter Commit eines anderen Tickets
(`554770c2b`) wurde gelöscht und überlebte nur via Remote-Ref; (2) Schritt 8 nimmt
uncommittete Fremdänderungen des geteilten Haupt-Checkouts in den Archiv-Commit
(T900094-Dateien in Archiv-PR #5511, drei rote Registry-Guards).

Eine fremde Session hat auf `fix/devflow-post-merge-guards-T900096` bereits einen
partiellen Fix gelegt (Reaper-Ancestor-Guard korrekt; Befund 2 jedoch via
`git checkout -- .` + `git clean -fd` — stilles Verwerfen fremder Arbeit statt
fail-closed). Dieser Change übernimmt den Branch (User-Entscheid) und korrigiert
ihn: destruktiver Discard → Dirty-Tree-Abbruch, plus fehlender lokaler
Branch-Delete-Guard und BATS-Absicherung.

## What

- Schritt 10 (`devflow-post-merge-finalize.sh`): vor `branch -D` prüfen, dass der
  Branch keine Commits außerhalb von `origin/main` trägt; bei Treffern nicht
  löschen, sondern warnen und melden.
- Schritt 8: vor `checkout -B` fail-closed abbrechen, wenn der Arbeitsbaum
  uncommittete Änderungen trägt (statt sie zu verwerfen oder mitzunehmen);
  `archive-staged-scope.sh` bleibt zweites Netz.
- Bestehenden Reaper-Ancestor-Guard (Fremd-Commit) per Spec + Test festschreiben.
- BATS-Guards im `post-merge-finalize-guards`-Stil (Source-Grep-PRÜFMODUS mit
  dokumentierter Ausnahme, Positiv-Anker).

_Ticket: T900096_
