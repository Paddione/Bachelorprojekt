---
title: Collabora WOPI Dual-Brand Guard (T000478) Implementation Plan
ticket_id: T000478
domains: [website, infra, ops, test, security]
status: active
pr_number: null
---

# Collabora WOPI Dual-Brand Guard (T000478) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verhindern, dass Single-Brand-`workspace:office:deploy`-Aufrufe in Prod-Kontexten die andere Brand aus dem Ingress löschen. Der `server_name=""`-Fix ist bereits aktiv — das fehlende Stück ist der operative Guard.

**Architecture:** Die geteilte Collabora-Instanz im `workspace-office` Namespace bedient beide Brands. Nur `fleet:shared-services` (Taskfile ~1844) deployed korrekt mit beiden Hosts (`COLLABORA_HOST` + `COLLABORA_HOST_2`). Ein Single-Brand-Deploy via `workspace:office:deploy` setzt `COLLABORA_HOST_2=""` und überschreibt den Ingress → die andere Brand verschwindet. Fix: `workspace:office:deploy` blockt nicht-dev ENVs mit klarer Fehlermeldung, die auf `fleet:shared-services` verweist.

**Tech Stack:** BATS-Tests, Bash, Taskfile (go-task)

**Ticket:** T000478

---

## Diagnose

### Was bereits funktioniert

1. **`COLLABORA_SERVER_NAME=""`** ist in allen Deploy-Pfaden gesetzt → coolwsd leitet WOPI-Discovery-Host vom Request-Header ab ✓
2. **`fleet:shared-services`** setzt beide `COLLABORA_HOST` + `COLLABORA_HOST_2` → Ingress hat beide Hosts ✓
3. **`fleet:shared-services`** patcht das Ingress für korczewski-TLS-Zertifikat ✓
4. BATS-Tests (`collabora-wopi-discovery.bats`) validieren den leeren server_name ✓

### Was noch fehlt

**Single-Brand-Deploy ist destruktiv.** `workspace:office:deploy ENV=mentolder` deployed den Ingress NUR mit `office.mentolder.de` — `office.korczewski.de` wird aus der Konfiguration entfernt.

Der Task wird aufgerufen von:
- `workspace:office:deploy` (direkt, Zeile 1214)
- `fleet:deploy:brand` (Zeile 1798) — ruft office:deploy NICHT auf, verweist auf shared-services

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `Taskfile.yml` | Guard in `workspace:office:deploy` einbauen |
| `tests/unit/collabora-wopi-single-brand-guard.bats` | Test existiert bereits (ROT) |
| `Taskfile.yml` | Test in `test:unit` verdrahten |

---

## Tasks

### Task 1: Prod-Guard in `workspace:office:deploy` einbauen

**Files:**
- Modify: `Taskfile.yml` (workspace:office:deploy task, ~Zeile 1214)

- [ ] **Step 1: Guard-Logik hinzufügen**

Vor der Deploy-Logik (vor Schritt `workspace:office:pull-secret`) eine ENV-Prüfung einfügen:

```yaml
  workspace:office:deploy:
    desc: "Deploy Collabora office-stack (DEV ONLY — use fleet:shared-services for prod)"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        if [ "{{.ENV}}" != "dev" ]; then
          echo "❌ workspace:office:deploy is for DEV (k3d) only."
          echo ""
          echo "   The shared fleet office-stack serves BOTH brands. A single-brand"
          echo "   deploy overwrites the Ingress and drops the other brand's host."
          echo ""
          echo "   For production fleet deploys, use:"
          echo "     task fleet:shared-services"
          echo ""
          echo "   This deploys Collabora + CoTURN/Janus for both brands in one shot."
          exit 1
        fi
      - task: workspace:office:pull-secret
        vars: { ENV: "{{.ENV}}" }
      # ... rest of existing deploy steps
```

- [ ] **Step 2: Test ausführen (jetzt GRÜN)**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/collabora-wopi-single-brand-guard.bats
```

Erwartet: Alle 3 Tests PASS (Guard wird gefunden).

### Task 2: BATS-Test in `test:unit` verdrahten

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Task-Definition hinzufügen**

```yaml
  test:unit:collabora-wopi-single-brand-guard:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/collabora-wopi-single-brand-guard.bats
```

- [ ] **Step 2: In `test:unit` aufrufen**

Nach `test:unit:collabora-wopi-discovery` einfügen:
```yaml
      - task: test:unit:collabora-wopi-discovery
      - task: test:unit:collabora-wopi-single-brand-guard
```

### Task 3: Finale Verifikation & Commit

- [ ] **Step 1: Vollständige Test-Suite ausführen**

```bash
task test:all
```

Erwartet: Alle Tests PASS.

- [ ] **Step 2: Committen**

```bash
git add Taskfile.yml tests/unit/collabora-wopi-single-brand-guard.bats docs/superpowers/plans/2026-06-07-collabora-wopi-dual-brand.md
git commit -m "fix(office): guard single-brand office:deploy against prod use [T000478]

workspace:office:deploy now refuses non-dev ENVs with a clear pointer to
fleet:shared-services. Single-brand deploys overwrite the shared Ingress
and drop the other brand's host — only fleet:shared-services sets both
COLLABORA_HOST + COLLABORA_HOST_2.

The server_name='' fix (dynamic WOPI discovery from Host header) is already
in place; this guard closes the remaining operational gap."
```

---

## Architektur-Entscheidung: Warum kein Split?

**Option A (Split in zwei Instanzen)** wurde evaluiert, aber für jetzt zurückgestellt:

| Kriterium | Split (A) | Guard (gewählt) |
|-----------|-----------|-----------------|
| Aufwand | Hoch: neues Namespace, zweites Deployment, zweiter Ingress, Secrets, NetworkPolicy | Gering: eine if-Abfrage |
| Ressourcen | 2× RAM/CPU (512Mi-2Gi pro Instanz) | 1× (Status Quo) |
| Wartung | Zwei Instanzen patchen/updaten | Eine Instanz |
| Risiko | CAP_SYS_ADMIN × 2 Pods | Unverändert |
| Dringlichkeit | Niedrig — Status Quo funktioniert mit fleet:shared-services | Hoch — Fußangel existiert |

**Empfehlung:** Jetzt den Guard einbauen. Split in einem separaten Feature-Plan angehen, falls Ressourcen-Isolation oder unabhängiges Rollout pro Brand benötigt wird.
