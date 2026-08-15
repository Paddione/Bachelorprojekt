# Proposal: mcp-tool-guide-psql-ticket-ssot

## Why

Der dokumentierte `psql()`-Helper in `.claude/skills/references/mcp-tool-guide.md` §mcp-postgres
adressiert die **fleet**-Postgres-Kopie (`--context fleet`). Die Ticket-SSOT liegt aber auf
**k3d-mentolder-dev**: die fleet-Kopie ist historisch eingefroren (ADR-006 E3, T002785-4).

### Symptom vs. Hypothese (T002448-M5)

**Symptom (belegt, aus T006285):** UPDATE/psql gegen fleet/shared-db für Ticket-IDs aus dem Triage
liefert `UPDATE 0` — die Tickets liegen nicht dort (T005676, T005898, T005591). Gleiche Statements
gegen `k3d-mentolder-dev` → `UPDATE 1`.

**Hypothese:** Die Ticket-SSOT liegt auf der lokalen k3d-DB; der dokumentierte psql()-Helper zeigt
ins Leere, weil die fleet-Kopie eingefroren ist.

### Ursachen-Verifikation (read-only, 2026-08-15, Stand c7b2a2b95)

```bash
# Lokale k3d-DB (k3d-mentolder-dev/workspace/shared-db-97c8495b5)
kubectl --context k3d-mentolder-dev exec pod/shared-db-97c8495b5-wn544 -n workspace -c postgres \
  -- psql -U website -d website -t -c "SELECT count(*) FROM tickets.tickets;
     SELECT external_id FROM tickets.tickets WHERE external_id IN ('T006285','T005676','T005898','T005591');"
# → 2757, alle vier IDs vorhanden
```

```bash
# fleet-Kopie (fleet/workspace/shared-db-86d7d79f7b-lqmfl, gleiche Query)
kubectl --context fleet exec pod/shared-db-86d7d79f7b-lqmfl -n workspace -c postgres \
  -- psql -U website -d website -t -c "SELECT count(*) FROM tickets.tickets;
     SELECT external_id FROM tickets.tickets WHERE external_id IN ('T006285','T005676','T005898','T005591');"
# → 2091, keine der vier IDs
```

Zusatzbefund: `mcp__mcp-postgres__query` (Port 13001 — im Guide als fleet-Forward beschrieben)
liefert 2757 Tickets inkl. aller vier IDs → der Server zeigt auf die **lokale** DB; auch der
Freeze-Hinweis-Text „Port 13001 wird per `kubectl --context fleet port-forward` bedient"
(Zeile 99-100) beschreibt damit eine überholte Realität.

Referenz-Routing im Repo: `scripts/ticket.sh` Zeile 42 — `CTX="${TICKET_CTX:-k3d-mentolder-dev}"`;
Zeile 85: „BEIDER Brands in DERSELBEN lokalen Datenbank". Das CLI-BRAND-Routing ist korrekt,
nur der Guide-Helper driftet.

### Prior-Art (T002829)

Die Entscheidung ist bereits getroffen und darf nicht still umgekehrt werden:

- **ADR-006** (`docs/adr/ADR-006-sdlc-isolation-dev-host.md`, Accepted): SDLC-Daten
  (`tickets.*`) ziehen auf den Dev-Host; Zielverteilung: „Daten: `tickets.*` (primär)" → Dev-Host.
- **Archivierter Change `2026-08-10-e3-sdlc-tickets-lokal`**: Tickets-SSOT lokal, fleet-Kopie
  eingefroren (Freeze nach T002722), Restore/Backup-Linie beschrieben.
- **Guide-interner Hinweis T002785-4** (Zeile 99-106) dokumentiert den Freeze bereits — widerspricht
  aber dem Helper direkt darunter.

Korrigiert wird der **Guide**, nicht die Entscheidung.

## What

### Optionen

1. **Helper auf k3d-mentolder-dev zeigen + BRAND/Freeze-Routing explizit dokumentieren
   (gewählt).** Der Helper ist der dokumentierte Pflichtweg für Ticket-Writes; er muss auf die
   SSOT zeigen. Die Freeze-Notiz wird um das konkrete Routing ergänzt (Ticket-DB lokal, beide
   Brands in derselben DB; prod-Business-Daten weiterhin fleet + Prod-Write-Guard). Der
   Timeout-Hinweis T002261 (WireGuard) wird auf fleet-Writes gegen prod-Daten präzisiert.
2. **Nur BRAND-Routing dokumentieren, Helper lässt fleet.** Verworfen: Der Helper bliebe eine
   Fußangel — jeder Leser, der ihn ausführt, schreibt ins Leere (genau der Mishap aus T006285).
3. **Helper generisch über ticket.sh-Wrapper.** Verworfen: Overkill für ein triviales
   Doku-Ticket; der Helper ist für beliebige SQL gedacht, nicht nur Ticket-CLI-Operationen.

### Entscheidung

Option 1. Die Doku in `.claude/skills/references/mcp-tool-guide.md` §mcp-postgres wird so
korrigiert, dass der psql()-Helper die lokale Ticket-SSOT adressiert und das Brand-Routing
explizit beschrieben ist; RED-Guard in `tests/spec/mcp-skill-integration/` sichert den
Fix dauerhaft ab.

_Ticket: T006285_
