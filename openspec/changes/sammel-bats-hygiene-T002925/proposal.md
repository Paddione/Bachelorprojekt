# Proposal: sammel-bats-hygiene-T002925

## Why

Drei BATS-Hygiene-Befunde wurden zu einem Bündel zusammengefasst (T002925), weil sie eine
gemeinsame Wurzel teilen: **ein Test meldet etwas anderes, als er zu messen vorgibt.**

Vor der Planung wurde jeder der drei Kind-Befunde selbst gegen `origin/main` reproduziert
(CLAUDE.md verlangt das nach der T002872-Erfahrung, wo ein als „verifiziert" markierter Befund
der Gegenprobe nicht standhielt):

- **T002834 — bestätigt.** `tests/spec/agent-roster.bats`, Test „P4.5: agents-map.md ist
  aktuell" (Zeile 144–149) ruft `task agent-guide:maps` auf. Das schreibt alle vier
  getrackten Karten (`agents-map.md`, `danger-map.md`, `goals-map.md`, `tools-map.md`) in
  place neu. Beleg: vor dem Lauf wurden alle vier Dateien auf eine alte mtime gesetzt; nach
  `task agent-guide:maps` hatten alle vier eine neue mtime (eine fünfte, unbeteiligte Karte
  — `toolset-map.md`, die der Task nicht anfasst — blieb unverändert). Der Inhalt stimmt
  zwar bereits überein (kein `git diff`), aber die mtime-Änderung ist genau das, was der
  spec-tracked-file-guard (T002779) im CI meldet — ein für den Guard sichtbar veränderter
  Arbeitsbaum, obwohl der Test selbst grün durchläuft.
- **T002850 — bestätigt.** `tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats`
  enthält weiterhin (Zeile 88–102) ein festes `sleep 1` nach dem Start zweier
  `python3 http.server`-Hintergrundprozesse, bevor der Positiv-Anker (der gesunde Server
  MUSS als erreichbar gelten) geprüft wird. Unter Last kann die Sekunde nicht reichen, bis
  `bind()` fertig ist — dann kippt der Positiv-Anker, obwohl der Server grundsätzlich
  funktioniert. Der im Ticket vorgeschlagene Fix (aktives Warten mit `/dev/tcp`-Polling und
  Obergrenze) ist noch nicht angewendet.
- **T002878 — NICHT mehr reproduzierbar, aus dem Scope genommen.** Die im Ticket
  beschriebene Helper-Funktion `_workflows_with_paths()` in
  `tests/spec/ci-cd/workflow-self-trigger.bats` trägt bereits ein explizites `return 0` samt
  erklärendem Kommentar, wortgleich zum im Ticket beschriebenen Fix. `git log` zeigt: die
  Datei wurde am 2026-08-09 08:36 UTC in PR #3945 (T002868) MIT diesem Fix angelegt — das
  Ticket T002878 wurde erst 6 Minuten später (08:42 UTC) eröffnet und beschreibt einen
  Zwischenzustand, der zum Zeitpunkt der Ticket-Erstellung bereits behoben war. Offen bleibt
  nur der im Ticket genannte Dokumentations-Vorschlag für
  `docs/superpowers/references/gotchas-footguns.md` — das ändert kein Testverhalten und
  bekommt deshalb keinen RED-Test in diesem Bündel (siehe „Out of Scope").

## What

Beide bestätigten Fälle verletzen dieselbe Erwartung an einen Positiv-Anker bzw. einen
Testlauf: **die Assertion soll ausschließlich über die geprüfte Sache entscheiden, nicht über
einen unbeabsichtigten Nebeneffekt der Testmechanik selbst.**

- Bei T002834 ist der Nebeneffekt räumlich: der Testlauf hinterlässt einen veränderten
  Arbeitsbaum (mtime-Drift auf vier getrackten Dateien), der den spec-tracked-file-guard und
  parallele `bats -j`-Läufe verwirrt, obwohl die eigentliche Freshness-Aussage stimmt.
- Bei T002850 ist der Nebeneffekt zeitlich: der Positiv-Anker hängt an einer festen
  Wartezeit, die auf einem unbelasteten Rechner reicht und auf einem geteilten CI-Runner
  nicht garantiert reicht — der Anker fällt dann aus einem Scheduling-Grund, nicht weil der
  gesunde Server tatsächlich ungesund wäre.

Der Fix in beiden Fällen: den Test von der Fehlerquelle entkoppeln — Regeneration in ein
Tempdir statt in die getrackte Datei (T002834), aktives Port-Polling statt fixer `sleep`
(T002850). Zusätzlich wird eine SSOT-Anforderung in `openspec/specs/ci-cd.md` ergänzt (Delta
in diesem Change), die diese Klasse von Testfehlern künftig benennt.

## Out of Scope

- **T002878-Dokumentation** (Eintrag in `docs/superpowers/references/gotchas-footguns.md` für
  den grep-Exit-Code-Footgun): keine Testverhaltensänderung, passt nicht zur
  RED/GREEN-Prämisse dieses Bündels. Wird als eigenständige Empfehlung notiert, nicht in
  diesem Plan umgesetzt.
- **T002922** (CI führt cluster-abhängige `tests/spec/*.bats` nie tatsächlich aus) — verwandter
  Themenkreis, aber ein eigener, größerer Vorgang.
- **T002723** (Skip-Guard prüft Kontextnamen statt Erreichbarkeit) — verwandt, eigenes Ticket.

_Ticket: T002925_
