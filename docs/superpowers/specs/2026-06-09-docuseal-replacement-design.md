# Design: DocuSeal-Replacement — Self-Written Signing System

**Datum:** 2026-06-09  
**Branch:** feature/docuseal-replacement  
**Grilling-Ticket:** T000557  
**Scope:** Enhanced — Feature-Parität + Native-UX-Integration  
**Priorität:** Normal  
**Migration:** Direkter Cutover (kein Parallelbetrieb)

---

## 1. Motivation

DocuSeal wird durch ein eigenständiges, in der Website eingebettetes Signatur-System ersetzt. Gründe:

- **Wartungsaufwand:** Externe Rails-Anwendung mit eigenem Release-Zyklus, DB und PVC
- **Bloat:** DocuSeal bringt ein vollständiges Admin-Portal, Template-Editor und viele ungenutzte Features
- **Codebasis-Vereinfachung:** Stale References in Secrets, Ingress, Backup-Jobs, Health-Checks und E2E-Tests

Das Replacement ist vollständig in der bestehenden Astro/Node.js-Website implementiert. DocuSeal und alle seine Kubernetes-Ressourcen werden nach Cutover entfernt.

---

## 2. Architektur-Übersicht

```
Kunde (Browser)
  ↓ Keycloak SSO
  ↓ /portal/sign/[assignmentId]  (Astro SSR, auth-guard)
  ↓ Dokument-HTML inline + Signature Bar (Layout A: float-bottom)
  ↓ POST /api/portal/sign/[assignmentId]
      → Template rendern + Signatur einbetten
      → Playwright PDF erzeugen
      → DB: signed_html, signed_pdf, signature_data, signed_at
  ↓ Redirect → /portal (Bestätigung)

Admin (Browser)
  ↓ POST /api/admin/documents/assign  (unverändert)
  ↓ POST /api/admin/documents/notify/[id]  (neu: E-Mail manuell)
  ↓ DELETE /api/admin/documents/assignments/[id]  (neu: Widerruf)
  ↓ PATCH /api/admin/documents/assignments/[id]  (neu: Deadline verlängern)
  ↓ GET /api/portal/documents/[id]/pdf  (Admin + Kunde)
```

Kein externer Dienst, kein Webhook, kein iFrame.

---

## 3. DB-Schema-Änderungen

### 3.1 Tabelle `document_templates`

```sql
ALTER TABLE document_templates
  DROP COLUMN IF EXISTS docuseal_template_id;
```

### 3.2 Tabelle `document_assignments`

**Entfernt:**
```sql
ALTER TABLE document_assignments
  DROP COLUMN IF EXISTS docuseal_template_id,
  DROP COLUMN IF EXISTS docuseal_submission_slug,
  DROP COLUMN IF EXISTS docuseal_embed_src;
```

**Neu:**
```sql
ALTER TABLE document_assignments
  ADD COLUMN signature_data   JSONB,
  ADD COLUMN signed_html      TEXT,
  ADD COLUMN signed_pdf       BYTEA,
  ADD COLUMN expires_at       TIMESTAMPTZ;
```

`signature_data` Schema:
```json
{
  "type": "canvas" | "checkbox",
  "imageData": "data:image/png;base64,...",  // nur bei type=canvas
  "signerName": "Max Muster",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "signedAt": "2026-06-09T14:32:00Z"
}
```

### 3.3 Neue Tabelle `signing_audit_log`

```sql
CREATE TABLE signing_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES document_assignments(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,   -- 'viewed' | 'signed' | 'revoked' | 'email_sent' | 'pdf_downloaded'
  ip            INET,
  user_agent    TEXT,
  actor_id      TEXT,            -- Keycloak User-ID (Kunde oder Admin)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signing_audit_log__assignment_id ON signing_audit_log(assignment_id);
```

Beide Brands erhalten identische Migrationen (mentolder + korczewski).

---

## 4. Neue Komponenten

### 4.1 `website/src/lib/signing/` — Signing-Modul

```
website/src/lib/signing/
├── index.ts              — Re-exports
├── template-renderer.ts  — HTML-Template rendern (Placeholder ersetzen)
├── pdf-service.ts        — Playwright-basierte PDF-Erzeugung
├── audit.ts              — signing_audit_log Schreibzugriff
└── types.ts              — SignatureData, SigningResult, etc.
```

**`template-renderer.ts`:**
- Übernimmt die Logik aus `assign.ts` (Fixed-Substitution: `{{KUNDENNUMMER}}`, `{{DATUM}}`, `{{JAHR}}`, `{{Stand}}`)
- Neu: Signatur-HTML in das Dokument einbetten (Canvas-PNG als `<img>` oder Checkbox-Vermerk + Name/Datum/IP)

**`pdf-service.ts`:**
- Singleton: Playwright-Browser wird einmalig beim ersten Aufruf gestartet, danach wiederverwendet
- `generatePdf(html: string): Promise<Buffer>` — rendert HTML → PDF via `page.pdf()`
- Graceful shutdown via `process.on('SIGTERM', ...)`
- Playwright als Production-Dependency (`playwright`, nicht `@playwright/test`), Chromium via `npx playwright install chromium` im Dockerfile

### 4.2 API-Endpunkte (neu)

**`POST /api/portal/sign/[assignmentId]`** (customer-auth-guard)
```
Body: { signatureType: 'canvas'|'checkbox', imageData?: string, signerName: string }
1. Assignment laden → Ownership-Check (customer_id = aktueller User)
2. Status-Check: nur 'pending' kann unterschrieben werden
3. Expires-Check: expires_at prüfen
4. Template-HTML rendern + Signatur einbetten
5. PDF erzeugen (Playwright)
6. DB: signed_html, signed_pdf, signature_data, status='completed', signed_at=NOW()
7. Audit-Log: event='signed'
8. Response: { success: true }
```

**`GET /api/portal/documents/[assignmentId]/pdf`** (customer + admin)
```
1. Assignment laden → Auth-Check
2. signed_pdf aus DB lesen
3. Response: PDF-Download (application/pdf, Content-Disposition: attachment)
4. Audit-Log: event='pdf_downloaded'
```

**`POST /api/admin/documents/notify/[assignmentId]`** (admin-only)
```
1. Assignment + Customer-Daten laden
2. E-Mail via Mailpit/SMTP senden (Link zu /portal/sign/[id])
3. Audit-Log: event='email_sent'
```

**`DELETE /api/admin/documents/assignments/[id]`** (admin-only)
```
1. Assignment status → 'revoked'
2. Audit-Log: event='revoked'
```

**`PATCH /api/admin/documents/assignments/[id]`** (admin-only)
```
Body: { expiresAt?: string }
1. expires_at setzen/verlängern
```

**Geändert: `POST /api/admin/documents/assign`**
- DocuSeal-Aufrufe (`createTemplate`, `createSubmission`) entfernen
- Nur noch: Template-Daten aus DB laden + Assignment erstellen
- Kein `docuseal_template_id`, kein `docuseal_embed_src`, kein `docuseal_submission_slug`

### 4.3 Signing-Page (`/portal/sign/[assignmentId].astro`)

**Layout A: Scrollable Dokument + Floating Signature Bar**

```
┌─────────────────────────────────┐
│  Portal-Header (Topbar)         │
├─────────────────────────────────┤
│                                 │
│  Dokument-HTML                  │
│  (scrollbar, voll-width)        │
│                                 │
│  [Editable Fields inline        │
│   als Formular-Inputs im        │
│   Dokument-Kontext]             │
│                                 │
│  ↓ Scroll ↓                     │
│                                 │
├─────────────────────────────────┤  ← fixiert (sticky bottom)
│  ✍️ [Canvas-Pad]  ─oder─  ☑ Ich│
│  [Löschen]                      │
│  Name: [Input]                  │
│  [Jetzt unterschreiben]         │
└─────────────────────────────────┘
```

- Signature Bar ist `position: sticky; bottom: 0` — scrollt nicht weg
- Canvas-Pad nutzt `signature_pad` npm package (MIT-Lizenz)
- Toggle zwischen Canvas-Modus und Checkbox-Modus
- Validierung: Bei Canvas muss Pad nicht leer sein; bei Checkbox muss Checkbox gecheckt + Name ausgefüllt sein
- Bei `status = 'completed'`: Seite zeigt "Bereits unterschrieben am [Datum]" + Download-Button

### 4.4 `website/src/lib/documents-db.ts` — Änderungen

- DocuSeal-Spalten aus `DocumentAssignment` Interface entfernen
- Neue Felder hinzufügen: `signatureData`, `signedHtml`, `signedPdf`, `expiresAt`
- Neue Funktion: `markAssignmentSigned(id, data)` (ersetzt `markAssignmentCompleted`)
- Neue Funktion: `getAssignmentPdf(id)` → `Buffer | null`
- Funktion `markAssignmentCompleted` entfernen (war für DocuSeal-Webhook)

---

## 5. Entfernte Komponenten

### 5.1 Website-Code

| Datei | Aktion |
|-------|--------|
| `website/src/lib/docuseal.ts` | **Löschen** |
| `website/src/pages/api/webhooks/docuseal.ts` | **Löschen** |
| `website/src/lib/assistant/actions/portal/signDocument.ts` | Action-ID beibehalten, Redirect unverändert |

### 5.2 Kubernetes-Manifeste

| Datei | Aktion |
|-------|--------|
| `k3d/docuseal.yaml` | **Löschen** |
| `k3d/kustomization.yaml` | DocuSeal-Eintrag entfernen |
| `prod/patch-docuseal.yaml` | **Löschen** |
| `prod/kustomization.yaml` | DocuSeal-Patch-Eintrag entfernen |
| `prod/ingress.yaml` | DocuSeal-Ingress-Block entfernen (Zeilen 125–147) |
| `prod/configmap-domains.yaml` | `SIGN_DOMAIN` entfernen |
| `k3d/configmap-domains.yaml` | `SIGN_DOMAIN` entfernen |
| `k3d/shared-db.yaml` | DocuSeal-User/DB-Init-Block entfernen |
| `k3d/secrets.yaml` | `DOCUSEAL_*` Dev-Secrets entfernen |
| `k3d/website.yaml` | `DOCUSEAL_API_TOKEN`, `DOCUSEAL_INTERNAL_URL` entfernen |
| `k3d/backup-cronjob.yaml` | DocuSeal-Volume + DB-Backup-Einträge entfernen |

### 5.3 Secrets & Environments

| Datei | Aktion |
|-------|--------|
| `environments/schema.yaml` | `DOCUSEAL_SECRET_KEY_BASE`, `DOCUSEAL_API_TOKEN`, `DOCUSEAL_DB_PASSWORD` entfernen |
| `environments/sealed-secrets/mentolder.yaml` | DocuSeal-Secrets entfernen |
| `environments/sealed-secrets/korczewski.yaml` | DocuSeal-Secrets entfernen |
| `environments/sealed-secrets/fleet-mentolder.yaml` | DocuSeal-Secrets entfernen |
| `environments/sealed-secrets/fleet-korczewski.yaml` | DocuSeal-Secrets entfernen |
| `environments/.secrets/dev.yaml` | DocuSeal-Plaintext-Secrets entfernen |

### 5.4 Tests & Monitoring

| Datei | Aktion |
|-------|--------|
| `tests/e2e/specs/systemtest-05-docuseal.spec.ts` | Umbenennen → `systemtest-05-signing.spec.ts`, Inhalt neu |
| `tests/e2e/specs/integration-smoke.spec.ts` | DocuSeal-Smoke-Test ersetzen |
| `tests/e2e/specs/nfa-infra-health-sweep.spec.ts` | DocuSeal-Health-Check entfernen |
| `website/src/lib/system-test-seed-data.ts` | Systemtest-5-Beschreibung aktualisieren |
| `website/src/pages/api/admin/ops/health.ts` | DocuSeal-Health-Check entfernen |
| `website/src/pages/api/admin/ops/restore.ts` | `'docuseal'` aus Restore-Liste entfernen |
| `pentest-dashboard/app.py` | DocuSeal-Service + Probe + Vulnerability entfernen |

---

## 6. Infra-Änderungen

### 6.1 Dockerfile (website)

```dockerfile
# Playwright Chromium installieren
RUN npx playwright install --with-deps chromium
```

### 6.2 `package.json` (website)

```json
{
  "dependencies": {
    "playwright": "^1.x",
    "signature_pad": "^4.x"
  }
}
```

`@playwright/test` bleibt in `devDependencies` für E2E-Tests.

### 6.3 Kubernetes: Kein neues Deployment

Das Signing-System läuft vollständig im bestehenden `website`-Deployment. Kein neuer Service, kein neues PVC, kein neue Ingress-Rule für `sign.*`.

Die `website`-Deployment-Ressourcen sollten leicht erhöht werden (Playwright Chromium):
- Memory Request: 256Mi → 384Mi
- Memory Limit: 512Mi → 768Mi

### 6.4 `.gitignore`

```
.superpowers/
```

---

## 7. E2E-Tests

**`tests/e2e/specs/systemtest-05-signing.spec.ts`** (ersetzt systemtest-05-docuseal):

1. Admin weist Dokument einem Testkunden zu
2. Kunde loggt sich ein, sieht offenes Dokument in Portal
3. Kunde öffnet Signing-Seite, zeichnet Canvas-Signatur
4. Formular-Submit → Status `completed`
5. PDF-Download funktioniert (Status 200, Content-Type: application/pdf)
6. Admin sieht Status als `completed` in Admin-Übersicht
7. Admin kann PDF herunterladen
8. Wiederholter Sign-Versuch → Fehler (bereits unterschrieben)

**`tests/e2e/specs/integration-smoke.spec.ts`** — DocuSeal-Block durch signing-smoke ersetzen:
- Portal `/portal/sign/[nonexistent]` → 404 (nicht 500)
- Signing-API ohne Auth → 401

---

## 8. Nicht im Scope (bewusst ausgelassen)

- **Keycloak OIDC für DocuSeal-Admin:** Entfällt — DocuSeal-Admin existiert nicht mehr
- **E-Mail-Templates für Signatur-Anfragen:** Plain-Text mit Link; kein HTML-E-Mail-Template
- **Signatur-Felder mit Koordinaten im Dokument:** Feste Signatur-Sektion am Ende des Dokuments; kein drag-and-drop Feldplatzierung
- **Mehrere Unterzeichner pro Dokument:** Nur ein Unterzeichner pro Assignment (wie bisher)
- **Versionierung von Templates mit Diff:** Templates haben `stand_date` (wie bisher)

---

## 9. Migrations-Strategie

**Direkter Cutover** — kein Parallelbetrieb nötig:

1. Keine aktiven DocuSeal-Submissions mit Live-Daten (Testplattform)
2. `document_assignments` mit Status `pending` werden durch Migration auf neues Schema gebracht (DocuSeal-Spalten auf `NULL`)
3. `document_assignments` mit Status `completed`: `docuseal_*` Spalten können verworfen werden (Signatur-Artefakt ist weg, aber das ist akzeptiert für Cutover)
4. Nach Deployment: DocuSeal k8s-Ressourcen aus dem Cluster löschen (`kubectl delete -f k3d/docuseal.yaml`)
5. DocuSeal-DB-User und -Datenbank in shared-db löschen

---

## 10. Offene Fragen / Risiken

| Risiko | Mitigation |
|--------|------------|
| Playwright Chromium erhöht Image-Size (~300MB) | Akzeptiert; Image-Build dauert länger |
| Playwright-Browser-Startup-Latenz (~2s) | Singleton-Pattern: Browser einmal starten, warmhalten |
| PDF-Speicher in BYTEA bei vielen Dokumenten | Für Kleinteam (<100 Docs) kein Problem; ggf. später auf Dateisystem migrieren |
| Signed_html in TEXT bei langen Dokumenten | PostgreSQL TEXT ist unbegrenzt; kein Problem |
