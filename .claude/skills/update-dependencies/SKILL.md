---
name: update-dependencies
description: Systematische Aktualisierung von Paketen und Frameworks — Deprecation-Audit, Major-Bumps, Lockfile-Audit, Rollback-Strategie und EOL-Check über alle Workspaces hinweg.
---

# update-dependencies — Paketaktualisierung

## Wann diese Skill greift

Bei Anfragen zu Paket-Updates, Deprecation-Warnungen, Major-Versionssprüngen,
Sicherheits-Advisories oder Lockfile-Audits.

## Ablauf

### Phase 1: Audit — Was ist veraltet?

```bash
# Lockfile-Audit (pnpm)
cd website && pnpm audit --json > /tmp/audit.json

# Veraltete Pakete anzeigen
cd website && pnpm outdated --format json > /tmp/outdated.json

# Deprecation-Warnungen extrahieren
cd website && pnpm install 2>&1 | grep -i "deprecat" > /tmp/deprecations.txt
```

### Phase 2: Klassifizierung

| Typ | Aktion | Risiko |
|-----|--------|--------|
| Patch (x.y.Z) | Auto-Update + Tests | Niedrig |
| Minor (x.Y.z) | Auto-Update + Tests + manueller Smoke-Test | Mittel |
| Major (X.y.z) | Manuelles Update mit Migration-Runbook | Hoch |
| Security Advisory | Sofort patchen, unabhängig von anderem | Kritisch |

### Phase 3: Update durchführen

```bash
# Patch/Minor: batch-update
cd website && pnpm update --latest --interactive

# Major: einzeln prüfen
pnpm outdated --format json | jq -r '.[] | select(.latest | test("^[0-9]+\\."))'
# → Jedes Major-Update einzeln: pnpm add <pkg>@latest
```

### Phase 4: Verifikation

```bash
# Build
cd website && pnpm build

# Tests
task test:all

# Kustomize
task workspace:validate
```

### Phase 5: Rollback (falls nötig)

```bash
git checkout pnpm-lock.yaml
pnpm install --frozen-lockfile
git commit -m "revert: rollback dependency update"
```

## Betroffene Pods pro Workspace

| Workspace | Betroffene Deployments |
|-----------|----------------------|
| `website/` | `website` (website-ns) |
| `brett/` | `brett` (workspace-ns) |
| Root `package.json` | Keine (Root-Scripts) |

## EOL-Check

Prüfe vor jedem Update:
- **Node.js**: `node --version` → Mindestens aktive LTS (≥22.x)
- **pnpm**: `pnpm --version` → Mindestens 9.x
- **PostgreSQL**: `SELECT version()` → Mindestens 16.x (pgvector-Kompatibilität)
- **k3s**: `kubectl version --short` → Innerhalb der Support-Window

## Häufige Blocker

| Problem | Lösung |
|---------|--------|
| `pnpm audit` zeigt hohe Vulnerabilities | Advisory-IDs sammeln, einzeln recherchieren (manche sind nur dev, manche irrelevant für unser Deployment) |
| Major-Bump bricht Build | Migration-Docs des Pakets lesen, Breaking-Changes-Liste durchgehen |
| Lockfile-Konflikt nach Rebase | `pnpm install --frozen-lockfile` → `pnpm update` |

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `cluster-deployment` | Folge — Test-Deploy nach Major-Bump |
| `fleet-ops` | Folge — Cross-Brand-Verifikation |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Mishap Tracking

Alle aufgetretenen Fehler, Blockaden oder Prozess-Friction über `mishap-tracker`
protokollieren.
