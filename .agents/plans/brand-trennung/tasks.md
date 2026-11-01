---
title: "brand-trennung — korczewski-Voll-Unfreeze + mentolder-Alles-raus, Aufbau-zuerst (Goal brand-trennung)"
domains: [infra, website]
status: active
goal: brand-trennung
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brand-trennung — Implementation Plan

Zweck (Deutsch): Markentrennung per Eigner-Entscheidung 2026-11-01 —
unser Repo wird korczewski-only und voll live-fähig (Unfreeze),
mentolder fliegt vollständig raus (Manifeste, Envs, Content, Code),
sein DNS (ipv64) und sein Repo (`mentolder-prod`) bleiben seine Sache.
Aufbau-zuerst: kein mentolder-Abriss vor verifiziertem korczewski-Live.

## File Structure

| Datei | Ist-Zeilen | Status |
|---|---|---|
| `docs/agent-guide/brand-separation-inventory.md` | 0 (neu) | neu (`.md` ungated) |
| `flux/clusters/fleet/ks-korczewski.yaml` | 40 | ändern (`suspend: false` + Skalierung, `.yaml` ungated) |
| `flux/clusters/fleet/ks-jobs-korczewski.yaml` | 24 | ändern (`.yaml` ungated) |
| `flux/clusters/fleet/ks-website-korczewski.yaml` | 25 | ändern (`.yaml` ungated) |
| `flux/clusters/fleet/ks-korczewski-auth.yaml` | 34 | ändern (`.yaml` ungated) |
| `environments/fleet-korczewski.yaml` | 125 | ändern/prüfen (`.yaml` ungated) |
| `environments/korczewski-prod.yaml` | — | prüfen (`.yaml` ungated) |
| `prod-fleet/website-korczewski/kustomization.yaml` | — | ändern (`.yaml` ungated) |
| `prod-fleet/website-korczewski/website-patch.yaml` | — | ändern (`.yaml` ungated) |
| `prod-fleet/website-korczewski/website-ingress-web.yaml` | — | ändern (`.yaml` ungated) |
| `.github/workflows/e2e.yml` | 283 | ändern (korczewski-Block reaktivieren, `.yml` ungated) |
| `lighthouserc.json` | 27 | ändern (URL → web.korczewski.de, `.json` ungated) |
| `prod-fleet/website-mentolder/kustomization.yaml` | 23 | LÖSCHEN |
| `prod-fleet/website-mentolder/website-ingress-web.yaml` | 53 | LÖSCHEN |
| `prod-fleet/website-mentolder/website-patch.yaml` | 15 | LÖSCHEN |
| `prod-fleet/website-mentolder/website-security-headers.yaml` | 19 | LÖSCHEN |
| `prod-fleet/mentolder/kustomization.yaml` | 343 | LÖSCHEN |
| `prod-fleet/mentolder/studio-ingress.yaml` | 23 | LÖSCHEN |
| `prod-fleet/mentolder/studio-patch.yaml` | 27 | LÖSCHEN |
| `flux/clusters/fleet/ks-mentolder.yaml` | 42 | LÖSCHEN |
| `flux/clusters/fleet/ks-jobs-mentolder.yaml` | 19 | LÖSCHEN |
| `flux/clusters/fleet/ks-website-mentolder.yaml` | 18 | LÖSCHEN |
| `environments/fleet-mentolder.yaml` | 127 | LÖSCHEN |
| `environments/mentolder.yaml` | — | LÖSCHEN |
| `components/mentolder-web/package.json` | — | LÖSCHEN (Repräsentant, ganzes Verzeichnis fliegt) |
| `components/mentolder-web/Dockerfile` | — | LÖSCHEN (Repräsentant) |
| `components/mentolder-web/nginx.conf` | — | LÖSCHEN (Repräsentant) |
| `components/website/content/mentolder/faq.json` | — | LÖSCHEN |
| `components/website/content/mentolder/footer.json` | — | LÖSCHEN |
| `components/website/content/mentolder/homepage-blocks.json` | — | LÖSCHEN |
| `components/website/content/mentolder/homepage.json` | — | LÖSCHEN |
| `components/website/content/mentolder/kontakt.json` | — | LÖSCHEN |
| `components/website/content/mentolder/kore-flags.json` | — | LÖSCHEN |
| `components/website/content/mentolder/leistungen.json` | — | LÖSCHEN |
| `docs/agent-guide/registry/domains.yaml` | 301 | umschreiben (mentolder raus, korczewski live + expect, `.yaml` ungated) |
| `docs/agent-guide/maps/domains-map.md` | generiert | regenerieren + committen |

Verbraucht: `task fleet:dns:cutover` (vorhanden, plan→cutover),
`task fleet:deploy:brand BRAND=fleet-korczewski` (vorhanden),
`docs/runbooks/credentials-finden.md` (Secrets-Prozedur),
Apex-Redirect-Muster (`website-apex.yaml`, nur als Negativ-Referenz —
kein Redirect für mentolder, sondern Abriss).
Produziert: live korczewski-Stack + mentolder-freies Repo + Beleg-Inventar.
S4: jede Stufe ist per Task/Workflow-Beleg erreichbar (Deploy-Logs,
cutover-State, Guard-Läufe).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-inventar.md | impl | `docs/agent-guide/brand-separation-inventory.md` |  |
| p2 | tasks.d/p2-unfreeze.md | impl | `flux/clusters/fleet/ks-korczewski.yaml`, `flux/clusters/fleet/ks-jobs-korczewski.yaml`, `flux/clusters/fleet/ks-website-korczewski.yaml`, `flux/clusters/fleet/ks-korczewski-auth.yaml` | p1 |
| p3 | tasks.d/p3-envs-dns.md | impl | `environments/fleet-korczewski.yaml`, `environments/korczewski-prod.yaml` | p2 |
| p4 | tasks.d/p4-website-live.md | impl | `prod-fleet/website-korczewski/kustomization.yaml`, `prod-fleet/website-korczewski/website-patch.yaml`, `prod-fleet/website-korczewski/website-ingress-web.yaml`, `.github/workflows/e2e.yml`, `lighthouserc.json` | p3 |
| p5 | tasks.d/p5-mentolder-infra-weg.md | impl | `prod-fleet/website-mentolder/kustomization.yaml`, `prod-fleet/website-mentolder/website-ingress-web.yaml`, `prod-fleet/website-mentolder/website-patch.yaml`, `prod-fleet/website-mentolder/website-security-headers.yaml`, `prod-fleet/mentolder/kustomization.yaml`, `prod-fleet/mentolder/studio-ingress.yaml`, `prod-fleet/mentolder/studio-patch.yaml`, `flux/clusters/fleet/ks-mentolder.yaml`, `flux/clusters/fleet/ks-jobs-mentolder.yaml`, `flux/clusters/fleet/ks-website-mentolder.yaml`, `environments/fleet-mentolder.yaml`, `environments/mentolder.yaml` | p4 |
| p6 | tasks.d/p6-mentolder-code-weg.md | impl | `components/mentolder-web/package.json`, `components/mentolder-web/Dockerfile`, `components/mentolder-web/nginx.conf`, `components/website/content/mentolder/faq.json`, `components/website/content/mentolder/footer.json`, `components/website/content/mentolder/homepage-blocks.json`, `components/website/content/mentolder/homepage.json`, `components/website/content/mentolder/leistungen.json`, `components/website/content/mentolder/kontakt.json`, `components/website/content/mentolder/kore-flags.json`, `components/website/content/mentolder/navigation.json`, `components/website/content/mentolder/referenzen.json`, `components/website/content/mentolder/seo.json`, `components/website/content/mentolder/services.json`, `components/website/content/mentolder/stammdaten.json`, `components/website/content/mentolder/ueber-mich.json` | p5 |
| p7 | tasks.d/p7-registry-verify.md | tests | `docs/agent-guide/registry/domains.yaml`, `docs/agent-guide/maps/domains-map.md` | p6 |
| p8 | tasks.d/p8-render-raus.md | tests | `scripts/flux-render-artifact.sh`, `tests/py/spec/test_flux_render_and_security.py` | p5 |

## Tasks

- [x] **1. Partial p1** (`tasks.d/p1-inventar.md`): Voll-Inventar mentolder-Oberfläche.
- [x] **2. Partial p2** (`tasks.d/p2-unfreeze.md`): korczewski-Flux-Suspend lösen.
- [x] **3. Partial p3** (`tasks.d/p3-envs-dns.md`): Envs/Secrets + DNS-Cutover (mit Eigner-STOPP).
- [x] **4. Partial p4** (`tasks.d/p4-website-live.md`): Website korczewski live + CI-Refs.
- [x] **5. Partial p5** (`tasks.d/p5-mentolder-infra-weg.md`): mentolder-Manifeste/Envs raus (mit Prune-STOPP).
- [x] **6. Partial p6** (`tasks.d/p6-mentolder-code-weg.md`): mentolder-web + Content raus.
- [x] **7. Partial p7** (`tasks.d/p7-registry-verify.md`): Registry-Umschreibung + Guards grün + Belege.
- [ ] **8. Partial p8** (`tasks.d/p8-render-raus.md`): Render-Skript mentolder-frei + Render-Tests grün (Nachtrag, CI-Gate für diesen PR).
- [ ] **9. Finaler Verifikations-Task.** `task test:changed`,
  `task freshness:regenerate`, `task freshness:check`.
