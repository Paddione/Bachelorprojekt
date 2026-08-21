---
title: "gitlab-registry-mirror — Design"
ticket_id: T012415
domains: [ci-cd, fleet-operations]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: gitlab-registry-mirror

## D1 — Spiegeln statt in GitLab neu bauen

**Entscheidung:** Die GitHub-Workflows pushen ihre bereits gebauten Artefakte
zusaetzlich nach `registry.gitlab.com`. `.gitlab-ci.yml` bekommt **keine**
Build-Jobs.

**Der entscheidende Zwang ist die Signatur, nicht der Aufwand.**
`flux/clusters/fleet/oci-source.yaml` verifiziert das Artefakt hart:

```yaml
verify:
  provider: cosign
  matchOIDCIdentity:
    - issuer: ^https://token\.actions\.githubusercontent\.com$
      subject: ^https://github\.com/Paddione/Bachelorprojekt/\.github/workflows/render-fleet-artifact\.yml@refs/heads/main$
```

Ein in GitLab **neu gebautes** Artefakt traegt eine GitLab-OIDC-Identitaet und
faellt durch diese Pruefung. Es zuzulassen hiesse, eine zweite Identitaet in die
Policy aufzunehmen — also die Supply-Chain-Zusicherung aufzuweichen, um eine
Verfuegbarkeitsluecke zu schliessen. Ein **kopiertes** Artefakt behaelt dagegen
seine Signatur, weil cosign an den Digest bindet und nicht an den Ablageort.
Deshalb ist der Spiegel nicht nur der billigere, sondern der einzige Weg, der die
Policy unangetastet laesst.

**Verworfen:** "GitLab baut selbst". Zusaetzlich zur Policy-Aufweichung haette es
zehn Build-Jobs dupliziert und den Runner belastet, der laut Etappe-2-Messung
ohnehin der Engpass ist (`pk-hetzner-8` bei 96 % CPU-Requests).

**Grenze, die daraus folgt:** Waehrend eines GitHub-Ausfalls entstehen **keine
neuen** Artefakte. Der Change sichert Rollout und Rollback bereits gebauter
Staende — mehr nicht. Das ist bewusst so und gehoert ins Runbook, damit im
Ernstfall niemand einen frischen Build erwartet.

## D2 — `cosign copy`, nicht `crane copy`

Die cosign-Signatur liegt nicht im Manifest, sondern als eigenes Tag
(`sha256-<digest>.sig`) neben dem Artefakt. `crane copy` auf den Artefakt-Tag
kopiert dieses Nebentag **nicht** mit — der Spiegel waere unsigniert und Flux
wuerde ihn nach der Umschaltung genau deshalb ablehnen. Der Fehler faellt beim
Kopieren nicht auf, sondern erst im Ausfall, wenn der Spiegel gebraucht wird.
`cosign copy` kopiert Artefakt und zugehoerige Signaturen gemeinsam.

## D3 — Umschaltung manuell, zweite Quelle suspendiert

**Entscheidung:** Eine zweite `OCIRepository` (`fleet-manifests-gitlab`) wird
angelegt und `suspend: true` gesetzt. Die Umschaltung im Ausfall ist ein
Runbook-Schritt, kein Automatismus.

Flux' `OCIRepository` kennt keine Multi-Quelle mit Fallback; ein automatischer
Schwenk braeuchte einen eigenen Controller. Wichtiger ist das Argument, das im
Repo schon einmal entschieden wurde: Ein selbsttaetiges Ausweichen verbirgt den
Ausfall, und ein Ausfall, den niemand bemerkt, wird nicht behoben
(`docs/runbooks/gitlab-runner.md` §6 zu `CI_RUNNER_TAG`). Dieser Change folgt
derselben Linie statt daneben eine zweite Konvention zu etablieren.

**Beide Richtungen gehoeren ins Runbook.** Der Rueckweg ist der Schritt, der
vergessen wird: Bleibt die Quelle nach dem Ausfall auf GitLab, reconciled Flux
dauerhaft aus einem Spiegel, der nur so frisch ist wie der letzte
GitHub-Actions-Lauf — ohne dass irgendetwas rot wird.

## D4 — Credentials

Der Push braucht ein GitLab-Token mit `write_registry`. Es kommt als
GitHub-Secret `GITLAB_REGISTRY_TOKEN` dazu, getrennt vom bestehenden
`GITLAB_MIRROR_TOKEN` (`write_repository`) — ein Token, das beides darf, waere
im Ausfall genau der Schluessel, dessen Kompromittierung beide Wege zugleich
trifft.

Clusterseitig wird das Pull-Token als SealedSecret `gitlab-registry-auth`
hinterlegt (Muster: bestehendes `ghcr-auth`). Es wird bereitgestellt, aber von
keinem Deployment referenziert, solange die Umschaltung nicht erfolgt ist.
