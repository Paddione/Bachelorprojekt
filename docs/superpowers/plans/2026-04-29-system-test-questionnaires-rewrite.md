# System-Test Questionnaires Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2 mashed-up system-test templates (40 steps, role-split) with 10 domain-scoped templates (89 steps, full coverage of bookkeeping requirements A-01..A-15, B-01..B-11, C-01..C-13).

**Architecture:** Extract test-step content from the inline seeder in `questionnaire-db.ts` into a pure data module (`system-test-seed-data.ts`). The seeder iterates the data module and inserts. URLs resolve `${DOMAIN}` against `process.env.PROD_DOMAIN` (fallback `localhost`) so prod links work.

**Tech Stack:** TypeScript, Vitest, PostgreSQL 16, Astro 5, existing `questionnaire-db.ts` patterns.

**Spec:** [`docs/superpowers/specs/2026-04-29-system-test-questionnaires-rewrite-design.md`](../specs/2026-04-29-system-test-questionnaires-rewrite-design.md)

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `website/src/lib/system-test-seed-data.ts` | **Create** | Pure data module: 10 templates × steps + `resolveDomain()` helper |
| `website/src/lib/system-test-seed-data.test.ts` | **Create** | Vitest invariants: 10 templates, 89 steps, full req coverage, valid roles/URLs |
| `website/src/lib/questionnaire-db.ts` | **Modify** | Replace inline `seedSystemTestTemplates()` body with iteration over the data module |

---

## Task 1: Test-driven scaffolding for the seed-data module

**Files:**
- Create: `website/src/lib/system-test-seed-data.ts`
- Test: `website/src/lib/system-test-seed-data.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `website/src/lib/system-test-seed-data.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { SYSTEM_TEST_TEMPLATES, resolveDomain } from './system-test-seed-data';

const REQUIRED_REQ_IDS = [
  ...Array.from({ length: 15 }, (_, i) => `A-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 11 }, (_, i) => `B-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 13 }, (_, i) => `C-${String(i + 1).padStart(2, '0')}`),
];

const EXPECTED_STEP_COUNTS = [6, 10, 5, 5, 5, 12, 16, 14, 6, 10];

describe('system-test-seed-data', () => {
  it('exports exactly 10 templates', () => {
    expect(SYSTEM_TEST_TEMPLATES).toHaveLength(10);
  });

  it('per-category step counts match the spec', () => {
    const counts = SYSTEM_TEST_TEMPLATES.map(t => t.steps.length);
    expect(counts).toEqual(EXPECTED_STEP_COUNTS);
  });

  it('totals 89 steps across all templates', () => {
    const total = SYSTEM_TEST_TEMPLATES.reduce((sum, t) => sum + t.steps.length, 0);
    expect(total).toBe(89);
  });

  it('every template has non-empty title/description/instructions', () => {
    for (const t of SYSTEM_TEST_TEMPLATES) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.instructions.length).toBeGreaterThan(0);
    }
  });

  it('every step has non-empty question_text and expected_result', () => {
    for (const t of SYSTEM_TEST_TEMPLATES) {
      for (const s of t.steps) {
        expect(s.question_text.length).toBeGreaterThan(0);
        expect(s.expected_result.length).toBeGreaterThan(0);
      }
    }
  });

  it('every step has a valid test_role', () => {
    for (const t of SYSTEM_TEST_TEMPLATES) {
      for (const s of t.steps) {
        expect(['admin', 'user']).toContain(s.test_role);
      }
    }
  });

  it('every step URL is either a relative admin/portal path or an absolute https URL', () => {
    for (const t of SYSTEM_TEST_TEMPLATES) {
      for (const s of t.steps) {
        const ok = s.test_function_url.startsWith('/') || s.test_function_url.startsWith('https://');
        expect(ok, `bad URL in template "${t.title}": ${s.test_function_url}`).toBe(true);
      }
    }
  });

  it('covers every bookkeeping requirement (A-01..A-15, B-01..B-11, C-01..C-13)', () => {
    const allText = SYSTEM_TEST_TEMPLATES.flatMap(t =>
      t.steps.flatMap(s => [s.question_text, s.expected_result, s.req_ids?.join(',') ?? '']),
    ).join('\n');
    const missing = REQUIRED_REQ_IDS.filter(id => !allText.includes(id));
    expect(missing, `missing requirement coverage: ${missing.join(', ')}`).toEqual([]);
  });

  describe('resolveDomain()', () => {
    let originalDomain: string | undefined;
    beforeEach(() => { originalDomain = process.env.PROD_DOMAIN; });
    afterEach(() => {
      if (originalDomain === undefined) delete process.env.PROD_DOMAIN;
      else process.env.PROD_DOMAIN = originalDomain;
    });

    it('falls back to "localhost" when PROD_DOMAIN is unset', () => {
      delete process.env.PROD_DOMAIN;
      expect(resolveDomain()).toBe('localhost');
    });

    it('returns PROD_DOMAIN when set', () => {
      process.env.PROD_DOMAIN = 'mentolder.de';
      expect(resolveDomain()).toBe('mentolder.de');
    });

    it('falls back to "localhost" when PROD_DOMAIN is empty string', () => {
      process.env.PROD_DOMAIN = '';
      expect(resolveDomain()).toBe('localhost');
    });
  });
});
```

- [ ] **Step 1.2: Run the test and verify it fails**

Run:
```bash
cd website && npx vitest run src/lib/system-test-seed-data.test.ts
```

Expected: FAIL with `Cannot find module './system-test-seed-data'` (the module doesn't exist yet).

- [ ] **Step 1.3: Create the seed-data module — types, helper, empty templates array**

Create `website/src/lib/system-test-seed-data.ts`:

```typescript
export type TestRole = 'admin' | 'user';

export interface SystemTestStep {
  question_text: string;
  expected_result: string;
  test_function_url: string;
  test_role: TestRole;
  /** Optional bookkeeping requirement IDs covered (e.g. ["A-02", "A-04"]). */
  req_ids?: string[];
}

export interface SystemTestTemplate {
  title: string;
  description: string;
  instructions: string;
  steps: SystemTestStep[];
}

export function resolveDomain(): string {
  const d = process.env.PROD_DOMAIN;
  return d && d.length > 0 ? d : 'localhost';
}

const D = resolveDomain();

export const SYSTEM_TEST_TEMPLATES: SystemTestTemplate[] = [];
```

- [ ] **Step 1.4: Run the test — verify the failures shift**

Run: `cd website && npx vitest run src/lib/system-test-seed-data.test.ts`
Expected: All structural tests fail (`expect(SYSTEM_TEST_TEMPLATES).toHaveLength(10)` etc.); `resolveDomain` tests pass.

- [ ] **Step 1.5: Add Template 1 — Authentifizierung & SSO (6 steps)**

Append to `system-test-seed-data.ts` after the empty array (replacing the `[]`):

```typescript
export const SYSTEM_TEST_TEMPLATES: SystemTestTemplate[] = [
  {
    title: 'System-Test 1: Authentifizierung & SSO (Keycloak)',
    description: 'End-to-End-Test aller Single-Sign-On-Flows: Admin-Anmeldung, Portal-Anmeldung, Konto-Verwaltung und SSO in alle externen Dienste.',
    instructions: 'Führe die Schritte in zwei separaten Browser-Profilen aus (Admin + Testnutzer). Wähle pro Schritt das Ergebnis und trage Auffälligkeiten in das Detailfeld ein.',
    steps: [
      { question_text: 'Admin-SSO-Login durchführen',
        expected_result: 'Weiterleitung zu /admin nach Keycloak-Authentifizierung; Session-Cookie gesetzt; Logout-Button im Header sichtbar.',
        test_function_url: '/admin', test_role: 'admin' },
      { question_text: 'Keycloak-Account-Verwaltung als Admin öffnen',
        expected_result: 'Profil-Daten ladbar; Sitzungen-Liste zeigt aktive Sessions; Passwort-Änderung zugänglich.',
        test_function_url: `https://auth.${D}/realms/workspace/account`, test_role: 'admin' },
      { question_text: 'Testnutzer per Keycloak SSO im Portal anmelden',
        expected_result: 'Login-Flow läuft durch; Weiterleitung zu /portal; Profilname stimmt mit Testnutzer überein.',
        test_function_url: '/portal', test_role: 'user' },
      { question_text: 'Nextcloud per Keycloak SSO öffnen (als Testnutzer)',
        expected_result: 'Automatischer Login ohne erneute Eingabe; Dateiansicht lädt vollständig.',
        test_function_url: `https://files.${D}`, test_role: 'user' },
      { question_text: 'Vaultwarden per Keycloak SSO öffnen (als Testnutzer)',
        expected_result: 'Automatischer Login; Passwort-Tresor wird geladen.',
        test_function_url: `https://vault.${D}`, test_role: 'user' },
      { question_text: 'DocuSeal per Keycloak SSO öffnen (als Testnutzer)',
        expected_result: 'Automatischer Login; Dokumentenliste sichtbar.',
        test_function_url: `https://sign.${D}`, test_role: 'user' },
    ],
  },
];
```

- [ ] **Step 1.6: Add Template 2 — Admin-Verwaltung & CRM (10 steps)**

Append to the `SYSTEM_TEST_TEMPLATES` array (inside the brackets, after Template 1):

```typescript
  {
    title: 'System-Test 2: Admin-Verwaltung & CRM',
    description: 'Funktionstest der zentralen Admin-Workflows: Dashboard, Clients, Meetings, Termine, Projekte, Kalender, Inbox und Einstellungen.',
    instructions: 'Alle Schritte mit dem Admin-Browser-Profil. Vorhandene Testdaten dürfen verwendet werden.',
    steps: [
      { question_text: 'Dashboard-KPIs aufrufen und prüfen',
        expected_result: 'KPIs (Clients, offene Bugs, Meetings, Rechnungen) laden ohne Fehler und zeigen plausible Werte.',
        test_function_url: '/admin', test_role: 'admin' },
      { question_text: 'Neuen Client anlegen',
        expected_result: 'Client erscheint in der Clientliste; Pflichtfelder werden serverseitig validiert; nach Reload weiterhin sichtbar.',
        test_function_url: '/admin/clients', test_role: 'admin' },
      { question_text: 'Client-Detailseite öffnen',
        expected_result: 'Reiter Stammdaten, Notizen, Fragebögen, Rechnungen ladbar; keine 500er.',
        test_function_url: '/admin/clients', test_role: 'admin' },
      { question_text: 'Meeting anlegen und speichern',
        expected_result: 'Meeting erscheint in der Meetingliste mit korrekten Datums- und Teilnehmerinfos.',
        test_function_url: '/admin/meetings', test_role: 'admin' },
      { question_text: 'Termin anlegen',
        expected_result: 'Termin wird gespeichert und ist in /admin/termine sowie im Kalender sichtbar.',
        test_function_url: '/admin/termine', test_role: 'admin' },
      { question_text: 'Projekt anlegen und einem Client zuordnen',
        expected_result: 'Projekt erscheint in /admin/projekte; Zuordnung zum Client in der Detailansicht sichtbar.',
        test_function_url: '/admin/projekte', test_role: 'admin' },
      { question_text: 'Admin-Kalender öffnen und Terminanzeige prüfen',
        expected_result: 'Kalender lädt; Termine + Meetings korrekt visualisiert (Monats-/Wochenansicht).',
        test_function_url: '/admin/kalender', test_role: 'admin' },
      { question_text: 'Inbox: ein Item als erledigt markieren',
        expected_result: 'Item wechselt den Status sofort; Inbox-Counter aktualisiert sich.',
        test_function_url: '/admin/inbox', test_role: 'admin' },
      { question_text: 'Admin-Einstellungen öffnen, Wert ändern und speichern',
        expected_result: 'Einstellung wird persistiert; nach Reload korrekt geladen.',
        test_function_url: '/admin/einstellungen', test_role: 'admin' },
      { question_text: 'Branding-Settings: Logo hochladen und speichern',
        expected_result: 'Logo erscheint im Admin-Header und auf der öffentlichen Website.',
        test_function_url: '/admin/einstellungen/branding', test_role: 'admin' },
    ],
  },
```

- [ ] **Step 1.7: Add Template 3 — Kommunikation: Inbox, Chat & E-Mail (5 steps)**

Append after Template 2:

```typescript
  {
    title: 'System-Test 3: Kommunikation — Inbox, Chat & E-Mail',
    description: 'End-to-End-Roundtrip Chat-Widget (Nutzer → Admin → Nutzer), E-Mail-Versand und Newsletter-Vorschau.',
    instructions: 'Schritte 1 + 3 im Testnutzer-Browser, Schritte 2/4/5 im Admin-Browser. Tab-Wechsel zwischen den Profilen.',
    steps: [
      { question_text: 'Im öffentlichen Chat-Widget als Testnutzer eine Nachricht senden',
        expected_result: 'Nachricht im Chatverlauf des Widgets sichtbar; Admin-Inbox zeigt sie sofort (Polling/Websocket).',
        test_function_url: `https://web.${D}`, test_role: 'user' },
      { question_text: 'Als Admin in der Inbox auf die Nachricht antworten',
        expected_result: 'Antwort gesendet; Admin-Inbox zeigt den Verlauf.',
        test_function_url: '/admin/inbox', test_role: 'admin' },
      { question_text: 'Im Testnutzer-Browser prüfen, ob die Admin-Antwort live erscheint',
        expected_result: 'Admin-Antwort ist im Chat-Widget des Nutzers ohne Seitenreload sichtbar.',
        test_function_url: `https://web.${D}`, test_role: 'user' },
      { question_text: 'E-Mail-Test: Termin-Bestätigung versenden',
        expected_result: 'Mailpit/Postfach zeigt eingehende Mail mit korrektem Branding und Pflichtangaben (Impressum-Link).',
        test_function_url: '/admin/termine', test_role: 'admin' },
      { question_text: 'Newsletter-Versand-Vorschau aufrufen',
        expected_result: 'HTML-Vorschau lädt; Header/Footer-Branding und Abmelde-Link sichtbar.',
        test_function_url: '/admin/newsletter', test_role: 'admin' },
    ],
  },
```

- [ ] **Step 1.8: Add Template 4 — Fragebogen-System (5 steps)**

Append after Template 3:

```typescript
  {
    title: 'System-Test 4: Fragebogen-System (Coaching-Workflow)',
    description: 'Vollständiger End-to-End-Workflow: Template anlegen → veröffentlichen → einem Client zuweisen → Nutzer füllt aus → Admin wertet aus → Test-Results-Panel.',
    instructions: 'Schritte 1, 2, 4, 5 im Admin-Browser, Schritt 3 im Testnutzer-Browser. Verwende ein neu angelegtes Test-Template, um vorhandene Daten nicht zu beeinflussen.',
    steps: [
      { question_text: 'Neues Coaching-Fragebogen-Template anlegen (Titel, mind. 1 Frage)',
        expected_result: 'Template wird gespeichert und erscheint in der Template-Liste als Draft.',
        test_function_url: '/admin/fragebogen', test_role: 'admin' },
      { question_text: 'Template veröffentlichen und einem Client zuweisen',
        expected_result: 'Assignment erstellt; Nutzer sieht Fragebogen im Portal-Dashboard (ggf. E-Mail-Benachrichtigung).',
        test_function_url: '/admin/clients', test_role: 'admin' },
      { question_text: 'Fragebogen im Portal vollständig ausfüllen und absenden',
        expected_result: 'Fragebogen-Status wechselt auf "submitted"; Bestätigungsseite erscheint.',
        test_function_url: '/portal', test_role: 'user' },
      { question_text: 'Admin: Auswertung in der Client-Detailansicht prüfen',
        expected_result: 'Antworten + Scoring-Dimensionen korrekt dargestellt; Coach-Notizen-Feld editierbar.',
        test_function_url: '/admin/clients', test_role: 'admin' },
      { question_text: 'Test-Results-Panel im Monitoring aufrufen',
        expected_result: 'Alle 10 System-Test-Templates sichtbar mit Last-Result/Last-Success-Status.',
        test_function_url: '/admin/monitoring', test_role: 'admin' },
    ],
  },
```

- [ ] **Step 1.9: Add Template 5 — Dokumente & DocuSeal-Unterschriften (5 steps)**

Append after Template 4:

```typescript
  {
    title: 'System-Test 5: Dokumente & DocuSeal-Unterschriften',
    description: 'Dokument-Editor, Inhalte-Editor und vollständiger DocuSeal-Signatur-Roundtrip (Versenden → Signieren → Verifizieren).',
    instructions: 'Schritte 1, 2, 3, 5 im Admin-Browser, Schritt 4 im Testnutzer-Browser.',
    steps: [
      { question_text: 'Dokument im Editor anlegen und Inhalt speichern',
        expected_result: 'Dokument wird gespeichert; nach Reload weiterhin lesbar; Versionshistorie sichtbar.',
        test_function_url: '/admin/dokumente', test_role: 'admin' },
      { question_text: 'Inhalte-Editor: Startseiten-Block bearbeiten und speichern',
        expected_result: 'Änderung wird persistiert und auf der öffentlichen Startseite sichtbar.',
        test_function_url: '/admin/inhalte', test_role: 'admin' },
      { question_text: 'Vertrag zur Unterschrift via DocuSeal an Testnutzer senden',
        expected_result: 'Nutzer erhält Mail/Notification mit Signatur-Link.',
        test_function_url: '/admin/dokumente', test_role: 'admin' },
      { question_text: 'Vertrag als Testnutzer in DocuSeal unterzeichnen',
        expected_result: 'Signatur wird gespeichert; Dokument-Status wechselt auf "Completed".',
        test_function_url: `https://sign.${D}`, test_role: 'user' },
      { question_text: 'Signatur als Admin verifizieren',
        expected_result: 'DocuSeal zeigt "Completed" + Audit-Trail (IP, Timestamp).',
        test_function_url: `https://sign.${D}`, test_role: 'admin' },
    ],
  },
```

- [ ] **Step 1.10: Add Template 6 — Rechnungswesen: Steuer-Modus & § 19 UStG (12 steps, B-01..B-11)**

Append after Template 5:

```typescript
  {
    title: 'System-Test 6: Rechnungswesen — Steuer-Modus & § 19 UStG-Monitoring',
    description: 'Vollständiger Test des Subsystems B (§ 19 UStG): Steuer-Modus-Schalter, Schwellenwert-Monitoring (20k/25k/100k €), USt-IdNr.-Pflicht, UStVA-Export, Ist-Versteuerung, Fristen-Dashboard. Bildet alle B-01..B-11-Anforderungen aus dem In-House-Bookkeeping-Plan ab.',
    instructions: 'Alle Schritte im Admin-Browser. Test-Daten dürfen verwendet werden — Schritte 4–6 erfordern künstliche Umsatzwerte (z. B. via SQL oder Test-Modus).',
    steps: [
      { question_text: 'Steuer-Modus auf "kleinunternehmer" setzen [B-01]',
        expected_result: 'site_settings.tax_mode = kleinunternehmer; Hinweis "§ 19 UStG" erscheint auf der nächsten Rechnung.',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-01'] },
      { question_text: 'Steuer-Modus auf "regelbesteuerung" umschalten [B-01]',
        expected_result: 'Wechsel persistiert; nächste Rechnung wird mit USt (7 %/19 %) ausgewiesen.',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-01'] },
      { question_text: 'Yearly-Revenue-Widget im Steuer-Dashboard prüfen [B-02]',
        expected_result: 'Kumulierter Netto-Umsatz des laufenden Jahres entspricht der Summe der "paid"-Rechnungen.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-02'] },
      { question_text: 'Warnschwelle 20.000 € testen (≥ 80 %) [B-03]',
        expected_result: 'Gelber Warn-Alert sichtbar im TaxMonitorWidget; Hinweis auf §19-Grenze.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-03'] },
      { question_text: 'Harte Grenze 25.000 € überschreiten [B-03/B-04]',
        expected_result: 'Roter Alert; Auto-Switch auf Regelbesteuerung; nächste Rechnung mit USt; Switch im Audit-Log.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-03', 'B-04'] },
      { question_text: '100.000 €-Grenze testen [B-06]',
        expected_result: 'Roter "sofort Regelbesteuerung"-Alert; Pflichtwechsel unabhängig vom Vorjahresumsatz.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-06'] },
      { question_text: 'Audit-Log Steuermodus-Wechsel öffnen [B-07]',
        expected_result: 'Eintrag mit Datum, auslösender Rechnungsnummer und Begründung sichtbar (revisionssicher).',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-07'] },
      { question_text: 'UStVA-Quartalsexport als CSV downloaden [B-08]',
        expected_result: 'CSV enthält Nettoumsätze 0 %/7 %/19 % und USt-Summen je Steuersatz; Werte stimmen mit Buchungen.',
        test_function_url: '/admin/billing/elster', test_role: 'admin', req_ids: ['B-08'] },
      { question_text: 'UStVA-ELSTER-Vorschau aufrufen [B-08]',
        expected_result: 'Vorschau-Layout mit Pflichtfeldern (Kennziffern 81/86/35) korrekt befüllt.',
        test_function_url: '/admin/billing/elster', test_role: 'admin', req_ids: ['B-08'] },
      { question_text: 'Ist-Versteuerung-Toggle aktivieren [B-09]',
        expected_result: 'UStVA bezieht USt erst bei Zahlungseingang ein, nicht bei Rechnungsstellung.',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-09'] },
      { question_text: 'Fristen-Dashboard: nächste UStVA-Frist anzeigen [B-10]',
        expected_result: 'Termine 10. März/Juni/September/Dezember sowie Jahres-/GewSt-Frist sichtbar.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-10'] },
      { question_text: 'USt-IdNr.-Pflichtfeld bei Wechsel zu Regelbesteuerung [B-11]',
        expected_result: 'Speichern ohne USt-IdNr. schlägt fehl; Format DE\\d{9} wird validiert (EU-VIES-konform).',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-11'] },
    ],
  },
```

- [ ] **Step 1.11: Add Template 7 — Rechnungswesen: Rechnungserstellung, ZUGFeRD & Archivierung (16 steps, A-01..A-15)**

Append after Template 6:

```typescript
  {
    title: 'System-Test 7: Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung',
    description: 'Vollständiger Test des Subsystems A (Native Invoice Engine): Pflichtangaben Klein/Regel, fortlaufende Nummerierung, SEPA-Daten, ZUGFeRD-Einbettung, Storno, Mahnwesen, Aufbewahrung. Bildet alle A-01..A-15-Anforderungen aus dem In-House-Bookkeeping-Plan ab.',
    instructions: 'Alle Schritte im Admin-Browser. Verwende einen Test-Client + Test-Rechnung. Für Schritt 8 wird ein PDF-Tool (pdftk/qpdf) benötigt, um eingebettete XML zu prüfen.',
    steps: [
      { question_text: 'Rechnungs-Liste laden und Datenquelle prüfen [A-01]',
        expected_result: 'Daten werden aus PostgreSQL geladen; im Network-Tab kein Stripe-API-Call; Liste vollständig.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-01'] },
      { question_text: 'Kleinunternehmer-Rechnung anlegen (§ 19 UStG) [A-02/A-04]',
        expected_result: 'Pflichtangaben (Anschrift Leistender/Empfänger, Steuernummer, Datum, fortlaufende Nr. RE-YYYY-NNNN, Leistungsbeschreibung, Entgelt) + § 19-Hinweis vorhanden.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-02', 'A-04'] },
      { question_text: 'Regelbesteuerung-Rechnung anlegen [A-03]',
        expected_result: 'Pflichtangaben inkl. USt-IdNr., Nettobetrag, Steuersatz (7 %/19 %), Steuerbetrag, Bruttobetrag, Leistungszeitraum.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-03'] },
      { question_text: 'Rechnungsnummer-Lückenlosigkeit prüfen [A-04]',
        expected_result: 'Versuch, Nummer manuell zu ändern oder eine Rechnung zu löschen, schlägt fehl bzw. erzeugt nur eine Stornorechnung.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-04'] },
      { question_text: 'SEPA-Block auf PDF prüfen [A-05]',
        expected_result: 'IBAN, BIC, Bankname, Verwendungszweck = Rechnungsnummer auf jeder PDF.',
        test_function_url: '/admin/billing/[id]/drucken', test_role: 'admin', req_ids: ['A-05'] },
      { question_text: 'SEPA-Lastschriftmandat für einen Kunden anlegen [A-06]',
        expected_result: 'IBAN, BIC, Mandatsreferenz, Datum der Unterschrift, Gläubiger-ID gespeichert und an Rechnungen verknüpfbar.',
        test_function_url: '/admin/billing/customers/[id]', test_role: 'admin', req_ids: ['A-06'] },
      { question_text: 'PDF-Generierung lokal verifizieren [A-07]',
        expected_result: 'Download liefert valide PDF; kein externer API-Call im Network-Tab; pdf_path im DB-Eintrag gesetzt (GoBD-Archiv).',
        test_function_url: '/admin/billing/[id]/drucken', test_role: 'admin', req_ids: ['A-07'] },
      { question_text: 'ZUGFeRD-XML-Einbettung prüfen [A-08]',
        expected_result: 'pdftk dump_data_fields oder qpdf --show-attachments zeigt eingebettetes factur-x.xml mit Profil MINIMUM (E-Rechnungspflicht B2B 2025).',
        test_function_url: '/admin/billing/[id]/drucken', test_role: 'admin', req_ids: ['A-08'] },
      { question_text: 'Rechnung finalisieren → revisionssicher (locked) [A-09]',
        expected_result: 'locked = true; Bearbeiten-Buttons disabled; API-Versuche zu editieren liefern 403/Conflict.',
        test_function_url: '/admin/billing/[id]', test_role: 'admin', req_ids: ['A-09'] },
      { question_text: 'Aufbewahrungsfrist retain_until prüfen [A-10]',
        expected_result: 'DB-Feld retain_until = Rechnungsdatum + 10 Jahre (§ 147 AO).',
        test_function_url: '/admin/billing/[id]', test_role: 'admin', req_ids: ['A-10'] },
      { question_text: 'Stornorechnung erzeugen [A-11]',
        expected_result: 'Neue Rechnung mit negativem Betrag; cancels_invoice_id verweist auf Original; § 14c UStG-Hinweis.',
        test_function_url: '/admin/billing/[id]', test_role: 'admin', req_ids: ['A-11'] },
      { question_text: 'Rechnung per E-Mail versenden [A-12]',
        expected_result: 'E-Mail mit PDF-Anhang + ZUGFeRD-XML gesendet; Mailpit/Empfangs-Postfach zeigt Mail.',
        test_function_url: '/admin/billing/[id]', test_role: 'admin', req_ids: ['A-12'] },
      { question_text: 'Status-Workflow draft → open → paid prüfen [A-13]',
        expected_result: 'Statuswechsel sichtbar; jede Transition triggert eine Buchung im Buchungsjournal.',
        test_function_url: '/admin/billing/[id]', test_role: 'admin', req_ids: ['A-13'] },
      { question_text: 'Zahlungseingang manuell erfassen [A-14]',
        expected_result: 'Datum, Betrag, Zahlungsreferenz gespeichert; Status auf "paid"; Einnahme im Journal gebucht.',
        test_function_url: '/admin/billing/[id]', test_role: 'admin', req_ids: ['A-14'] },
      { question_text: 'Mahnung manuell triggern [A-14]',
        expected_result: 'Mahnstufe inkrementiert; Mail mit Mahngebühr versendet; Buchung in Forderungs-Journal.',
        test_function_url: '/admin/billing/[id]', test_role: 'admin', req_ids: ['A-14'] },
      { question_text: 'Angebot anlegen und in Rechnung umwandeln [A-15]',
        expected_result: 'Angebot mit Nummer AN-YYYY-NNNN; bei Konvertierung referenziert die Rechnung das Angebot.',
        test_function_url: '/admin/angebote', test_role: 'admin', req_ids: ['A-15'] },
    ],
  },
```

- [ ] **Step 1.12: Add Template 8 — Buchhaltung: EÜR, Belege & Steuerauswertungen (14 steps, C-01..C-13)**

Append after Template 7:

```typescript
  {
    title: 'System-Test 8: Buchhaltung — EÜR, Belege & Steuerauswertungen',
    description: 'Vollständiger Test des Subsystems C (EÜR-Buchhaltungsmodul) plus DATEV-Export: Buchungsjournal, Auto-Buchung Forderung/Einnahme, Vorsteuer-Trennung, EÜR-Auswertung, § 15a Vorsteuerberichtigung, GWG, GewSt-Kalkulator, ESt-Vorauszahlung, Belegarchiv. Bildet C-01..C-13 ab.',
    instructions: 'Alle Schritte im Admin-Browser. Test-Daten dürfen verwendet werden. Schritt 13 erfordert eine Beleg-Datei (PDF oder Bild).',
    steps: [
      { question_text: 'Buchungsjournal öffnen [C-01]',
        expected_result: 'Liste mit Datum, Betrag, Kategorie, Belegnummer für Betriebseinnahmen und Betriebsausgaben (§ 4 Abs. 3 EStG).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-01'] },
      { question_text: 'Rechnung versenden → Forderungsbuchung automatisch [C-02]',
        expected_result: 'Buchung mit Kategorie "Forderung" zeitnah (≤ 10 Tage GoBD) im Journal sichtbar.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-02'] },
      { question_text: 'Zahlungseingang erfassen → Einnahmebuchung automatisch [C-02]',
        expected_result: 'Buchung "Betriebseinnahme" mit Verweis auf Rechnung; Forderung wird ausgeglichen.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-02'] },
      { question_text: 'Vorsteuer als eigene Buchungskategorie [C-03]',
        expected_result: 'Bei Eingangsrechnung wird Vorsteuer separat vom Nettobetrag gebucht (§ 4 Abs. 3 S. 3 EStG).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-03'] },
      { question_text: 'USt-Zahllast als Betriebsausgabe verbuchen [C-04]',
        expected_result: 'Quartalszahlung an Finanzamt als Ausgabe-Buchung mit Kategorie "USt-Zahllast"; Erstattungen als Einnahme.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-04'] },
      { question_text: 'EÜR-Jahresbericht als PDF und CSV exportieren [C-05]',
        expected_result: 'Beide Exports zeigen Betriebseinnahmen, Ausgaben, Gewinn; Summen stimmen mit Journal überein (Anlage EÜR).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-05'] },
      { question_text: 'Anlagegut mit Vorsteuer > 1.000 € erfassen [C-06/C-07]',
        expected_result: 'AK, Anschaffungsdatum, AfA-Laufzeit (Monate), Vorsteuer gespeichert; Berichtigungsbetrag § 15a UStG bei Modus-Wechsel automatisch berechnet (Bagatellgrenze § 44 UStDV).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-06', 'C-07'] },
      { question_text: 'Warenlager-Vorsteuerberichtigung beim Wechsel [C-08]',
        expected_result: 'Beim Switch Klein → Regel: volle Vorsteuer auf Bestände als Forderung gegen das FA berechnet (§ 15a Abs. 7).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-08'] },
      { question_text: 'GWG (≤ 800 € netto) erfassen [C-09]',
        expected_result: 'Sofortabschreibung; Sammelposten-Logik für 250–1.000 € über 5 Jahre korrekt (§ 6 Abs. 2/2a EStG).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-09'] },
      { question_text: 'Sonderabschreibung § 7g EStG anwenden [C-10]',
        expected_result: '40 %-Sonder-AfA bei Gewinn ≤ 200.000 € korrekt angesetzt.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-10'] },
      { question_text: 'Gewerbesteuer-Kalkulator nutzen [C-11]',
        expected_result: 'Eingabe Gewerbeertrag → Hinzurechnungen/Kürzungen → Freibetrag 24.500 € → Messbetrag × 3,5 % × Hebesatz Lübbecke 417 % → korrekte Steuerlast.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-11'] },
      { question_text: 'Einkommensteuer-Vorauszahlungsrechner nutzen [C-12]',
        expected_result: 'Schätzgewinn → zvE nach GFB 12.096 € (2025) → ESt-Betrag → Quartalsraten korrekt berechnet.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-12'] },
      { question_text: 'Beleg an Buchung anhängen [C-13]',
        expected_result: 'PDF/Bild-Upload erfolgreich; Beleg unveränderbar mit Buchung verknüpft (GoBD Rn. 85–96).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-13'] },
      { question_text: 'DATEV-Export für Steuerberater erzeugen',
        expected_result: 'CSV im DATEV-Format mit korrekten Konten und Buchungsdatum; importierbar in DATEV-Tool.',
        test_function_url: '/admin/rechnungen', test_role: 'admin' },
    ],
  },
```

- [ ] **Step 1.13: Add Template 9 — Monitoring & Bug-Tracking (6 steps)**

Append after Template 8:

```typescript
  {
    title: 'System-Test 9: Monitoring & Bug-Tracking',
    description: 'Cluster-Monitoring (Pod-Status, Rolling Restart, Staleness), Bug-Ticket-Lifecycle und Test-Results-Panel.',
    instructions: 'Alle Schritte im Admin-Browser.',
    steps: [
      { question_text: 'Pod-Statusliste prüfen',
        expected_result: 'Alle Pods zeigen "Running" oder "Healthy"; keine dauerhaften CrashLoops.',
        test_function_url: '/admin/monitoring', test_role: 'admin' },
      { question_text: 'Deployment per Rolling Restart neu starten',
        expected_result: 'Restart-Trigger wird bestätigt; Pod kommt wieder ready.',
        test_function_url: '/admin/monitoring', test_role: 'admin' },
      { question_text: 'Staleness-Report aufrufen',
        expected_result: 'Bericht lädt; Empfehlungen oder OK-Status je System sichtbar.',
        test_function_url: '/admin/monitoring', test_role: 'admin' },
      { question_text: 'Bug-Ticket aus dem Monitoring erstellen',
        expected_result: 'Ticket mit Format BR-YYYYMMDD-xxxx wird angelegt und unter /admin/bugs sichtbar.',
        test_function_url: '/admin/monitoring', test_role: 'admin' },
      { question_text: 'Bug-Ticket als erledigt markieren (mit Auflösungsnotiz)',
        expected_result: 'Status wechselt auf "resolved"; Auflösungsnotiz wird gespeichert.',
        test_function_url: '/admin/bugs', test_role: 'admin' },
      { question_text: 'Test-Results-Panel zeigt System-Test-Status für alle 10 Templates',
        expected_result: 'Alle Templates sichtbar mit last_result/last_success_at; Drilldown auf Question-Level möglich.',
        test_function_url: '/admin/monitoring', test_role: 'admin' },
    ],
  },
```

- [ ] **Step 1.14: Add Template 10 — Externe Dienste & öffentliche Website (10 steps)**

Append after Template 9 and close the array with `];`:

```typescript
  {
    title: 'System-Test 10: Externe Dienste & öffentliche Website',
    description: 'Funktionstest der angebundenen Dienste (Nextcloud, Talk, Whiteboard, Collabora, Vaultwarden, Brett) und der öffentlichen Website inkl. Kontaktformular.',
    instructions: 'Alle Schritte im Testnutzer-Browser, sofern nicht anders angegeben.',
    steps: [
      { question_text: 'Nextcloud: Testdatei hochladen',
        expected_result: 'Datei erscheint in der Dateiliste; Fortschrittsbalken läuft durch.',
        test_function_url: `https://files.${D}`, test_role: 'user' },
      { question_text: 'Nextcloud-Kalender öffnen',
        expected_result: 'Monats-/Wochenansicht lädt ohne Fehler.',
        test_function_url: `https://files.${D}/apps/calendar`, test_role: 'user' },
      { question_text: 'Nextcloud-Kontakte öffnen',
        expected_result: 'Kontakte-App öffnet; Kontaktliste sichtbar.',
        test_function_url: `https://files.${D}/apps/contacts`, test_role: 'user' },
      { question_text: 'Nextcloud Talk: Raum öffnen, Audio/Video freigeben',
        expected_result: 'Signaling-Verbindung hergestellt; lokales Video erscheint im Raum.',
        test_function_url: `https://files.${D}/apps/talk`, test_role: 'user' },
      { question_text: 'Nextcloud Whiteboard öffnen',
        expected_result: 'Whiteboard-App lädt; Speichern/Laden funktioniert.',
        test_function_url: `https://files.${D}/apps/whiteboard`, test_role: 'user' },
      { question_text: 'Collabora: Office-Datei in Nextcloud bearbeiten',
        expected_result: 'Editor öffnet inline; Änderungen werden gespeichert.',
        test_function_url: `https://files.${D}`, test_role: 'user' },
      { question_text: 'Vaultwarden: neuen Passwort-Eintrag anlegen',
        expected_result: 'Eintrag in Tresorübersicht sichtbar; Passwort abrufbar.',
        test_function_url: `https://vault.${D}`, test_role: 'user' },
      { question_text: 'Öffentliche Startseite aufrufen',
        expected_result: 'Sektionen + Bilder laden; keine 404er im Network-Tab.',
        test_function_url: `https://web.${D}`, test_role: 'user' },
      { question_text: 'Kontaktformular ausfüllen und absenden',
        expected_result: 'Validierung serverseitig; Bestätigung erscheint; Admin-Inbox zeigt den Eintrag.',
        test_function_url: `https://web.${D}`, test_role: 'user' },
      { question_text: 'Brett (Systembrett) öffnen',
        expected_result: '3D-Board lädt; Demo-Konstellation manipulierbar; Speichern funktioniert.',
        test_function_url: `https://brett.${D}`, test_role: 'user' },
    ],
  },
];
```

- [ ] **Step 1.15: Run all tests and verify they pass**

Run: `cd website && npx vitest run src/lib/system-test-seed-data.test.ts`
Expected: All 11 tests PASS (10 invariants + resolveDomain helper).

- [ ] **Step 1.16: Commit**

```bash
git add website/src/lib/system-test-seed-data.ts website/src/lib/system-test-seed-data.test.ts
git commit -m "feat(questionnaires): add system-test seed-data module with 10 templates

10 domain-scoped test questionnaires (89 steps) covering all bookkeeping
requirements A-01..A-15, B-01..B-11, C-01..C-13. Pure data module +
vitest invariants, no DB dependency.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Wire `seedSystemTestTemplates()` to the data module

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts`

- [ ] **Step 2.1: Add the import for the data module**

In `website/src/lib/questionnaire-db.ts` near the top, add the import after the existing imports (around line 2):

```typescript
import { SYSTEM_TEST_TEMPLATES, type SystemTestTemplate } from './system-test-seed-data';
```

- [ ] **Step 2.2: Replace the body of `seedSystemTestTemplates()`**

Replace the entire `seedSystemTestTemplates()` function (currently lines 101–290) with:

```typescript
async function seedSystemTestTemplates(): Promise<void> {
  const existing = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM questionnaire_templates WHERE is_system_test = true`,
  );
  if ((existing.rows[0]?.cnt ?? 0) > 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const tpl of SYSTEM_TEST_TEMPLATES) {
      await insertSystemTestTemplate(client, tpl);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function insertSystemTestTemplate(
  client: pg.PoolClient,
  tpl: SystemTestTemplate,
): Promise<void> {
  const r = await client.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status, is_system_test)
     VALUES ($1, $2, $3, 'published', true)
     RETURNING id`,
    [tpl.title, tpl.description, tpl.instructions],
  );
  const templateId = r.rows[0].id as string;

  for (let i = 0; i < tpl.steps.length; i++) {
    const s = tpl.steps[i];
    await client.query(
      `INSERT INTO questionnaire_questions
         (template_id, position, question_text, question_type,
          test_expected_result, test_function_url, test_role)
       VALUES ($1, $2, $3, 'test_step', $4, $5, $6)`,
      [templateId, i + 1, s.question_text, s.expected_result, s.test_function_url, s.test_role],
    );
  }
}
```

- [ ] **Step 2.3: Verify TypeScript compiles**

Run: `cd website && npx astro check 2>&1 | tail -20`
Expected: No errors related to `questionnaire-db.ts` or `system-test-seed-data.ts`. (Other unrelated errors in the codebase may exist; only confirm none reference these files.)

- [ ] **Step 2.4: Run the unit test suite to confirm no regressions**

Run: `cd website && npm run test:unit 2>&1 | tail -30`
Expected: All tests pass, including the new `system-test-seed-data` suite.

- [ ] **Step 2.5: Commit**

```bash
git add website/src/lib/questionnaire-db.ts
git commit -m "refactor(questionnaires): seed system-test templates from data module

Replace inline 190-line seeder body with iteration over
SYSTEM_TEST_TEMPLATES. Behaviour identical for an empty DB
(idempotency guard preserved). Test step content fully driven
by the data module.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Local dev verification (k3d)

**Files:** none (verification only)

- [ ] **Step 3.1: Build and deploy the website to k3d**

Run: `task website:redeploy 2>&1 | tail -20`
Expected: Build succeeds, image imported into k3d, pod restarts.

- [ ] **Step 3.2: Wipe existing system-test templates in dev DB**

Run:
```bash
kubectl --context k3d-dev -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c "DELETE FROM questionnaire_templates WHERE is_system_test = true;"
```
Expected: `DELETE 2` (or however many existed).

- [ ] **Step 3.3: Restart the website pod to trigger the seeder**

Run:
```bash
kubectl --context k3d-dev -n website rollout restart deploy/website
kubectl --context k3d-dev -n website rollout status deploy/website --timeout=120s
```
Expected: Rollout completes; pod is ready.

- [ ] **Step 3.4: Verify 10 templates were seeded**

Run:
```bash
kubectl --context k3d-dev -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c "SELECT title, (SELECT COUNT(*) FROM questionnaire_questions WHERE template_id = t.id) AS steps FROM questionnaire_templates t WHERE is_system_test = true ORDER BY title;"
```
Expected: Exactly 10 rows; titles `System-Test 1: …` through `System-Test 10: …`; step counts match `[6, 10, 5, 5, 5, 12, 16, 14, 6, 10]`.

- [ ] **Step 3.5: Spot-check URL resolution in dev**

Run:
```bash
kubectl --context k3d-dev -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c "SELECT DISTINCT test_function_url FROM questionnaire_questions WHERE test_function_url LIKE 'http%' ORDER BY test_function_url;"
```
Expected: All absolute URLs use `*.localhost` (because `PROD_DOMAIN` is unset in dev).

- [ ] **Step 3.6: Open the Test-Results-Panel in the dev admin UI**

Manually browse to `https://web.localhost/admin/monitoring` (admin login required).
Expected: All 10 templates appear in the Test-Results panel, each grouping its question count correctly.

---

## Task 4: Production rollout (mentolder + korczewski)

**Files:** none (deployment only)

- [ ] **Step 4.1: Push the feature branch and open a PR**

Run:
```bash
git push -u origin feature/system-test-questionnaires-rewrite
gh pr create --title "feat(questionnaires): rewrite system tests by domain + cover bookkeeping requirements" --body "$(cat <<'EOF'
## Summary
- Replaces 2 mashed-up system-test templates (40 steps, role-split) with 10 domain-scoped templates (89 steps).
- Maps every bookkeeping requirement A-01..A-15, B-01..B-11, C-01..C-13 to ≥1 verifiable step.
- Extracts test step content into pure data module with vitest invariants.
- Fixes broken URL resolution in prod (was hardcoded `*.localhost`, now uses `PROD_DOMAIN`).

## Test plan
- [x] `npx vitest run src/lib/system-test-seed-data.test.ts` — 11 invariants pass
- [x] `npm run test:unit` — full suite green
- [x] Local k3d deploy + DB wipe + reseed → 10 templates, 89 steps verified
- [ ] Mentolder rollout: DELETE + restart → 10 templates verified
- [ ] Korczewski rollout: DELETE + restart → 10 templates verified
- [ ] Test-Results-Panel shows all 10 templates on both clusters

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 4.2: Wait for CI green, then merge**

Run: `gh pr checks --watch && gh pr merge --squash --delete-branch`
Expected: CI passes; PR squash-merged to main; feature branch deleted.

- [ ] **Step 4.3: Wait for ArgoCD to sync the website to mentolder + korczewski**

Run: `task argocd:status 2>&1 | grep -E "website|workspace-(hetzner|korczewski)"`
Expected: Both Applications show `Synced` + `Healthy` after ~1–2 minutes (ArgoCD auto-sync). If not synced, `task argocd:sync -- workspace-hetzner` and `task argocd:sync -- workspace-korczewski`.

- [ ] **Step 4.4: Wipe existing system-test templates on mentolder + restart pod**

Run:
```bash
kubectl --context mentolder -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c "DELETE FROM questionnaire_templates WHERE is_system_test = true;"
kubectl --context mentolder -n website rollout restart deploy/website
kubectl --context mentolder -n website rollout status deploy/website --timeout=120s
```
Expected: `DELETE 2`; rollout completes.

- [ ] **Step 4.5: Verify mentolder seeded correctly**

Run:
```bash
kubectl --context mentolder -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c "SELECT title, (SELECT COUNT(*) FROM questionnaire_questions WHERE template_id = t.id) AS steps FROM questionnaire_templates t WHERE is_system_test = true ORDER BY title;"
```
Expected: 10 rows with step counts `[6, 10, 5, 5, 5, 12, 16, 14, 6, 10]`.

- [ ] **Step 4.6: Verify mentolder URL resolution uses production domain**

Run:
```bash
kubectl --context mentolder -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c "SELECT DISTINCT test_function_url FROM questionnaire_questions WHERE test_function_url LIKE 'http%' ORDER BY test_function_url;"
```
Expected: URLs use `*.mentolder.de` (e.g. `https://files.mentolder.de`, `https://vault.mentolder.de`, `https://web.mentolder.de`). **Not** `*.localhost`.

- [ ] **Step 4.7: Open Test-Results-Panel on mentolder**

Manually browse to `https://web.mentolder.de/admin/monitoring`.
Expected: All 10 templates appear in the panel.

- [ ] **Step 4.8: Repeat 4.4–4.7 for korczewski**

Run:
```bash
kubectl --context korczewski -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c "DELETE FROM questionnaire_templates WHERE is_system_test = true;"
kubectl --context korczewski -n website rollout restart deploy/website
kubectl --context korczewski -n website rollout status deploy/website --timeout=120s
kubectl --context korczewski -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c "SELECT title, (SELECT COUNT(*) FROM questionnaire_questions WHERE template_id = t.id) AS steps FROM questionnaire_templates t WHERE is_system_test = true ORDER BY title;"
kubectl --context korczewski -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c "SELECT DISTINCT test_function_url FROM questionnaire_questions WHERE test_function_url LIKE 'http%' ORDER BY test_function_url;"
```
Expected: 10 templates seeded; URLs use `*.korczewski.de`.

Manually browse to `https://web.korczewski.de/admin/monitoring`.
Expected: All 10 templates appear.

---

## Self-review checks

- **Coverage:** Spec section "Test step catalogue" maps to Tasks 1.5–1.14 (one substep per template). Spec "Requirements traceability" verified by Task 1.1 invariant `covers every bookkeeping requirement`. Spec "Operational rollout" maps to Task 4 (`DELETE + rollout restart` per cluster).
- **No placeholders:** Every code block is complete; no TBDs.
- **Type consistency:** `SystemTestTemplate.steps[i]` is `SystemTestStep` everywhere; `test_role` is `'admin' | 'user'` (matches existing `QQuestion.test_role`); the seeder maps these to columns `question_text`, `test_expected_result`, `test_function_url`, `test_role` with question_type `'test_step'` (consistent with the existing schema).
- **Idempotency:** Seeder still early-returns when `count(is_system_test=true) > 0`. Rollout uses an explicit `DELETE` + restart, intentional.

---

## Out of scope / future iterations

- Per-step ordering dependencies (e.g., "step 5 needs step 2 erfüllt").
- Auto-detected Playwright runs that mark `erfüllt` automatically.
- I18n of question text (currently German only).
