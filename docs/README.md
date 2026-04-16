# Dokumentation

### Anforderungskategorien

| Kategorie | IDs | Beschreibung |
|-----------|-----|--------------|
| Funktional (FA) | FA-01 -- FA-25 | Messaging, Kanaele, Video, Dateien, Nutzerverwaltung, Benachrichtigungen, Suche, Homeoffice, Stripe-Checkout, Website, Gast-Portal, Claude Code AI, Docs, Registration, OIDC, Booking, Meetings, Transkription, Vaultwarden, Whiteboard, Mailpit |
| Sicherheit (SA) | SA-01 -- SA-10 | SSO, Authentifizierung, Verschluesselung, Netzwerksicherheit, MCP-Auth |
| Nicht-funktional (NFA) | NFA-01 -- NFA-09 | DSGVO/Datensouveraenitaet, Monitoring, Performance, Resilienz, Backup, Multi-Cluster |
| Abnahmekriterien (AK) | AK-03, AK-04 | Akzeptanztests |
| Lieferobjekte (L) | L-01 ff. | Auslieferbare Artefakte |

### Tests ausfuehren

```bash
./tests/runner.sh local              # Alle Tests
./tests/runner.sh local FA-03        # Einzelner Test
./tests/runner.sh report             # Markdown-Report
```
