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
      description: 'Verwalte deine Coaching-Sitzungen — buche neue Termine oder sage bestehende ab.',
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
    startseite: {
      title: 'Startseite',
      description: 'Inhalte der öffentlichen Startseite (Hero, Angebote, USPs) bearbeiten.',
      actions: ['Texte bearbeiten', 'Änderungen speichern', 'Vorschau öffnen'],
      guides: [],
    },
    uebermich: {
      title: 'Über mich',
      description: 'Die „Über mich"-Seite der Website bearbeiten.',
      actions: ['Text bearbeiten', 'Bild aktualisieren', 'Änderungen speichern'],
      guides: [],
    },
    angebote: {
      title: 'Angebote',
      description: 'Leistungsangebote auf der Website pflegen.',
      actions: ['Angebot bearbeiten', 'Neues Angebot anlegen', 'Angebot deaktivieren'],
      guides: [],
    },
    faq: {
      title: 'FAQ',
      description: 'Häufig gestellte Fragen auf der Website pflegen.',
      actions: ['Frage hinzufügen', 'Frage bearbeiten', 'Reihenfolge ändern'],
      guides: [],
    },
    kontakt: {
      title: 'Kontakt',
      description: 'Kontaktinformationen und Kontaktformular-Einstellungen verwalten.',
      actions: ['Kontaktdaten bearbeiten', 'Benachrichtigungs-E-Mail setzen'],
      guides: [],
    },
    referenzen: {
      title: 'Referenzen',
      description: 'Kundenstimmen und Referenzen auf der Website pflegen.',
      actions: ['Referenz hinzufügen', 'Referenz bearbeiten', 'Referenz ausblenden'],
      guides: [],
    },
    rechtliches: {
      title: 'Rechtliches',
      description: 'Impressum, Datenschutzerklärung und AGB pflegen.',
      actions: ['Impressum bearbeiten', 'Datenschutzerklärung aktualisieren', 'AGB anpassen'],
      guides: [],
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
  },
};
