# Feature-Kandidaten je Bereich (für PM-Formular Modus B)

Aus `feature-intake` Modus B extrahiert (Chore T001007). Diese Listen werden als
Checkbox-Vorauswahl ins `pm-form-template.html` eingebaut. **Vor jeder Formular-Generierung**
gegen `tickets.tickets WHERE status NOT IN ('done','archived')` abgleichen — bereits
vorhandene Einträge entfernen oder als „(bereits geplant: TXXXxxx)" markieren.

**Brett:**
- Figuren-Animationen / Gesten
- Board-Export (PNG / PDF)
- Zuschauer-Modus (read-only)
- Board-Templates
- Mobile-Touch-Optimierung

**Website / Content-Hub:**
- Newsletter-Vorlagen-Bibliothek
- Vertrags-PDF-Preview
- Bild-Upload im HTML-Editor
- Mehrsprachigkeit (DE/EN)
- SEO-Metadaten-Editor

**Chat / Messaging:**
- Emoji-Reaktionen
- Thread-Antworten
- Datei-Anhänge (>10 MB)
- Gelesen-Bestätigungen
- Push-Notifications (PWA)

**Infra / DevEx:**
- Staging-Umgebung (k3d-isoliert)
- Performance-Dashboard
- Alert-Regeln (Grafana)
- Automated Rollback bei Failed Deploy

**AI / Factory:**
- Ticket-Auto-Triage (Severity-Erkennung)
- Factory-Qualitäts-Ratchet (Scout-Output-Bewertung)
- DeepSeek Scout-Qualität verbessern (touched_files Coverage)

## Areas-Normalisierung (für `--areas`-Parameter)

Formular-Output verwendet deutsche/kapitalisierte Namen — vor `plan-meta set` auf lowercase-Keys normalisieren:

| Formular-Ausgabe | `--areas`-Wert |
|-----------------|---------------|
| `Brett` | `brett` |
| `Website / Content-Hub` | `website` |
| `Chat / Messaging` | `chat` |
| `Infra / DevEx` | `infra` |
| `AI / Factory` | `ai/factory` |
| `Keycloak / Auth` | `auth` |
| `Nextcloud / Files` | `nextcloud` |
