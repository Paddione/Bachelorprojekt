# Partial p4 — Tests: BATS + Vitest für die Stil-Datenbank
**Role:** tests | **Ticket:** T002468 | **Depends:** p3

> Letztes Partial — STRUCT2-Partial. Der Failing-Test-Step (RED) wird zuerst
> angelegt und muss auf dem aktuellen Branch fehlschlagen, weil die
> Stil-Datenbank noch nicht existiert.

Neue Dateien: `tests/spec/sdlc-cockpit/k9-stil-datenbank.bats`, `tests/unit/cockpit-styles.test.ts`

## RED — Failing-Test-Step

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/k9-stil-datenbank.bats
# expected: FAIL (Datenebene .lavish/styles/ existiert noch nicht — die
# Schema-/D14-Assertions schlagen fehl)
```

## BATS — `tests/spec/sdlc-cockpit/k9-stil-datenbank.bats`

Ablage-Konvention: ein Verzeichnis pro SSOT-Spec, eine Datei pro Vorgang (T002416).

1. **Schema-Validität**: alle `*.json` in `.lavish/styles/` (außer `schema.json`,
   `index.json`, `README.md`) validieren mit jq gegen `schema.json` (Pflichtfelder,
   `additionalProperties: false`).
2. **D14-Negativtest mit Positiv-Anker (T002356-M1)**: erst prüfen, dass
   mindestens ein Eintrag existiert und gültig ist (Anker), dann negativ:
   kein `token_bezuege`-Wert und kein `beleg_ausschnitt` enthält feste
   Hex-/Pixel-Werte (`#[0-9a-fA-F]{3,8}` oder `\d+(px|pt|em|rem)`), nur
   `--lv-*`/`--color-*`-Tokens.
3. **Daemon-Route** (skippt ohne laufenden Daemon — K2-Konvention): falls
   `curl 127.0.0.1:49152/api/cockpit/styles` erreichbar, muss die Antwort
   `entries` + `fetchedAt` enthalten; sonst `skip`.

## Vitest — `tests/unit/cockpit-styles.test.ts`

Adapter `data.styles()` (import aus `../../.lavish/kit/adapter.js`, Vitest-Konvention
der bestehenden cockpit-Panel-Tests):

- Liefert `{ entries, fetchedAt }` bei erfolgreichem Fetch (mock)
- D13-Fehlerpfad: bei nicht erreichbarer Quelle `{ error, fetchedAt }`, nie
  `undefined`/`null`-Messwert

## GREEN

Nach p1–p3 müssen alle BATS- und Vitest-Tests grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/k9-stil-datenbank.bats
npx vitest run tests/unit/cockpit-styles.test.ts
```

## Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Acceptance

- BATS-RED nachgewiesen vor der Implementierung (p1–p3)
- Alle Tests grün nach p3; D14-Negativtest hat Positiv-Anker
- Daemon-BATS skippt sauber ohne laufenden Daemon
