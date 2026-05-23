<div class="page-hero">
  <span class="page-hero-icon">🚀</span>
  <div class="page-hero-body">
    <div class="page-hero-eyebrow">Endnutzer · Erste Schritte</div>
    <div class="page-hero-title">In fünf Minuten startklar</div>
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

<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-brass">1</div>
    <span class="phase-title">Portal öffnen</span>
    <span class="phase-desc">~1 min</span>
  </div>
  <div class="phase-body">

Rufe `https://web.{DOMAIN}/portal` auf. Es wird dich automatisch zum Single Sign-On weiterleiten.

  </div>
</div>

<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-sage">2</div>
    <span class="phase-title">Anmelden</span>
    <span class="phase-desc">~1 min</span>
  </div>
  <div class="phase-body">

Gib Benutzername und Initial-Passwort ein. Beim ersten Login wirst du gebeten, ein neues Passwort zu setzen — wähl mindestens zwölf Zeichen.

  </div>
</div>

<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-blue">3</div>
    <span class="phase-title">Dashboard kennenlernen</span>
    <span class="phase-desc">~2 min</span>
  </div>
  <div class="phase-body">

Nach dem Login landest du im Portal-Dashboard. Du siehst:

- **Eigene Termine** — direkt mit Talk-Call verknüpft
- **Letzte Dateien** — synchronisiert aus Nextcloud
- **Kontakt** — Chat mit anderen Workspace-Nutzern

  </div>
</div>

<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-brass">4</div>
    <span class="phase-title">Datei hochladen</span>
    <span class="phase-desc">~1 min</span>
  </div>
  <div class="phase-body">

Klick auf **Dateien** in der Seitenleiste. Du landest in Nextcloud. Zieh eine Datei in den Browser — fertig.

  </div>
</div>

<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-sage">5</div>
    <span class="phase-title">Talk-Call starten</span>
    <span class="phase-desc">~1 min</span>
  </div>
  <div class="phase-body">

Zurück im Portal: **Talk** öffnen → **Neuer Call**. Sende den Link an Teilnehmer per Chat oder Mail.

  </div>
</div>

## Tiefer einsteigen

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
