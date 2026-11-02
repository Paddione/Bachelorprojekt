# Task 5 — Watchdog #7050: priorisierte Liste (nur Inventur, kein Einbau)

Stand: 2026-11-02. Quelle: Issue #7050 (`version-watchdog`-Marker, Lauf
systemd-Timer 2026-11-02, erzeugt von `scripts/version_watchdog.py`).
Entscheidung 5a: KEIN Einspielen in diesem Plan (kein Image-Pin-Update,
kein npm-Eingriff, kein `gh`-Write).

## Fällige Updates

| Kategorie | patch | minor | major | Bemerkung |
|---|---|---|---|---|
| Images | — | — | — | Tabelle leer: nichts faellig |
| GitHub Actions | — | — | — | Tabelle leer: nichts faellig |
| npm | — | — | — | Tabelle leer: nichts faellig |

D. h. die priorisierte Liste ist leer — es gibt nichts zu priorisieren.

## Zur Kenntnis (kein Handlungsbedarf in diesem Goal)

- Noch zu jung (< 3 Tage, bewusst zurueckgehalten): `mailpit` v1.32.0→v1.33.0
  (2d), `ntfy` v2.34.0→v2.36.0 (1d), `alpine/k8s` 1.37.1→1.37.2 (1d, mehrfach),
  div. npm-Pakete (`@mistralai/mistralai`, `@tanstack/react-query`,
  `i18next*`, `jose`, `lucide-react`, `motion`, `openai`, `react-i18next`,
  `react-resizable-panels`, `react-window`, `ws`).
- Uebersprungen (Env-Platzhalter, nicht aufloesbar): 5.
- Nicht automatisch bewertbar (latest-Tags, Digest-only, keine Registry-Daten):
  ~35 Eintraege, u. a. `pocket-id:v2.18.0` (keine Registry-Daten — fuer #7059
  irrelevant, da Fix im Seed-Parse liegt, nicht im Pin).
- Alter/Blocker-Risiko fuer Spec/Guards: keins — bei leerer Faellig-Tabelle
  geht von #7050 kein Spec/Guards-Risiko aus.

## CI-Bezug (reine Korrelationsnotiz, keine Kausalaussage)

- `gh run list --branch main --limit 12`: juengste Runs (b68e874, #7064,
  05:54Z) alle `success`, inkl. Workflow `CI`. Aelterer Run (a445e9f):
  `Release Please failure` (einzelner Workflow, kein Spec/Guards-Signal).
- #7066 (Spec + Guards @ 68562fd, Shards 1/3) liegt vor diesen Runs und ist
  auf aktuellem main nicht mehr reproduzierbar sichtbar; die Watchdog-Tabellen
  sind leer, daher kann #7050 das #7066-Rot weder erklaeren noch miterklaeren.
  Keine Kausalaussage ohne Beleg.
