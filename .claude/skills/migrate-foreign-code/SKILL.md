---
name: migrate-foreign-code
description: Use when bringing an externally-developed app into the Bachelorprojekt platform — decouple it in its origin repo, vendor it, containerize it, move client-only capabilities server-side, and integrate it (Kustomize/Ingress/Keycloak/embed) across both brands. A 6-phase meta-runbook over dev-flow.
---

# migrate-foreign-code — Fremdcode in die Plattform übernehmen

## Wann diese Skill greift

Wenn eine **bestehende, extern entwickelte App** ins Bachelorprojekt übernommen werden soll
(erste Anwendung: VideoVault). Die Reise ist generisch; der [Pattern-Katalog](#pattern-katalog)
liefert die wiederkehrenden technischen Muster + Stolpersteine.

## Schicht-Hinweis: ein Meta-Runbook über dev-flow

Dieser Skill ist **operator-getrieben** und **ersetzt dev-flow nicht** — er **sequenziert** es.
**Jede Phase ist ein eigener `dev-flow-plan` → `dev-flow-execute`-Zyklus.** Für die Deploy-/Auth-/
Secret-Mechanik wird auf die bestehenden Skills verwiesen (siehe [Verwandte Skills](#verwandte-skills)),
nicht dupliziert.

## Die 6 Phasen

| Phase | Was passiert (generisch) | VideoVault-Instanz |
|---|---|---|
| **0 · Assess & Decide** | Stack/Build/Daten/Auth inventarisieren; **Migrations-Fitness-Gate** | Zwei Apps, client-first, FSAA-basiert |
| **1 · Decouple in-place** | God-Module zerlegen, Shared-Packages extrahieren, Verhalten per Characterization-Tests einfrieren — **im Ursprungs-Repo gegen dessen Test-Suite** | `useVideoManager` (1762 Z.) → 3 Hooks; `videovault-player`-Package |
| **2 · Vendor** | Code in-repo holen (Dockerfile + CI, Idiom wie `website/`/`brett/`); source-only-Package via Alias | Player-Package + Service vendored |
| **3 · Containerize** | Multi-Stage-Build (Client + Server → 1 Port); native Deps; neue DB in `shared-db`; PVC für Zwischendaten | Slim-Image + ffmpeg via APT |
| **4 · Server-Capabilities** | Client-only-Backend hinter dem **bestehenden Interface** auf server-resident tauschen (Hybrid via Capability-Signal) | Server-seitiger Schnitt |
| **5 · Platform-Integration** | Kustomize/Ingress; host-owned Auth (Keycloak/oauth2-proxy); Embed-Bridge; `configmap-domains`; **beide Brands** | Companion-Panel im Portal |

## Decision-Gates

Zwischen jeder Phase ein explizites Gate: **Voraussetzungen erfüllt? · reversibel? · weiter/stopp?**
Leitprinzip: **erst in-place stabilisieren, dann migrieren**.

- **Gate 0→1:** Migrations-Fitness bejaht **und** Ursprungs-Test-Suite grün, bevor entkoppelt wird.
- **Gate 1→2:** Grenzen per Characterization-Tests eingefroren; Interfaces extrahiert (ermöglicht Phase 4).
- **Gate 3→4:** Server-resident nur wo es Mehrwert bringt — Annahmen (z.B. GPU) per Code-Erkundung
  verifizieren, nicht raten.
- **Gate 4→5:** Integration zuletzt, wenn die App als Container eigenständig läuft.

## Pattern-Katalog

Wiederkehrende technische Muster — je generisches Muster, VideoVault-Beispiel und Stolpersteine:

| Pattern | Phase(n) | Inhalt |
|---|---|---|
| [pattern-vendoring](references/pattern-vendoring.md) | 2 | In-Repo-Vendoring-Idiom (Dockerfile + CI, kein committed `node_modules`) |
| [pattern-multistage-build](references/pattern-multistage-build.md) | 3 | Client+Server → ein Runtime-Port; Slim-Image + native Deps |
| [pattern-source-only-package](references/pattern-source-only-package.md) | 1, 2 | source-only Package via Alias; Dual-Build; React-Dedup; WASM-Assets |
| [pattern-hybrid-backend](references/pattern-hybrid-backend.md) | 4 | Backend-Tausch hinter stabilem Interface via Capability-Signal |
| [pattern-embed-bridge](references/pattern-embed-bridge.md) | 5 | postMessage Host↔Widget mit Origin-Validierung; Props+Handle |
| [pattern-data-and-auth](references/pattern-data-and-auth.md) | 3, 5 | DB in `shared-db` + PVC; host-owned Auth; beide Brands |

## Verwandte Skills

| Skill | Beziehung |
|---|---|
| `dev-flow-plan` / `dev-flow-execute` | Pro Phase ein Plan/Execute-Zyklus — der eigentliche Arbeitsmotor |
| `workspace-deploy` / `cluster-deployment` | Phase 3 — Manifeste, DB, PVC, Deploy |
| `keycloak-realm-sync` | Phase 5 — OIDC/Realm/Auth |
| `secret-rotation` | Phase 5 — Credentials der neuen App |
| `fleet-ops` | Phase 3/5 — Cross-Brand-Fan-out (beide Namespaces) |

## Quelle der Learnings

Destilliert aus dem VideoVault-Vorhaben (SP1 Split + SP2 Migration) in `~/projects/`.
Die ursprünglichen Spec-Dateien (`docs/superpowers/specs/2026-06-15-videovault-*.md`) waren als
Quell-Learnings referenziert, sind aktuell aber nicht im Repo eingecheckt — die Patterns leben
in den Referenz-Dokumenten oben weiter. Wenn die Original-Specs nachgereicht werden, hier wieder
verlinken.
