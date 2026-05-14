# Dev-Flow: PR-Link + Plan-Archiv in Postgres

**Datum:** 2026-05-14
**Branch:** `feature/dev-flow-pr-link-plan-archive`
**Scope:** `.claude/skills/dev-flow-execute/SKILL.md`, Schema-Migration `tickets.ticket_plans`

---

## Problemstellung

Der aktuelle `dev-flow-execute`-Flow hat zwei Lücken:

1. **Kein PR-Link im Ticket:** Nach dem Erstellen eines Pull Requests kennt das Ticket in der DB nicht, welcher GitHub-PR dazugehört. `tickets.ticket_links` hat bereits eine `pr_number`-Spalte, wird aber nie befüllt.

2. **Plan-Archivierung nur als Datei:** Nach erfolgreichem Merge landet der Plan per `mv` in `docs/superpowers/plans/executed/`. Der Markdown-Inhalt ist nie in Postgres gespeichert — kein strukturierter Zugriff, kein DB-seitiger Bezug zum Ticket.

---

## Design

### ① Schema-Migration — `tickets.ticket_plans`

Neue Tabelle im `tickets`-Schema:

```sql
CREATE TABLE tickets.ticket_plans (
  id          BIGSERIAL PRIMARY KEY,
  ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id),
  slug        TEXT NOT NULL,
  branch      TEXT,
  content     TEXT NOT NULL,
  pr_number   INTEGER,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `slug`: Dateiname ohne Extension und Datumspräfix (z.B. `dev-flow-pr-link-plan-archive`)
- `branch`: vollständiger Branch-Name (z.B. `feature/dev-flow-pr-link-plan-archive`)
- `content`: vollständiger Markdown-Inhalt der Plan-Datei zum Zeitpunkt der Archivierung
- `pr_number`: GitHub-PR-Nummer, die diesen Plan umgesetzt hat
- Kein FK auf `ticket_links` — `pr_number` ist reine Referenz, kein harter Constraint

Kein Index erforderlich für MVP; `ticket_id`-Lookup reicht über Seq-Scan bei kleinem Tabellenvolumen.

---

### ② dev-flow-execute Schritt 5 — PR-Link nach PR-Erstellung

**Einfügepunkt:** direkt nach `commit-commands:commit-push-pr` (sobald PR-Nummer verfügbar).

```bash
PR_NUM=$(gh pr view --json number -q '.number')

PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

# ticket_uuid aus external_id auflösen
TICKET_UUID=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT id FROM tickets.tickets WHERE external_id = '$TICKET_ID';")

# PR-Link in ticket_links eintragen (idempotent via WHERE NOT EXISTS)
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "INSERT INTO tickets.ticket_links (from_id, kind, pr_number)
   SELECT '$TICKET_UUID', 'pr', $PR_NUM
   WHERE NOT EXISTS (
     SELECT 1 FROM tickets.ticket_links
     WHERE from_id = '$TICKET_UUID' AND kind = 'pr' AND pr_number = $PR_NUM
   );"
```

- Nur ausführen wenn `$TICKET_ID` gesetzt (wie bisher bei Ticket-Operationen)
- `WHERE NOT EXISTS` verhindert Duplikate bei Retry (kein UNIQUE-Constraint auf der Tabelle)
- `to_id` bleibt NULL — `ticket_links` erlaubt das, da kein NOT NULL-Constraint

---

### ③ dev-flow-execute Schritt 7 — Plan-Archivierung in Postgres (ersetzt `executed/`-Move)

**Ersetzt:** `mv docs/superpowers/plans/<slug>.md docs/superpowers/plans/executed/`

```bash
PLAN_FILE="docs/superpowers/plans/<slug>.md"
PLAN_CONTENT=$(cat "$PLAN_FILE")

PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_UUID=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT id FROM tickets.tickets WHERE external_id = '$TICKET_ID';")

PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "NULL")

# Plan-Inhalt in Postgres archivieren
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "INSERT INTO tickets.ticket_plans (ticket_id, slug, branch, content, pr_number)
   VALUES (
     '$TICKET_UUID',
     '<slug>',
     '$(git branch --show-current)',
     \$plan\$$PLAN_CONTENT\$plan\$,
     $([ "$PR_NUM" = "NULL" ] && echo "NULL" || echo "$PR_NUM")
   );"

# .md-Datei löschen (nicht nach executed/ verschieben)
rm "$PLAN_FILE"
git add "$PLAN_FILE"
git commit -m "chore(plans): archive <slug> → postgres [$TICKET_ID]"
git push
```

- Dollar-Quoting (`$plan$...$plan$`) verhindert SQL-Injection durch Markdown-Sonderzeichen
- **Implementierungshinweis:** `PLAN_CONTENT` via Shell-Variable in `kubectl exec -c` ist bei Newlines/Quotes riskant. Besser: Plan-Datei per `kubectl cp` in den Pod kopieren und dort per `psql -f` oder `\lo_import` einspielen — oder Inhalt in eine temporäre SQL-Datei schreiben und via `kubectl exec ... -- psql -f -` pipen.
- Falls `$TICKET_ID` leer (z.B. bei Chores ohne Ticket): Archivierung überspringen, nur `rm` + commit
- Das `executed/`-Verzeichnis entfällt komplett — bestehende Dateien dort bleiben unberührt (kein Cleanup im Scope)

---

## Abgrenzung

**In Scope:**
- Schema-Migration `tickets.ticket_plans` (einmalig, manuell via `kubectl exec psql`)
- Anpassung `dev-flow-execute/SKILL.md` an zwei Stellen (Schritt 5 + Schritt 7)

**Out of Scope:**
- Admin-UI zum Anzeigen archivierter Pläne
- Backfill bereits archivierter Pläne aus `executed/`
- Cleanup des `executed/`-Verzeichnisses
- Änderungen an `dev-flow-plan/SKILL.md`

---

## Verifikation

- Schema-Migration läuft sauber durch: `\d tickets.ticket_plans` zeigt die Tabelle
- Nach einem Test-PR: `SELECT pr_number FROM tickets.ticket_links WHERE kind='pr'` gibt Treffer
- Nach Plan-Archivierung: `SELECT slug, archived_at FROM tickets.ticket_plans` zeigt Eintrag, `.md`-Datei ist weg
- `task test:all` bleibt grün (Skill-Änderungen berühren keine getestete Logik)
