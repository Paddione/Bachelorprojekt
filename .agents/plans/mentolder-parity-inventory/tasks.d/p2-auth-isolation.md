# p2 — Auth, Tenant-Identität und Isolation

Ziel: `docs/parity/mentolder-auth-isolation.md` mit belegtem Ist-Stand.

## Target (neu, kein S1-Limit — `.md` nicht in gates.yaml)

- `docs/parity/mentolder-auth-isolation.md`: neu, Auth/Isolation mit Evidenz.

## Tasks

- [x] **1. Tenant-Identität kartieren.** BRAND-Auflösung in
  `components/website/src/pages/api/booking.ts` (Env mit Fallback),
  Brand-CHECK-Constraints in den Migrationen und fehlenden Tenant-Parameter
  in `messaging-db.createInboxItem` mit exakter Quelle belegen. Als
  Audit-/Migrations-Befunde einordnen, nicht als Exploits.
- [x] **2. Auth und Mitgliedschaften kartieren.** Auth-Module
  (`components/website/src/lib/auth.ts`, `business-memberships.ts`) und
  Rollen-/Mitgliedschafts-Modell mit Evidenz beschreiben; URL-/Brand-Theme
  nicht mit Autorisierung gleichsetzen.
- [x] **3. Scope von Jobs, Dateien, Cache, Nachrichten, Rechnungen
  kartieren.** Für jede Kategorie belegen, ob und wie Mandanten-Scope
  umgesetzt ist (Schema-Erzwingung, Guards, Namensräume); ADR-003 als
  Namespace-Evidenz zitieren, nicht als Row-Level-Beweis.
- [x] **4. Isolations-Testlücken notieren.** Existierende
  Cross-Tenant-/Isolations-Tests referenzieren oder `kein Test` vermerken;
  beobachtete Lücken als Befund, nicht als Schwachstellen-Nachweis.
- [x] **5. Verify.** Datei existiert, jeder Mechanismus mit Quelle belegt,
  keine unbelegte Sicherheits-Aussage.
