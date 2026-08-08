---
title: "p2-redirect — Zugriffspfade auf die lokale DB umstellen"
ticket_id: T002626
domains: [scripts, infra]
status: active
---

# p2-redirect — Zugriffspfade auf die lokale DB umstellen

Stellt den Default-Kontext aller Ticket-Zugriffe von `fleet` auf den lokalen Cluster um und
korrigiert die Namespace-Umbiegung, die den Umzug sonst sofort unbrauchbar machen wuerde.
Setzt p1 voraus: die Daten muessen lokal liegen, bevor die Pfade dorthin zeigen.

## File Structure

| Datei | Rolle | S1-Budget |
|---|---|---|
| `scripts/ticket.sh` | geaendert — Default-Kontext, Namespace-Ableitung | in `gates.yaml` ignore (990 Zeilen, sanktioniert) |
| `scripts/vda/ticket/_ticket-core.sh` | geaendert — Default-Kontext | `.sh` / 800, Bestand 181, Budget 619 |
| `scripts/factory/lib.sh` | geaendert — `FACTORY_CTX`-Default | `.sh` / 800, Bestand 72, Budget 728 |
| `docs/sdlc-stack/README.md` | geaendert — zwei `provider_config`, Verfuegbarkeit | n/a |

## Aufgaben

### 1. Namespace-Ableitung zuerst korrigieren (D7)

`scripts/ticket.sh` Z. 69–75 biegt bei `CTX == k3d-*` den Namespace von `workspace` auf
`workspace-dev` um. E2 hat den SDLC-Stack nach `workspace` deployt. Bliebe die Regel stehen,
faende `_pgpod` keinen Pod und **jeder** Ticket-Befehl braeche mit „no shared-db pod found" ab.

Die Regel stammt aus der Zeit des alten `workspace-dev`-Stacks auf fleet. Sie wird nicht
erweitert, sondern ersetzt: der Namespace folgt der Marke (`workspace` /
`workspace-korczewski`), und nur der historische fleet-Dev-Kontext behaelt sein
`-dev`-Suffix. Ein Namensmuster des Kontexts ist der falsche Anker fuer die Frage, in welchem
Namespace ein Cluster seine Datenbank betreibt.

Diese Aufgabe steht bewusst **vor** der Default-Umstellung: andernfalls ist der Zwischenstand
ein Repository, in dem kein einziger Ticket-Befehl mehr funktioniert.

### 2. Default-Kontext umstellen

Drei Stellen tragen den Default, alle uebrigen Aufrufer erben ihn:

- `scripts/ticket.sh:23` — `CTX="${TICKET_CTX:-fleet}"`
- `scripts/vda/ticket/_ticket-core.sh:7` — `: "${CTX:=${TICKET_CTX:-fleet}}"`
- `scripts/factory/lib.sh` — `FACTORY_CTX`

`TICKET_CTX` bleibt als Override erhalten: wer die eingefrorene fleet-Historie lesen will,
setzt es weiterhin explizit. Nur der **Default** dreht sich um.

Nicht anzufassen: `scripts/ticket-attach.sh`, `scripts/mishap-categorize.sh`,
`scripts/batch-gap-analysis.sh`, `scripts/vda/ticket/readiness-audit.sh` — sie lesen
`${TICKET_CTX:-fleet}` selbst, erben also den neuen Wert erst, wenn er dort ebenfalls steht.
Pruefen und angleichen; jede uebersehene Stelle zeigt sonst weiter auf die tote Kopie.

`scripts/ticket-mcp/go/` bleibt unveraendert — der Go-Server ruft `scripts/ticket.sh` auf und
erbt den Default, ohne dass sein Code angefasst wird.

### 3. Runbook nachziehen

`docs/sdlc-stack/README.md` bekommt zwei Abschnitte:

- **Zwei `provider_config`-Instanzen** — die lokale steuert die Factory, die fleet-Kopie bedient
  ausschliesslich Coaching. Wer eine aendert, aendert nicht die andere.
- **Verfuegbarkeitserwartung** — Ticket-Operationen setzen ab jetzt einen laufenden lokalen
  Cluster voraus. Das ist die beabsichtigte Konsequenz von ADR-006, kein Defekt.

## Verifikation dieses Partials

```bash
bash scripts/ticket.sh --resolve-ns-only get --id T002626
TICKET_CTX=fleet bash scripts/ticket.sh --resolve-ns-only get --id T002626
bash scripts/ticket.sh get --id T002626
```

Erwartet: der erste Aufruf loest den Namespace des lokalen Stacks auf, der zweite weiterhin den
fleet-Namespace, der dritte liefert das Ticket aus der lokalen Datenbank.
