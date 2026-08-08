---
title: Worktree-Reaper in agent-lock cmd_reap
ticket_id: T002622
domains: [bachelorprojekt-test, bachelorprojekt-infra]
status: planning
---

# Design: Worktree-Reaper in agent-lock cmd_reap

## Symptom, Ursache, Hypothese

Die Trennung ist hier wichtig, weil die ursprüngliche Ticket-Formulierung Symptom und
Ursachenvermutung vermischte. Beide Ursachen sind belegt, nicht angenommen.

**Symptom (gemessen 2026-08-03).** Acht Verzeichnisse unter `.worktrees/` waren verwaist:
Ticket `done`, Remote-Branch gelöscht, Arbeitsbaum sauber. `cmd_reap` läuft bei jedem
Session-Start *und* als Pre-Claim-Reap bei jedem `claim` — hatte diese acht aber nie angefasst.

**Ursache 1 (belegt).** Schritt 2c filtert Kandidaten mit `git branch --merged main`. Im Repo
liefert dieser Befehl **nur `main`** — keinen der neun lokalen Branches, obwohl acht davon
gemergt waren. Squash-Merge erzeugt einen neuen Commit auf `main`; der Branch-Tip wird nie
Vorfahre von `origin/main`. Die nachgelagerte `upstream-gone`-Prüfung wird deshalb strukturell
nie erreicht.

**Ursache 2 (belegt, minimaler Reproducer).** `git branch -d` bricht mit
`cannot delete branch … used by worktree` ab (Exit 1), solange der Branch in einem Worktree
ausgecheckt ist. Selbst mit korrektem Vorfilter würde 2c am Worktree scheitern — und
`2>/dev/null || true` macht diesen Fehlschlag unsichtbar.

Die beiden Ursachen sind unabhängig: jede allein genügt, damit nichts passiert. Ein Fix nur an
einer der beiden bleibt wirkungslos.

## Architektur

Eine geteilte Kandidaten-Prüfung, zwei Verwerter.

`_reap_candidate_reason <branch>` beantwortet für einen lokalen Branch genau eine Frage: darf er
weg, und wenn nein, warum nicht? Rückgabe ist ein Grund-Text auf stdout (`ok` oder ein
Skip-Grund). Schritt 2c konsumiert sie für Branches **ohne** Worktree, die neue Stufe für die
**mit** — ein Kriteriensatz statt zweier divergierender.

Die Logik lebt in `scripts/agent-lock.sh` selbst, nicht in einem Fragment: das S1-Limit für `.sh`
ist 800 (`docs/code-quality/gates.yaml`, angehoben in T002452), die Datei hat 511 Zeilen. Der
Kommentar in Zeile 483, der noch von 500 spricht, ist veraltet und wird korrigiert.

## Löschkriterien — alle vier, fail-closed

1. **Upstream war konfiguriert und der Remote-Ref ist weg.** Bewusst strenger als heute: 2c
   löscht aktuell auch bei leerem Upstream, also bei nie gepushten Branches. Unter dem
   `--merged`-Vorfilter war das harmlos, ohne ihn wäre es ein Datenverlust-Pfad.
2. **Ticket-Status `done` oder `archived`,** ermittelt über die Ticket-ID im Branchnamen
   (`T[0-9]{6}`). Kein Match im Namen, oder Status nicht ermittelbar → nicht anfassen.
3. **Arbeitsbaum sauber,** falls ein Worktree existiert: `git status --porcelain` leer.
4. **Kein lebender agent-lock-Claim** auf dem Branch (`_branch_is_live_claimed`).

## Sicherheitsnetz und Selbstschutz

Vor jedem `git branch -D` wird der Tip-SHA als lokaler Tag `reaped/<branch>` gesetzt. `-D` statt
`-d` ist unvermeidlich — `-d` kann nach einem Squash-Merge nie greifen, genau das ist Ursache 1.
Der Tag ersetzt die Sicherheit, die `-d` sonst liefert, und spiegelt das Muster, das
`scripts/branch-reaper.sh` für Remote-Branches schon verwendet (dort als Push nach `origin`).

Der Worktree, aus dem `cmd_reap` gerade läuft, ist nie Kandidat. `cmd_reap` läuft auch aus
Worktrees heraus (Pre-Claim-Reap bei jedem `claim`); ohne diesen Guard könnte es sich selbst den
Boden wegziehen.

## Ausgabe-Kontrakt

Pro übersprungenem Kandidat eine Zeile auf stderr im Ton der bestehenden Zeile 458:

```
AGENT-LOCK: Skipping worktree <pfad> — <grund>
AGENT-LOCK: Reaped worktree <pfad> (branch <branch>, tag reaped/<branch>)
```

Kein Output für Branches mit lebendem Upstream — sonst stünden neun Zeilen unter jedem `claim`.
Stummheit ist hier kein Stilmittel: `2>/dev/null || true` ist die zweite Ursache dieses Bugs.

## Kosten

Der Ticket-Roundtrip (DB über `ticket.sh`) läuft erst, wenn Kriterien 1, 3 und 4 grün sind. Im
Normalbetrieb sind das null Kandidaten, also null Roundtrips pro `claim`. Nur an einem
Aufräumtag fallen so viele an, wie es verwaiste Worktrees gibt.

## Kontrakt-Wechsel

Der Kommentarblock ab Zeile 423 (T002242 M2-DOC) schreibt fest, dass `cmd_reap` keine
Worktree-Verzeichnisse entfernt, und verweist für Zombie-Cleanup auf
`scripts/factory/watchdog.sh`. Dieser Kontrakt wird bewusst geändert; der Block wird neu
geschrieben statt gelöscht, damit der Grund für die Umkehr sichtbar bleibt. Ein BATS-Test, der
den alten Kontrakt festschreibt, existiert nicht — die Umstellung bricht keine Tests.

`watchdog.sh` bleibt unverändert zuständig für Factory-Zombie-Worktrees (`sf-*`), die eine
andere Herkunft haben: dort ist die Pipeline abgestürzt, hier ist sie normal fertig geworden.

## Tests

`tests/spec/software-factory/worktree-reap.bats` — eigenes Verzeichnis nach der
T002416-Konvention, Parent-Spec `software-factory`. Gegen ein Wegwerf-Repo mit `ticket.sh`-Stub
über `TICKET_SH`, wie `tests/spec/ci-cd/branch-reaper.bats` es vormacht; kein Cluster nötig.

Der RED-Test baut die heutige Lage nach: squash-gemergter Branch, Worktree, Remote weg. Nach
T002356-M1 trägt jeder Negativtest seinen Positiv-Anker im selben Test — erst belegen, dass ein
*aktiver* Worktree überlebt, dann dass der verwaiste verschwindet. Ohne den Anker wäre „der
aktive Worktree wurde nicht gelöscht" auch dann wahr, wenn die neue Stufe gar nicht existiert.

Geprüft wird Kommando-Output und Resultat (Verzeichnis weg, Branch weg, Tag da, stderr-Zeile
vorhanden), nicht der Quelltext von `agent-lock.sh` — Test-Resultats-Konvention T002448-M4.
