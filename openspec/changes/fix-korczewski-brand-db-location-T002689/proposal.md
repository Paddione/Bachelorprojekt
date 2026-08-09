# Proposal: fix-korczewski-brand-db-location-T002689

## Why

Jeder SDLC-CLI-Aufruf für die korczewski-Brand bricht ab. Reproduziert am 2026-08-09
im Worktree, beide Aufrufe rc≠0:

```
$ bash scripts/ticket.sh factory-control get --key killswitch --brand korczewski
ERROR: no shared-db pod found in namespace workspace-korczewski (context k3d-mentolder-dev)   # rc=1
$ bash scripts/ticket.sh list --brand korczewski
ERROR: no shared-db pod found in namespace workspace-korczewski (context k3d-mentolder-dev)   # rc=1
$ bash scripts/ticket.sh list --brand mentolder                                               # rc=0
```

### Symptom, Hypothese und belegte Ursache

Die Ticket-Beschreibung führt Symptom und Ursachen-Annahme in einem Satz. Getrennt:

- **Symptom (Fakt, reproduzierbar):** `--brand korczewski` scheitert am Pod-Lookup;
  der killswitch-Guard schlägt deshalb fail-closed an und blockiert Queue,
  Auto-Enqueue und Auto-Chore-Plan der Brand.
- **Hypothese der Meldung (widerlegt):** „In `workspace-korczewski` läuft kein
  `shared-db`-Pod, weil der Namespace bewusst auf 0/0 skaliert ist — der Guard
  müsste *bewusst inaktiv* von *kaputt* unterscheiden."
- **Belegte Ursache:** `brand` ist eine **Spalte**, kein **Ort**. Die SDLC-Daten
  beider Brands liegen seit E3/T002626 in **derselben** lokalen Datenbank:

  ```
  tickets.tickets:  korczewski|36  ·  mentolder|2138     ← eine DB, beide Brands
  kubectl --context k3d-mentolder-dev get ns → default, kube-*, workspace
                                              (kein workspace-korczewski, kein workspace-dev)
  ```

Die Hypothese trägt nicht: Auch ein laufender `shared-db`-Pod in
`workspace-korczewski` enthielte die 36 gesuchten Zeilen nicht — sie liegen in
`workspace`. Der Code bildet `brand` aber unbedingt auf einen Namespace ab und
sucht dort einen Pod. Das ist ein Überbleibsel der Zwei-Cluster-Zeit, in der jede
Brand ihre eigene DB hatte; seit der SDLC-Datenhoheit lokal liegt, ist es falsch.
Eine **Datendimension wird als Infrastrukturdimension** behandelt.

`TICKET_NS=workspace` ist kein Ausweg: die `case "$BRAND"`-Zuweisung überschreibt
den Wert bedingungslos. Es gibt derzeit **keinen** Weg, korczewski-Zeilen über die
CLI zu lesen.

### Zwei Befunde, die über das gemeldete Symptom hinausgehen

**1. `conflict-check.sh` ist für *beide* Brands kaputt, auch den Default.** Es hält
eine eigene Kopie der Abbildung *und* eine eigene Kontext-Suffix-Regel, der die
k3d-Ausnahme aus T002626 fehlt:

```
$ BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/conflict-check.sh
resolved: ctx=k3d-mentolder-dev ns=workspace-dev        ← Namespace existiert nicht
$ BRAND=mentolder bash scripts/factory/conflict-check.sh T002689
{"error":"no shared-db pod found"}                      # rc=2
```

Das Conflict-Gate ist damit auf dem Default-Brand wirkungslos — bisher unbemerkt.

**2. Die Fail-Open-Stelle liegt woanders als vermutet.** Die Voranalyse verortete
sie in `ticket.sh list` (rc=0 trotz Fehler). Das reproduziert **nicht** — `list`
endet fail-closed mit rc=1. Fail-open ist stattdessen die Backlog-Zählung in
`scripts/factory/wakeup.sh:292-293`:

```
$ BL_K=$(BRAND=korczewski bash scripts/factory/queue.sh 2>/dev/null | jq 'length' 2>/dev/null || echo 0)
$ echo "BL_K=$BL_K"
BL_K=            ← queue.sh endet rc=2 mit {"error":"no shared-db pod found"};
                   der Ausfall erscheint als leerer/nuller Backlog
```

Genau diese Klasse legte laut Kommentar in `factory/lib.sh` am 2026-07-28 die Brand
still lahm. Der Fehler wird zu „nichts zu tun" umgedeutet.

## What

`brand` wird als **Zeilenfilter** behandelt. Die Abbildung brand→Namespace wird auf
dem **SDLC-Datenpfad** entfernt; alle Brands lösen auf den Namespace des
SDLC-Stacks auf, und `brand` wirkt ausschließlich als `WHERE brand = …`.

Betroffen sind vier Kopien der Fehlabbildung (alle auf dem Datenpfad):

| Datei | Stelle |
|---|---|
| `scripts/ticket.sh` | `case "$BRAND"` + Kontext-Suffix-Regel |
| `scripts/factory/lib.sh` | `factory_resolve` |
| `scripts/factory/conflict-check.sh` | eigene Kopie + eigene, veraltete Suffix-Regel |
| `scripts/vda/ticket/readiness-audit.sh` | eigene Kopie |

Dazu: die Fail-Open-Backlog-Zählung in `wakeup.sh` wird fail-closed, und die
Pod-Fehlermeldung nennt Kontext, Namespace und den Override-Hebel.

### Der Workload-Pfad bleibt unangetastet

Geprüft wurde die naheliegende Sorge, `factory_resolve` müsse in einen
Workload-Resolver (kubectl auf Brand-Workloads) und einen Daten-Resolver (SDLC-DB)
gespalten werden. Das ist **nicht** nötig: Jeder Konsument von `FACTORY_NS` /
`FACTORY_CTX` ist ein `kubectl exec … -c postgres -- psql`-Aufruf, also reiner
Datenpfad — `reconcile-ticket-status.sh`, `schedule.sh`, `slots.sh`, `metrics.sh`,
`reap-provider-slots.sh`, `llm-stack-measure.sh`. Es gibt keinen Workload-Konsumenten.
`factory_resolve` **ist** bereits der Daten-Resolver; er trägt nur einen zu
allgemeinen Namen. Die Naht wird durch Umbenennung und einen Kommentar sichtbar
gemacht, nicht durch eine Aufspaltung ohne zweiten Fall.

Die echten Workload-Abbildungen (`scripts/lib/promote-phases.sh`,
`prod-fleet/*`, `WORKSPACE_NAMESPACE`) bleiben unberührt — dort ist brand→Namespace
korrekt, weil die Brands tatsächlich getrennte Workloads in getrennten Namespaces
betreiben.

## Non-Goals

- **Kein Hochskalieren** von `workspace-korczewski` und **kein Entsuspendieren**
  von Flux. Die Dormanz ist gewollt und nach dem Fix ohne Bedeutung für den
  SDLC-Pfad.
- **Keine Dormanz-Registry** („bewusst inaktiv" vs. „kaputt"). Sie hätte nach dem
  Fix keinen Gegenstand mehr: es wird kein brand-spezifischer Namespace mehr
  abgefragt.
- **Keine Änderung an Workload-Pfaden** (Deploy, Promote, Ingress, Overlays).
- **Keine Datenmigration.** Die Zeilen liegen bereits richtig.

_Ticket: T002689_
