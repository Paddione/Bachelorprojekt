---
title: GHCR-Digest-Resolve scheitert an nicht-verknüpftem Package
ticket_id: T002837
domains: [ci, infra]
status: active
---

# GHCR-Digest-Resolve scheitert an nicht-verknüpftem Package

## Purpose

`render-fleet-artifact.yml` bricht seit PR #3877 bei jedem Push auf `main` ab. Damit entsteht
kein neues OCI-Artefakt, und Flux reconciled den fleet-Cluster stumm weiter auf einer alten
Revision. Dieser Change stellt die Registry-Authentifizierung des Renderers auf denselben Weg
um, den die vier Build-Workflows für nicht-verknüpfte Packages bereits nutzen, und sichert das
Ergebnis mit einem Offline-Guard gegen Rückfall ab.

## Symptom vs. Ursache

Die Trennung ist hier wesentlich, weil die Ticket-Beschreibung eine Hypothese enthielt, die sich
als falsch erwiesen hat.

**Beobachtetes Symptom (Fakt, reproduzierbar):**

```
HEAD https://ghcr.io/v2/paddione/workspace-brett/manifests/latest:
  unexpected status code 403 Forbidden
Error: DENIED: requested access to the resource is denied
```

Aufrufer ist `scripts/resolve-image-digest.sh --image ghcr.io/paddione/workspace-brett:latest`,
das den Lookup an `crane digest` weiterreicht. Betroffen sind die Runs `31283255072`,
`31284750694`, `31298317415` und `31300049783`.

**Hypothese im Ticket (widerlegt):** „Das Package ist privat *oder* das Token hat keinen
`read:packages`-Scope."

**Verifizierte Ursache:** Beides trifft den Kern nicht. Der Workflow hat `packages: write` und
loggt sich korrekt ein; entscheidend ist die **fehlende Repository-Verknüpfung** des Packages.

| Package | Sichtbarkeit | Repo-Verknüpfung | Digest-Resolve |
|---|---|---|---|
| `website` | public | `Paddione/Bachelorprojekt` | erfolgreich |
| `workspace-brett` | private | **keine** | 403 DENIED |

`GITHUB_TOKEN` ist ein repo-scoped Installations-Token. Auf ein privates Package ohne
Repo-Verknüpfung hat es keinen Zugriff — unabhängig von den deklarierten `permissions`. Dass
`website` im selben Step vorher gelingt, beweist nichts über das Token: es ist public und
benötigt gar keine Authentifizierung.

Der Zustand war bereits bekannt. Commit `555cda1ff` hält fest:

> workspace-docs and workspace-brett packages are not linked to the repository, so GITHUB_TOKEN
> gets permission_denied on push. GH_PAT authenticates as the user (write:packages scope) and
> bypasses this.

Vier Build-Workflows (`build-brett`, `build-docs`, `build-videovault`,
`build-mediaviewer-widget`) tragen diese Ausnahme seither. PR #3877 (T002706) fügte mit dem Step
`Resolve image digests` einen **Consumer** hinzu, ohne sie zu übernehmen. Es handelt sich also um
eine Regression aus #3877, nicht um einen schleichenden Ausfall.

## Entscheidung

Der Renderer übernimmt den etablierten Auth-Weg. Die Wurzel — die fehlende Verknüpfung der vier
Packages — wird in diesem Change **nicht** angefasst.

Verworfene Alternativen:

- **Packages mit dem Repo verknüpfen** (strukturell sauber, macht alle vier PAT-Umgehungen
  rückbaubar): kein REST-API-Pfad, nur ein manueller Schritt in der GHCR-Oberfläche pro Package.
  Git bezeugt das Ergebnis nicht, wodurch der Zustand unbemerkt zurückfallen kann.
- **Package öffentlich machen:** löst das Auth-Problem durch Aufgabe der Vertraulichkeit. Eine
  Sichtbarkeitsentscheidung gehört nicht in einen CI-Fix.
- **Producer auf `GITHUB_TOKEN` umstellen**, damit die Verknüpfung beim Push automatisch
  entsteht: genau dieser Weg scheiterte zuerst und war der Anlass für `555cda1ff`.

## Änderung

Eine Datei, ein Step — `.github/workflows/render-fleet-artifact.yml`, „Log in to GHCR":

```diff
           registry: ghcr.io
-          username: ${{ github.actor }}
-          password: ${{ secrets.GITHUB_TOKEN }}
+          username: ${{ github.repository_owner }}
+          password: ${{ secrets.GH_PAT }}
```

**Beide Zeilen sind notwendig.** `github.actor` ist der auslösende Akteur; bei einem Bot-Push
(release-please, Renovate — der letzte main-Commit war „chore: release main (#3939)") wäre das
ein Bot-Name, der nicht zum PAT des Repository-Owners passt. Die vier bestehenden
GH_PAT-Workflows verwenden einheitlich `github.repository_owner`. Ein Tausch nur der
`password`-Zeile ergäbe einen Login, der ausgerechnet bei den regelmäßigen Bot-Pushes bricht.

**Reichweite:** Dieser Login bedient sowohl `crane digest` (lesend, der 403) als auch
`flux push artifact` (schreibend, `ghcr.io/paddione/fleet-manifests`). `GH_PAT` trägt
`write:packages` — belegt dadurch, dass `build-brett.yml` damit pusht. Der Artefakt-Push bleibt
funktionsfähig und wechselt lediglich die Identität vom Repo-Token auf den Owner.

## Guard

`tests/spec/ci-cd/ghcr-digest-auth.bats`, offline, ohne Netz- oder Cluster-Zugriff:

1. **Positiv-Anker:** `render-fleet-artifact.yml` ruft `resolve-image-digest.sh` auf. Fehlt der
   Aufruf, ist die Kandidatenmenge leer und die Negativaussage träfe vakuos zu (T002356-M1).
2. **Eigentliche Aussage:** Der GHCR-Login desselben Workflows nutzt `secrets.GH_PAT` und
   `github.repository_owner`.

Der Guard inspiziert den Workflow-Quelltext. Das ist die in der Test-Resultats-Konvention
(T002448-M4) benannte Ausnahme: Registry-Credentials eines GitHub-Actions-Workflows manifestieren
sich ausschließlich im Quelltext; ein lokal beobachtbarer Laufzeit-Output existiert nicht.

## Restrisiko

Nach diesem Change hängen fünf statt vier Workflows am selben `GH_PAT`. Läuft das Token ab oder
wird es rotiert, fallen sie gemeinsam aus. Das ist die Konsequenz der gewählten Ebene und kein
neues Risiko seiner Art — die Verknüpfungs-Wurzel bleibt bestehen und kann jederzeit separat
aufgeräumt werden.

## Nicht im Scope

- Verknüpfung der vier Packages und Rückbau der GH_PAT-Umgehungen.
- Ein Drift-Detektor, der die von Flux ausgerollte Revision gegen `origin/main` vergleicht. Er
  finge auch andere Ursachen für stilles Altern, braucht aber Cluster-Zugriff, einen
  Schwellwert und eine Alarm-Senke.
- Sichtbarkeit der GHCR-Packages.
