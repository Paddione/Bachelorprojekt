# Proposal: ticket-list-test-data-filter

## Why

`scripts/vda/ticket/list.sh` baut sein WHERE als `brand = :'brand'` und ergänzt nur
`status`, `type`, `attention_mode` und `missing_id`. Ein Filter auf `is_test_data` fehlt.
Das gilt damit auch für `mcp__ticket-mcp__list_tickets` — `list.go` ist nur ein Wrapper um
`ticket.sh list`. Jede Listen- und Triage-Sicht zeigt E2E-Testdaten als echte offene Vorgänge.

Bemerkenswert ist, wo der Filter **existiert**: die Triage-Query in
`.claude/skills/references/ticket-ops-procedures.md` filtert korrekt mit
`AND is_test_data = false` — sie läuft aber gegen `mcp-postgres`. Wer den für Ticket-Reads
**vorgeschriebenen** Weg über `ticket-mcp` nimmt, bekommt die Testdaten wieder. Der Filter
liegt also genau auf dem Pfad, der dafür nicht vorgesehen ist.

### Symptom und Hypothese getrennt (T002448-M5)

Die Ticketbeschreibung enthält einen Satz, der einer Prüfung **nicht** standhält und hier
richtiggestellt wird: „T002762 steht dabei auf backlog — der Status, aus dem
`scripts/factory/queue.sh` dispatcht." Das legt eine Dispatch-Gefahr nahe, die es nicht gibt.
Die Feature-Lane in `queue.sh` verlangt zusätzlich
`COALESCE((readiness->>'lastenheft_locked')::boolean,false) = true`, und T002762 trägt
`lastenheft_locked=false`. Durch Ausführen gemessen:

```
BRAND=mentolder bash scripts/factory/queue.sh   →   ['T002785','T002714']
```

T002762 steht **nicht** in der Queue. Der Schaden ist auf die Listen- und Triage-Sicht
begrenzt — genau das, was der Ticket-Titel sagt. Bestätigt bleibt dagegen der eigentliche
Befund: `list.sh` hat keinen `is_test_data`-Filter, und beide Testdaten-Zeilen erscheinen.

### Warum der Fixture-Purge mit im Umfang liegt

Beim Schreiben des RED-Tests kam die **Ursache** der liegengebliebenen Testdaten heraus.
`purge_factory_test_data` in `tests/lib/factory-test-fixtures.sh` bildet `k3d-*`-Kontexte auf
den Namespace `workspace-dev` ab. Diesen Namespace gibt es im Dev-Cluster nicht:

```
kubectl --context k3d-mentolder-dev get ns   →   default, kube-*, workspace
kubectl get pod -n workspace      --context k3d-mentolder-dev …  →  shared-db-97c8495b5-w4f6t
kubectl get pod -n workspace-dev  --context k3d-mentolder-dev …  →  (leer)
```

Der Purge findet nie einen Pod, gibt `return 1` zurück, und der übliche
`purge_factory_test_data … || true`-Aufruf im `teardown` verschluckt das. Der teardown hat
auf diesem Cluster **nie** funktioniert; T002761 und T002762 sind dessen planmäßige Folge,
kein Einzelfall.

Das gehört hier hinein und nicht in ein eigenes Ticket, weil der Test dieses Fixes seine
eigene Fixture sät und abräumen muss. Ohne funktionierenden Purge leakt er bei jedem Lauf
eine weitere Zeile — er würde also genau das Problem vergrößern, das er absichert. Der Fix
ist Vorbedingung des Deliverables, nicht Umfangszuwachs.

## What

**`is_test_data = false` als Default in `scripts/vda/ticket/list.sh`**, mit
`--include-test-data` als Opt-out. Das Muster ist im Repo bereits entschieden:
`listInboxItems` in `website/src/lib/messaging-db.ts` filtert per Default und bietet
`includeTest`; die Tests dort prüfen beide Richtungen. Dieser Change folgt derselben Form,
statt eine neue zu erfinden.

Kein `COALESCE` nötig — empirisch geprüft statt angenommen: die Spalte ist
`boolean NOT NULL DEFAULT false`, und von 2112 Zeilen tragen 0 einen NULL-Wert. Ein
schlichtes `= false` verliert also keine Zeile.

**Nur `list.sh`.** `triage.sh` arbeitet auf einer einzelnen `external_id` und mutiert — ein
Filter wäre dort falsch, weil ein gezielt adressiertes Testticket auffindbar bleiben muss.
`get.sh` ebenso. `readiness-audit.sh` ist zwar ein mehrzeiliger Read-only-Audit und damit
dieselbe Klasse, bleibt aber bewusst außen vor: zwei Testzeilen unter 2112 stören dort nicht,
und der Befund nennt ihn nicht.

**Namespace-Mapping in `tests/lib/factory-test-fixtures.sh` korrigieren**, sodass der
teardown-Purge den Pod tatsächlich findet — plus das Abräumen der beiden liegengebliebenen
Zeilen T002761 und T002762.

_Ticket: T002781_
