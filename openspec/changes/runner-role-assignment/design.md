---
title: "runner-role-assignment — Design"
ticket_id: T012488
domains: [ci-cd, github-actions, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: runner-role-assignment

_Ticket: T012488_

## Ausgangslage

Gemessen gegen `origin/main` (2026-08-18, Commit `28cd717ae`):

```bash
# Welche Jobs fordern self-hosted Kapazitaet an?
for f in $(git ls-tree -r --name-only origin/main .github/workflows/); do
  git show origin/main:$f | grep -H --label="$(basename $f)" -n 'runs-on:.*self-hosted'
done
# -> arbitration.yml:41  runs-on: [self-hosted, fleet-gpu]
# -> opencode.yml:28     runs-on: [self-hosted, fleet-gpu]

# Welche Runner sind registriert?
gh api repos/Paddione/Bachelorprojekt/actions/runners \
  --jq '.runners[] | "\(.name) | \(.status) | \([.labels[].name] | join(","))"'
# -> gekko-hetzner-3 | online | self-hosted,Linux,X64,gekko
# -> wsl-gpu-host    | online | self-hosted,Linux,X64,fleet-gpu
```

Zwei Runner, zwei adressierende Jobs — beide auf `fleet-gpu`, also beide auf `wsl-gpu-host`.
`gekko-hetzner-3` wird von keinem Job angefordert.

## D1 — Universeller Guard statt erweiterter Allowlist

Der Guard aus T012446 prüft zehn `ci.yml`-Jobs und vier Hilfsworkflows **namentlich**. Die
naheliegende Reaktion wäre, diese Listen zu pflegen. Das verfehlt den Zweck: die Fehlerklasse
ist ein Job, den niemand in die Liste einträgt, weil es ihn beim Schreiben des Guards noch
nicht gab.

**Entscheidung:** Der neue Guard iteriert über `yq '.jobs | keys'` jeder Workflow-Datei und
prüft jedes gefundene `runs-on`. Die Prüfrichtung kehrt sich damit um — nicht „stehen die
bekannten Jobs richtig?", sondern „fordert irgendein Job unzulässige Kapazität an?".

Der T012446-Guard bleibt **unverändert** bestehen. Er sichert den konkreten Soll-Zustand
benannter Required Checks (Checknamen, Fork-Guards, `fleet-gpu`-Positivanker); der neue Guard
sichert die allgemeine Regel. Beide zusammenzulegen hieße, die Positivanker aufzugeben.

## D2 — Capability-Label statt generischem Pool

Der Kern des Problems steht bereits im Kopfkommentar von `scripts/ci/provision-gh-runner.sh`
(T012414): zwei Runner mit identischen generischen Labels, GitHub verteilt frei, „der Lauf
wird zufallsabhängig". Die dortige Lösung stellt die beiden Hosts gleich aus, damit die
Zufälligkeit folgenlos bleibt.

**Entscheidung:** Die Ursache wird an der Adressierung behoben statt an der Ausstattung. Ein
Job, der lokale Infrastruktur braucht, fordert das Capability-Label an, das diese
Infrastruktur bezeichnet (`fleet-gpu`), nicht den generischen Pool. Damit ist die Zuteilung
durch die Workflow-Definition bestimmt und nicht durch das Runner-Inventar.

`provision-gh-runner.sh` bleibt bestehen und behält seinen Zweck für die Ausstattung des
verbleibenden Runners. Sein Kopfkommentar wird auf den neuen Stand gebracht, weil die
beschriebene Zwei-Runner-Gleichheit dann nicht mehr die Begründung ist.

Die Labelliste braucht eine einzige Fundstelle mit der Begründung je Label. Sie wandert in
die Guard-Datei selbst statt in eine separate Registry: eine zweite Datei wäre eine weitere
Stelle, an der Drift entsteht, und die einzigen Leser der Liste sind der Guard und der Mensch,
der ihn liest.

## D3 — gekko-hetzner-3: deregistrieren

Drei Optionen standen zur Wahl:

| Option | Bewertung |
|---|---|
| **O1** Actions-Runner deregistrieren | Beseitigt den unbeaufsichtigten Auffangpool vollständig. Der Host bleibt als GitLab-Runner-Node (`nodeAffinity: gekko-hetzner-3/4`) und als Cluster-Worker unverändert in Betrieb. |
| **O2** Generische Labels entfernen, Capability-Label `cluster` vergeben | Erhält die Kapazität, aber kein Job fordert `cluster` an. Ein Runner ohne adressierenden Job verstößt gegen das dritte Requirement — die Option verschiebt das Problem, statt es zu lösen. |
| **O3** Belassen | Der Rückfall auf generisches self-hosted bleibt still möglich. Das ist genau der Zustand, den dieses Vorhaben beendet. |

**Entscheidung: O1.** Der Runner nimmt keine Arbeit an, die ein anderer Runner nicht
übernehmen könnte, und seine bloße Existenz ist die Bedingung für den stillen Rückfall.

**Ausführung nur nach ausdrücklicher Freigabe.** Die Deregistrierung ändert die
GitHub-Konfiguration des Repositories und entzieht Kapazität, die ein später hinzukommender
Job brauchen könnte. Sie ist deshalb kein Implementierungsschritt, den der Plan nebenbei
ausführt, sondern ein eigener Task mit Nutzer-Gate. Rückweg: erneute Registrierung über
`config.sh` auf dem Host, gefolgt von `scripts/ci/provision-gh-runner.sh`.

Solange die Freigabe aussteht, bleibt der Guard trotzdem wirksam — er prüft die
**Workflow-Seite**, und die ist unabhängig davon korrekt.

## D4 — Inventur-Abgleich ist ein Skript, kein CI-Gate

Der Abgleich „registrierter Runner ohne adressierenden Job" braucht die GitHub-API und damit
ein Token. In der PR-CI wäre er ein Job, der bei Fork-PRs ohne Secret notwendig scheitert oder
übersprungen wird — beides macht ihn als Gate wertlos.

**Entscheidung:** Der Abgleich wird ein aufrufbares Skript mit klarer Ausgabe, kein
Required Check. Der fail-closed Teil ist der Workflow-seitige BATS-Guard, der ohne Netzzugriff
auskommt.

## Abgrenzung

Nicht Teil dieses Vorhabens:

- Die GitLab-Doppelverifikation umwidmen oder abschalten. Sie berührt das Requirement
  „GitLab-Parallelbetrieb — GitHub bleibt SSOT und Merge-Gate" (`openspec/specs/ci-cd.md`) und
  braucht eine eigene Entscheidung.
- Non-CI-Last auf GitLab-Runner verlagern. Bei öffentlichem Repository entsteht kein
  Kostenvorteil, und der bekannte Setup-Overhead je GitLab-Job spricht dagegen.
