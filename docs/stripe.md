<div class="page-hero">
  <span class="page-hero-icon">💳</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Stripe-Integration</div>
    <p class="page-hero-desc">Zahlungsgateway-Konfiguration, Stripe Checkout und Webhook-Setup fuer direkte Zahlungsabwicklung auf der Website.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Website &amp; Admin</span>
      <span class="page-hero-tag">Stripe</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Stripe-Integration

Die Website (mentolder.de / korczewski.de) wickelt Zahlungen direkt ueber Stripe Checkout ab — ohne separate Rechnungssoftware. Kunden bezahlen Leistungen auf der Homepage oder der Leistungen-Seite per Kreditkarte oder SEPA.

---

## Voraussetzungen

- Stripe-Konto unter [dashboard.stripe.com](https://dashboard.stripe.com)
- API-Keys (Publishable Key + Secret Key) aus dem Stripe Dashboard
- Produkte / Preise in Stripe angelegt und deren `price_id` bekannt

---

## Umgebungsvariablen

| Variable | Wo | Beschreibung |
|----------|----|--------------|
| `STRIPE_SECRET_KEY` | `workspace-secrets` (K8s Secret) | Stripe Secret Key (`sk_live_…` oder `sk_test_…`) |
| `STRIPE_PUBLISHABLE_KEY` | `workspace-secrets` (K8s Secret) | Stripe Publishable Key (`pk_live_…` oder `pk_test_…`) |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Astro Build Env | Wird beim Build aus `workspace-secrets` injiziert |

Die Keys werden per `envFrom` in den Website-Pod injiziert (`k3d/website.yaml`).
Produkt-Konfiguration (welcher `price_id` auf welchem Angebot liegt) erfolgt ueber `mentolder.config.ts` / `korczewski.config.ts`.

---

## Website-Checkout einrichten

### 1. Stripe-Keys als Secret speichern

```bash
# Keys im Cluster-Secret setzen (Werte base64-kodiert)
kubectl edit secret workspace-secrets -n workspace
# STRIPE_SECRET_KEY: <base64(sk_…)>
# STRIPE_PUBLISHABLE_KEY: <base64(pk_…)>
```

### 2. Website redeployen

```bash
task website:redeploy
```

### 3. Produkte konfigurieren

In der Brand-Konfig (`website/src/config/mentolder.config.ts`):

```ts
homepage: {
  service: {
    stripeServiceKey: 'price_xxxxxxxxxxxxx',  // Stripe Price ID
    // ...
  }
}
```

Auf der Leistungen-Seite kann jeder Service-Karte eine `stripeServiceKey` (Price ID) zugewiesen werden.

---

## Test vs. Live

| Modus | Publishable Key | Beschreibung |
|-------|-----------------|--------------|
| Test | `pk_test_…` | Stripe-Testkarten, keine echten Zahlungen |
| Live | `pk_live_…` | Echte Zahlungen |

Das Setup-Skript erkennt den Modus automatisch anhand des Publishable-Key-Praefixes.

**Stripe-Testkarten:**

| Karte | Nummer | Ergebnis |
|-------|--------|---------|
| Visa | `4242 4242 4242 4242` | Zahlung erfolgreich |
| Mastercard | `5555 5555 5555 4444` | Zahlung erfolgreich |
| Fehler | `4000 0000 0000 0002` | Karte abgelehnt |

---

## Fehlersuche

**Checkout-Seite laedt nicht / JS-Fehler:**
- Pruefen ob `PUBLIC_STRIPE_PUBLISHABLE_KEY` im Pod vorhanden: `kubectl exec -n website deploy/website -- env | grep STRIPE`
- Website neu deployen: `task website:redeploy`

**``No such price`` Fehler:**
- Price ID in der Brand-Konfig stimmt nicht mit dem Stripe-Dashboard ueberein
- Test- und Live-Keys/Prices nicht mischen
