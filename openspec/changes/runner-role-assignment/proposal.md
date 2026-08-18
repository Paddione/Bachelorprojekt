# Proposal: runner-role-assignment

## Why

Die Runner-Platzierung der PR-CI ist innerhalb weniger Tage zweimal umgekehrt worden.
T012414 routete die portablen Gates auf den generischen self-hosted Pool; T012446
(PR #4785) holte sie vollständig auf `ubuntu-latest` zurück. Beide Änderungen waren für
sich begründet und beide gingen grün durch. Was fehlt, ist eine festgeschriebene Regel,
gegen die eine dritte Umkehrung prüfbar wäre.

Der vorhandene Guard aus T012446 (`tests/spec/ci-cd/hybrid-runner-placement.bats`) schützt
den erreichten Zustand, aber nur als **Allowlist benannter Jobs**: er zählt zehn `ci.yml`-Jobs
und vier Hilfsworkflows namentlich auf und prüft deren `runs-on`. Ein **neu hinzugefügter**
Job, der auf `[self-hosted, linux, x64]` gesetzt wird, steht in keiner dieser Listen und
passiert den Guard unbemerkt. Genau so ist der Zustand entstanden, den T012446 rückgängig
machen musste.

Der Ist-Stand macht die Lücke konkret. Gemessen gegen `origin/main`:

- Genau zwei self-hosted Runner sind registriert: `wsl-gpu-host`
  (`self-hosted,Linux,X64,fleet-gpu`) und `gekko-hetzner-3` (`self-hosted,Linux,X64,gekko`).
- Nur zwei Jobs adressieren self-hosted Kapazität — `arbitration.yml:41` und
  `opencode.yml:28` — und beide über `[self-hosted, fleet-gpu]`.
- Damit adressiert **kein** Workflow den Runner `gekko-hetzner-3`. Sobald die vor PR #4785
  gebranchten PRs abgearbeitet sind, läuft er leer. Er trägt aber weiterhin die generischen
  Labels `self-hosted, Linux, X64` und nimmt deshalb jeden Job an, der versehentlich auf den
  generischen Pool gesetzt wird — unbeaufsichtigt und ohne dass ein Gate anschlägt.

Ein leerlaufender Runner mit generischen Labels ist die Bedingung dafür, dass der Rückfall
still gelingt. Solange er existiert, ist „aus Versehen self-hosted" kein Fehler, der auffällt,
sondern ein Zustand, der einfach funktioniert.

Das Kostenargument trägt in die andere Richtung nicht: Das Repository ist öffentlich,
GitHub-hosted Standard-Runner sind damit unbegrenzt verfügbar. Eigene Hardware ist nur dort
begründet, wo ein Job auf lokale Infrastruktur zugreift.

## What

- Ein Requirement in `openspec/specs/ci-cd.md` schreibt die Zuordnungsregel fest: jeder
  portable Job läuft GitHub-hosted; self-hosted Kapazität ist ausschließlich Jobs mit
  belegter lokaler Abhängigkeit vorbehalten (GPU, Cluster-Zugriff, private Dienste), und
  diese adressieren sie über ein **Capability-Label** statt über den generischen Pool.
- Ein Requirement verbietet die generische Adressierung explizit: kein Job darf self-hosted
  Kapazität allein über `self-hosted`/`linux`/`x64` anfordern.
- Ein neuer BATS-Guard prüft die Regel **universell statt namentlich**: er iteriert über
  jeden Job jeder Workflow-Datei, statt eine Liste bekannter Jobs abzuhaken. Damit erfasst er
  auch künftig hinzugefügte Jobs — die Lücke, die der T012446-Guard konstruktionsbedingt hat.
- Die zulässigen Capability-Labels stehen an einer einzigen Stelle, zusammen mit der
  Begründung, welche lokale Abhängigkeit sie bezeichnen. Ein neues Label ohne Begründung
  schlägt fehl.
- Der Runner `gekko-hetzner-3` verliert seine Rolle als unbeaufsichtigter Auffangpool. Die
  Entscheidung — Deregistrierung des Actions-Runners gegenüber Zuweisung einer belegten
  Aufgabe — wird in `design.md` getroffen und dokumentiert; die Ausführung an der
  GitHub-Registrierung erfolgt erst nach ausdrücklicher Freigabe.
- Der bestehende Guard aus T012446 bleibt unverändert bestehen. Er prüft den konkreten
  Soll-Zustand benannter Jobs, der neue Guard die allgemeine Regel; beide adressieren
  verschiedene Fehlerklassen.

Nicht im Scope: die GitLab-Doppelverifikation umwidmen oder abschalten (eigenes Vorhaben,
berührt das Requirement „GitLab-Parallelbetrieb"), und die Verlagerung von Non-CI-Last auf
GitLab-Runner (ohne Kostenvorteil bei öffentlichem Repository).

_Ticket: T012488_
