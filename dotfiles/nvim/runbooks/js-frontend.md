---
page: js-frontend
ticket: T901047
status: complete
actions:
  - dev
  - test
  - lint
  - build
---

## Voraussetzungen

- Komponente mit `package.json` unter der Projekt-Root (erkannt werden
  u.a. components/website, components/brett, components/VideoVault,
  components/studio-server, components/mentolder-web,
  components/mediaviewer-widget, packages/*).
- Paketmanager je Komponente live geprueft (website: pnpm, Rest: npm).

## Geordnete Schritte

1. **dev**: Komponente waehlen — Dev-Server starten. Befehl NICHT hart
   codiert: je Komponente via `bash scripts/vda.sh oracle '<Ziel>'`
   ermitteln (diese Anfrage ist der Schritt).
2. **test**: Komponente waehlen — Tests fahren (Befehl via oracle).
3. **lint**: Komponente waehlen — Lint fahren (Befehl via oracle).
4. **build**: Komponente waehlen — Build fahren (Befehl via oracle).

Kein format-on-save. Unbekannte Komponenten erscheinen mit Diagnose
(Liste der erkannten) statt zu schweigen.

## Erwartetes Ergebnis

`components()` listet website plus mindestens eine bisher nicht
abgedeckte Komponente; vier Aktionen je Komponente; Befehle via oracle
ermittelt.

## Troubleshooting

- **Komponente unbekannt**: Diagnose nennt erkannte Komponenten —
  `package.json`-Pfad pruefen.
- **Falscher Manager**: website erwartet pnpm (`pnpm-lock.yaml`);
  Rest npm (`package-lock.json`).

## Recovery

Keine: dieses Kapitel startet nur Prozesse im Terminal; Builds rueckgaengig
via `git clean -fdX` im Komponentenverzeichnis (mit Bestaetigung).
