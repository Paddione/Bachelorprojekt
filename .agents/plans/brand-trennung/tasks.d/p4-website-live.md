# p4 — Website korczewski live + CI-Refs

## Ziel
1. `prod-fleet/website-korczewski/{kustomization,website-patch,website-ingress-web}.yaml`
   auf live-Stand (Content-Marke korczewski existiert unter
   `components/website/content/korczewski/`; BRAND-Mechanismus verifizieren,
   keine neuen Content-Dateien erfinden).
2. Deploy: `task fleet:deploy:brand BRAND=fleet-korczewski` (nach p3-Freigabe;
   ohne Cluster-Kontakt: Manifeste fertig + `workspace:validate` grün, Deploy
   als dokumentierter Folge-Schritt).
3. Verifikation: `https://web.korczewski.de` → 200,
   `https://korczewski.de` → 301 auf web (curl-Beleg wie #7051-Muster).
4. CI-Refs: `.github/workflows/e2e.yml` korczewski-Block reaktivieren
   (Kommentar-Block aus T002602 zurückdrehen), `lighthouserc.json`-URL auf
   `https://web.korczewski.de`. Danach `task lint:workflows`.

## Gates
- curl-Belege 200/301 im PR-Body (oder „Deploy ausstehend" mit Grund).
- `task lint:workflows` grün.
