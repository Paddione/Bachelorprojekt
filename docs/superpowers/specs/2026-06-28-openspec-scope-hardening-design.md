---
ticket_id: null
plan_ref: null
status: active
date: 2026-06-28
---

# Design: openspec-scope-hardening

**Datum:** 2026-06-28  
**Slug:** `openspec-scope-hardening`  
**Status:** approved

---

## Kontext & Problem

Das OpenSpec-System hat seit Einführung eine unkontrollierte Spec-Proliferation entwickelt:

- **74 SSOT-Specs** in `openspec/specs/` — davon 31 leere Baselines und 23 thin Stubs (<50 Zeilen)
- **Root-Cause:** `openspec-merge.mjs` erstellt automatisch neue SSOT-Dateien wenn das Delta-Ziel nicht existiert — kein Fehler, keine Warnung
- **Verstärker:** Delta-Specs werden nach dem Change-Slug benannt statt nach dem Parent-Spec, sodass Sub-Features eigene Spec-Dateien spawnen
- **Weiches Gate:** `checkConfigDrift()` in `openspec-validate.ts` warnt nur (WARN), blockiert CI nie — kein Druck zur Registrierung

Ziel: mechanisch verhindern dass neue Scopes entstehen, bestehende Proliferation bereinigen.

---

## Implementierungsreihenfolge

```
[Hebel 2] openspec-merge.mjs   →  [Hebel 4] Konsolidierung   →  [Hebel 3] Gate aktivieren   →  [Hebel 1] Propose-Guidance
 kein Auto-Create mehr              Specs aufräumen                CI-FAIL wenn unlisted          Prozess fix
```

Hebel 3 kommt bewusst nach Hebel 4: der Gate-Flip auf FAIL würde sonst sofort CI brechen, bevor die Konsolidierung sauber ist.

---

## Hebel 2 — `openspec-merge.mjs`: Auto-Create Guard

### Änderung

`applyDelta()` prüft vor dem Schreiben ob die SSOT-Zieldatei existiert. Wenn nicht und `--create-new` nicht gesetzt: Fehler mit Hinweis.

```
node scripts/openspec-merge.mjs apply delta.md nonexistent.md
→ ERROR: Target 'nonexistent.md' does not exist.
   Point the delta at an existing spec, or pass --create-new for a genuinely new component.
   Exit code: 1
```

Mit `--create-new`: bisheriges Verhalten (Datei wird angelegt). Legitime neue Komponenten müssen explizit opt-in.

### Kaskade

`openspec.sh archive` reicht `--create-new` durch wenn der User es übergibt:
```bash
bash scripts/openspec.sh archive <slug> [--create-new]
```

### Betroffene Dateien
- `scripts/openspec-merge.mjs` — Flag-Parsing + Guard
- `scripts/openspec.sh` — `--create-new` in `cmd_archive()` durchreichen

---

## Hebel 3 — `openspec-validate.ts`: WARN → FAIL

### Änderung

`checkConfigDrift()` promoted von advisory zu enforcement:

```diff
- warnings.push(`WARN: ${slug} not listed in config.yaml OpenSpec-Komponenten`)
+ errors.push(`FAIL: ${slug} not listed in config.yaml OpenSpec-Komponenten`)
```

`ok` ist danach `errors.length === 0` — CI-Gate wird hart. Jede neue SSOT-Spec muss in `config.yaml`'s `OpenSpec-Komponenten` stehen, sonst schlägt `task test:openspec` fehl.

### Tests

`scripts/openspec-validate.test.ts` bekommt einen neuen Test der prüft dass ein unlisted Spec zu `ok: false` führt (bisher: `ok: true, warnings: [...]`).

### Aktivierung

Läuft erst nach Hebel 4 — `config.yaml` wird im selben PR auf die konsolidierten ~40 Specs aktualisiert.

### Betroffene Dateien
- `scripts/openspec-validate.ts`
- `scripts/openspec-validate.test.ts`
- `openspec/config.yaml` — bereinigt auf ~40 Einträge

---

## Hebel 4 — Spec-Konsolidierung

### Merge: Requirements in Parent übertragen

Jede der folgenden thin Specs wird in ihren Parent gemergt: Requirements-Blöcke werden als `## ADDED Requirements` / `### Requirement:` in die Parent-Spec eingefügt, die thin-Spec-Datei wird gelöscht, `config.yaml` und `component-map.yaml` werden bereinigt.

| Thin Spec | → Parent-Spec |
|-----------|--------------|
| `cockpit-direct-ticket-links` | `admin-cockpit` |
| `cockpit-fullscreen-overview` | `admin-cockpit` |
| `cockpit-sidekick-global` | `admin-cockpit` |
| `platform-cockpit-alignment` | `admin-cockpit` |
| `sidekick-ai-quality` | `sidekick-assistant` |
| `sidekick-cleanup-grilling-broadcast` | `sidekick-assistant` |
| `coaching-studio` | `portal` |
| `pocket-id-oidc-wiring` | `auth-sso` |
| `secret-rotation-guards` | `secret-rotation` |
| `korczewski-deploy-parity` | `workspace-deploy` |

### Archivieren: kein erhaltenswerter Content

Folgende Spec-Dateien werden aus `openspec/specs/` gelöscht (geliefert, ersetzt, oder explizite Stubs):

```
korczewski-monolith-keycloak-auth       — PocketID ersetzt das
openspec-ticket-detail-view             — won't miss
g-doc02-claude-md-trim                  — Health Goal, done
g-spec03-proposal-tickets               — Health Goal, done
g-test03-vitest-skip-todo               — Health Goal, done
t001269-mishap-bundle-*                 — expliziter Stub, keine Requirements
t001272-mishap-bundle-*                 — Content in ticket-system/software-factory
fix-coaching-studio-prod-manifest       — geliefert, kein SSOT-Wert
fix-awaiting-deploy-visualization-gaps  — geliefert, kein SSOT-Wert
antigravity-cli-gh-sandbox              — geliefert
cq02-any-types-200                      — Health Goal, done
ci-speed                                — Health Goal, done
docker-build-speedup                    — Health Goal, done
npm-audit-clean                         — Health Goal, done
size04-loc-velocity                     — Health Goal, done
g-dep02-major-deps-website              — Health Goal, done
```

### Ergebnis

```
Vorher: 74 Specs (31 leere Baselines + 23 thin Stubs + 20 substantielle)
Nachher: ~40 Specs (alle substantiell, alle in config.yaml registriert)
```

Die 31 leere Baselines (auto-generiert 2026-06-20) bleiben bestehen — sie sind legitime Platzhalter für echte Komponenten, noch unfilled.

---

## Hebel 1 — Propose-Time Guidance

### `scripts/openspec.sh propose` — `--target-spec` Flag

```bash
bash scripts/openspec.sh propose <slug> --ticket <id> [--target-spec <existing-slug>]
```

Wenn `--target-spec <existing-slug>` gesetzt: erstellt `openspec/changes/<slug>/specs/<existing-slug>.md` als vorbenannte Delta-Skeleton-Datei mit ADDED-Requirements-Struktur. Ohne Flag: `specs/` bleibt leer (kein Default-Spawn).

### `CLAUDE.md` — Konventions-Hinweis

Kurzer Abschnitt unter OpenSpec-Konventionen:

```markdown
**Delta-Spec-Konvention:** Der Dateiname in `openspec/changes/<slug>/specs/`
muss dem SSOT-Slug des betroffenen Parent-Spec entsprechen, nicht dem Change-Slug.
Sub-Features eines bestehenden Komponenten: `--target-spec <parent-slug>` beim Propose.
Echte neue Komponente: `--create-new` beim Archive explizit setzen.
```

---

## Betroffene Dateien (Gesamt)

| Datei | Änderungstyp |
|-------|-------------|
| `scripts/openspec-merge.mjs` | Code: `--create-new` Guard |
| `scripts/openspec.sh` | Code: Flag-Weiterleitung + `--target-spec` in propose |
| `scripts/openspec-validate.ts` | Code: WARN→FAIL |
| `scripts/openspec-validate.test.ts` | Tests: neuer Drift-FAIL-Test |
| `openspec/config.yaml` | Inhalt: auf ~40 Einträge bereinigt |
| `openspec/component-map.yaml` | Inhalt: gelöschte Specs entfernen |
| `openspec/specs/admin-cockpit.md` | Inhalt: +4 Requirements |
| `openspec/specs/sidekick-assistant.md` | Inhalt: +2 Requirements |
| `openspec/specs/portal.md` | Inhalt: +1 Requirement |
| `openspec/specs/auth-sso.md` | Inhalt: +1 Requirement |
| `openspec/specs/secret-rotation.md` | Inhalt: +1 Requirement |
| `openspec/specs/workspace-deploy.md` | Inhalt: +1 Requirement |
| `openspec/specs/*.md` (16 Dateien) | Löschen: archivierte Stubs |
| `CLAUDE.md` | Doku: Delta-Spec-Konvention |

---

## Non-Goals

- Kein Verzeichnis-Namespacing (flache Struktur bleibt, nur Präfixe)
- Kein Befüllen der 31 leeren Baseline-Specs
- Kein Ändern der OpenSpec-CLI selbst (`openspec` npm-Paket)
- Keine Änderung des `opsx:archive` Skill-Flows (der ist korrekt)

---

## Acceptance Criteria

- `task test:openspec` schlägt fehl wenn eine neue Spec nicht in `config.yaml` steht
- `node scripts/openspec-merge.mjs apply delta.md nonexistent.md` exitiert mit Code 1
- `node scripts/openspec-merge.mjs apply delta.md nonexistent.md --create-new` funktioniert wie bisher
- `openspec/specs/` hat ≤42 Dateien nach der Konsolidierung
- Alle verbleibenden Specs sind in `config.yaml` registriert
- `bash scripts/openspec.sh validate` liefert OK
- `task test:changed` grün
