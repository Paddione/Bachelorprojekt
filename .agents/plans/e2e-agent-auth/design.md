---
ticket_id: T901647
plan_ref: .agents/plans/e2e-agent-auth/tasks.md
status: active
date: 2026-10-09
---

# Design: e2e-agent-auth

Architektur-Spec (2026-10-09). Normative Details in `tasks.md` + Partials.

## Entschiedene Architektur

**Runner konsumiert fertige States, erzeugt keine.** Keine Credentials,
kein Login-Code im Harness — Auth kommt ausschließlich aus einer
`storageState`-Datei, erzeugt vom bestehenden `mentolder-setup`-Projekt.
Fail-closed: Auth-Flow ohne State bricht mit Meldung ab statt zu wandern.

## Modul-Schnitt (alles Edits, keine neuen Dateien)

```text
tests/e2e/agent/runner.mjs       # + --auth-Flag, AGENT_AUTH_STATE, context({storageState}), JSONL-Feld authUsed
tests/e2e/agent/oracle.mjs       # + export validateFlows(flows): Schema + Marker-Typen, pure Funktion
tests/e2e/agent/curated.json     # + "auth": true an content-hub-editor, admin-inbox-renders
tests/e2e/agent/oracle.test.mjs  # + Validierungsfälle (node --test, kein Browser)
docs/runbooks/e2e-vision-agents.md  # + Auth-Abschnitt (Erzeugen, Nicht-Committen, Bench-Trennung)
```

## Kontrakte

- CLI: `--auth <pfad>` (Default: `AGENT_AUTH_STATE` oder keines). Pfad muss
  existieren und valides JSON sein, sonst Startabbruch mit klarem Fehler
  (kein stiller Anonymous-Fallback bei Auth-Flows).
- Curated: `"auth": true` (optional, Default false). Flow mit Marker ohne
  State → Record `{pass:false, error:"auth-required"}` in 0 Turns.
- JSONL: neues Feld `authUsed: true|false` je Run (Bench-Trennung
  anonym/auth messbar).
- Validierung: `validateFlows` wirft `Error` mit Flow-ID bei Schema-
  Verstoß (unbekannte Check-Typen, `auth` nicht-boolean, leere Checks);
  Runner ruft sie beim Start auf (fail-fast vor dem ersten Browser).

## Test-Strategie

- `oracle.test.mjs` (bestehend, erweitern): `validateFlows`-Fälle
  (gültig/ungültig je Regel), `auth`-Marker-Typprüfung, Fehlermeldungen
  enthalten Flow-ID. Alles ohne Browser.
- Rot→grün-Nachweis (`expected: FAIL` + `node --test`).
- Live-Smoke (1 Auth-Flow/1 Rep mit State) als manueller Verify-Step im
  Execute, kein CI-Gate.

## Referenzen (exploriert, A.1)

- `tests/e2e/specs/global-setup.ts:80` (`.auth/user.json`-Erzeugung),
  `playwright.config.ts:148,234` (storageState-Referenzen),
  `specs/brett-mentolder-auth-setup.spec.ts:63`
- `tests/e2e/agent/runner.mjs` (255 Zeilen, CLI-/Loop-Struktur),
  `oracle.mjs` (72 Zeilen, Check-Typen), `oracle.test.mjs` (11 Tests)
