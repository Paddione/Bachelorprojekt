# Proposal: coaching-ki-model-select

## Why

Die Coaching-Sessions-KI hat zwei Lücken: (1) Das LLM-Modell ist ein Freitext-Feld —
die in LM Studio installierten Modelle (`/v1/models`) werden nirgends zur Auswahl
angeboten, und die hartkodierte Provider-Allowlist in `ki-config/active.ts`
(`['openai','mistral','lumo']`) verhindert sogar das Aktivieren von
`local-lmstudio`-Konfigurationen. (2) Die Prompt-Pseudonymisierung
(`{{KLIENT_ID}}` → `customerNumber`) ist strukturell, nicht erzwungen:
Coach-Freitexte (`coachInputs`, `project.kiContext`) fließen ungefiltert in die
Prompts — ein getippter Kundenname erreicht das LLM, und kein Test sichert die
Garantie „kein Kundenname im Prompt" ab (DSGVO-Risiko).

## What

1. **Dynamische Modell-Auswahl:** Neuer purer Helper `llm-models-probe.ts`
   (extrahiert die `/v1/models`-Fetch-Logik aus `env-status.ts`), neuer Endpoint
   `GET /api/admin/coaching/ki-config/models?id=<configId>` (Endpoint-Auflösung wie
   `resolveEndpoint()`, Antwort `{ reachable, models }`, nie 5xx), `<datalist>`-
   Anbindung des `modelName`-Feldes in `CoachingSettings.svelte` (zeilenneutral,
   S1-Budget 0) und `KiCoachingDrawer.svelte` mit Freitext-Fallback bei
   Nichterreichbarkeit. Bugfix: `active.ts`-Allowlist aus `KI_CATALOG`-IDs +
   `custom_*` ableiten.
2. **PII-Scrubber:** Neuer purer Helper `prompt-scrubber.ts`
   (`scrubClientPii(text, { names, emails, replacement })` — case-insensitiv,
   Wortgrenzen, Umlaut-sicher, Namensbestandteile ≥ 3 Zeichen), eingehängt am
   Chokepoint in `generate.ts` unmittelbar vor dem Agent-Call auf System- UND
   User-Prompt; Namen aus `coachingSession.clientName` + verknüpftem
   `customers`-Datensatz, Ersetzung durch `customerNumber` bzw. `[KLIENT]`.
   Regression-Tests sichern die Garantie ab.

**Abgrenzung:** Keine Datei-Überlappung mit T001638
(`feature/coaching-sessions-admin-ux`); keine DB-Schema-Änderung; kein Eingriff in
den globalen (Nicht-Coaching-)LLM-Pfad.

_Ticket: T001641_
_Spec: docs/superpowers/specs/2026-07-08-coaching-ki-model-select-design.md_
