# ticket-mcp — Design

**Datum:** 2026-06-21
**Status:** design_approved
**Ticket:** neu (wird nach Plan-Erstellung angelegt)

---

## Zusammenfassung

Ein MCP-Server als stdio-Prozess, der die Ticket-Operationen aus `scripts/ticket.sh` als native MCP-Tools exponiert. Alle drei Clients (Claude Code, Opencode, Gemini CLI) können damit Tickets triagen, Felder setzen, Status-Übergänge auslösen und Mishaps bündeln — ohne manuelle Shell-Aufrufe.

---

## Kontext & Motivation

- `scripts/ticket.sh` deckt 15+ Ticket-Operationen ab, ist aber nur über Bash-Aufrufe nutzbar
- AI-Agenten müssen heute komplexe Shell-Kommandos kennen um Tickets zu verwalten
- Mishaps werden einzeln als Tickets angelegt — ohne Bündelung entsteht Ticket-Noise
- Tickets entstehen gelegentlich ohne `external_id` (T000xxx) wegen Race-Conditions beim Create — kein automatischer Heilmechanismus existiert

---

## Architektur

### Laufzeit

- **Typ:** Node.js stdio MCP-Server (`@modelcontextprotocol/sdk`)
- **Kein Build-Schritt** — reines JavaScript
- **Kein direkter DB-Zugriff** — ticket.sh bleibt die einzige DB-Schreibstelle
- **Transport:** stdio (jeder Client startet den Prozess lokal)

### Verzeichnisstruktur

```
scripts/ticket-mcp/
  server.js          ← MCP stdio entry point, Tool-Registrierung
  package.json       ← nur @modelcontextprotocol/sdk
  tools/
    list.js          ← list_tickets, get_ticket, export_tickets
    triage.js        ← triage_ticket, backfill_ticket_id
    planning.js      ← set_plan_meta, set_readiness_flag, prepare_feature
    lifecycle.js     ← transition_status, add_comment, update_fields
    mishap.js        ← report_mishap + Bundle-Logik
  lib/
    run-ticket.js    ← execFile-Wrapper um scripts/ticket.sh
    mishap-buffer.js ← Lesen/Schreiben .git/mishap-buffer.json
```

### BRAND-Kontext

Der Server liest `BRAND` aus der Umgebungsvariable (default: `mentolder`). Alle Tools akzeptieren optional `brand` als Parameter zur Laufzeit-Überschreibung — konsistent mit ticket.sh-Konvention.

---

## Tool-Katalog

### Atomare Tools

| Tool | Parameter | Delegiert an |
|------|-----------|--------------|
| `list_tickets` | `status?`, `brand?`, `type?`, `attention_mode?`, `missing_id?` | `ticket.sh get` (SQL via kubectl) |
| `get_ticket` | `id` (external_id) | `ticket.sh get --id` |
| `triage_ticket` | `id`, `type?`, `severity?`, `priority?`, `attention_mode?` | `ticket.sh update-status` + plan-meta |
| `set_plan_meta` | `id`, `value_prop?`, `effort?`, `areas?`, `depends_on?`, `rank?` | `ticket.sh plan-meta set` |
| `set_readiness_flag` | `id`, `flag`, `value` (true/false) | `ticket.sh plan-meta set --readiness` |
| `transition_status` | `id`, `status`, `resolution?`, `notes?` | `ticket.sh update-status` |
| `add_comment` | `id`, `body`, `author?`, `visibility?` | `ticket.sh add-comment` |
| `update_fields` | `id`, `title?`, `description?`, `notes?` | `ticket.sh update-status` (notes-Patch) |
| `backfill_ticket_id` | `brand?` | `ticket.sh backfill-id` (neuer Subcommand) |

### Convenience-Tools

| Tool | Verhalten |
|------|-----------|
| `prepare_feature` | Einzel-Call: führt `triage_ticket` + `set_plan_meta` + alle Readiness-Flags + `transition_status → planning` sequenziell aus; atomarer Fehler-Rollback per Kommentar |
| `export_tickets` | Gibt Tickets als JSON oder Markdown aus (filtert wie `list_tickets`) |
| `report_mishap` | Fügt einen Mishap in den Buffer ein; bei ≥ 3 Einträgen automatisch `classify_mishap_bundle` |

---

## Mishap-Bundle-System

### Buffer

- **Speicherort:** `.git/mishap-buffer.json` (nicht committet, persistiert zwischen Sessions, wird bei `git worktree remove` aufgeräumt)
- **Schema:** `[{ title, description, component, type, reported_at }]`

### Flow

```
report_mishap(title, description, component, type)
  → mishap-buffer.json lesen
  → Mishap anhängen
  → Wenn buffer.length >= 3:
      → classify_mishap_bundle() aufrufen
      → Zusammengefasstes Ticket via ticket.sh create anlegen:
          type=task, status=triage, attention_mode=ai_ready
          title = "Mishap-Bundle: <komponenten>" 
          description = alle 3 Mishaps gebündelt als Markdown
      → mishap-buffer.json leeren
      → Ticket-external_id zurückgeben
  → Sonst: buffer-Größe + fehlende Anzahl bis Trigger zurückgeben
```

### classify_mishap_bundle — Klassifizierungslogik

Kein LLM-Aufruf — regelbasierte Klassifizierung:
- `type`: immer `task` (Mishaps = Verbesserungsaufgaben)
- `severity`: `major` wenn ≥ 1 Mishap vom Typ `broken|security`; sonst `minor`
- `priority`: `hoch` wenn severity=major; sonst `mittel`
- `areas`: Union aller `component`-Werte der 3 Mishaps (normalisiert auf bekannte Areas)
- `attention_mode`: immer `ai_ready` → landet im nächsten Factory-Tick

### mishap-tracker Skill-Integration

Der bestehende `mishap-tracker`-Skill wird angepasst: statt direkt ein Ticket zu erstellen ruft er `report_mishap` via MCP auf. Das Dreier-Bündelungs-Gate liegt vollständig im MCP-Server — der Skill selbst muss keine Zähllogik kennen.

---

## backfill_ticket_id

### Problem

Tickets ohne `external_id` (NULL) entstehen wenn das Create-Statement zwar eine Zeile einfügt aber der Rückgabewert nicht ausgelesen wird (Race-Condition in parallelen Inserts oder Fehler im Client).

### Lösung

Neuer `ticket.sh backfill-id`-Subcommand:
```sql
UPDATE tickets.tickets
SET external_id = 'T' || LPAD(nextval('tickets.ticket_id_seq')::text, 6, '0')
WHERE external_id IS NULL
  AND brand = :'brand'
RETURNING external_id, id;
```

`backfill_ticket_id` im MCP ruft diesen Subcommand auf und gibt die reparierten IDs zurück. Kann in `list_tickets` mit `missing_id: true` kombiniert werden um vorher die betroffenen Tickets zu finden.

---

## Client-Integration

### Opencode (`.opencode/opencode.jsonc`)

```jsonc
"ticket-mcp": {
  "type": "local",
  "command": ["node", "scripts/ticket-mcp/server.js"],
  "enabled": true
}
```

### Claude Code (`.claude/settings.json` → `mcpServers`)

```json
"ticket-mcp": {
  "type": "stdio",
  "command": "node",
  "args": ["scripts/ticket-mcp/server.js"]
}
```

### Gemini CLI

Gemini CLI nutzt dasselbe stdio-Muster — Konfigurationspfad und Format werden bei Implementierung aus dem vorhandenen `~/.gemini/config`-Verzeichnis abgeleitet.

---

## Fehlerbehandlung

- `ticket.sh` exit ≠ 0 → MCP-Antwort mit `isError: true`, stderr als Nachricht
- Unbekannte `external_id` → klare Fehlermeldung, kein silent fail
- Buffer-Schreibfehler → `report_mishap` gibt Fehler zurück, kein Datenverlust (Mishap bleibt im Aufruf-Kontext)
- `prepare_feature` Teilfehler → Kommentar am Ticket dokumentiert was gesetzt wurde und was fehlschlug

---

## OpenSpec-Verknüpfung

Dieses Design wird als OpenSpec-Change-Proposal angelegt (`openspec/changes/ticket-mcp/`). Der Slug lautet `ticket-mcp`. Die Implementierung startet erst nach `openspec:apply`.

Verwandter bestehender Change: `ai-ticket-auto-triage` (T000992, status: planning) — die Mishap-Bundle-Klassifizierung ersetzt dort die heuristische Severity-Erkennung für Mishap-Tickets. Nach Merge kann T000992 auf `archived` gesetzt werden.

---

## Neue ticket.sh Subcommands (Implementierungsabhängigkeit)

Das MCP-Server-Layer setzt zwei neue Subcommands in `scripts/ticket.sh` voraus, die im selben Zug implementiert werden:

| Subcommand | Funktion |
|------------|----------|
| `list` | Gibt Tickets gefiltert nach status/brand/type/attention_mode als JSON aus; unterstützt `--missing-id` Flag für NULL-external_id-Suche |
| `backfill-id` | UPDATE auf Tickets mit NULL external_id → setzt nächsten Sequenzwert |

---

## Nicht im Scope

- Kein direkter PostgreSQL-Client (ticket.sh bleibt einzige DB-Schreibstelle)
- Kein LLM-Aufruf im MCP-Server selbst (regelbasierte Klassifizierung)
- Keine eigene Authentifizierung (Clients vertrauen dem lokalen Prozess)
- Kein k3d-Pod — rein lokal via stdio

---

## Erfolgskriterien

1. Alle 3 Clients (Claude Code, Opencode, Gemini) können Tickets via MCP triagen ohne Shell-Aufrufe
2. `prepare_feature` setzt alle Pflichtfelder für `plan_staged`-Readiness in einem Tool-Call
3. 3 Mishaps → automatisch 1 gebündeltes Ticket mit `attention_mode: ai_ready`
4. `backfill_ticket_id` findet und repariert alle NULL-external_id Tickets
5. `ticket.sh` bleibt unverändert die einzige DB-Schreibstelle (kein direkter pg-Zugriff im MCP)
