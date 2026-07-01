---
title: "G-CI01: [skip ci] im freshness-regen Bot-Commit"
ticket_id: T001281
domains: [ci]
status: plan_staged
---

# ci01-skip-ci-bot-commits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Queue-Verdrängung im GitHub-Actions-Concurrency-Slot stoppen, indem
der freshness-regen-Bot-Commit keinen eigenen CI-Lauf mehr triggert. Einzige
Änderung: `[skip ci]` am Ende der Commit-Message in `freshness-regen.yml`.

**Architecture:** Einzel-Zeilen-Fix in einem GH-Actions-Workflow. Kein
Laufzeit-Code, kein k8s-Manifest, keine Datenbank beteiligt.

## File Structure

Geänderte Datei:

- `.github/workflows/freshness-regen.yml` — Commit-Message-Zeile im Step
  "Commit and push if changed" erhält `[skip ci]`

## Global Constraints

- Nur die eine Zeile in `freshness-regen.yml` ändern
- BATS-Test in `tests/spec/ci-cd.bats` einfügen (Abschnitt G-CI01)
- Kein weiterer Code, keine Manifest-Änderungen

---

## Task 1 — Failing BATS-Test schreiben (RED)

**Datei:** `tests/spec/ci-cd.bats`

Neuen Test am Ende des G-CI01-Abschnitts einfügen:

```bats
@test "G-CI01-E: freshness-regen.yml Bot-Commit enthaelt [skip ci]" {
  run grep -c "\[skip ci\]" "$REPO_ROOT/.github/workflows/freshness-regen.yml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
```

Erwartetes Ergebnis vor Task 2: **FAIL** (grep findet nichts, `output` = 0).

Ausführen und rotes Ergebnis bestätigen:

```bash
bats tests/spec/ci-cd.bats --filter "G-CI01-E"
```

## Task 2 — Fix in freshness-regen.yml anwenden

In `.github/workflows/freshness-regen.yml` den "Commit and push if changed"-Step anpassen:

```yaml
# Vorher:
          git commit -m "chore: auto-regenerate freshness artifacts"
# Nachher:
          git commit -m "chore: auto-regenerate freshness artifacts [skip ci]"
```

Danach Test erneut ausführen — muss grün sein:

```bash
bats tests/spec/ci-cd.bats --filter "G-CI01-E"
```

## Task 3 — Verify

```bash
# Offline-Tests mit dem geänderten Workflow
task test:changed

# Freshness-Artefakte neu generieren und prüfen
task freshness:regenerate
task freshness:check
```

Alle drei Befehle müssen exit 0 liefern. Danach PR erstellen.
