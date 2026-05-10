# Claude auf dem Handy mit den MCP-Servern verbinden

> Anleitung für Gekko (Android & iOS). Das Dokument ist absichtlich
> ohne Fachbegriffe geschrieben — einfach Schritt für Schritt durchgehen.
>
> **Vor dem Verschicken:** Patrick muss an einer Stelle (Schritt 2) den
> Bearer-Token einsetzen. Anweisung dafür ganz unten.

---

## Voraussetzung

Du brauchst die Claude-App **mit Pro- oder Max-Abo**. Mit dem kostenlosen
Plan sind eigene Server-Verbindungen ("Connectors") gesperrt.

- **Pro:** ca. 18 €/Monat — reicht für deine Zwecke
- Wechsel in der App über Profil oben rechts → **Upgrade**

---

## Schritt 1 — Claude-App installieren

1. Öffne den **Google Play Store** (auf iPhone: **App Store**)
2. Suche nach **"Claude"** (von **Anthropic**)
3. Tippe **Installieren**
4. Öffne die App, melde dich mit deinem Anthropic-Konto an

---

## Schritt 2 — Den ersten Server hinzufügen

1. In der App tippe oben links auf das **Menü-Symbol** (☰)
2. Tippe unten auf dein **Profil**
3. Tippe auf **Settings** / **Einstellungen**
4. Tippe auf **Connectors** (manchmal "Verbindungen" oder "Tools")
5. Tippe auf **"+ Add custom connector"** / **"Eigenen Connector hinzufügen"**

Es erscheint ein Formular. Fülle es so aus:

| Feld | Wert |
|---|---|
| **Name** | `Kubernetes` |
| **Server URL** | `https://mcp.mentolder.de/kubernetes/mcp` |
| **Authentication** | "Bearer Token" auswählen |
| **Token** | *{{HIER FÜGT PATRICK DEN TOKEN EIN}}* |

Tippe **Add** / **Hinzufügen**.
→ Es sollte ein grünes Häkchen ✓ erscheinen.

---

## Schritt 3 — Die anderen vier Server hinzufügen

Genauso wie Schritt 2, aber mit anderen Daten.
**Der Token ist jedes Mal derselbe** — nur Name und URL ändern sich:

| Name | Server URL |
|---|---|
| `Postgres` | `https://mcp.mentolder.de/postgres/mcp` |
| `Keycloak` | `https://mcp.mentolder.de/keycloak/mcp/sse` |
| `Browser` | `https://mcp.mentolder.de/browser/mcp` |
| `GitHub` | `https://mcp.mentolder.de/github/mcp` |

Bei jedem: **Bearer Token** auswählen, **denselben Token** einfügen,
**Add** tippen.

---

## Schritt 4 — Testen

Geh zurück in einen normalen Chat in der App. Tippe auf das
**Werkzeug-Symbol** unten neben dem Texteingabefeld 🛠️ — du solltest
deine 5 Connectors aufgelistet sehen, jeder mit einem Schalter.

Schreib zum Testen:

> *"Welche Pods laufen gerade im workspace-Namespace?"*

Wenn Claude eine Liste mit Pod-Namen zurückgibt → läuft alles. 🎉

---

## Wenn etwas schiefläuft

| Problem | Lösung |
|---|---|
| Kein "Connectors"-Menü | Du brauchst **Claude Pro**. Profil oben rechts → Upgrade. |
| "Authentication failed" / 401 | Token falsch eingefügt. Connector löschen und neu anlegen — Token komplett markieren und einfügen. |
| "Connection timed out" | WLAN-/Mobilfunkverbindung kurz prüfen. Wenn andere Connectors funktionieren aber einer hängt: Patrick anschreiben. |
| Connector erscheint nicht beim 🛠️-Symbol | Einstellungen → Connectors → Schalter daneben **anschalten**. |
| Token läuft nicht mehr | Patrick muss `task claude-code:rotate-tokens ENV=mentolder` ausführen und dir den neuen Token schicken. |

---

## Was du **nicht** brauchst

- Kein Terminal, kein Computer
- Keine Installation außer der Claude-App
- Kein kubectl, kein SSH, kein VPN
- Keine geheimen Befehle aus dem Internet

---

## Erwartung — was geht, was nicht

Die Claude-App auf dem Handy ist super für:
- "Schau mal nach, wie viele neue Anmeldungen wir gestern hatten"
- "Lies mir die letzten 5 Pull Requests vor"
- "Welche Pods sind gerade nicht gesund?"

Schwächer ist sie bei sehr komplexen Mehrschritt-Aufgaben — die laufen
flüssiger im Claude Code im Terminal. Für den Alltag auf dem Handy
reicht's aber locker.

Bei Fragen: einfach Patrick anrufen 😄

---

# 📦 Anleitung für Patrick — Token rausholen und schicken

So bekommst du den Bearer-Token, den du oben in Schritt 2 einsetzen musst:

```bash
kubectl --context mentolder -n default get secret mcp-tokens \
  -o jsonpath='{.data.BUSINESS_TOKEN}' | base64 -d; echo
```

Output ist eine 64-stellige Zeichenfolge wie `459ce7e6...`.

Schick Gekko über einen **sicheren Kanal** (Vaultwarden Send, Signal):

1. Den **Token** (allein, ohne weiteren Text — leichter zu kopieren)
2. Diese Anleitung als zweite Nachricht

Bitte **nicht** über E-Mail oder normales WhatsApp — der Token gibt
Vollzugriff auf alle 5 MCP-Server der Plattform, das ist ein Passwort.

## Token rotieren (falls geleakt)

```bash
task claude-code:rotate-tokens ENV=mentolder
```

Danach Gekko den neuen Token schicken — alte Tokens sind sofort ungültig
und alle bestehenden Connectors in seiner App müssen einmal aktualisiert
werden (Connector öffnen → Token ersetzen → Speichern).
