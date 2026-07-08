---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-08
---

# Coaching-KI: LM-Studio-Modelle dynamisch auswählbar + PII-Scrubber — Design

## Kontext & Problem

Die Coaching-Sessions-KI-Integration (`session-agent-factory` → `OpenAICompatibleSessionAgent`
→ LM Studio via `llm-gateway-lmstudio`) hat zwei Lücken:

1. **Modell-Auswahl:** `modelName` ist ein reines Freitext-Feld in
   `CoachingSettings.svelte` / `KiCoachingDrawer.svelte`. Die in LM Studio installierten
   Modelle (`/v1/models`) werden nirgends als Auswahl angeboten. Zusätzlich blockiert
   `api/admin/coaching/ki-config/active.ts` mit der hartkodierten Liste
   `['openai','mistral','lumo']` das Aktivieren von `local-lmstudio`-Konfigurationen.
2. **PII in Prompts:** Die bestehende Pseudonymisierung (`{{KLIENT_ID}}` →
   `customerNumber` in `generate.ts`) ist strukturell, nicht erzwungen. Coach-Freitexte
   (`coachInputs`, `project.kiContext`) fließen ungefiltert in System-/User-Prompt; ein
   getippter Klarname erreicht das LLM. Kein Test sichert die Garantie „kein Kundenname
   im Prompt" ab.

## Entscheidungen (Brainstorming 2026-07-08, User-bestätigt)

- **Modell-Liste:** Live-Abfrage von `/v1/models` + Freitext-Fallback (kein statischer
  Katalog-Ausbau, kein Merge-Hybrid).
- **PII-Schutz:** Deterministischer Scrubber am Chokepoint (stille Ersetzung durch
  Pseudonym), kein Blockieren des Workflows, kein NER.

## Architektur

### Teil 1 — Dynamische Modell-Auswahl

**Neuer purer Helper `website/src/lib/llm-models-probe.ts`:**
- `fetchModelIds(baseUrl: string, timeoutMs?: number): Promise<{ reachable: boolean; models: string[] }>`
  — GET `<baseUrl>/models`, parst OpenAI-Format `body.data[].id`. Extrahiert die heute in
  `api/admin/ki/env-status.ts` duplizierte Logik; `env-status.ts` konsumiert den Helper
  (S2: pures Modul, keine DB-/API-Imports).

**Neuer Endpoint `GET /api/admin/coaching/ki-config/models?id=<configId>`:**
- Lädt die KiConfig-Zeile, löst die Base-URL analog `resolveEndpoint()`
  (`openai-compatible-session-agent.ts`) auf: `apiEndpoint` aus DB → Provider-Default via
  `LLM_HOST_IP`. Die Endpoint-Auflösung wird dazu aus dem Agent exportiert oder in einen
  gemeinsamen Helper gezogen — keine Kopie.
- Antwort: `{ reachable: boolean, models: string[] }`. Timeout kurz (~2 s), Fehler ⇒
  `reachable: false, models: []` (nie 5xx an die UI).
- Admin-Auth wie die übrigen `ki-config`-Endpoints.

**UI (`CoachingSettings.svelte` + `KiCoachingDrawer.svelte`):**
- `modelName`-`<input>` erhält `list="..."` auf eine `<datalist>`, die beim Öffnen der
  Konfiguration bzw. Provider-Wechsel via neuen Endpoint befüllt wird.
- `reachable: false` ⇒ Datalist leer, dezenter Hinweis („Modell-Liste nicht abrufbar —
  Modell-ID manuell eintragen"); Freitext bleibt immer möglich.

**Bugfix `ki-config/active.ts`:**
- Hartkodierte Allowed-Liste durch die Provider-IDs aus `ki-catalog.ts`
  (`KI_CATALOG.map(i => i.id)` + `custom_*`-Präfix) ersetzen, sonst bleibt
  `local-lmstudio` nicht aktivierbar.

### Teil 2 — PII-Scrubber

**Neuer purer Helper `website/src/lib/prompt-scrubber.ts`:**
- `scrubClientPii(text: string, opts: { names: string[]; emails?: string[]; replacement: string }): string`
- Ersetzt case-insensitiv: vollständige Namen, einzelne Namensbestandteile ≥ 3 Zeichen
  (Wortgrenzen, Umlaut-sicher), E-Mail-Adressen. Ersetzung durch `customerNumber` bzw.
  `[KLIENT]` wenn keine vorhanden. Keine False-Positives auf Substrings innerhalb
  längerer Wörter.

**Einhängung (einzige Stelle):** `api/admin/coaching/sessions/[id]/steps/[n]/generate.ts`
unmittelbar vor `createSessionAgent(...).generate/stream` — auf `effectiveSystem` UND
`anonymizedUserPrompt`. Quellen der Namen: `coachingSession.clientName` + Name/E-Mail des
verknüpften `customers`-Datensatzes (via `clientId`).

### Nicht-Ziele
- Kein Laufzeit-Blockieren der Generierung bei PII-Fund.
- Kein Ausbau von `ki-catalog.ts` um konkrete Modell-Einträge.
- Keine Änderungen am globalen (Nicht-Coaching-)LLM-Pfad (`provider-config.ts`,
  `assistant/llm.ts`).

## Abgrenzung zur Parallel-Session (T001638)

`feature/coaching-sessions-admin-ux` (in Umsetzung) berührt `AdminSidebarNav.astro`,
`admin.astro`, `helpContent.ts`, `coaching-session-db.ts`, Sessions-Detailseiten/Popout.
**Dieser Change fasst keine dieser Dateien an.** Insbesondere: Namen für den Scrubber
werden über bestehende Getter (`getCoachingSession`, Customer-Lookup) gelesen — keine
Signatur-Änderung in `coaching-session-db.ts`.

## Fehlerbehandlung

- Models-Endpoint: Netzwerk-/Timeout-Fehler ⇒ `{ reachable: false, models: [] }`, UI
  degradiert zu Freitext. Keine stillen Catch-Blöcke ohne Signal (`reachable`-Flag ist
  das Signal).
- Scrubber: läuft immer; leere Namensliste ⇒ Identity-Funktion. Scrubbing-Fehler dürfen
  die Generierung nicht crashen lassen (defensiv, aber geloggt).

## Testing

- `prompt-scrubber.test.ts`: Vollname, Teilname, Umlaute, Mehrfachvorkommen,
  Wortgrenzen (kein Treffer in „Beispielhannes" bei Name „Hannes"), E-Mail, leere Liste.
- `llm-models-probe.test.ts`: OpenAI-Format-Parsing, Timeout/Netzfehler ⇒
  `reachable:false`.
- `ki-config/models`-Endpoint-Test: Auth, Endpoint-Auflösung aus Config, Fehlerpfad.
- `active.ts`: Test, dass `local-lmstudio` jetzt aktivierbar ist.
- Regression auf `generate.ts`-Ebene: `clientName` erreicht den Agent-Call nie
  (schließt die bestehende Coverage-Lücke).
- Bestehende Tests (`openai-compatible-session-agent.test.ts`, `ki-catalog.test.ts`,
  `env-status.test.ts`) bleiben grün.
