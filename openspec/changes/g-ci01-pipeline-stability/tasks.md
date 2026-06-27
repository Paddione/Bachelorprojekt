---
title: "G-CI01 — CI Pipeline Stability: Implementation Plan"
ticket_id: T001279
domains: [ci, infra]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# g-ci01-pipeline-stability — Implementation Plan

## File Structure

Files changed in this PR:

| File | Change |
|------|--------|
| `.github/workflows/freshness-regen.yml` | Modify — GPG-Step entfernen |
| `website/Dockerfile` | Modify — npm→pnpm@10 migration |
| `tests/spec/ci-cd.bats` | Modify — G-CI01 BATS-Tests hinzufügen |
| `openspec/specs/ci-cd.md` | Modify — Delta-Requirements ergänzen |

---

## 1. BATS-Failing-Tests schreiben (rot→grün)

- [x] 1.1 Öffne `tests/spec/ci-cd.bats` und füge am Ende 4 neue `@test`-Blöcke für G-CI01 ein:
  - `G-CI01-A`: `freshness-regen.yml` enthält keinen `ghaction-import-gpg`-Verweis — expected: FAIL
  - `G-CI01-B`: `Dockerfile` COPY-Zeile referenziert `pnpm-lock.yaml` — expected: FAIL
  - `G-CI01-C`: `Dockerfile` nutzt `pnpm install --frozen-lockfile` (nicht `npm ci`) — expected: FAIL
  - `G-CI01-D`: `website/pnpm-lock.yaml` existiert; `website/package-lock.json` existiert nicht — expected: PASS (sollte bereits grün sein)
- [x] 1.2 Verifiziere, dass Tests 1.1 A/B/C aktuell rot sind: `bats tests/spec/ci-cd.bats -f "G-CI01"` — erwartet: mind. 3 failures

## 2. Fix A: freshness-regen.yml — GPG-Step entfernen

- [x] 2.1 Öffne `.github/workflows/freshness-regen.yml`, entferne den Schritt "Import GPG key for commit signing" (Step mit `uses: crazy-max/ghaction-import-gpg@d46b8ef5e6e7b4d1a8ef73f09f7a7d5e26fccc07`) vollständig — alle 7 Zeilen des Steps inkl. `with:`-Block
- [x] 2.2 Stelle sicher, dass der folgende "Commit and push if changed"-Step erhalten bleibt und keine `git config commit.gpgsign`-Zeile enthält (keine Signing-Config nötig)
- [x] 2.3 Verifiziere: `grep -c "ghaction-import-gpg" .github/workflows/freshness-regen.yml` → muss 0 ergeben; Test G-CI01-A ist jetzt grün

## 3. Fix B: website/Dockerfile — npm→pnpm Migration

- [x] 3.1 Öffne `website/Dockerfile`, ersetze im Build-Stage den npm-Install-Block:
  ```
  # Ersetze:
  COPY website/package.json website/package-lock.json ./
  RUN --mount=type=cache,target=/root/.npm npm ci

  # Durch:
  RUN npm install -g pnpm@10
  COPY website/package.json website/pnpm-lock.yaml ./
  RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
  ```
- [x] 3.2 Ersetze im Build-Stage `RUN npm run build` durch `RUN pnpm build`
- [x] 3.3 Ersetze `RUN npm prune --omit=dev` durch `RUN pnpm prune --prod`
- [x] 3.4 Verifiziere: `grep "package-lock.json" website/Dockerfile` → kein Match; Tests G-CI01-B und G-CI01-C sind grün

## 4. OpenSpec SSOT-Update

- [x] 4.1 Öffne `openspec/specs/ci-cd.md`, füge am Ende (oder in der relevanten Sektion) zwei neue Requirements ein:
  - "Requirement: Post-merge Freshness-Regenerierung ohne externe GPG-Action" (aus `specs/ci-cd/spec.md`)
  - "Requirement: Website Dockerfile verwendet pnpm als Package-Manager" (aus `specs/ci-cd/spec.md`)
  - Inkl. der zugehörigen BATS-Scenarios aus dem Delta-Spec

## 5. Ticket-Referenz in der openspec change eintragen

- [x] 5.1 Schreibe die Ticket-ID `T001279` in `.ticket`-Datei: `echo "T001279" > openspec/changes/g-ci01-pipeline-stability/.ticket`

## 6. Verifikation & CI-Gate

- [x] 6.1 Alle G-CI01 BATS-Tests sind grün: `bats tests/spec/ci-cd.bats -f "G-CI01"`
- [ ] 6.2 Führe `task test:changed` aus — muss grün sein (BATS-Unit + openspec)
- [ ] 6.3 Führe `task freshness:regenerate` aus — muss ohne Fehler abschließen
- [ ] 6.4 Führe `task freshness:check` aus — muss grün sein (kein Freshness-Ratchet-Fehler)
- [ ] 6.5 Führe `bash scripts/openspec.sh validate` (oder `task test:openspec`) aus — muss grün sein
- [ ] 6.6 Commit & Push auf `fix/g-ci01-pipeline-stability`; PR öffnen mit Titel `fix(ci): stabilize freshness-regen GPG + Dockerfile pnpm migration [T001279]`
