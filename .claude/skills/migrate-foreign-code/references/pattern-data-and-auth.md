# Pattern: Daten & Auth in der Plattform (beide Brands)

Wie Persistenz, Zwischendaten und Authentifizierung der migrierten App in die Plattform eingebettet werden.

## Muster (generisch)

- **Persistenz:** eine neue, isolierte DB in der **zentralen `shared-db`** statt einer eigenen
  Datenbank-Instanz.
- **Zwischendaten** (Uploads, Schnitt-Artefakte): ein **RWO-PVC** mit single-replica
  `Recreate`-Strategie.
- **Auth: host-owned.** Die App vertraut dem Host; SSO läuft über Keycloak/oauth2-proxy. Die App
  bringt **keine** eigene Auth mit.
- **Domain-Auflösung** zentral über `configmap-domains`.
- **Multi-Brand:** Die Brands sind **separate per-Brand-Deployments im selben Fleet-Cluster**
  (Namespaces `workspace` + `workspace-korczewski`). Cross-cutting-Änderungen — DB-Anlage,
  OIDC-Clients, Schema-Migrationen — müssen **explizit in beide Namespaces** ausgerollt werden.

## VideoVault-Beispiel

Neue DB `videovault` in der zentralen `shared-db`; Upload-PVC (RWO, `Recreate`) für
Schnitt-Zwischendaten; Auth durch den Workspace-Host (Keycloak); Auslieferung in beide Brands.

## Stolpersteine

- **Beide Namespaces nicht vergessen:** ein Roll-out nur in `workspace` lässt den korczewski-Brand
  ohne DB/OIDC zurück. Das gilt für jede cross-cutting Änderung.
- **Mechanik nicht duplizieren — routen:** für OIDC-/Realm-Arbeit auf `keycloak-realm-sync`, für
  Credentials auf `secret-rotation`, für den Cross-Brand-Fan-out auf `cluster-deployment` (Phase 5) verweisen.
