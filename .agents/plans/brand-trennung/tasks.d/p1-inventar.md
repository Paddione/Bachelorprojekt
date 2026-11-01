# p1 — Voll-Inventar mentolder-Oberfläche (read-only)

## Ziel
`docs/agent-guide/brand-separation-inventory.md` (neu): jede mentolder-Referenz
im Repo mit Datei:Zeile, gruppiert: (a) Hosts/DNS (`mentolder.de`-Hosts,
ipv64-Referenzen, Zertifikate), (b) Manifeste/Flux (`prod-fleet/mentolder*`,
`ks-mentolder*`, `website-mentolder`), (c) Envs/Secrets
(`environments/*mentolder*`, Sealed-Secrets-Namen — Inhalte NICHT öffnen,
nur Namen zählen), (d) Code/Content (`components/mentolder-web/`,
`components/website/content/mentolder/`, Docs mit mentolder-Bezug),
(e) CI/Workflows/Skripte (`ENV=mentolder`, `e2e.yml`-Matrix, `lighthouserc`,
`fleet:dns`-Quellen), (f) OIDC-Clients (Pocket-ID mentolder).

## Methode
Nur `grep -rn` + `ls` (Musterliste aus Goal-Kriterium 4:
`mentolder\.de`, `fleet-mentolder`, `website-mentolder`, `mentolder-web`,
`react\.mentolder`, `ENV=mentolder`, `PROD_DOMAIN.*mentolder`).
Keine Änderung, kein Löschen, kein Cluster-Kontakt in p1.

## Gates
- Jede Datei aus tasks.md-File-Structure (p5/p6-Zeilen) ist im Inventar mit
  Zeilenzahl belegt; Abweichungen (Datei fehlt/mehr gefunden) werden im
  Inventar als Delta-Tabelle geführt → p5/p6 lesen sie verbindlich.
- Inventar endet mit Zählung (Dateien, Zeilen, Secrets-Namen).
