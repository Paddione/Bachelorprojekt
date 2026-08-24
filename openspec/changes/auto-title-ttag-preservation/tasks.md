---
title: "auto-title-ttag-preservation — Implementation Plan"
ticket_id: T015826
domains: [ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# auto-title-ttag-preservation — Implementation Plan

## File Structure

```
.github/workflows/pr-auto-title.yml          Rename-Pfad um Tag-Erhalt/-Rekonstruktion erweitern (main 143, Limit 800)
tests/spec/ci-cd/pr-auto-title-ttag.bats     1 Fall, Source-Grep auf CI-Konfiguration (liegt bereits rot auf dem Branch)
```

## Partial-Manifest

Ein Partial. Der RED-Test liegt schon auf dem Branch; Test und Workflow-Fix bilden einen
unteilbaren Rot-Grün-Schritt an derselben Funktion — ein Schnitt dazwischen liesse einen
Stand zurueck, in dem der Guard den bekannten Defekt meldet.

## Tasks

- [ ] **1. Failing test (RED) bestaetigen.** Der Test liegt bereits auf dem Branch
      (`tests/spec/ci-cd/pr-auto-title-ttag.bats`). Vor der ersten Aenderung laufen lassen
      und den roten Stand bestaetigen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/pr-auto-title-ttag.bats
      ```

      expected: FAIL — die Positiv-Anker (Workflow existiert, Rename-Pfad existiert) sind
      gruen, die Assertion "Tag-Extraktion aus dem PR-Titel" ist rot. Ein Test, der an
      allem scheitert, wuerde die Negativ-Aussage zufaellig erfuellen; genau das wird
      durch die Anker verhindert.

- [ ] **2. Tag-Erhalt im Rename-Pfad implementieren.** In `.github/workflows/pr-auto-title.yml`
      zwischen Schritt 3b (Scope-Validierung) und Schritt 4 (Subject-Aufbau) einfuegen:

      ```bash
      # ── 3c. Ticket-Tag erhalten oder aus dem Branch rekonstruieren (T015826) ──
      # auto-close-merged.sh schliesst Tickets nur über den literalen [TNNNNNN]-Tag
      # im PR-Titel ("Merge = closure", T001092). Der Rename darf ihn nicht verwerfen.
      TICKET_TAG=$(printf '%s' "$PR_TITLE" | grep -oP '\[T[0-9]{6}\]' | head -1 || true)
      if [[ -z "$TICKET_TAG" ]]; then
        TAG_FROM_BRANCH=$(printf '%s' "$BRANCH" | grep -oiP '(?<![a-zA-Z0-9])T[0-9]{6}' | head -1 || true)
        [[ -n "$TAG_FROM_BRANCH" ]] && TICKET_TAG="[${TAG_FROM_BRANCH^^}]"
      fi
      ```

      Zusätzlich in Schritt 4 das Ticket-Token aus dem Subject entfernen (sonst steht die
      ID doppelt — einmal als Text im Subject, einmal als Tag):

      ```bash
      SUBJECT_SLUG=$(printf '%s' "$SUBJECT_SLUG" | sed -E 's/(^|-)[tT][0-9]{6}($|-)/\1\2/; s/--+/-/g; s/^-+|-+$//')
      ```

      Und in Schritt 5 den Tag anhaengen:

      ```bash
      [[ -n "$TICKET_TAG" ]] && NEW_TITLE="${NEW_TITLE} ${TICKET_TAG}"
      ```

      Randbedingungen: `$PR_TITLE` bleibt stdin-only fuer grep (Security-Modell des
      Workflows, Kopf-Kommentar), `$BRANCH` ist bereits auf `[a-zA-Z0-9/_-]` sanitisiert,
      `grep -oP` mit `|| true` vertraegt leere Treffermengen unter `set -euo pipefail`.

- [ ] **3. GREEN + Anker gegenpruefen.**

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/pr-auto-title-ttag.bats
      ```

      Erwartet: 1/1 gruen. Ausserdem simulieren: ein Titel `fix: foo [T015826]` muss in
      Schritt 1 weiterhin frueh aussteigen (bereits CC-valide, kein Rename); ein Branch
      `fix/t015826-slug` ohne Tag im Titel muss `[T015826]` rekonstruieren.

- [ ] **4. Final Verification.** Repo-Gates intakt:

      ```bash
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```

      Erwartet: keine neuen Fehlschlaege gegenueber origin/main, freshness gruen.
