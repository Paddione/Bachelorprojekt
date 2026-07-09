---
name: update-dependencies
archived: true
# Kein description-Feld — dieser Skill läuft als biweekly Cloud-Routine (CronCreate).
# Manuell: Skill explizit mit /update-dependencies aufrufen, falls sofortige Ausführung nötig.
---

# ARCHIVIERT → biweekly Scheduled Routine

Dieser Skill wird **nicht mehr auto-getriggert**.
Er läuft alle 2 Wochen als geplante Cloud-Routine (CronCreate).

Für sofortige manuelle Ausführung: Skill explizit aufrufen.

## Ablauf (Referenz)

### Phase 1: Audit

```bash
cd website && pnpm audit --json > /tmp/audit-website.json
cd brett && npm audit --json > /tmp/audit-brett.json 2>/dev/null || true

cd website && pnpm outdated --format json > /tmp/outdated-website.json
cd brett && npm outdated --format json > /tmp/outdated-brett.json 2>/dev/null || true

cd website && pnpm install 2>&1 | grep -i "deprecat" > /tmp/deprecations-website.txt
```

### Phase 2: Klassifizierung

| Typ | Aktion | Risiko |
|-----|--------|--------|
| Patch (x.y.Z) | Auto-Update + Tests | Niedrig |
| Minor (x.Y.z) | Auto-Update + Tests + Smoke-Test | Mittel |
| Major (X.y.z) | Manuelles Update mit Migration-Runbook | Hoch |
| Security Advisory | Sofort patchen | Kritisch |

### Phase 3: Update

```bash
cd website && pnpm update --latest --interactive
cd brett && npm update 2>/dev/null || true
```

### Phase 4: Verifikation

```bash
cd website && pnpm build
task test:changed
task workspace:validate
```

### Phase 5: Rollback

```bash
git checkout pnpm-lock.yaml package-lock.json 2>/dev/null || git checkout pnpm-lock.yaml
cd website && pnpm install --frozen-lockfile
```

## EOL-Check

- **Node.js**: `node --version` → ≥22.x (aktive LTS)
- **pnpm**: `pnpm --version` → ≥9.x
- **PostgreSQL**: `SELECT version()` → ≥16.x
- **k3s**: innerhalb Support-Window

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `infra-ops §1` | Folge — Test-Deploy nach Major-Bump |
| `mishap-tracker` | Abschluss |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

