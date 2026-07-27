# Proposal: mcp-postgres-brand-scope

## Why

Der MCP-Server `mcp-postgres` (`localhost:13001`) ist über `DATABASE_URL` fest an
`shared-db.workspace` — die **mentolder**-Datenbank — gebunden. `external_id`-Werte sind
aber nur **pro Brand** eindeutig: `T000254` existiert in beiden Brand-Datenbanken als
völlig unterschiedliches Ticket.

Eine Abfrage nach einer korczewski-Ticket-ID liefert deshalb **still das gleichnamige
mentolder-Ticket** statt einer leeren Menge oder eines Fehlers. Belegt am Vorfall vom
2026-07-27: beim Planen von korczewski-`T000254` (Wordmark-Bug) lieferte
`SELECT description … WHERE external_id='T000254'` die Beschreibung eines archivierten
mentolder-pnpm-Tickets. Ohne Titel-Abgleich wäre ein Implementierungsplan für den
falschen Bug entstanden.

Der Fehler ist besonders tückisch, weil das **korrekt** brand-gefilterte Query
(`AND brand='korczewski'`) eine leere Menge liefert und damit nahelegt, der Filter sei
falsch — statt dass es die falsche Datenbank ist.

Verschärfend: `CLAUDE.md` verkauft `mcp-postgres` in der Agent-Routing-Tabelle
ausdrücklich als den Weg für „Ticket-Queries", und der `mcp-tool-guide` empfiehlt ihn für
Reads gegen `tickets.*` — beides ohne die Brand-Bindung zu erwähnen. Die Fehlleitung ist
also dokumentiert statt gewarnt.

## What

**Gewählte Richtung: Routing + maschinenlesbare Deklaration + CI-Guard.** Keine neue
Brand-Mechanik in `mcp-postgres`, kein zweiter Server.

Begründung gegen die beiden größeren Alternativen aus dem Ticket:

- **Zweiter Server `mcp-postgres-korczewski` (Richtung 1)** löst den *stillen* Fehlgriff
  nicht. Wer nicht weiß, dass Brand relevant ist, wählt weiterhin `:13001` und bekommt
  weiterhin still die falsche Zeile — die Lösung verschiebt das Problem auf eine
  Auswahlentscheidung, die genau der Aufrufer treffen müsste, der den Kontext nicht hat.
  Sie kostet zudem einen weiteren Container im MCP-Monolithen, einen Service-Port, eine
  zusätzliche Port-forward-Zeile in `scripts/mcp-gateway/mcp-gateway.service` und
  `Taskfile.agents.yml`, einen Registry-Client mit `mcp-sync render` über drei
  Harness-Configs — und ein `kubectl apply -k k3d/default`, das von **keiner** Overlay-
  oder Flux-Kustomization getragen wird und daher dauerhaft driftgefährdet bleibt.
  Sequenzierung spricht zusätzlich dagegen: T002321 diagnostiziert gerade einen
  OOM/Leak in genau diesem `postgres`-Container; ihn vor der Diagnose zu duplizieren,
  verdoppelt die Fehlerquelle.
- **Brand-Parameter am `query`-Tool (Richtung 2)** erfordert einen Fork von
  `@modelcontextprotocol/server-postgres` bzw. einen Eigenbau-Server. Unverhältnismäßig
  für einen Read-Pfad, dessen Hauptnutzung ein bereits korrektes Alternativwerkzeug hat.

Denn: `ticket-mcp` ist **bereits** brand-parametrisiert (`brand`-Argument) und liefert
`description` und `resolution` vollständig. Der Anwendungsfall, in dem der Bug feuerte —
Ticket-Detail-Read während der Planung — ist damit schon heute korrekt bedienbar. Der
Fix muss diesen Weg zum vorgeschriebenen machen, statt einen zweiten Weg zum selben Ziel
zu bauen.

Reine Prosa wäre allerdings zu schwach für einen major-Bug, deshalb drei Teile:

1. **Routing-Regel.** `mcp-tool-guide.md` §`mcp-postgres` bekommt die Brand-Bindung als
   Warnung, und Ticket-Reads werden explizit auf `ticket-mcp` mit gesetztem `brand`
   umgeroutet. Der `kubectl exec`-Weg gegen `workspace-korczewski` wird als sanktionierter
   Pfad für nicht-Ticket-SQL gegen die korczewski-DB dokumentiert.
   Die aktive Fehlleitung in `CLAUDE.md` („`mcp-postgres` — Ticket-Queries") wird korrigiert.
2. **Maschinenlesbare Deklaration.** `docs/agent-guide/registry/mcp.yaml` deklariert unter
   `clients.mcp-postgres` die Brand-Bindung (`brand`, `database`, `scope_warning`,
   `korczewski_path`) — nicht nur in Prosa, sondern dort, wo die Registry-SSOT liegt.
3. **CI-Guard.** `tests/spec/mcp-gateway.bats` prüft mechanisch, dass Deklaration und
   Warnung existieren und dass `CLAUDE.md` die Fehlleitung nicht wieder einführt.

**Bewusst nicht Teil dieses Change:**

- `k3d/default/claude-code-mcp-monolith-deploy.yaml` bleibt unangetastet. `DATABASE_URL`
  ist für den mentolder-Zweck korrekt; ein Manifest-Eingriff brächte keinen funktionalen
  Gewinn, würde aber mit T002321 (`PGOPTIONS` im selben `env`-Array) kollidieren und ein
  `kubectl apply -k k3d/default` erzwingen. Der Change bleibt dadurch rein
  repository-seitig und deploy-frei.
- Die Read-only-Frage des Servers (`ALTER USER`) gehört zu T002307 und wird hier nicht
  angefasst.
- Sollte später echter Bedarf an korczewski-SQL über MCP entstehen, ist Richtung 1 ein
  Follow-up-Ticket — bis dahin ist `kubectl exec` der dokumentierte Weg.

_Ticket: T002278_
