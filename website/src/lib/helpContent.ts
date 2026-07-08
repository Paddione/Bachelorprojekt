export interface HelpGuide {
  title: string;
  steps: string[];
}

export interface HelpSection {
  title: string;
  description: string;
  actions: string[];
  guides: HelpGuide[];
}

export type HelpContext = 'portal' | 'admin';

import { components } from './agentGuide';

// ── S2: Plattform-Hub help, built programmatically from the agent-guide registry. ──
// Only `title`, `description`, and the static guide are hand-authored German;
// every component-specific string derives from the SSOT registry.
const allComponents = Object.values(components);
const sensitiveComponents = allComponents.filter(
  (c) => c.sensitivity === 'assisted' || c.sensitivity === 'forbidden',
);
// Non-empty guarantee: sensitive first; if none, fall back to first 8 in registry order.
const actionSource = (sensitiveComponents.length > 0 ? sensitiveComponents : allComponents).slice(0, 8);

const platformHelp: HelpSection = {
  title: 'Plattform Hub',
  description:
    'Hier siehst Du alle Bausteine der Plattform (Software-Dienste und Hardware-Knoten). ' +
    'Öffne „Agent-Anleitung", um zu lernen, wie Du sie bedienst — ohne etwas kaputtzumachen.',
  actions: actionSource.map((c) => `${c.emoji} ${c.name} — ${c.summary_de}`),
  guides: [
    {
      title: 'Wie finde ich Hilfe zu einem Baustein?',
      steps: [
        'Öffne den Sidekick (Knopf unten rechts).',
        'Tippe auf „Agent-Anleitung".',
        'Suche unter „Werkzeuge & Agenten" oder „Ich will …" nach dem passenden Eintrag.',
      ],
    },
  ],
};

export const helpContent: Record<HelpContext, Record<string, HelpSection>> = {
  portal: {
    overview: {
      title: 'Übersicht',
      description: 'Dein persönliches Dashboard — hier siehst du auf einen Blick, was als Nächstes ansteht.',
      actions: [
        'Nächsten Termin einsehen',
        'Offene Rechnungen prüfen',
        'Ungelesene Nachrichten öffnen',
        'Onboarding-Fortschritt verfolgen',
      ],
      guides: [],
    },
    nachrichten: {
      title: 'Nachrichten',
      description: 'Kommuniziere direkt mit deinem Coach. Alle Gesprächsverläufe bleiben dauerhaft gespeichert.',
      actions: [
        'Nachricht senden',
        'Datei anhängen (PDF, Bilder)',
        'Zwischen Räumen wechseln',
        'Nachrichtenhistorie scrollen',
      ],
      guides: [
        {
          title: 'Erste Nachricht senden',
          steps: [
            'Klicke auf das Texteingabefeld am unteren Rand.',
            'Tippe deine Nachricht ein.',
            'Drücke Enter oder klicke auf „Senden".',
          ],
        },
        {
          title: 'Datei hochladen',
          steps: [
            'Klicke auf das Büroklammer-Icon neben dem Textfeld.',
            'Wähle eine Datei von deinem Gerät aus (max. 10 MB).',
            'Die Datei erscheint als Anhang in der Nachricht.',
          ],
        },
      ],
    },
    besprechungen: {
      title: 'Besprechungen',
      description: 'Hier findest du Aufzeichnungen und Transkripte vergangener Meetings mit deinem Coach.',
      actions: [
        'Aufzeichnung abspielen',
        'Transkript lesen',
        'Nach Datum filtern',
      ],
      guides: [],
    },
    dateien: {
      title: 'Dateien',
      description: 'Geteilte Dokumente zwischen dir und deinem Coach — sicher gespeichert in Nextcloud.',
      actions: [
        'Datei hochladen',
        'Datei herunterladen',
        'Ordner navigieren',
        'Dateiname suchen',
      ],
      guides: [
        {
          title: 'Datei hochladen',
          steps: [
            'Klicke auf „Hochladen" oder ziehe eine Datei per Drag & Drop in den Bereich.',
            'Warte bis der Upload abgeschlossen ist.',
            'Die Datei erscheint danach in der Liste.',
          ],
        },
      ],
    },
    unterschriften: {
      title: 'Unterschriften',
      description: 'Dokumente, die deine Unterschrift benötigen, erscheinen hier.',
      actions: [
        'Dokument öffnen und lesen',
        'Elektronisch unterschreiben',
        'Unterschriebenes Dokument herunterladen',
      ],
      guides: [
        {
          title: 'Dokument unterschreiben',
          steps: [
            'Klicke auf das Dokument in der Liste.',
            'Lies das Dokument vollständig durch.',
            'Klicke auf „Unterschreiben" und bestätige.',
            'Das Dokument wird automatisch archiviert.',
          ],
        },
      ],
    },
    termine: {
      title: 'Termine',
      description: 'Verwalte deine Coaching-Sessions — buche neue Termine oder sage bestehende ab.',
      actions: [
        'Neuen Termin buchen',
        'Termin absagen',
        'Termin in Kalender exportieren',
        'Vergangene Termine einsehen',
      ],
      guides: [
        {
          title: 'Neuen Termin buchen',
          steps: [
            'Klicke auf „Neuen Termin buchen".',
            'Wähle einen freien Zeitslot aus dem Kalender.',
            'Bestätige die Buchung — du erhältst eine E-Mail-Bestätigung.',
          ],
        },
        {
          title: 'Termin absagen',
          steps: [
            'Klicke auf den Termin in der Liste.',
            'Wähle „Absagen".',
            'Gib optional einen Grund an und bestätige.',
          ],
        },
      ],
    },
    rechnungen: {
      title: 'Rechnungen',
      description: 'Hier findest du alle deine Rechnungen und kannst offene Beträge online bezahlen.',
      actions: [
        'Rechnung als PDF herunterladen',
        'Offene Rechnung online bezahlen',
        'Zahlungsstatus prüfen',
      ],
      guides: [
        {
          title: 'Rechnung bezahlen',
          steps: [
            'Klicke auf die offene Rechnung.',
            'Klicke auf „Jetzt bezahlen".',
            'Du wirst zu Stripe weitergeleitet — gib dort deine Zahlungsdaten ein.',
            'Nach erfolgreicher Zahlung erscheint die Rechnung als „Bezahlt".',
          ],
        },
      ],
    },
    projekte: {
      title: 'Projekte',
      description: 'Gemeinsame Projekte mit deinem Coach — verfolge Fortschritt und Aufgaben.',
      actions: [
        'Projekt-Status einsehen',
        'Aufgaben ansehen',
        'Kommentar hinzufügen',
      ],
      guides: [],
    },
    onboarding: {
      title: 'Onboarding',
      description: 'Deine Einrichtungs-Checkliste — schließe alle Schritte ab, um loszulegen.',
      actions: [
        'Schritt als erledigt markieren',
        'Fortschritt verfolgen',
        'Fehlende Schritte anzeigen',
      ],
      guides: [
        {
          title: 'Onboarding abschließen',
          steps: [
            'Gehe jeden Schritt in der Checkliste durch.',
            'Klicke auf einen Schritt um ihn als erledigt zu markieren.',
            'Nach Abschluss aller Schritte ist dein Konto vollständig eingerichtet.',
          ],
        },
      ],
    },
    dienste: {
      title: 'Dienste',
      description: 'Direktzugang zu den externen Tools deines Workspaces.',
      actions: [
        'Nextcloud (Dateien & Kalender) öffnen',
        'Wiki aufrufen',
        'Vaultwarden (Passwörter) öffnen',
        'Keycloak-Konto verwalten',
      ],
      guides: [
        {
          title: 'Nextcloud aufrufen',
          steps: [
            'Klicke auf „Nextcloud" in der Diensteliste.',
            'Du wirst automatisch eingeloggt (SSO via Keycloak).',
            'Nextcloud öffnet sich in einem neuen Tab.',
          ],
        },
      ],
    },
    konto: {
      title: 'Konto',
      description: 'Verwalte deine Konto-Einstellungen und Datenschutzoptionen.',
      actions: [
        'Passwort ändern',
        'E-Mail-Adresse ändern',
        'Datenschutzeinstellungen verwalten',
        'Konto löschen',
      ],
      guides: [
        {
          title: 'Passwort ändern',
          steps: [
            'Klicke auf „Passwort ändern".',
            'Du wirst zu Keycloak weitergeleitet.',
            'Gib dein aktuelles und neues Passwort ein und bestätige.',
          ],
        },
      ],
    },
  },

  admin: {
    platform: platformHelp,
    dashboard: {
      title: 'Dashboard',
      description: 'KPI-Übersicht — offene Bugs, Projekte, Follow-ups und anstehende Termine auf einen Blick.',
      actions: [
        'Offene Bugs einsehen',
        'Anstehende Follow-ups prüfen',
        'Unbezahlte Rechnungen sehen',
        'Freie Terminslots prüfen',
      ],
      guides: [],
    },
    bugs: {
      title: 'Bugs',
      description: 'Fehlerberichte von Klienten und intern verwalten.',
      actions: [
        'Bug als gelöst markieren',
        'Bug-Status ändern',
        'Bugs nach Kategorie filtern',
        'Bug archivieren',
      ],
      guides: [
        {
          title: 'Bug lösen',
          steps: [
            'Klicke auf den Bug in der Liste.',
            'Prüfe Beschreibung und ggf. Screenshots.',
            'Klicke auf „Als gelöst markieren".',
            'Der Bug verschwindet aus der offenen Liste.',
          ],
        },
      ],
    },
    meetings: {
      title: 'Meetings',
      description: 'Besprechungen anlegen, Transkripte hochladen und Meetings finalisieren.',
      actions: [
        'Neues Meeting anlegen',
        'Transkript hochladen',
        'Meeting finalisieren',
        'Aufzeichnung verlinken',
      ],
      guides: [
        {
          title: 'Meeting transkribieren',
          steps: [
            'Öffne das gewünschte Meeting.',
            'Klicke auf „Transkript hochladen" und wähle die Audiodatei.',
            'Warte bis Whisper das Transkript erstellt hat.',
            'Prüfe das Transkript und klicke auf „Finalisieren".',
          ],
        },
      ],
    },
    termine: {
      title: 'Termine',
      description: 'Alle Kundentermine verwalten — anlegen, bearbeiten oder absagen.',
      actions: [
        'Termin für Klienten anlegen',
        'Termin bearbeiten',
        'Termin absagen',
        'Terminliste filtern',
      ],
      guides: [
        {
          title: 'Termin für Klienten buchen',
          steps: [
            'Klicke auf „Neuer Termin".',
            'Wähle den Klienten aus der Liste.',
            'Wähle Datum, Uhrzeit und Dienstleistung.',
            'Klicke auf „Speichern" — der Klient erhält eine E-Mail-Bestätigung.',
          ],
        },
      ],
    },
    clients: {
      title: 'Clients',
      description: 'Kundendaten verwalten — anlegen, bearbeiten und Zugänge steuern.',
      actions: [
        'Neuen Klienten anlegen',
        'Klientendaten bearbeiten',
        'Passwort zurücksetzen',
        'Konto deaktivieren',
      ],
      guides: [
        {
          title: 'Neuen Klienten anlegen',
          steps: [
            'Klicke auf „Neuer Klient".',
            'Fülle Name und E-Mail-Adresse aus.',
            'Klicke auf „Erstellen" — der Klient erhält eine Willkommens-E-Mail mit Login-Link.',
          ],
        },
      ],
    },
    projekte: {
      title: 'Projekte',
      description: 'Projekte und Teilprojekte für Klienten anlegen und verwalten.',
      actions: [
        'Neues Projekt anlegen',
        'Teilprojekte hinzufügen',
        'Status setzen',
        'Klienten zuweisen',
      ],
      guides: [
        {
          title: 'Projekt anlegen',
          steps: [
            'Klicke auf „Neues Projekt".',
            'Gib Titel und Beschreibung ein.',
            'Weise das Projekt einem Klienten zu.',
            'Klicke auf „Erstellen".',
          ],
        },
      ],
    },
    tickets: {
      title: 'Tickets',
      description: 'Aufgaben, Features, Bugs und Projekte verwalten — alles in einem System.',
      actions: [
        'Neues Ticket anlegen (Bug, Feature, Task oder Projekt)',
        'Ticket nach Status, Typ, Komponente oder Schlagwort filtern',
        'Ticket einem Teammitglied zuweisen',
        'Schlagwörter (Tags) per Klick oder Textsuche filtern',
      ],
      guides: [
        {
          title: 'Ticket anlegen',
          steps: [
            'Klicke auf „+ Neues Ticket".',
            'Wähle den Typ: Bug, Feature, Task oder Projekt.',
            'Gib Titel und optional eine Beschreibung ein.',
            'Setze Priorität, Komponente und weise das Ticket zu.',
            'Klicke auf „Erstellen".',
          ],
        },
        {
          title: 'Nach Schlagwort filtern',
          steps: [
            'Gib einen Tag-Namen ins Feld „Schlagwort" ein.',
            'Klicke auf „Filtern".',
            'Alternativ: klicke direkt auf einen Tag-Chip in der Tabelle.',
          ],
        },
      ],
    },
    live: {
      title: 'Live-Stream',
      description: 'Livestream starten, Zuschauer verwalten und Aufzeichnungen herunterladen.',
      actions: [
        'Stream starten und stoppen',
        'Stream-Titel und -Beschreibung setzen',
        'Aufzeichnung herunterladen',
        'Zuschauer-Link teilen',
      ],
      guides: [
        {
          title: 'Stream starten',
          steps: [
            'Stelle sicher, dass OBS oder dein Stream-Tool konfiguriert ist.',
            'Klicke auf „Stream starten" — LiveKit erstellt einen neuen Raum.',
            'Teile den Zuschauer-Link unter /portal/stream.',
            'Klicke auf „Stream beenden" wenn du fertig bist.',
          ],
        },
      ],
    },
    zeiterfassung: {
      title: 'Zeiterfassung',
      description: 'Arbeitsstunden für Projekte und Klienten erfassen und Berichte erstellen.',
      actions: [
        'Zeit manuell erfassen',
        'Einträge nach Projekt filtern',
        'Monatsübersicht exportieren',
      ],
      guides: [
        {
          title: 'Zeit erfassen',
          steps: [
            'Klicke auf „Zeit erfassen".',
            'Wähle Klient und Projekt.',
            'Gib Datum, Dauer und Beschreibung ein.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    rechnungen: {
      title: 'Rechnungen',
      description: 'Rechnungen und Angebote erstellen, versenden und verwalten.',
      actions: [
        'Neue Rechnung erstellen',
        'Angebot erstellen',
        'Rechnung als bezahlt markieren',
        'Rechnung per E-Mail versenden',
        'Entwurf speichern',
      ],
      guides: [
        {
          title: 'Rechnung erstellen und versenden',
          steps: [
            'Klicke auf „Neue Rechnung".',
            'Wähle Klient und füge Positionen mit Betrag hinzu.',
            'Wähle „Rechnung" (statt Angebot) und klicke auf „Erstellen".',
            'Klicke auf „Per E-Mail senden" — der Klient erhält die Rechnung mit Zahlungslink.',
          ],
        },
      ],
    },
    followups: {
      title: 'Follow-ups',
      description: 'Wiedervorlagen für Klienten und Aufgaben — nie eine Frist vergessen.',
      actions: [
        'Follow-up anlegen',
        'Follow-up als erledigt markieren',
        'Fällige Follow-ups ansehen',
      ],
      guides: [
        {
          title: 'Follow-up anlegen',
          steps: [
            'Klicke auf „Neues Follow-up".',
            'Wähle Klient, Fälligkeitsdatum und Notiz.',
            'Klicke auf „Speichern" — du wirst per E-Mail erinnert.',
          ],
        },
      ],
    },
    newsletter: {
      title: 'Newsletter',
      description: 'E-Mail-Kampagnen an Abonnenten erstellen und versenden.',
      actions: [
        'Neue Kampagne erstellen',
        'Vorschau ansehen',
        'Kampagne versenden',
        'Abonnentenliste prüfen',
      ],
      guides: [
        {
          title: 'Newsletter versenden',
          steps: [
            'Klicke auf „Neue Kampagne".',
            'Gib Betreff und Inhalt ein.',
            'Klicke auf „Vorschau" um die E-Mail zu prüfen.',
            'Klicke auf „Senden" — die Kampagne wird an alle Abonnenten verschickt.',
          ],
        },
      ],
    },
    kalender: {
      title: 'Kalender',
      description: 'Kalenderansicht aller Termine — Verfügbarkeit prüfen und Slots verwalten.',
      actions: [
        'Wochenansicht / Monatsansicht wechseln',
        'Verfügbare Slots sehen',
        'Gebuchte Termine einsehen',
      ],
      guides: [],
    },
    monitoring: {
      title: 'Monitoring',
      description: 'Systemgesundheit und Deployment-Status aller Workspace-Services.',
      actions: [
        'Service-Status prüfen',
        'Letzte Deployments einsehen',
        'Fehlerhafte Pods identifizieren',
      ],
      guides: [],
    },
    inbox: {
      title: 'Inbox',
      description: 'Eingehende Nachrichten und System-Benachrichtigungen verwalten.',
      actions: [
        'Nachricht lesen',
        'Nachricht beantworten',
        'Nachricht archivieren',
        'Nach ungelesen filtern',
      ],
      guides: [],
    },
    inhalte: {
      title: 'Content Hub',
      description: 'Hier pflegst du alle Inhalte deiner Website — Texte, Preise, Rechtliches und mehr. Wähle oben einen Tab und dann eine Sektion, um deren spezifische Hilfe zu sehen.',
      actions: [
        'Tab „website" wählen → Seiteninhalt bearbeiten',
        'Tab „newsletter" wählen → E-Mail-Kampagnen anlegen',
        'Tab „fragebogen" wählen → Fragebogen-Vorlagen bearbeiten',
        'Tab „vertraege" wählen → Vertragsvorlagen pflegen',
        'Tab „rechnungen" wählen → Rechnungsvorlagen anpassen',
      ],
      guides: [
        {
          title: 'Website-Inhalt bearbeiten (Überblick)',
          steps: [
            'Klicke auf den Tab „website" oben im Content Hub.',
            'Wähle eine Sektion aus der zweiten Tab-Reihe (z.B. „Startseite", „Angebote", „FAQ").',
            'Bearbeite die Felder im Editor — der Sidekick zeigt dann die Anleitung für genau diese Sektion.',
            'Klicke auf „Speichern". Die Änderung ist sofort live auf der Website.',
          ],
        },
        {
          title: 'Änderungen in Echtzeit prüfen',
          steps: [
            'Speichere deine Änderung im Admin.',
            'Öffne die öffentliche Website in einem neuen Tab.',
            'Lade die Seite neu — die Änderung ist sofort sichtbar (kein Deploy nötig).',
          ],
        },
      ],
    },
    seo: {
      title: 'SEO',
      description: 'Meta-Titel und -Beschreibungen für alle Website-Seiten pflegen — relevant für Suchmaschinen und Social-Sharing.',
      actions: [
        'Meta-Titel bearbeiten (50–70 Zeichen)',
        'Meta-Beschreibung bearbeiten (120–160 Zeichen)',
        'Änderungen speichern',
      ],
      guides: [
        {
          title: 'Meta-Titel und Beschreibung setzen',
          steps: [
            'Öffne Tab „website" → Sektion „SEO".',
            'Wähle die Seite aus der Liste (z.B. Startseite, Coaching).',
            'Bearbeite „Meta-Titel" (50–70 Zeichen) und „Meta-Beschreibung" (120–160 Zeichen).',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    startseite: {
      title: 'Startseite',
      description: 'Inhalte der öffentlichen Startseite bearbeiten — Hero, Kennzahlen, Warum-ich-Punkte und Prozessschritte.',
      actions: ['Texte bearbeiten', 'Änderungen speichern', 'Vorschau öffnen'],
      guides: [
        {
          title: 'Hero-Bereich bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Startseite".',
            'Bearbeite „Überschrift", „Unterzeile" und „Call-to-Action-Text" im Hero-Block.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Kennzahlen (Stats) anpassen',
          steps: [
            'Scrolle in der Sektion „Startseite" zum Block „Kennzahlen".',
            'Ändere Zahl, Einheit und Beschreibung für jede Kennzahl.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Why-Me-Punkte bearbeiten',
          steps: [
            'Scrolle zum Block „Warum ich".',
            'Bearbeite Titel und Beschreibung jedes Punktes.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    uebermich: {
      title: 'Über mich',
      description: 'Die „Über mich"-Seite der Website bearbeiten.',
      actions: ['Text bearbeiten', 'Bild aktualisieren', 'Änderungen speichern'],
      guides: [
        {
          title: 'Profiltext bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Über mich".',
            'Bearbeite die Textfelder für Vita, Hintergrund und Schwerpunkte.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    angebote: {
      title: 'Angebote',
      description: 'Leistungsangebote auf der Website pflegen — Karten, Preise und Reihenfolge.',
      actions: ['Angebot bearbeiten', 'Neues Angebot anlegen', 'Angebot deaktivieren'],
      guides: [
        {
          title: 'Angebots-Karte bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Angebote".',
            'Klicke auf die Karte die du bearbeiten möchtest.',
            'Ändere Titel, Beschreibung, Preis und CTA-Text.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Reihenfolge der Angebote ändern',
          steps: [
            'Klicke in der Sektion „Angebote" auf die Pfeil-Buttons (↑ ↓) neben einem Angebot.',
            'Die Reihenfolge gilt sowohl für die Website-Karten als auch für den Footer.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    faq: {
      title: 'FAQ',
      description: 'Häufig gestellte Fragen auf der Website pflegen.',
      actions: ['Frage hinzufügen', 'Frage bearbeiten', 'Reihenfolge ändern'],
      guides: [
        {
          title: 'Neue Frage hinzufügen',
          steps: [
            'Öffne Tab „website" → Sektion „FAQ".',
            'Klicke auf „+ Frage hinzufügen".',
            'Gib Frage und Antwort ein.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Frage-Reihenfolge ändern',
          steps: [
            'Klicke auf die Pfeil-Buttons (↑ ↓) neben der Frage.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    kontakt: {
      title: 'Kontakt',
      description: 'Kontaktinformationen pflegen — Änderungen gelten auf der gesamten Website.',
      actions: ['Kontaktdaten bearbeiten', 'Benachrichtigungs-E-Mail setzen'],
      guides: [
        {
          title: 'Kontaktdaten aktualisieren',
          steps: [
            'Öffne Tab „website" → Sektion „Kontakt".',
            'Die Felder hier spiegeln deine Stammdaten — Änderungen gelten auf der ganzen Website.',
            'Ändere E-Mail, Telefon oder Ort.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    referenzen: {
      title: 'Referenzen',
      description: 'Kundenstimmen und Referenzen auf der Website pflegen.',
      actions: ['Referenz hinzufügen', 'Referenz bearbeiten', 'Referenz ausblenden'],
      guides: [
        {
          title: 'Neue Referenz hinzufügen',
          steps: [
            'Öffne Tab „website" → Sektion „Referenzen".',
            'Klicke auf „+ Referenz hinzufügen".',
            'Gib Name, Unternehmen, Zitat und optional ein Bild ein.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Referenz ausblenden',
          steps: [
            'Klicke auf das Auge-Icon neben der Referenz.',
            'Die Referenz bleibt gespeichert, erscheint aber nicht mehr auf der Website.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    rechtliches: {
      title: 'Rechtliches',
      description: 'Impressum, Datenschutzerklärung, AGB und Barrierefreiheitserklärung pflegen.',
      actions: ['Impressum bearbeiten', 'Datenschutzerklärung aktualisieren', 'AGB anpassen'],
      guides: [
        {
          title: 'Impressum aktualisieren',
          steps: [
            'Öffne Tab „website" → Sektion „Rechtliches" → Tab „Impressum".',
            'Bearbeite den Text im Editor.',
            'Klicke auf „Speichern" — die Änderung ist sofort live.',
          ],
        },
        {
          title: 'Datenschutzerklärung aktualisieren',
          steps: [
            'Wechsle innerhalb „Rechtliches" auf den Tab „Datenschutz".',
            'Bearbeite den Freitext oder passe Token-Felder an.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'AGB anpassen',
          steps: [
            'Wechsle innerhalb „Rechtliches" auf den Tab „AGB".',
            'Bearbeite den Text.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    einstellungen: {
      title: 'Einstellungen',
      description: 'Systemweite Konfiguration — Benachrichtigungen, E-Mail, Rechnungen und Branding.',
      actions: [
        'E-Mail-Benachrichtigungen konfigurieren',
        'Absender-E-Mail festlegen',
        'Rechnungsvorlagen anpassen',
        'Logo und Farben (Branding) setzen',
      ],
      guides: [],
    },
    stammdaten: {
      title: 'Stammdaten',
      description: 'Zentrale Daten (Name, E-Mail, Telefon, Ort) pflegen — werden auf der gesamten Website verwendet.',
      actions: ['Stammdaten bearbeiten', 'Änderungen speichern'],
      guides: [
        {
          title: 'Stammdaten bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Stammdaten".',
            'Hier pflegst du zentrale Daten (Name, E-Mail, Telefon, Ort), die auf der gesamten Website verwendet werden.',
            'Ändere die gewünschten Felder.',
            'Klicke auf „Speichern" — die Änderung gilt sofort überall.',
          ],
        },
      ],
    },
    navigation: {
      title: 'Navigation',
      description: 'Hauptmenü der Website bearbeiten — Einträge, Reihenfolge und Links.',
      actions: ['Menü-Reihenfolge anpassen', 'Eintrag bearbeiten', 'Änderungen speichern'],
      guides: [
        {
          title: 'Menü-Reihenfolge anpassen',
          steps: [
            'Öffne Tab „website" → Sektion „Navigation".',
            'Verschiebe Einträge per Pfeil-Buttons (↑ ↓).',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    footer: {
      title: 'Footer',
      description: 'Footer-Texte und -Links der Website bearbeiten.',
      actions: ['Tagline bearbeiten', 'Copyright-Text anpassen', 'Änderungen speichern'],
      guides: [
        {
          title: 'Footer-Text bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Footer".',
            'Bearbeite Tagline und Copyright-Text.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    coaching: {
      title: 'Coaching',
      description: 'Inhalte der „Coaching"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: 'Coaching-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Coaching".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    'fuehrung-persoenlichkeit': {
      title: 'Führung & Persönlichkeit',
      description: 'Inhalte der „Führung & Persönlichkeit"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: 'Führung & Persönlichkeit-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Führung & Persönlichkeit".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    '50plus-digital': {
      title: '50plus Digital',
      description: 'Inhalte der „50plus Digital"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: '50plus Digital-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „50plus Digital".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    'ki-transition': {
      title: 'KI-Transition',
      description: 'Inhalte der „KI-Transition"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: 'KI-Transition-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „KI-Transition".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    beratung: {
      title: 'Beratung',
      description: 'Inhalte der „Beratung"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: 'Beratung-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Beratung".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
  },
};
