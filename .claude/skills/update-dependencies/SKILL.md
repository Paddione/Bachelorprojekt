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
# Lockfile-Audit (pnpm — website, arena-server)
cd website && pnpm audit --json > /tmp/audit-website.json
cd arena-server && pnpm audit --json > /tmp/audit-arena.json

# Lockfile-Audit (npm — brett)
cd brett && npm audit --json > /tmp/audit-brett.json 2>/dev/null || true

# Veraltete Pakete anzeigen
cd website && pnpm outdated --format json > /tmp/outdated-website.json
cd brett && npm outdated --format json > /tmp/outdated-brett.json 2>/dev/null || true
cd arena-server && pnpm outdated --format json > /tmp/outdated-arena.json 2>/dev/null || true

# Deprecation-Warnungen extrahieren
cd website && pnpm install 2>&1 | grep -i "deprecat" > /tmp/deprecations-website.txt
cd brett && npm install 2>&1 | grep -i "deprecat" > /tmp/deprecations-brett.txt 2>/dev/null || true
cd arena-server && pnpm install 2>&1 | grep -i "deprecat" > /tmp/deprecations-arena.txt 2>/dev/null || true
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
# Patch/Minor: batch-update per workspace
cd website && pnpm update --latest --interactive
cd brett && npm update 2>/dev/null || true
cd arena-server && pnpm update --latest --interactive 2>/dev/null || true

# Major: einzeln prüfen (workspace-übergreifend)
for dir in website brett arena-server; do
  [ -f "$dir/package.json" ] || continue
  echo "=== $dir ==="
  (cd "$dir" && (pnpm outdated --format json 2>/dev/null || npm outdated --format json 2>/dev/null) \
    | jq -r '.[] | select(.latest | test("^[0-9]+\\."))' 2>/dev/null || true)
done
# → Jedes Major-Update einzeln: cd <workspace> && pnpm add <pkg>@latest (oder npm install <pkg>@latest)
```

### Phase 4: Verifikation

```bash
# Build per Workspace
cd website && pnpm build
cd brett && npm run build 2>/dev/null || true
cd arena-server && pnpm build 2>/dev/null || true

# Tests (vollständig)
task test:all

# Kustomize
task workspace:validate

# Typecheck (brett + arena-server)
npm --prefix brett run typecheck 2>/dev/null || true
npm --prefix arena-server test 2>/dev/null || true
```

### Phase 5: Rollback (falls nötig)

```bash
# Lockfiles pro Workspace zurücksetzen
git checkout pnpm-lock.yaml package-lock.json 2>/dev/null || git checkout pnpm-lock.yaml

# Neu installieren
cd website && pnpm install --frozen-lockfile
cd brett && npm ci 2>/dev/null || true
cd arena-server && pnpm install --frozen-lockfile 2>/dev/null || true

git commit -m "revert: rollback dependency update"
```

## Betroffene Pods pro Workspace

| Workspace | Paketmanager | Betroffene Deployments |
|-----------|-------------|----------------------|
| `website/` | pnpm | `website` (website-ns) |
| `brett/` | npm | `brett` (workspace-ns) |
| `arena-server/` | pnpm | `arena-server` (korczewski only) |
| Root `package.json` | — | Keine (Root-Scripts) |

## EOL-Check

Prüfe vor jedem Update:
- **Node.js**: `node --version` → Mindestens aktive LTS (≥22.x)
- **pnpm**: `pnpm --version` → Mindestens 9.x
- **PostgreSQL**: `SELECT version()` → Mindestens 16.x (pgvector-Kompatibilität)
- **k3s**: `kubectl version --short` → Innerhalb der Support-Window

## Häufige Blocker

| Problem | Lösung |
|---------|--------|
| `pnpm audit` / `npm audit` zeigt hohe Vulnerabilities | Advisory-IDs sammeln, einzeln recherchieren (manche sind nur dev, manche irrelevant für unser Deployment) |
| Major-Bump bricht Build | Migration-Docs des Pakets lesen, Breaking-Changes-Liste durchgehen |
| Lockfile-Konflikt nach Rebase | `pnpm install --frozen-lockfile` → `pnpm update` (bzw. `npm ci` → `npm update` für brett) |
| `npm audit` schlägt mit `E401` fehl | Keine npm-Auth nötig — public packages; `--audit-level=none` zum Übergehen |

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `cluster-deployment` | Folge — Test-Deploy nach Major-Bump |
| `fleet-ops` | Folge — Cross-Brand-Verifikation |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Mishap Tracking

Alle aufgetretenen Fehler, Blockaden oder Prozess-Friction über `mishap-tracker`
protokollieren.
