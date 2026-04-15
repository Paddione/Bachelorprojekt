# Stripe Checkout — mentolder Homepage

**Datum:** 2026-04-15  
**Status:** Approved  
**Scope:** mentolder-Brand (website-Namespace, mentolder-Cluster + korczewski-Cluster)

---

## Ziel

Kunden können Coaching- und Digital-Café-Pakete direkt auf mentolder.de per Kreditkarte kaufen. Stripe Checkout (hosted) übernimmt Zahlungsabwicklung. Gerald erhält nach jeder Zahlung eine Mattermost-Notification.

---

## Architektur & Datenfluss

```
Homepage ServiceCard          Leistungen-Seite
 "Ab 60 € — Jetzt buchen"     "5er-Paket 270 € — Kaufen"
         │                              │
         └──────────────┬───────────────┘
                        ↓
          POST /api/stripe/checkout
          { serviceKey }
                        │
          Stripe API: createCheckoutSession()
          ├─ success_url: /stripe/success?session_id={CHECKOUT_SESSION_ID}
          └─ cancel_url:  /leistungen
                        │
                        ↓
            checkout.stripe.com (hosted, PCI-compliant)
                        │
         ┌──────────────┴──────────────┐
       Zahlung OK               Zahlung abgebrochen
         │                              │
    /stripe/success              /leistungen
    + Mattermost-Notification    (stille Rückkehr)
         │
    POST /api/stripe/webhook
    event: checkout.session.completed
    → Mattermost-DM an Gerald
```

---

## Neue Dateien

| Datei | Zweck |
|---|---|
| `src/lib/stripe.ts` | Stripe-Client + Produkt/Preis-Mapping |
| `src/pages/api/stripe/checkout.ts` | POST → erstellt Checkout Session, gibt `url` zurück |
| `src/pages/api/stripe/webhook.ts` | POST → empfängt Stripe-Webhook, sendet MM-Notification |
| `src/pages/stripe/success.astro` | Danke-Seite nach erfolgreicher Zahlung |

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/components/ServiceCard.svelte` | Optionaler Stripe-CTA-Button ("Ab X € direkt buchen") |
| `src/pages/leistungen.astro` | "Kaufen"-Button pro Paket in der Preistabelle |
| `src/config/brands/mentolder.ts` | `stripeServiceKey` pro leistungen-Eintrag ergänzen |

---

## Produkt-Mapping

| serviceKey | Stripe-Produktname | Preis (€) | Checkout verfügbar |
|---|---|---|---|
| `digital-cafe-einzel` | 50+ digital — Einzelstunde | 60,00 | ja |
| `digital-cafe-5er` | 50+ digital — 5er-Paket | 270,00 | ja (highlight) |
| `digital-cafe-10er` | 50+ digital — 10er-Paket | 500,00 | ja |
| `digital-cafe-gruppe` | 50+ digital — Gruppe | 40,00 | ja |
| `coaching-session` | Coaching — Einzelsession (90 Min.) | 150,00 | ja |
| `coaching-6er` | Coaching — 6er-Paket | 800,00 | ja (highlight) |
| `coaching-intensiv` | Coaching — Intensivtag | 500,00 | ja |
| `beratung-tag` | Unternehmensberatung | — | nein (→ Kontakt-CTA) |

Produkte werden beim ersten Checkout-Aufruf via Stripe API erstellt (Price-Lookup-Key). Kein manuelles Anlegen in der Konsole nötig.

---

## Umgebungsvariablen

| Variable | Quelle | Status |
|---|---|---|
| `STRIPE_SECRET_KEY` | workspace-secrets (beide Cluster) | bereits hinterlegt (sk_live) |
| `STRIPE_PUBLISHABLE_KEY` | workspace-secrets (beide Cluster) | bereits hinterlegt (pk_live) |
| `STRIPE_WEBHOOK_SECRET` | workspace-secrets (nach Webhook-Registrierung) | noch anzulegen |

---

## UI-Details

**ServiceCard (Homepage):**
- Jede Card mit `price`-Feld (außer Beratung) bekommt unter dem "Mehr erfahren"-Link einen zweiten Button: `💳 Ab [günstigster Preis] direkt buchen`
- Button löst `fetch('/api/stripe/checkout', { method: 'POST', body: JSON.stringify({ serviceKey }) })` aus, leitet bei Erfolg auf `data.url` weiter
- Loading-State während der API-Anfrage

**Leistungen-Seite:**
- Jede Preiszeile mit bekanntem `serviceKey` bekommt einen "Kaufen"-Button
- Highlight-Pakete: gold-border, prominenter CTA
- Beratung: Button ersetzt durch "Anfragen →" (Link zu /kontakt)

**Success-Seite `/stripe/success`:**
- Bestätigungstext: Produkt, Betrag, Hinweis "Gerald meldet sich innerhalb von 24h"
- BugReportWidget mit vorausgefüllter Kategorie `zahlung` am Seitenende

---

## Webhook-Flow

```
Stripe → POST /api/stripe/webhook
  Header: stripe-signature (HMAC-SHA256)
  Body: { type: "checkout.session.completed", data: { object: session } }
         │
  stripe.webhooks.constructEvent() — Signatur prüfen
         │
  Mattermost-DM an Gerald:
  "💳 Neue Zahlung: [Produkt] — [Betrag] € von [customer_email]"
```

Webhook-Endpoint ist öffentlich erreichbar (kein Auth-Guard), aber durch Stripe-Signaturprüfung gesichert.

---

## Fehlerbehandlung

- API-Endpoint gibt `{ error }` zurück bei ungültigem `serviceKey` oder Stripe-Fehler → ServiceCard zeigt Fehlermeldung
- Webhook: Signaturprüfung fehlgeschlagen → 400, kein Logging der Payload
- Stripe Checkout abgebrochen → stille Rückkehr zu `/leistungen` (kein Fehler-Banner)
- Zahlung fehlgeschlagen: Stripe-eigene Fehlermeldung auf hosted Checkout

---

## Nicht im Scope

- Rechnungserstellung via Invoice Ninja (separater Flow)
- Abo-/Subscription-Modelle
- Rückerstattungen (Stripe-Dashboard)
- Beratung-Tarif als Checkout (Preis variabel → Kontakt-Flow)
