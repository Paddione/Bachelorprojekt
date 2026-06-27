## Context

`build-website.yml` deployt beide Brands (mentolder + korczewski) in einem einzigen sequentiellen Job. Die korczewski Deploy-Steps werden komplett übersprungen wenn ein mentolder-Step fehlschlägt — ohne separate Fehlermeldung für korczewski. Resultat: 53% Erfolgsrate auf dem korczewski-Deploy (Ziel: ≥90%).

T001182 (g-cd01-korczewski-secret-drift) hat den Secret-Drift als Root Cause 1 behoben. Dieser Change behebt Root Cause 2: die sequentielle Job-Kopplung.

## Goals / Non-Goals

**Goals:**
- `build-website.yml` in 3 Jobs aufteilen: `build-image` → `deploy-mentolder` + `deploy-korczewski` (parallel, unabhängig)
- G-CD01 BATS-Tests für Brand-Parity-Garantie in `tests/spec/ci-cd.bats`
- Spec-Bereinigung: veraltete `build-website-korczewski.yml`-Referenzen in `openspec/specs/ci-cd.md` entfernen (Drift aus T001229)
- `tests/unit/website-ci-deploy.bats` an neue 3-Job-Struktur anpassen

**Non-Goals:**
- E2E-PR gegen korczewski auf PRs (nightly e2e.yml deckt das ab)
- Branch-protection required-checks ändern (build-website ist kein required check)
- Weitere Failure-Modi jenseits der sequentiellen Kopplung

## Decisions

**Separate Jobs statt Matrix:** Matrix-Jobs wären eleganter, aber Job-Outputs (IMAGE + SHA_TAG) sind über Matrix-Jobs schwieriger zu pipen. Separate, explizit benannte Jobs (`deploy-mentolder`, `deploy-korczewski`) sind einfacher zu debuggen und die GitHub Actions UI zeigt beide klar an.

**Job-Outputs für Image-Tags:** `build-image` exportiert `image` und `sha_tag` als `outputs:`, die Deploy-Jobs lesen per `needs.build-image.outputs.*`. Kein `GITHUB_ENV`-Trick nötig.

**Keine `continue-on-error`:** Option C (`continue-on-error: true` auf Steps) maskiert Fehler statt sie zu isolieren. Echte Job-Isolation ist die robuste Lösung.

**Deployment-Logik unverändert:** Die kubectl-, kustomize- und envsubst-Befehle in den Deploy-Steps bleiben byte-identisch. Nur die Job-Struktur ändert sich.

## Risks / Trade-offs

- **T001182 file_lock:** g-cd01-korczewski-secret-drift (T001182) hat `build-website.yml` als file_lock. Dieser Change muss NACH T001182-Merge landen oder koordiniert werden.
- **BATS-Test-Scope:** Die neuen G-CD01 BATS-Tests prüfen YAML-Struktur von `build-website.yml` (Job-Namen, needs-Relationen). Wenn die Job-Namen später umbenannt werden, müssen Tests mitkommen. Mitigation: Tests prüfen die semantische Eigenschaft ("korczewski hat kein needs auf deploy-mentolder") nicht den exakten String.
- **website-ci-deploy.bats Assertion-Anpassung:** Der Test `"Beide Workflows warten auf rollout status"` prüft auf 2 rollout-status-Calls in der Datei. Bei 3 Jobs (2 Deploy-Jobs) sind es weiterhin 2 Calls — je einer pro Deploy-Job. Test bleibt korrekt.
