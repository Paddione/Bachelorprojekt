# KI-API Prod-Migrationen (T000711) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei SQL-Migrationen auf beiden Prod-Brand-Datenbanken (mentolder + korczewski) ausführen, damit die Coaching-Auswahl im Dashboard für T000711 funktioniert.

**Architecture:** Beide Migrationen sind idempotent und müssen nacheinander ausgeführt werden: erst Schema-Erweiterung (`provider-config-unify`), dann Daten-Migration (`coaching-data-migrate`). Sie laufen direkt gegen die `shared-db`-Pods im `fleet`-Cluster via `kubectl exec`.

**Tech Stack:** kubectl (context: `fleet`), psql, `scripts/factory/lib.sh` (factory_resolve / factory_psql), Bash.

## Global Constraints

- kubectl context immer `fleet` — niemals einen anderen Context nutzen
- mentolder → Namespace `workspace`, korczewski → Namespace `workspace-korczewski`
- Migrationen sind idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING) — sie können sicher mehrfach laufen
- Reihenfolge: 1. `provider-config-unify.sql`, 2. `coaching-data-migrate.sql`
- Auf beiden Brands ausführen: erst mentolder, dann korczewski
- Kein Code-Change, kein PR nötig — nur Ops

---

### Task 1: Verbindungscheck und Vorbedingungen prüfen

**Files:**
- Read: `scripts/factory/lib.sh` (factory_resolve + factory_psql — bereits bekannt, kein Edit)
- Read: `scripts/migrations/2026-06-14-provider-config-unify.sql`
- Read: `scripts/migrations/2026-06-14-coaching-data-migrate.sql`

**Interfaces:**
- Konsumiert: `FACTORY_CTX=fleet`, `BRAND=mentolder|korczewski`
- Produziert: Bestätigung dass shared-db-Pods erreichbar sind

- [ ] **Step 1: fleet-Context aktivieren**

```bash
kubectl config use-context fleet
kubectl config current-context  # muss "fleet" ausgeben
```

Erwartung: `fleet`

- [ ] **Step 2: mentolder shared-db-Pod prüfen**

```bash
kubectl get pod -n workspace --context fleet \
  -l 'app in (shared-db, shared-db-dev)' \
  -o wide
```

Erwartung: Ein Pod mit Status `Running`. Name wird für später gemerkt.

- [ ] **Step 3: korczewski shared-db-Pod prüfen**

```bash
kubectl get pod -n workspace-korczewski --context fleet \
  -l 'app in (shared-db, shared-db-dev)' \
  -o wide
```

Erwartung: Ein Pod mit Status `Running`.

- [ ] **Step 4: mentolder DB-Verbindung testen**

```bash
BRAND=mentolder bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT current_database(), current_user, current_schema();
EOF
'
```

Erwartung: Ausgabe enthält `website`, `website`, (kein Fehler).

- [ ] **Step 5: korczewski DB-Verbindung testen**

```bash
BRAND=korczewski bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT current_database(), current_user, current_schema();
EOF
'
```

Erwartung: Ausgabe enthält `website`, `website`, (kein Fehler).

---

### Task 2: Schema-Migration auf mentolder ausführen

**Files:**
- Execute: `scripts/migrations/2026-06-14-provider-config-unify.sql` gegen `workspace` (mentolder)

**Interfaces:**
- Konsumiert: laufender mentolder shared-db-Pod aus Task 1
- Produziert: `tickets.provider_config` mit neuen Spalten + Indices

- [ ] **Step 1: Aktuellen Schema-Stand prüfen (Pre-Check)**

```bash
BRAND=mentolder bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT column_name FROM information_schema.columns
WHERE table_schema = '"'"'tickets'"'"' AND table_name = '"'"'provider_config'"'"'
ORDER BY ordinal_position;
EOF
'
```

Notiere, welche Spalten bereits vorhanden sind.

- [ ] **Step 2: Schema-Migration ausführen**

```bash
BRAND=mentolder bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql < scripts/migrations/2026-06-14-provider-config-unify.sql
'
```

Erwartung: Kein Fehler, Migration läuft durch (COMMIT ohne ERROR).

- [ ] **Step 3: Neue Spalten verifizieren**

```bash
BRAND=mentolder bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT column_name FROM information_schema.columns
WHERE table_schema = '"'"'tickets'"'"' AND table_name = '"'"'provider_config'"'"'
  AND column_name IN ('"'"'brand'"'"', '"'"'is_active'"'"', '"'"'display_name'"'"',
                       '"'"'api_key'"'"', '"'"'temperature'"'"', '"'"'enabled_fields'"'"')
ORDER BY column_name;
EOF
'
```

Erwartung: Alle 6 Spalten werden aufgelistet.

- [ ] **Step 4: Index auf coaching-brand_provider prüfen**

```bash
BRAND=mentolder bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT indexname FROM pg_indexes
WHERE tablename = '"'"'provider_config'"'"' AND schemaname = '"'"'tickets'"'"'
  AND indexname LIKE '"'"'provider_config_coaching%'"'"';
EOF
'
```

Erwartung: `provider_config_coaching_brand_provider` und `provider_config_coaching_active` erscheinen.

---

### Task 3: Daten-Migration auf mentolder ausführen

**Files:**
- Execute: `scripts/migrations/2026-06-14-coaching-data-migrate.sql` gegen `workspace` (mentolder)

**Interfaces:**
- Konsumiert: Schema aus Task 2 (Spalten `brand`, `source`, `tier` etc. in `tickets.provider_config`)
- Produziert: Daten aus `coaching.ki_config` → `tickets.provider_config`, Mapping-Tabelle, neue FK

- [ ] **Step 1: Anzahl bestehender Coaching-Einträge prüfen (Pre-Check)**

```bash
BRAND=mentolder bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT COUNT(*) AS ki_config_count FROM coaching.ki_config;
SELECT COUNT(*) AS provider_config_coaching_count
FROM tickets.provider_config WHERE source = '"'"'coaching'"'"';
EOF
'
```

Notiere die Anzahlen.

- [ ] **Step 2: Daten-Migration ausführen**

```bash
BRAND=mentolder bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql < scripts/migrations/2026-06-14-coaching-data-migrate.sql
'
```

Erwartung: Kein Fehler, COMMIT ohne ERROR.

- [ ] **Step 3: Migrationserfolg verifizieren**

```bash
BRAND=mentolder bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT COUNT(*) AS migrated FROM tickets.provider_config WHERE source = '"'"'coaching'"'"';
SELECT COUNT(*) AS mapped FROM coaching.ki_config_id_map;
SELECT COUNT(*) AS sessions_remapped
  FROM coaching.sessions s
  JOIN tickets.provider_config p ON p.id = s.ki_config_id
  WHERE p.source = '"'"'coaching'"'"';
EOF
'
```

Erwartung: `migrated` ≥ 1, `mapped` = `migrated`, `sessions_remapped` ≥ 0 (kann 0 sein wenn keine Sessions existieren).

- [ ] **Step 4: FK-Constraint prüfen**

```bash
BRAND=mentolder bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT conname, contype FROM pg_constraint
WHERE conname = '"'"'sessions_ki_config_id_fkey'"'"'
  AND conrelid = '"'"'coaching.sessions'"'"'::regclass;
EOF
'
```

Erwartung: `sessions_ki_config_id_fkey` mit `contype = f` (Foreign Key).

---

### Task 4: Schema-Migration auf korczewski ausführen

**Files:**
- Execute: `scripts/migrations/2026-06-14-provider-config-unify.sql` gegen `workspace-korczewski`

**Interfaces:**
- Konsumiert: laufender korczewski shared-db-Pod aus Task 1
- Produziert: gleicher Schema-Stand wie mentolder

- [ ] **Step 1: Schema-Migration auf korczewski ausführen**

```bash
BRAND=korczewski bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql < scripts/migrations/2026-06-14-provider-config-unify.sql
'
```

Erwartung: Kein Fehler, COMMIT ohne ERROR.

- [ ] **Step 2: Neue Spalten auf korczewski verifizieren**

```bash
BRAND=korczewski bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT column_name FROM information_schema.columns
WHERE table_schema = '"'"'tickets'"'"' AND table_name = '"'"'provider_config'"'"'
  AND column_name IN ('"'"'brand'"'"', '"'"'is_active'"'"', '"'"'display_name'"'"',
                       '"'"'api_key'"'"', '"'"'temperature'"'"', '"'"'enabled_fields'"'"')
ORDER BY column_name;
EOF
'
```

Erwartung: Alle 6 Spalten erscheinen.

---

### Task 5: Daten-Migration auf korczewski ausführen

**Files:**
- Execute: `scripts/migrations/2026-06-14-coaching-data-migrate.sql` gegen `workspace-korczewski`

**Interfaces:**
- Konsumiert: Schema aus Task 4 (korczewski)
- Produziert: Daten-Migration vollständig auf beiden Brands

- [ ] **Step 1: Daten-Migration auf korczewski ausführen**

```bash
BRAND=korczewski bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql < scripts/migrations/2026-06-14-coaching-data-migrate.sql
'
```

Erwartung: Kein Fehler, COMMIT ohne ERROR.

- [ ] **Step 2: Migrationserfolg auf korczewski verifizieren**

```bash
BRAND=korczewski bash -c '
  source scripts/factory/lib.sh
  factory_resolve
  factory_psql <<EOF
SELECT COUNT(*) AS migrated FROM tickets.provider_config WHERE source = '"'"'coaching'"'"';
SELECT COUNT(*) AS mapped FROM coaching.ki_config_id_map;
EOF
'
```

Erwartung: `migrated` ≥ 0 (korczewski kann weniger Daten haben), `mapped` = `migrated`.

---

### Task 6: End-to-End-Funktionsprüfung im Browser

**Files:**
- Test via Browser: `https://web.mentolder.de/admin/dashboard` (Coaching-Tab)
- Test via Browser: `https://web.korczewski.de/admin/dashboard` (Coaching-Tab)

**Interfaces:**
- Konsumiert: vollständig migrierte DBs aus Tasks 2–5
- Produziert: Bestätigung dass Coaching-Auswahl im Dashboard funktioniert

- [ ] **Step 1: mentolder Coaching-Dashboard prüfen**

1. Browser öffnen: `https://web.mentolder.de/admin/dashboard`
2. Als Admin einloggen (via Pocket ID)
3. Coaching-Tab öffnen
4. Sicherstellen, dass vorhandene Coaching-Provider geladen werden (keine leere Liste oder 500-Error)

- [ ] **Step 2: korczewski Coaching-Dashboard prüfen**

1. Browser öffnen: `https://web.korczewski.de/admin/dashboard`
2. Als Admin einloggen
3. Coaching-Tab öffnen
4. Sicherstellen, dass die Coaching-Auswahl funktioniert

- [ ] **Step 3: Ticket T000711 auf awaiting_deploy setzen (bereits gemergt)**

Da der Code (PR #1651) bereits gemergt und deployed ist und die Migrationen jetzt laufen, Ticket schliessen:

```bash
bash scripts/ticket.sh comment T000711 "Migrationen erfolgreich auf mentolder und korczewski ausgeführt. Coaching-Dashboard verifiziert."
```

Falls Ticket-Status noch nicht `done`: Status auf `done` setzen via Admin-Cockpit oder ticket.sh.
