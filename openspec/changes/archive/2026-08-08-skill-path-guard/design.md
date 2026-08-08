---
title: skill-path-guard — Guard gegen tote Pfadverweise in eigenen Skills
ticket_id: T002613
domains: [test, tooling, devflow]
status: active
date: 2026-08-03
---

# skill-path-guard — Design

## Purpose

Ein Skill, der auf eine nicht existierende Datei verweist, führt den Agenten ins Leere: er liest
den Verweis als Handlungsanweisung, findet nichts, und rät weiter. Der Fehler ist still — kein
Gate prüft heute, ob ein im Skill-Fließtext genannter Repo-Pfad existiert.

Der auslösende Fund: `.claude/skills/dev-flow-e2e/SKILL.md` verweist zweimal auf
`openspec/specs/k8-headed-tests/spec.md`. Diesen Pfad hat es nie gegeben.

### Was tatsächlich passiert ist

Die zunächst naheliegende Vermutung — die Archivierung habe das Delta nie in einen SSOT-Spec
gemerged — ist **falsch** und wird hier festgehalten, damit sie nicht erneut angestellt wird.
Die Archivierung hat korrekt gearbeitet: das Delta aus
`openspec/changes/archive/2026-08-02-k8-headed-tests/specs/e2e-test-infrastructure.md` liegt
vollständig in `openspec/specs/e2e-test-infrastructure.md` ab Zeile 432, mit REQ-k8-01 bis
REQ-k8-04.

Der Fehler sitzt allein in der Prosa des Skills: sie benennt den Pfad nach dem **Change**-Slug
(`k8-headed-tests`) statt nach dem **Ziel-Spec**-Slug (`e2e-test-infrastructure`). Das ist die
Delta-Spec-Konvention (T001304) an der einen Stelle gespiegelt, die kein Werkzeug abdeckt:
`openspec validate` prüft Delta-Dateinamen, aber niemand prüft Pfadangaben in Fließtext.

## Architecture

```
tests/spec/agent-skills/skill-path-references.bats   Guard (neu)
.claude/skills/dev-flow-e2e/SKILL.md                 Pfad + Vision-Rückfall
.claude/skills/references/mishap-classification.md   Pfad
.claude/skills/references/ticket-ops-procedures.md   Zitat
```

Der Guard liegt unter `tests/spec/agent-skills/` — ein Verzeichnis je SSOT-Spec, eine Datei je
Vorgang, nach der Konvention aus T002416. Der zugehörige SSOT-Spec ist `agent-skills`.

### Testing

Der Guard prüft Kommando-Ergebnisse, nicht Quelltextmuster: er extrahiert die Verweise und testet
jeden mit `[ -e ]` gegen das Dateisystem. Das ist zugleich der Grenzfall, den die
Test-Resultats-Konvention (T002448-M4) ausdrücklich zulässt — der geprüfte Gegenstand *ist* hier
der Dateiinhalt, und ein Verweis lässt sich nicht anders als durch Lesen finden. Der Header des
Tests hält diesen Prüfmodus fest.

### Reihenfolge

Rot zuerst: Der Guard wird geschrieben und schlägt mit den drei bekannten toten Verweisen fehl,
bevor eine Korrektur erfolgt. Erst danach werden die drei Dateien angefasst.

## Abgrenzung

- **Keine Prüfung von URLs.** Nur repo-relative Pfade mit Dateiendung.
- **Keine Prüfung von Zeilennummern** in Verweisen der Form `datei.md:42`. Die Datei muss
  existieren, die Zeilennummer wird nicht validiert — sie veraltet naturgemäß und wäre ein
  Dauerärgernis ohne Erkenntnisgewinn.
- **Keine Änderung an REQ-k8-01…04.** Der SSOT-Spec ist korrekt; korrigiert wird die Prosa,
  die auf ihn zeigt.
