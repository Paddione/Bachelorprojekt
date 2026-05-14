---
ticket_id: T000290
title: Dev-Flow PR-Link + Plan-Archiv in Postgres
domains: [skills]
status: active
pr_number: null
---

# Dev-Flow PR-Link + Plan-Archiv in Postgres — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei Lücken in `dev-flow-execute` schließen: (1) GitHub-PR-Nummer nach PR-Erstellung in `tickets.ticket_links` speichern; (2) Plan-Markdown nach Merge in Postgres (`tickets.ticket_plans`) archivieren und die `.md`-Datei löschen.

**Architecture:** Einmalige Schema-Migration legt `tickets.ticket_plans` an. `dev-flow-execute/SKILL.md` bekommt einen neuen Block nach Schritt 5 (PR-Link) und Schritt 7 wird durch Postgres-Archivierung ersetzt. Kein Anwendungscode, keine neuen Abhängigkeiten — nur Skill-Text + SQL.

**Tech Stack:** `kubectl exec psql` gegen mentolder-Cluster, `gh` CLI, Bash.

**Spec reference:** `docs/superpowers/specs/2026-05-14-dev-flow-pr-link-plan-archive-design.md`

**Branch:** `feature/dev-flow-pr-link-plan-archive`

---

## Pre-flight

- [ ] **Worktree:** bereits aktiv auf Branch `feature/dev-flow-pr-link-plan-archive`
- [ ] **Cluster erreichbar:** `kubectl get pod -n workspace --context mentolder -l app=shared-db` gibt mindestens einen Pod zurück

---

## Task 1: Schema-Migration — `tickets.ticket_plans` anlegen

**Files:**
- Kein File: Migration direkt gegen Cluster-DB ausführen

- [ ] **Schritt 1: Tabelle anlegen**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -v ON_ERROR_STOP=1 -c "
CREATE TABLE IF NOT EXISTS tickets.ticket_plans (
  id          BIGSERIAL PRIMARY KEY,
  ticket_id   UUID        NOT NULL REFERENCES tickets.tickets(id),
  slug        TEXT        NOT NULL,
  branch      TEXT,
  content     TEXT        NOT NULL,
  pr_number   INTEGER,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"
```

Erwartete Ausgabe: `CREATE TABLE`

- [ ] **Schritt 2: Tabelle verifizieren**

```bash
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c "\d tickets.ticket_plans"
```

Erwartete Ausgabe: Tabelle mit Spalten `id, ticket_id, slug, branch, content, pr_number, archived_at`.

- [ ] **Schritt 3: Commit (kein Code-File — Migration-Nachweis in Commit-Message)**

```bash
git commit --allow-empty -m "chore(db): create tickets.ticket_plans on mentolder cluster"
```

---

## Task 2: Schritt 5.5 in SKILL.md einfügen — PR-Link in ticket_links

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (nach dem `---` hinter Schritt 5, vor `## Schritt 6`)

Der neue Block kommt zwischen dem abschließenden `---` nach dem Body-Template (aktuell Zeile 140) und `## Schritt 6: Auto-Merge wenn CI grün` (Zeile 142).

- [ ] **Schritt 1: Block einfügen**

Ersetze in `.claude/skills/dev-flow-execute/SKILL.md` den Abschnitt:

```
---

## Schritt 6: Auto-Merge wenn CI grün
```

durch:

```
---

## Schritt 5.5: PR-Link im Ticket speichern

Falls `$TICKET_ID` gesetzt, direkt nach dem PR-Erstellen:

```bash
PR_NUM=$(gh pr view --json number -q '.number')

PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_UUID=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT id FROM tickets.tickets WHERE external_id = '$TICKET_ID';")

kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "INSERT INTO tickets.ticket_links (from_id, kind, pr_number)
   SELECT '$TICKET_UUID', 'pr', $PR_NUM
   WHERE NOT EXISTS (
     SELECT 1 FROM tickets.ticket_links
     WHERE from_id = '$TICKET_UUID' AND kind = 'pr' AND pr_number = $PR_NUM
   );"
```

- `to_id` bleibt NULL (kein NOT NULL-Constraint auf der Spalte).
- `WHERE NOT EXISTS` macht den Insert idempotent ohne UNIQUE-Constraint.

---

## Schritt 6: Auto-Merge wenn CI grün
```

- [ ] **Schritt 2: Diff prüfen**

```bash
git diff .claude/skills/dev-flow-execute/SKILL.md
```

Erwartete Ausgabe: Neuer Abschnitt `## Schritt 5.5` zwischen Schritt 5 und Schritt 6 eingefügt, kein sonstiger Verlust.

- [ ] **Schritt 3: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "feat(dev-flow): store PR link in ticket_links after PR creation"
```

---

## Task 3: Schritt 7 in SKILL.md ersetzen — Plan-Archivierung in Postgres

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (Schritt 6.5-Kommentar + Schritt 7 komplett)

Zwei Stellen:

**A) Schritt 6.5 — Kommentar aktualisieren** (Zeile 167): Der Text `Plan executed: docs/superpowers/plans/<slug>.md` stimmt nach der Änderung nicht mehr, weil die Datei gelöscht wird.

**B) Schritt 7 — Inhalt ersetzen** (Zeilen 176–187): `mv executed/`-Logik durch Postgres-Archivierung + `rm`.

- [ ] **Schritt 1: Schritt 6.5-Kommentar aktualisieren**

Ersetze in `.claude/skills/dev-flow-execute/SKILL.md`:

```
     'PR #$PR_NUM merged. Plan executed: docs/superpowers/plans/<slug>.md',
```

durch:

```
     'PR #$PR_NUM merged. Plan archived to tickets.ticket_plans in Postgres.',
```

- [ ] **Schritt 2: Schritt 7 ersetzen**

Ersetze den gesamten Schritt-7-Block:

```
## Schritt 7: Plan archivieren

Nach erfolgreichem Merge den Plan in `executed/` verschieben:

```bash
mkdir -p docs/superpowers/plans/executed
mv docs/superpowers/plans/<slug>.md docs/superpowers/plans/executed/
git add docs/superpowers/plans/
git commit -m "chore(plans): mark <slug> as executed"
git push
```
```

durch:

````
## Schritt 7: Plan in Postgres archivieren + Datei löschen

Falls `$TICKET_ID` gesetzt und `$PLAN_FILE` vorhanden:

```bash
PLAN_FILE="docs/superpowers/plans/<slug>.md"
SLUG="<slug>"
BRANCH=$(git branch --show-current)
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")

PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_UUID=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT id FROM tickets.tickets WHERE external_id = '$TICKET_ID';")

PR_NUM_SQL=$([ -z "$PR_NUM" ] && echo "NULL" || echo "$PR_NUM")

# SQL in temp-Datei schreiben — verhindert Shell-Expansion des Plan-Inhalts
TMPFILE=$(mktemp /tmp/plan-archive-XXXXXX.sql)
{
  printf "INSERT INTO tickets.ticket_plans (ticket_id, slug, branch, content, pr_number)\nVALUES (\n  '%s',\n  '%s',\n  '%s',\n  \$plan\$" \
    "$TICKET_UUID" "$SLUG" "$BRANCH"
  cat "$PLAN_FILE"
  printf "\$plan\$,\n  %s\n);\n" "$PR_NUM_SQL"
} > "$TMPFILE"

kubectl exec -i "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -v ON_ERROR_STOP=1 < "$TMPFILE"

rm "$TMPFILE"

# Datei löschen (nicht nach executed/ verschieben)
rm "$PLAN_FILE"
git add "$PLAN_FILE"
git commit -m "chore(plans): archive $SLUG → postgres [$TICKET_ID]"
git push
```

Falls `$TICKET_ID` leer (Chore ohne Ticket): SQL-Archivierung überspringen — nur `rm "$PLAN_FILE"` + commit.

**Hinweis Dollar-Quoting:** `$plan$...$plan$` ist psql-Dollar-Quoting; sicher für beliebigen Markdown-Inhalt, solange der Plan selbst nicht den String `$plan$` enthält (praktisch ausgeschlossen).
````

- [ ] **Schritt 3: Diff prüfen**

```bash
git diff .claude/skills/dev-flow-execute/SKILL.md
```

Prüfe:
- Schritt 6.5-Kommentar zeigt "Archived to tickets.ticket_plans in Postgres."
- Schritt 7 enthält `mktemp`, `kubectl exec -i`, `rm "$PLAN_FILE"`, kein `mv executed/` mehr

- [ ] **Schritt 4: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "feat(dev-flow): archive plan to postgres and delete md file on merge"
```

---

## Task 4: Verifikation + PR

- [ ] **Schritt 1: SKILL.md auf Vollständigkeit prüfen**

```bash
grep -n "Schritt 5.5\|ticket_links\|ticket_plans\|rm.*PLAN_FILE\|executed/" \
  .claude/skills/dev-flow-execute/SKILL.md
```

Erwartete Ausgabe:
- Treffer für `Schritt 5.5` und `ticket_links` (PR-Link-Block)
- Treffer für `ticket_plans` und `rm.*PLAN_FILE` (Archivierungs-Block)
- **Kein** Treffer für `executed/` (alter Move-Befehl ist weg)

- [ ] **Schritt 2: Offline-Tests laufen lassen**

```bash
task test:all
```

Erwartete Ausgabe: grün — Skill-Änderungen berühren keine BATS- oder Kustomize-Tests.

- [ ] **Schritt 3: Smoke-Test der neuen DB-Tabelle**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "SELECT COUNT(*) FROM tickets.ticket_plans;"
```

Erwartete Ausgabe: `count = 0` (Tabelle leer, existiert aber).

- [ ] **Schritt 4: Push + PR erstellen**

```bash
git push -u origin feature/dev-flow-pr-link-plan-archive
```

Dann `commit-commands:commit-push-pr` aufrufen mit:
- Titel: `feat(dev-flow): link PR to ticket + archive plan in postgres`
- Body:
  ```
  ## Summary
  - Speichert die GitHub-PR-Nummer nach PR-Erstellung in tickets.ticket_links (kind='pr')
  - Archiviert den Markdown-Plan nach Merge in tickets.ticket_plans und löscht die .md-Datei

  ## Test plan
  - [x] task test:all
  - [x] tickets.ticket_plans Tabelle auf mentolder-Cluster verifiziert
  - [x] SKILL.md grep-Check: kein executed/-Move, neuer 5.5-Block vorhanden
  ```
