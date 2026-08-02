# Proposal: openspec-archive-backlog

## Why

`openspec/changes/` ist die Menge der **aktiven** Vorhaben. `scripts/plan-context.sh` liest genau
dieses Verzeichnis, und CLAUDE.md schreibt vor, dessen Ausgabe vor jedem Agent-Dispatch in den
Prompt zu injizieren. Am 2026-08-02 lagen dort 181 unarchivierte Change-Verzeichnisse — der Feed
ist damit für Multi-Agent-Dispatches praktisch nicht mehr injizierbar, und die Direktive wurde in
mehreren Läufen bewusst übergangen.

Es handelt sich nicht um offene Arbeit, sondern um einen **Vollzugsrückstau**: die Vorgänge sind
erledigt, nur der Archivierungsschritt wurde nie ausgeführt. Zweitwirkung: die SSOT-Specs unter
`openspec/specs/` laufen der Realität hinterher, weil das Delta erst beim Archivieren gemerged
wird.

### Messung (erhoben 2026-08-02 im Worktree)

Messmethode, reproduzierbar:

```bash
# 1. Alle unarchivierten Changes mit .ticket-Link auflisten
for d in openspec/changes/*/; do
  [ -f "$d/.ticket" ] || continue
  printf '%s\t%s\n' "$(basename "$d")" "$(tr -d '[:space:]' < "$d/.ticket")"
done > links.tsv

# 2. Ticket-Status gebündelt aus der shared-db lesen (ein Roundtrip statt 140)
POD=$(kubectl get pods -n workspace --context fleet -l app=shared-db \
      --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
IDS=$(cut -f2 links.tsv | sort -u | sed "s/^/'/;s/$/'/" | paste -sd,)
kubectl exec -i "$POD" -n workspace --context fleet -c postgres -- \
  psql -U website -d website -qtA \
  -c "SELECT external_id,status FROM tickets.tickets WHERE external_id IN ($IDS);"
```

Ergebnis:

| Größe | Wert |
|---|---|
| Unarchivierte Change-Verzeichnisse gesamt | 181 |
| davon mit `.ticket`-Link | 140 |
| davon Ticket-Status `done` | 128 |
| davon Ticket-Status `archived` | 10 |
| davon Ticket-Status `planning` (dieser Change selbst) | 1 |
| **maschinell belegbar archivierbar** | **139** |
| ohne `.ticket`-Link (Abschluss maschinell nicht bestimmbar) | 41 |

Die Zahl 139 liegt über der im Ticket genannten Schätzung von 134, weil seit der Erstaufnahme
weitere Vorgänge gemergt wurden und weil `archived` als Abschlussstatus mitgezählt wird.

## What

**Im Scope:** die 139 Changes, deren verknüpftes Ticket `done` oder `archived` ist, werden in
sieben eingefrorenen Chargen à 20 (die letzte 19) über je einen eigenen PR mit grüner CI nach
`openspec/changes/archive/` überführt; ihr Delta wird dabei in die SSOT gemerged.

**Nicht im Scope:** die 41 Changes ohne `.ticket`-Link. Ihr Abschlussstatus ist maschinell nicht
bestimmbar; ein Rateschritt gehört nicht in diesen Vorgang. Sie werden gezählt und in einem
Folgeticket erfasst (ersetzt AC3 des Tickets, Entscheidung Patrick 2026-08-02).

### Entscheidung 1 — `openspec.sh archive` muss `archived` als Abschlussstatus akzeptieren

`cmd_archive` in `scripts/openspec.sh` verlangt heute wörtlich `[[ "$st" == "done" ]]` und bricht
sonst mit `archive refused: ticket status is '…', expected 'done'` ab. Zehn der 139 Changes hängen
an einem Ticket im Status `archived` — einem *späteren* Lifecycle-Zustand als `done`, nicht einem
früheren. Diese zehn verteilen sich über die Chargen 1, 2, 3, 5 und 6; schon Charge 1 enthält
einen. Der Guard muss also **vor** Charge 1 erweitert werden.

Verworfene Alternative: `TICKET_OFFLINE=1` setzen. Das schaltet die Statusprüfung komplett ab und
würde auch ein Change mit offenem Ticket durchlassen — genau die Sicherung, die diesen Vorgang
vor Fehlarchivierungen schützt.

### Entscheidung 2 — `--create-new` wird pro Change vorab festgelegt, nicht zur Laufzeit geraten

67 der 139 Changes zielen auf eine SSOT-Spec, die unter `openspec/specs/` noch nicht existiert;
der Großteil davon sind Mishap-Bundles, für die `plan-archive-steps.md` `--create-new` bereits als
Regelweg dokumentiert. Ob das Flag gesetzt wird, steht deshalb pro Zeile im eingefrorenen
Manifest (`manifest.tsv`, Spalte `archive_flag`) und wird nicht während der Ausführung neu
entschieden.

Ein Sonderfall ist festgehalten: `website-db-split` und `t002150-website-db-split-stage-2` zielen
beide auf dieselbe fehlende SSOT `website-db-split.md`. Nur der erste trägt `--create-new`, der
zweite merged in die dann existierende Datei. Beide liegen deshalb in derselben Charge (7) und in
genau dieser Reihenfolge.

### Entscheidung 3 — der Chargen-Zuschnitt wird schriftlich eingefroren

Die Zuordnung Change → Charge steht in `openspec/changes/openspec-archive-backlog/manifest.tsv`
und wird zur Ausführungszeit gelesen, nicht neu berechnet. Grund: `openspec/changes/` verändert
sich während der Laufzeit dieses Vorgangs, weil jede gemergte Fremdarbeit neue Changes anlegt.
Eine zur Laufzeit neu berechnete Liste würde in Charge 5 andere Verzeichnisse erfassen als in
Charge 1 geplant, und der Vorgang wäre nicht nachvollziehbar abschließbar.

### Entscheidung 4 — Umgang mit einem Guard-Reißer

Der Scenario-Ratchet (`task openspec:validate`, `tests/spec/openspec-workflow.bats` #32) fällt
jede SSOT-Spec, deren Requirements keinen `#### Scenario:`-Block tragen. Weil `archive` das Delta
unverändert in die SSOT merged, fällt eine solche Lücke erst **beim Archivieren** auf — genau so
entstand T002567 mit dreimal rotem `main`. Der Ablauf pro Charge behandelt das als erwarteten
Normalfall statt als Ausnahme: nach dem Archivieren und **vor** dem Commit validieren, bei Bruch
den einzelnen Verursacher per `git checkout` zurückrollen und in die Nachzügler-Liste schieben,
den Rest der Charge unverändert ausliefern. Vollständiger Ablauf im Plan, Task 4.

_Ticket: T002569_
