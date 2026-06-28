# Proposal: g-dora03-cfr-policy

_Ticket: T001300_

## Why

Die Change Failure Rate (CFR) ist eine der vier DORA-Kernmetriken. Sie misst, wie viele Deployments / Merges einen Fehler einführen, der repariert werden muss. Das Projekt liegt aktuell bei **15.9 % breit** (Proxy: `fix()`-Commits als Anteil aller Merges nach `main` der letzten 8 Wochen) — knapp über dem Elite-Schwellenwert von ≤ 15 %. Die strikte Revert-Rate ist 0 %, d. h. kein Merge wurde tatsächlich reverted; die breite Rate spiegelt stattdessen Korrektheit-Nacharbeiten wider, die als `fix()`-Commits sichtbar sind.

Jeder `fix()`-Commit über das Elite-Limit hinaus ist ein Signal, dass entweder CI nicht ausreichend schützt oder Bug-Triage nicht konsistent betrieben wird: Defekte gelangen nach `main`, werden erst danach als Fixes sichtbar. Sinkt die breite CFR unter 15 %, bestätigt das, dass CI-Gates und Triage-Disziplin gemeinsam greifen.

Das Ziel ist nicht, `fix()`-Commits per Convention zu unterdrücken, sondern echte Regression-Reduktion zu erreichen: durch konsequentere Bug-Erfassung im Ticket-System, CI-Gates (insbesondere `astro check` aus T001277) die Typ-Regressionen abfangen, und stabilere Tests (G-CI01), die fehlerhafte Merges durch Flakiness verhindern.

## What

Es werden drei Maßnahmen umgesetzt:

**1. CI — `astro check` als Pflicht-Gate** (`.github/workflows/ci.yml`): Sicherstellen, dass der in T001277 hinzugefügte `astro check`-Step korrekt konfiguriert ist und bei Typ-/Template-Regressionen den PR blockiert. Der Step muss als required check in den Branch-Protection-Rules geführt werden. Dieses Gate verhindert eine Klasse von `fix()`-Commits, die aus TypeScript-/Astro-Typ-Fehlern entstehen, die erst nach Merge auffallen.

**2. Mess-Command dokumentieren und im CI verfügbar machen** (`scripts/vda.sh`): Der Measure-Command wird als aufrufbares Subcommand in `scripts/vda.sh` registriert, damit er reproduzierbar — ohne Memorisierung — von jedem Agent oder Entwickler ausgeführt werden kann. Das Ergebnis wird dem DORA-Dashboard in `/admin/dora` als `cfr_broad_proxy` exponiert, sodass der Wert im DORA-Dashboard (`T001092`) sichtbar ist.

**3. Triage-Konvention etablieren** (CLAUDE.md / development rules): Bugs die nach Merge entdeckt werden, werden ab sofort als `type=bug`-Ticket erfasst und in der nächsten Factory-Runde repariert — nicht als stiller `fix()`-Commit ohne Ticket-Referenz. Die Konvention wird in `CLAUDE.md` als Coding-Regel dokumentiert.

## Impact

**Neue/geänderte Dateien:**
- `.github/workflows/ci.yml` — `astro check`-Step als required-Gate absichern (Annotation prüfen + Job-Abhängigkeit)
- `scripts/vda.sh` — neues `cfr` Subcommand, das den Measure-Command kapselt und das Ergebnis als Text ausgibt
- `CLAUDE.md` — Abschnitt „Bug-Triage-Konvention" ergänzen

**Risiken:**
- Der `astro check`-Step kann legitime Warnings als Errors behandeln, wenn `tsconfig.json` zu strikt konfiguriert ist. Vor der Aktivierung als required check wird gegen den aktuellen `main`-Stand geprüft.
- Der breite CFR-Proxy (`fix()`-Rate) misst Commit-Convention-Disziplin, nicht echte Produktionsfehler. Eine Rate von 0 % wäre ein Signal für disziplinlose Benennung, nicht für Exzellenz. Das Ziel ist ≤ 15 %, nicht 0 %.

**Out of Scope:**
- Änderungen an der DORA-Dashboard-Implementierung (gehört zu T001092 / `dora-delivery-pipeline`).
- Automatische CFR-Berechnung in der Datenbank oder als neue View — das übernimmt `dora-metrics.ts` aus T001092.
- Flaky-Test-Behebung im Detail — das ist das separate Ziel G-CI01.
- Strict-CFR (Revert-basiert) — aktuell 0 %, kein Handlungsbedarf.
