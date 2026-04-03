# Dokumentation

## Live-Dokumentation

Die vollstaendige, menschenlesbare Dokumentation zu Architektur, Services, Migration und Betrieb:

**[http://docs.localhost](http://docs.localhost)** (erfordert laufenden k3d-Cluster)

## Anforderungen

Alle Anforderungen sind in der Requirements-Uebersicht dokumentiert:

| Datei | Beschreibung |
|-------|--------------|
| [Requirements Overview](requirements/overview.md) | Vollstaendige Anforderungsdefinitionen (FA, SA, NFA, AK, Lieferobjekte) |

### Anforderungskategorien

| Kategorie | IDs | Beschreibung |
|-----------|-----|--------------|
| Funktional (FA) | FA-01 -- FA-12 | Messaging, Kanaele, Video, Dateien, Nutzerverwaltung, Benachrichtigungen, Suche, Homeoffice, Billing Bot, Website, Gast-Portal, OpenClaw AI |
| Sicherheit (SA) | SA-01 -- SA-09 | SSO, Authentifizierung, Verschluesselung, Netzwerksicherheit |
| Nicht-funktional (NFA) | NFA-01 -- NFA-07 | DSGVO/Datensouveraenitaet, Monitoring, Performance, Resilienz |
| Abnahmekriterien (AK) | AK-03, AK-04 | Akzeptanztests |
| Lieferobjekte (L) | L-01 ff. | Auslieferbare Artefakte |

### Tests ausfuehren

```bash
./tests/runner.sh local              # Alle Tests
./tests/runner.sh local FA-03        # Einzelner Test
./tests/runner.sh report             # Markdown-Report
```
