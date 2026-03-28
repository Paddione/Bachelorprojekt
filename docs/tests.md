# Tests

Automatisiertes Test-Framework zur Verifikation aller 37 Anforderungen (AK, FA, L, NFA, SA).

## Architektur

Das Framework arbeitet in zwei Stufen:

| Stufe | Umgebung | Werkzeuge | Anforderungen |
|-------|----------|-----------|---------------|
| **Local** | Docker Compose auf localhost | Bash + curl + Playwright | FA-01–08, SA-02–06, NFA-03/06/07, AK-03/04 |
| **Prod** | Live-Deployment (echte Domains, TLS) | Bash + curl + nmap + ab | SA-01, SA-07, NFA-01/02/04 |

Zusätzlich gibt es eine **manuelle Checkliste** (AK-01/02/05/06/07, L-01–08) im generierten Markdown-Report.

## Schnellstart

```bash
# Lokale Tests: Stack starten, alle Tests ausführen, Stack herunterfahren
./tests/runner.sh local

# Nur bestimmte Tests ausführen
./tests/runner.sh local FA-01 SA-03

# Stack nach Tests weiterlaufen lassen (zum Debuggen)
./tests/runner.sh local --keep

# Produktionstests gegen Live-Deployment
./tests/runner.sh prod --env .env

# Markdown-Reports aus vorhandenen JSON-Ergebnissen neu generieren
./tests/runner.sh report
```

### Voraussetzungen

| Tool | Verwendung | Pflicht |
|------|-----------|---------|
| `docker` | Container-Lifecycle | Ja |
| `jq` | JSON-Verarbeitung | Ja |
| `curl` | API-Aufrufe | Ja |
| `node` / `npm` | Playwright E2E-Tests | Optional |
| `nmap` | TLS-Cipher-Check (SA-01) | Optional |
| `ab` | Load-Tests (NFA-02/04) | Optional |

## Verzeichnisstruktur

```
tests/
  runner.sh                  # Haupteintrittspunkt
  lib/
    assert.sh                # Assertion-Bibliothek (assert_eq, assert_http, ...)
    report.sh                # JSON-Finalisierung + Markdown-Generierung
    compose.sh               # Docker Compose Lifecycle + Testdaten-Bootstrap
  local/                     # Stufe 1: Bash-Tests gegen lokalen Stack
    AK-03.sh ... SA-06.sh    # 17 Dateien, je eine pro Anforderung
  prod/                      # Stufe 2: Bash-Tests gegen Live-Deployment
    NFA-01.sh ... SA-07.sh   # 5 Dateien
  e2e/                       # Playwright Browser-Tests
    package.json
    playwright.config.ts
    specs/                   # 8 Spec-Dateien + global-setup.ts
  results/                   # Ausgabe (gitignored)
```

## Ergebnisse

Jeder Testlauf erzeugt zwei Dateien in `tests/results/`:

- **JSON** (`2026-03-28-local.json`) — maschinenlesbar, eine Assertion pro Eintrag
- **Markdown** (`2026-03-28-local.md`) — Abnahme-Report mit Ergebnistabelle und manueller Checkliste

### JSON-Format

```json
{
  "meta": { "tier": "local", "date": "...", "host": "...", "compose_file": "..." },
  "results": [
    { "req": "FA-01", "test": "T1", "desc": "...", "status": "pass", "duration_ms": 342, "detail": "" }
  ],
  "summary": { "total": 47, "pass": 45, "fail": 2, "skip": 0 }
}
```

### Markdown-Report

Der generierte Markdown-Report enthält:

1. **Automatisierte Tests** — Tabelle mit Req-ID, Testfall, Beschreibung, Status, Dauer
2. **Manuelle Prüfungen** — Checkliste für AK/L-Anforderungen (Betreuer-Abnahme)
3. **Fehlgeschlagene Tests** — Detailabschnitt mit Fehlerbeschreibung

## Assertion-Bibliothek

Jede Assertion schreibt ein JSON-Objekt in die Ergebnisdatei und gibt farbcodierte Ausgabe im Terminal aus.

| Assertion | Parameter | Prüft |
|-----------|-----------|-------|
| `assert_eq` | actual expected REQ TEST DESC | Stringgleichheit |
| `assert_contains` | haystack needle REQ TEST DESC | Substring vorhanden |
| `assert_not_contains` | haystack needle REQ TEST DESC | Substring nicht vorhanden |
| `assert_http` | status url REQ TEST DESC | HTTP-Statuscode |
| `assert_http_redirect` | url expected_location REQ TEST DESC | Redirect-Ziel |
| `assert_lt` | actual max REQ TEST DESC | Numerisch kleiner als |
| `assert_gt` | actual min REQ TEST DESC | Numerisch größer als |
| `assert_cmd` | command REQ TEST DESC | Exit-Code 0 |
| `assert_match` | string regex REQ TEST DESC | Regex-Match |
| `skip_test` | REQ TEST DESC reason | Test überspringen |

## Testdaten-Bootstrap

Der Runner erstellt beim lokalen Testlauf automatisch folgende Testdaten (idempotent):

| Objekt | Typ | Zweck |
|--------|-----|-------|
| `testadmin` | System-Admin | API-Aufrufe, Konfigurationstests |
| `testuser1`, `testuser2` | User | Messaging, Channel, DM-Tests |
| `testguest` | Gast-Rolle | RBAC-Negativtests (SA-06, FA-05) |
| `testteam` | Team | Container für Kanäle |
| `test-public` | Öffentlicher Kanal | Nachricht-, Datei-, Suchtests |
| `test-private` | Privater Kanal | Zugriffstests (FA-02) |

Standard-Passwort für alle Test-User: `Testpassword123!`

## Anforderungs-Abdeckung

### Automatisiert (24 Anforderungen)

| Kategorie | Anforderungen | Tier |
|-----------|--------------|------|
| AK (Abnahme) | AK-03, AK-04 | Local |
| FA (Funktional) | FA-01–08 | Local (Bash + Playwright) |
| NFA (Nicht-Funktional) | NFA-01, NFA-02, NFA-03, NFA-04, NFA-05, NFA-06, NFA-07 | Local + Prod |
| SA (Sicherheit) | SA-01–07 | Local + Prod |

### Manuell (13 Anforderungen)

AK-01, AK-02, AK-05, AK-06, AK-07, L-01–L-08 — im Markdown-Report als Checkliste enthalten.

## Eigene Tests hinzufügen

Neue Bash-Tests erstellen:

```bash
#!/usr/bin/env bash
# XX-99: Beschreibung
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# Assertions schreiben
assert_eq "$(curl -s http://localhost:8065/api/v4/system/ping | jq -r .status)" "OK" \
  "XX-99" "T1" "Ping-Endpunkt antwortet OK"
```

Die Datei in `tests/local/` oder `tests/prod/` ablegen — der Runner findet sie automatisch.
