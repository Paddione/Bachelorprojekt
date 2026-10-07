# Reuse-Bewertung und Systemgrenze (Massagepraxis)

**Ticket:** T901020 · **Epic:** T901016 Homepagedesign · **Stand:** 2026-10-07
**Vorgänger:** T901018 (done), T901019 (done)
**Hold:** Es gilt weiter der Nutzer-Hold — nur Recherche und Ticket-Updates,
kein Deployment, kein Rewrite, kein Löschen von Quell-Assets.
**Status:** Begrenzte Architektur-Bewertung, keine Implementierung.

## 1. Plattform-Richtung (User Direction, bestätigt)

- Gemeinsame mandantenfähige Small-Business-Plattform; die Massagepraxis ist
  der erste neue Mandant, Mentolder migriert danach.
- Fundamentgrenzen bewusst neu ziehen; bewährtes Domänenverhalten und Daten
  erhalten. Modulare Migration/Extraktion gegen Voll-Ersatz mit Parität-,
  Kosten- und Rollback-Evidenz abwägen — vor jeder Implementierung.
- Kein „perfekt“-Anspruch: Akzeptanz sind getestete Grenzen und
  beobachtbares Betriebsverhalten.
- Astro-Websites und Inhaber-UI bleiben getrennt von Domänen-Services;
  modularer Monolith zuerst, keine spekulativen Microservices.
- Optionale Capabilities je Mandant, explizite Provider-Adapter, eine Quelle
  für Leistungen/Preise/Einstellungen, versionierte Migrationen, kein
  Runtime-DDL in Request-Pfaden des neuen Kerns, durable Jobs/Outbox und
  Idempotenz wo nötig.
- Registry, Identitäten, Business-Mitgliedschaften, Domain-Mapping,
  Object Storage, Audit und Backup/Restore vor dem Domänen-Port klären.
- DB-/Schema-Isolationsansatz braucht ein ADR; RLS ist Kandidat, nicht
  als ausreichend angenommen.
- Pilot-Scope bleibt: Anfragen + Inhaber-Bestätigung + Kalender + Basis-
  Kunden/Rechnungen, Vortags-Cutoff Europe/Berlin, Praxis-vor-Ort mit
  Ausnahme-Hausbesuchen, keine Online-Zahlungen.

## 2. Verifizierter Mentolder-Befund (begrenzt, 2026-10-07)

Alle Pfade am Worktree-Stand geprüft; Zeilen sind Momentaufnahmen.

- **Stack** (`components/website/package.json`): Astro 7, Svelte 5,
  `pg` 8, Nodemailer, PDFKit, React 19 + `@astrojs/react`-Integration.
- **Anfrage-POST** (`components/website/src/pages/api/booking.ts`):
  `BRAND = process.env.BRAND || 'mentolder'` (Z. 10); Slot-Validierung
  gegen Admin-Fenster via `isSlotInAnyWindow(BRAND, …)` (Z. 44–54);
  Inbox-Item (Z. 74), Bestätigungsmail („wir melden uns mit einer
  Bestätigung“), Admin-Benachrichtigung (Z. 95–100).
- **Verfügbarkeit** (`components/website/src/lib/appointments-db.ts`):
  brand-skoped (Brand-Parameter, Brand-FK, PK enthält Brand); Slot-
  Whitelist (ab Z. 310); `claimSlot(brand, start)` (Z. 378). Ob der
  öffentliche POST den Claim nutzt, wurde nicht geprüft — keine
  Booking-Race-Safety behaupten.
- **Rechnungen/Zahlungen** (`components/website/src/lib/invoice-payments.ts`):
  Transaktion (BEGIN/COMMIT) + `SELECT … FOR UPDATE`-Lock (Z. 37–100);
  manuelle Methoden `sepa|cash|bank|other|legacy` (Z. 21).
- **Mandanten-Lücken (Audit-Punkte, kein Exploit-Nachweis):**
  `createInboxItem` (`messaging-db.ts`, Z. 29) hat keinen Mandanten-
  Parameter; Migration `20260719-brand-check-constraints.sql` erlaubt per
  CHECK nur `mentolder`/`korczewski`; ADR-003 beschreibt Isolation via
  Kubernetes-Namespaces — kein Beleg für Row-Level-Mandantentrennung.
- **Scope:** Mentolder ist breiter als das Mom-MVP — SDLC/LLM/Coaching-
  Interna gehören per Default nicht in den Small-Business-Kern.

## 3. Reuse/Build je Capability (Vorschlag)

| Capability | Entscheidung | Begründung |
|---|---|---|
| Anfrage-Flow (Validierung→Inbox→Ack→Admin) | Vertrag/Tests wiederverwenden | Muster passt zum MVP, Mandanten-Identität neu |
| Kalender/Verfügbarkeit (Fenster, Whitelist, Claim) | Verträge wiederverwenden, Claim-Pfad prüfen | Race-Safety erst nach Review behaupten |
| Nachrichten/Inbox | Neu mit Mandanten-Scope | `createInboxItem` heute ohne Tenant-Parameter |
| Kunden/Stammdaten | Neu (T901019-Mindestfelder) | Keine Mentolder-Daten vererben |
| Rechnungen/Zahlungen | Transaktions-/Lock-Muster wiederverwenden | Manuelle Methoden passen (kein Online-Payment) |
| Website (Astro) | Basis wiederverwenden | Astro bleibt Website-Fundament |
| Auth/Identitäten/Mitgliedschaften | Neu entscheiden | Realm-/Rollen-Modell pro Mandant fehlt |
| Storage/Backup/Secrets | Neu entscheiden | Vor Domänen-Port zu klären (Abschnitt 1) |

Grundsatz: Verträge und Tests wiederverwenden, kein ungeprüftes Kopieren.
URL oder Brand-Theme niemals mit Autorisierung gleichsetzen.

## 4. Datenflüsse und Integrationsverträge (Ziel)

- Anfrage → Inbox → Inhaber-Bestätigung → Kalender → Besuch →
  Rechnung (bezahlt/unbezahlt) — durchgehend mit serverseitig
  verifizierter Mandanten-Identität.
- Mitgliedschaft/Rollen trennen Businesses, Brands und Benutzer;
  Schema-Level-Enforcement; Jobs, Dateien, Cache, Nachrichten und
  Rechnungen sind mandanten-skoped; Cross-Tenant-Tests belegen die
  Trennung (T901035-Scope).

## 5. Lizenzpolitik (Engineering-Regel, keine Rechtsberatung)

- Eigener Plattform-/Tooling-Code bleibt MIT (`LICENSE` verifiziert).
- HyperUI, shadcn-svelte, Bits UI nur unter ihren MIT-Lizenzen mit
  verifizierten Revisionen, Dependency-Closure und erhaltenen
  Copyright-/Lizenzhinweisen.
- Apache-2.0-Abhängigkeiten/Skills erlaubt mit LICENSE/NOTICE und
  Änderungsvermerken.
- Epicenter-Pakete/Apps sind AGPL-3.0-or-later: ihren Custom-Code nicht
  in den MIT-Kern einbetten/kopieren oder als MIT umetikettieren.
  AGPL-Übernahme bräuchte eine eigene Architektur-/Lizenzentscheidung mit
  Compliance-Plan (Combined Work, Source-Offer inkl. Netzwerknutzung).
- Historische MIT-Releases nur nach verifiziertem Archiv + vollständiger
  Lizenzprüfung; Default ist gepflegtes permissives Upstream.
- Design-Repo-Code darf MIT sein; jedes Asset dokumentiert Quelle,
  Owner, Lizenz und Rechte. Repo startet privat; Material mit ungeklärten
  Rechten wird quarantäniert, nicht publiziert. Bestehende gültige
  MIT-Grants werden nicht entzogen.

## 6. Asset-Konsolidierung (Design-Repo, Vorschlag)

- Separates Designs-Repository; Name/Remote/Sichtbarkeit vor Anlage
  bestätigen lassen.
- Verifizierte Inventar-Kandidaten (Existenz 2026-10-07 geprüft):
  `assets/{branding,brands,art-library,design-overviews}`, `.design-sync`,
  `packages/design-system`, `design/leitstand-ds`,
  `components/website/public/brand` (+ Komponentenkopien).
- Verbote: `scripts/assets-sync.sh` (enthält `rsync --delete`) nicht als
  Inventurschritt laufen lassen; `scripts/assets-index.sh` ist ein
  Registry-Updater, kein Read-only-Inventur-Tool.
- Kopplung bewusst entflechten: `packages/design-system/build.mjs` liest
  `website/public/brand/mentolder/colors_and_type.css` (Z. 23–25) —
  Extraktion kehrt Consumer→Source-Bezug gezielt um.
- Vorgeschlagene Struktur: `brands/<brand>/{identity,tokens,content,source}`,
  `shared/{tokens,icons,components}`, `generators/{scripts,workflows,recipes}`,
  `catalogs/`, `licenses/`, `previews/`, `archived/`; Laufzeit-Uploads
  bleiben operationeller Storage, keine committeten Kundendaten.
- Provenienz je Asset: stabile ID, Hash, Herkunft, Source-vs-Derivat,
  Lizenz/Rechte, Brand, Verwendung, Format, Generator-Version/Prompt/Seed/
  Modell-Lizenz, Consumer-Mapping. Keine API-Keys, Kundendaten, privaten
  Porträts ohne Einwilligung oder Modell-Binaries committen.
- Migration copy-first mit Hash-Prüfung, Verlaufserhalt wo sinnvoll,
  Kompatibilitäts-URLs und Rollback; alte Quellen erst nach bestandenem
  Consumer-Verifikations- und Cleanup-Gate löschen. Releases/Manifeste/
  Pakete gepinnt mit Checksums; Consumer nutzen kein mutable `latest`
  und keine absoluten WSL-Pfade.

## 7. Roadmap-Tickets (aus dem Ticket übernommen)

- Plattform-Epic T901030: T901032 (Reuse-Policy + Lizenz-Manifest),
  T901033 (Mentolder-Paritäts-Inventar), T901034 (Plattform-ADR, nach
  T901032+T901033), T901035 (Tenant-Isolation mit zwei Test-Businesses),
  T901036 (Shared-Module Pilot), T901037 (Mentolder-Migration mit Parität
  und Rollback).
- Design-Repo-Epic T901031: T901038 (WSL-Asset-Inventar), T901039
  (Repo-Layout + Provenienz + reproduzierbare Builds, nach T901038+T901032),
  T901040 (Consumer auf gepinnte Releases, nach T901039).

## 8. Evidenz und Grenzen

- Ticket-Evidenz: Checkout `0ff76b4e8`, K3-Projekt
  `home-patrick-Bachelorprojekt`, Generation 2026-10-04T11:30:58Z,
  Coverage-Aufzeichnung vollständig für die untersuchten Buchungs-/
  Zahlungs-Pfade (SQL-Migration Teilscope, voll gelesen).
- Diese Chore hat zusätzlich alle zitierten Implementierungsdateien am
  Stand 2026-10-07 auf Existenz und Kernaussage verifiziert (Abschnitt 2).
- Grenzen: begrenzte Bewertung, kein vollständiges Capability-/Security-
  Audit; keine Live-DB gelesen, kein Produktions-Verhaltenstest; K3 war in
  dieser Sitzung nicht exponiert und ist nicht re-verifiziert.
- Der Hold aus dem Ticket (nur Recherche + Ticket-Updates) gilt weiter.

## 9. Offene Fragen (Folge-Scope, hier nur benannt)

- Tenant-Isolationsansatz + RLS-Eignung (ADR, T901034).
- Registry, Identitäten, Mitgliedschaften, Domain-Mapping, Object Storage,
  Audit, Backup/Restore, Secrets-Management.
- Inhaber-Auth, Kalender-Source-of-Truth, Hosting/Domain.
- Design-Repo: Name, Remote, Sichtbarkeit, Storage (LFS/Object Store).
