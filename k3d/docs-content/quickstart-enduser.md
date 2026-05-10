<div class="page-hero">
  <span class="page-hero-icon">🚀</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Quickstart — Endnutzer</div>
    <p class="page-hero-desc">In fünf Minuten vom ersten Login zum ersten Talk-Call.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">5 Minuten</span>
      <span class="page-hero-tag">Kein Setup</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# In fünf Minuten startklar

<p class="kicker">Endnutzer · Erste Schritte</p>

Du hast einen Account von deiner Plattform-Administration erhalten. Diese Seite führt dich durch deinen ersten produktiven Tag.

## 1. Portal öffnen

Rufe `https://web.{DOMAIN}/portal` auf. Es wird dich automatisch zum Single Sign-On weiterleiten.

## 2. Anmelden

Gib Benutzername und Initial-Passwort ein. Beim ersten Login wirst du gebeten, ein neues Passwort zu setzen — wähl mindestens zwölf Zeichen.

## 3. Dashboard kennenlernen

Nach dem Login landest du im Portal-Dashboard. Du siehst:

- **Eigene Termine** — direkt mit Talk-Call verknüpft
- **Letzte Dateien** — synchronisiert aus Nextcloud
- **Kontakt** — Chat mit anderen Workspace-Nutzern

## 4. Datei hochladen

Klick auf **Dateien** in der Seitenleiste. Du landest in Nextcloud. Zieh eine Datei in den Browser — fertig.

## 5. Talk-Call starten

Zurück im Portal: **Talk** öffnen → **Neuer Call**. Sende den Link an Teilnehmer per Chat oder Mail.

## 6. Tiefer einsteigen

- **Whiteboard** — kollaboratives Zeichnen, mit Systembrett-Vorlage für systemische Aufstellungen.
- **Vaultwarden** — Passwort-Tresor, geteilt mit Teamkollegen.
- **Office** — Word/Excel/PowerPoint im Browser, öffnet aus Nextcloud.

```mermaid
flowchart LR
  Login([Login]) --> Portal[Portal-Dashboard]
  Portal --> Files[Nextcloud Dateien]
  Portal --> Talk[Talk-Call]
  Portal --> Vault[Vaultwarden]
  Files --> Office[Office im Browser]
  Talk --> Recording[Aufzeichnung]
```

> **Mehr erfahren:** Vollständiges [Benutzerhandbuch](benutzerhandbuch) für alle Funktionen.
