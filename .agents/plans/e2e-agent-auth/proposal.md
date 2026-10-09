# Proposal: e2e-agent-auth

Ticket: T901647 · Slug: `e2e-agent-auth` · Pfad: feature

## WARUM

2 der 7 kuratierten Vision-Agent-Flows (`content-hub-editor`,
`admin-inbox-renders`) brauchen eine Admin-Sitzung. Der Runner kennt kein
Auth: Beide Flows sind 0/6 und messen nur Fail-Verhalten statt Agenten-
Qualität. Die Scripted-Welt hat das gelöst (`.auth/*.json` per Setup-Spec,
in `playwright.config.ts` referenziert) — der Runner soll dasselbe Muster
nutzen.

## WAS (MVP-Schnitt, entschieden)

1. **Runner `--auth <pfad>` + Env `AGENT_AUTH_STATE`**: Bei Angabe wird der
   Browser-Kontext mit `storageState` gestartet; die JSONL-Records halten
   fest, ob mit Auth gelaufen wurde. Kein Default (fail-closed: ohne Angabe
   läuft anonym).
2. **Curated-Auth-Marker**: Optionales Feld `"auth": true` an den beiden
   Admin-Flows; Runner bricht solche Flows mit klarer Meldung ab, wenn kein
   `--auth` übergeben wurde (kein stilles Herumwandern, kein falsches Pass).
3. **Schema-Validierung nach `oracle.mjs`**: `validateFlows(flows)` als pure
   exportierte Funktion (prüft u. a. Marker-Typen), Runner importiert sie —
   dadurch testbar ohne Browser.
4. **Runbook-Abschnitt**: Auth-State erzeugen via bestehendem
   `mentolder-setup`-Projekt, Datei nie committen (`.auth/` ist
   git-ignoriert — verifizieren), Bench mit/ohne Auth sauber trennen.
5. **Tests**: `oracle.test.mjs` um Validierungsfälle erweitern
   (Marker-Typen, fehlende Datei-Fehlermeldung als Unit auf
   Validierungsebene, kein Browser).

## Nicht-Ziele (MVP)

- Kein Login-Flow im Runner (keine Credentials im Harness, kein
  Auto-Login) — State kommt immer aus einer Datei.
- Keine CI-Integration mit Secrets (Nightly läuft vorerst anonym; das ist
  Schritt 6, bewusst getrennt).
- Keine neuen kuratierten Flows.

## Risiken

- `.auth/*.json` enthält Session-Cookies → striktes Nicht-Committen
  (git-crypt-Staging-Guard + Review); Doku warnt explizit.
- Zusatz-Flag erhöht CLI-Komplexität minimal (1 Flag + 1 Env, Muster wie
  `--model`/`AGENT_MODEL_URL`).
