---
title: Workflows mit push.paths müssen sich selbst listen
ticket_id: T002868
domains: [ci, infra]
status: active
---

# Workflows mit push.paths müssen sich selbst listen

## Purpose

Ein Workflow mit `push.paths`, der seine eigene Datei nicht in dieser Liste führt, läuft nach
einer Änderung an sich selbst nicht an. Der Fix liegt dann auf `main`, wirkt aber nicht — und
zwar ohne Fehlermeldung, weil schlicht kein Lauf stattfindet. Genau das ist bei T002837
eingetreten und zuvor schon einmal bei T002156.

## Symptom vs. Ursache

**Beobachtetes Symptom (Fakt):** Der Merge-Commit `f813fec4b6b7a01f2a1828747ceee48e4f5ecf99`
(PR #3943, T002837) löste acht Workflow-Runs aus. „Render Fleet Artifact" war nicht darunter,
obwohl der Commit ausschließlich dessen Workflow-Datei, einen Test und Plan-Artefakte änderte.

**Ursache:** Die `push.paths`-Liste von `render-fleet-artifact.yml` führt die Render-Logik
(`scripts/flux-render-artifact.sh`, `scripts/resolve-image-digest.sh`,
`scripts/website-config-sha.sh`, `Taskfile.yml`) sowie alle Manifest-Verzeichnisse — aber nicht
`.github/workflows/render-fleet-artifact.yml` selbst.

**Das ist eine Wiederholung.** Der Kommentar unmittelbar über diesen Zeilen stammt aus T002157:

> T002157: die Render-Logik selbst gehoert in die Trigger-Pfade. Ohne sie aendert ein Fix am
> Renderer das Artefakt NICHT — es bleibt stale, bis zufaellig ein Manifest angefasst wird, und
> Flux rollt weiter den alten Stand aus. Genau so blieb der T002156-Fix nach dem Merge wirkungslos.

T002157 hat die *Skripte* aufgenommen, die *Workflow-Datei selbst* aber nicht. Die Lehre wurde
also nur zur Hälfte umgesetzt, und derselbe Ausfall trat ein zweites Mal ein.

## Bestandsaufnahme

Von elf Workflows mit `push.paths` führen sich sieben bereits selbst auf. Es handelt sich also
um eine gelebte Konvention mit vier Abweichungen:

| Workflow | listet sich selbst | Fehlermodus bei Abweichung |
|---|---|---|
| `build-collabora`, `build-mediaviewer-widget`, `build-mentolder-web`, `build-sdlc-console`, `build-transcriber`, `build-videovault`, `build-website` | ja | — |
| `render-fleet-artifact` | **nein** | Renderer-Fix erzeugt kein neues Artefakt; Flux rollt den alten Stand weiter aus |
| `build-brett` | **nein** | Workflow-Fix baut kein neues Image — exakt der Fall von `555cda1ff` (Token-Wechsel) |
| `build-docs` | **nein** | wie `build-brett` |
| `brain-merge-hook` | **nein** | Hook-Änderung (etwa eine neue Quelle) wirkt erst beim nächsten Content-Commit |

Die Dringlichkeit ist nicht überall gleich. Bei den drei artefakt-erzeugenden Workflows ist die
Selbst-Listung zwingend: ihr Produkt (OCI-Artefakt, Container-Image) entsteht nur im Lauf, und
ohne Lauf bleibt es auf dem alten Stand. Bei `brain-merge-hook` ist der Nutzen schwächer — er
verarbeitet Fremdinhalte, und ein zusätzlicher Lauf bei Hook-Änderungen ist eher Konsistenz als
Notwendigkeit. Er wird trotzdem aufgenommen: eine Regel mit einer nicht begründeten Ausnahme
lädt zur nächsten Ausnahme ein, und ein zusätzlicher Ingest-Lauf ist folgenlos.

## Entscheidung

Alle vier Workflows nehmen ihre eigene Datei in `push.paths` auf. Ein BATS-Guard hält die
Konvention fest, damit ein künftig hinzugefügter Workflow nicht erneut daran vorbeiläuft.

Verworfene Alternative: nur `render-fleet-artifact` reparieren und den Guard trotzdem über alle
Workflows spannen. Das hinterließe eine rote CI, bis drei Folgeänderungen erledigt sind — ein
Zustand, der erfahrungsgemäß normalisiert statt behoben wird. Ebenfalls verworfen: Guard nur für
den Renderer. Er ließe drei bekannte Lücken unerfasst und ohne Spur.

## Änderung

Je eine Zeile in vier Dateien, jeweils in den bestehenden `push.paths`-Block:

```yaml
      - '.github/workflows/<dateiname>.yml'
```

## Guard

`tests/spec/ci-cd/workflow-self-trigger.bats`, offline:

1. **Positiv-Anker:** Es gibt überhaupt Workflows mit einem `push.paths`-Block. Ohne diesen Anker
   wäre die Aussage bei leerer Kandidatenmenge vakuos erfüllt (T002356-M1).
2. **Eigentliche Aussage:** Jeder Workflow mit `push.paths` führt seinen eigenen Dateinamen in
   dieser Liste. Die Fehlermeldung nennt die abweichenden Dateien namentlich, damit der Befund
   ohne Nachforschung handhabbar ist.

Der Guard inspiziert Workflow-Quelltext — die in der Test-Resultats-Konvention (T002448-M4)
benannte Ausnahme für CI-Konfiguration. Ein Laufzeit-Output existiert außerhalb von GitHub
Actions nicht.

## Restrisiko

Der Guard erzwingt die Regel ausnahmslos. Sollte künftig ein Workflow entstehen, für den
Selbst-Listung sachlich falsch ist, wird er rot und muss um eine begründete Ausnahmeliste
erweitert werden. Das ist beabsichtigt: eine sichtbare, zu begründende Ausnahme ist einer
stillen Lücke vorzuziehen.

## Nicht im Scope

- Warum Flux das fertige Artefakt nicht pollt (eigenständig als T002869 erfasst).
- Die Trigger-Pfade inhaltlich darüber hinaus zu überarbeiten, etwa fehlende Abhängigkeiten wie
  Dockerfiles oder Hilfsskripte. Hier geht es allein um die Selbst-Referenz.
