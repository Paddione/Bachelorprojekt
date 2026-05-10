<div class="page-hero">
  <span class="page-hero-icon">🧭</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Decision-Log</div>
    <p class="page-hero-desc">Architekturentscheidungen mit Kontext, Konsequenz und Datum.</p>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Decision-Log

<p class="kicker">Referenz · Architektur-Entscheidungen</p>

Chronologisch, neueste zuerst. Jeder Eintrag hält fest, *warum* wir etwas geändert haben — nicht *was* (das steht im Code und im Git-Log).

---

## 2026-05-05 — Korczewski- und Mentolder-Cluster vereinen

**Status:** akzeptiert · gerollt am 2026-05-05

**Kontext:** Wir betrieben zwei separate k3s-Cluster (mentolder + korczewski) hinter zwei Hostgruppen. Cross-Cluster-Operations waren teuer, die Nodes der Korczewski-Box waren im Schnitt zu 30 % ausgelastet, ArgoCD musste zwei Cluster verwalten.

**Entscheidung:** Die korczewski-Nodes traten der mentolder-Cluster bei. korczewski.de läuft jetzt im Namespace `workspace-korczewski` auf demselben physischen Cluster, mit demselben Traefik. Der `korczewski`-kubeconfig-Kontext zeigt jetzt auf `pk-hetzner` (Cluster-API).

**Konsequenz:** Eine Cluster-Version, eine ArgoCD-Instanz, eine Backup-Strategie. Im Gegenzug brauchen alle Korczewski-Workloads `workspace-namespace`-Annotationen + `workspace-korczewski`-Labels in den ApplicationSets.

---

## 2026-05-09 — Stripe komplett rausnehmen

**Status:** akzeptiert

**Kontext:** Stripe-Integration war vorgesehen für Coaching-Buchungen, wurde aber nie aktiv genutzt. Die Maintenance-Last (Webhooks, PCI-Zone-Hygiene, Test-Mocks) war hoch.

**Entscheidung:** Stripe-Code, -Webhooks, -Tasks und -Secrets vollständig entfernt. Services-Seiten linken auf Kontakt-Formular, keine Buchungs-Buttons.

**Konsequenz:** ~1500 Zeilen Code weg, weniger Compliance-Pflichten. Falls Buchung später kommt, wird sie neu evaluiert.

---

## 2026-04-22 — Mattermost und InvoiceNinja entfernen

**Status:** akzeptiert · superseded by Custom Messaging in Astro-Website (siehe nächster Eintrag)

**Kontext:** Mattermost als Chat und InvoiceNinja als Rechnungs-Tool waren als externe Container eingebunden. Beide hatten eigene Backups, eigene OIDC-Klemmen, eigene UI-Sprünge — Reibung im Tagesbetrieb.

**Entscheidung:** Beide Services entfernt. Chat zieht in die Astro-Website. Rechnungslogik wird durch DocuSeal + manuelle ZUGFeRD-Erstellung ersetzt.

**Konsequenz:** Weniger bewegliche Teile, einheitlicher SSO-Pfad. Test-Suite hat einige FA-/SA-Lücken (FA-22, SA-06, SA-09 entfernt) — Gaps in der Nummerierung sind beabsichtigt.

---

## 2026-04-16 — Custom Messaging in der Astro-Website (statt Mattermost)

**Status:** akzeptiert

**Kontext:** Nach Mattermost-Entfernung brauchten wir weiter Chat. Die Astro-Website hatte bereits eigenes Auth + DB.

**Entscheidung:** Chat als Svelte-Insel direkt in `web.{DOMAIN}/portal/chat`. Backend = `/api/chat/*`-Endpoints in der Website, Storage in der `website`-DB.

**Konsequenz:** Ein einziges Frontend, keine OIDC-Verkettung mehr für Chat. Featureset bleibt schlank — bewusst kein Mattermost-Klon.

---

## 2026-05-04 — LiveKit für Streaming (statt Janus-only)

**Status:** akzeptiert

**Kontext:** Janus reichte für Talk-Calls, aber nicht für RTMP-Ingest und Webinar-Recording. Wir wollten OBS-Integration und MP4-Aufzeichnungen.

**Entscheidung:** LiveKit-Server, -Ingress (RTMP) und -Egress (Recording) deployen. `hostNetwork: true` + Node-Pinning auf `gekko-hetzner-3`. DNS-Pin der `livekit.{DOMAIN}`-A-Records auf den Pin-Node.

**Konsequenz:** RTMP funktioniert, Recordings landen im Egress-PVC. Trade-off: ein hostNetwork-Pod im `workspace`-Namespace + privilegiertes pod-security-Profil dort.

---

## 2026-04-10 — SealedSecrets statt envsubst-Workflow

**Status:** akzeptiert · PR #61

**Kontext:** Vorheriger Ansatz: `.env`-Datei + `envsubst` über Manifeste. Geheimnisse waren nie im Repo, dafür auf jedem Maintainer-Laptop. Onboarding-Schmerz, Rotation-Chaos.

**Entscheidung:** Bitnami SealedSecrets. Plaintext in `environments/.secrets/<env>.yaml` (gitignoriert), versiegelt nach `environments/sealed-secrets/<env>.yaml` (committed). Cluster entschlüsselt mit privatem Key.

**Konsequenz:** Geheimnisse leben mit dem Code im Repo, sind reproduzierbar deploybar. Rotation = neuer `env:seal`-Lauf. Drift-Gefahr: jede manuelle `kubectl edit secret`-Aktion wird beim nächsten Deploy überschrieben.

---

## Foundation — k3d/k3s + Kustomize als einziger Deploy-Pfad

**Status:** akzeptiert · keine Alternative aktiv

**Kontext:** Anfangs gab es zusätzlich docker-compose-Dateien für lokale Entwicklung. Zwei Deploy-Pfade führten zu Drift (Service-A funktionierte in compose, nicht in k8s).

**Entscheidung:** docker-compose entfernt. Nur k3d (lokal) und k3s (prod), beide identisch via Kustomize gefüttert.

**Konsequenz:** Lokal = Prod (modulo Overlay). Onboarding braucht Docker + k3d, etwas mehr als compose. Wert: keine Drift-Klassen mehr.
