---
title: 44 rote Spec-Tests nach Ursache trennen und schliessen
ticket_id: T002181
domains: [testing, ci, docs]
status: planning
plan_ref: openspec/changes/spec-test-rot/tasks.md
---

# Design — spec-test-rot

## Purpose

`main` trägt 48 rote `tests/spec/`-Tests. Vier davon sind echte Lücken und werden in T002180
behandelt. Die verbleibenden **44** sind Gegenstand dieses Changes.

Der naheliegende Reflex — „veraltete Tests an den Ist-Zustand anpassen" — wäre bei einem
erheblichen Teil davon falsch. Die Stichprobenprüfung in der Planungsphase hat ergeben, dass
„Test ist rot" hier **drei verschiedene Ursachen** hat, mit drei gegensätzlichen Behandlungen. Das
zu trennen ist der eigentliche Inhalt dieses Changes; das Grünmachen ist die leichtere Hälfte.

## Die drei Ursachen, jeweils am Code belegt

### Ursache 1 — Die Anforderung ist umgezogen, nicht entfallen

Die neun `M1:`-Tests prüfen, ob `dev-flow-plan/SKILL.md` in Schritt 3.7 die F1-Frontmatter-Keys
und die drei Verify-Kommandos nennt. Sie sind rot, weil das SKILL.md diese Inhalte nicht mehr
aufzählt:

| Suchbegriff | Treffer in `dev-flow-plan/SKILL.md` | Treffer in `references/plan-quality-gates.md` |
|---|---|---|
| `'title'` | 0 | 1 |
| `domains` | 0 | 3 |
| `ticket_id` | 1 | 1 |
| `task test:changed` | 1 | 2 |

Die Anforderungen bestehen unverändert — sie wurden in die Referenz-SSOT
`plan-quality-gates.md` ausgelagert, auf die das SKILL.md nun verweist. **Behandlung: den Test auf
die neue SSOT-Datei umbiegen.** Ein Streichen würde eine geltende Anforderung ungeprüft lassen;
ein Zurückkopieren der Aufzählung ins SKILL.md würde das SSOT-Refactoring rückgängig machen.

Dieselbe Prüfung ist für die übrigen Skill- und AGENTS-Assertions zu machen: T001268-M3,
T001331, T001269, T001386, T001265, HWS-8, T001672.

### Ursache 2 — Der Test hat recht, der Aufräumschritt fehlt

Fünf Tests sind **Negativ-Assertions** der Form „kein Schema- oder Env-File enthält die tote
Variable X". Rot bedeutet hier: die Variable ist noch da.

```
LLM_LMSTUDIO_URL        → environments/schema.yaml
LLM_CHAT_MODEL          → environments/schema.yaml
LLM_CODING_MODEL        → environments/schema.yaml
LLM_EMBED_MODEL_NOMIC   → environments/schema.yaml
llm-gateway-lmstudio    → environments/schema.yaml
```

Der Gateway-Umbau (T002102, unified llm-proxy) hat die Variablen funktional abgelöst, aber nicht
aus dem Schema entfernt. **Behandlung: `schema.yaml` aufräumen, Test unverändert lassen.** Hier
gilt dieselbe Regel wie in T002180 — wer die Assertion anpasst, macht den Rückstand unsichtbar.

Achtung, dies ist die Kollisionsstelle: T002171 fügt `POCKET_ID_API_KEY` in dieselbe Datei ein.
Beide Changes dürfen nicht gleichzeitig offen sein, sonst kollidieren sie in `schema.yaml`.

### Ursache 3 — Der Test kennt eine überholte Struktur

Die drei `T002083`-Flux-Tests sind rot, obwohl der Cluster-Zustand korrekt und sogar besser
strukturiert ist als vom Test angenommen:

```
erwartet:   flux-sealed-secrets, flux-platform
tatsächlich: flux-sealed-secrets-mentolder  (prune: false)
             flux-sealed-secrets-korczewski (prune: false)
             flux-infra-controllers, flux-mentolder, flux-korczewski, flux-dev,
             flux-website-mentolder, flux-website-korczewski
```

Die Kustomizations wurden brand-spezifisch aufgeteilt. Die inhaltliche Anforderung
(`prune: false` auf den Sealed-Secrets-Kustomizations, damit Secrets nie auto-gepruned werden)
ist bei **beiden** erfüllt. Der Test prüft nur einen Namen, der nicht mehr existiert.

Der OCIRepository-Test greift zusätzlich daneben, weil er `kind: OCIRepository` in derselben Datei
erwartet wie die `FluxInstance` — real liegen sie in `flux-instance.yaml` und `oci-source.yaml`.

**Behandlung: Test an die reale Struktur anpassen, und zwar strenger als vorher** — beide
Brand-Kustomizations müssen `prune: false` tragen, nicht nur eine. Die Anpassung ist die
Gelegenheit, die Assertion zu verschärfen statt sie nur passend zu machen.

### Ursache 3 in einer zweiten Variante — falscher Pfad oder falsche Schreibweise

Die fünf aus T002180 hierher verschobenen Positionen gehören ebenfalls hierher:

| Test | Defekt |
|---|---|
| `cors.ts is fail-closed for unknown origins` | `grep -qF` ist case-sensitiv, `cors.ts:2` schreibt „Fail-closed" gross |
| `callback.ts accepts absolute React URL in returnTo` | Pfad `website/src/api/callback.ts` existiert nicht |
| `callback.ts has Allowlist check for absolute URLs` | derselbe Pfad |
| `callback.ts returns to state parameter` | derselbe Pfad |
| `pocket-id: identity.ts calls Pocket ID Admin API with Bearer POCKET_ID_API_KEY` | Code nutzt `X-API-KEY`, weil Pocket ID v2.9.0 kein Bearer akzeptiert |

Der Code ist in allen fünf Fällen korrekt und verifiziert.

## Noch nicht stichprobengeprüft

Für drei Gruppen steht die Ursachenzuordnung aus. Der Plan schreibt die Prüfung vor, statt sie zu
raten — genau diese Abkürzung hat bei T002180 zu neun Fehleinordnungen geführt:

- **T001978 Delegation-Fallback** (5 Tests) — `fallbackFor`, `fallbackTriggered`,
  `qwen35-hq`-Registrierung.
- **Admin-Design-Tokens** (8 Tests) — `factory-tokens.css`, `:root`-Blöcke, semantische Tokens,
  `AdminModal` als natives `<dialog>`, `aria-labelledby`, `AdminSidebarNav`. Die a11y-Assertions
  sind inhaltlich werthaltig und dürfen nicht pauschal als verrottet abgetan werden.
- **AGENTS.md-Assertions** (4 Tests) — T001265 zweimal, HWS-8, T001672.

## Die Entscheidungsregel

Für jeden der 44 Tests ist genau eine Frage zu beantworten, **am Code, nicht am Testnamen**:

1. Beschreibt die Assertion eine Anforderung, die weiterhin gilt?
   - **Ja, und der Ist-Zustand erfüllt sie nicht** → Code oder Konfiguration fixen, Test
     unverändert lassen. (Ursache 2)
   - **Ja, aber der Test sucht am falschen Ort oder in überholter Form** → Test umbiegen,
     Anforderung erhalten, wo möglich verschärfen. (Ursachen 1 und 3)
   - **Nein, die Anforderung wurde bewusst aufgegeben** → Test streichen, **mit Begründung im
     Commit**, welche Entscheidung sie aufgehoben hat.

Ein stilles Anpassen des erwarteten Wortlauts an den Ist-Text ist in keinem der drei Fälle die
Antwort. Es ist der Weg, auf dem diese 44 Tests überhaupt erst wertlos geworden sind.

## Was NICHT im Scope ist

- Die vier echten Lücken aus T002180 (Secret-Keys, livekit-egress, pnpm audit).
- Das Schliessen des CI-Gates selbst (T002182) — dieser Change räumt den Rückstand ab, der es
  blockiert.
- `openspec/specs/`-Textbereinigung (T002179), auch wenn sich beide auf Doku-Ebene berühren.

## Nebenbefund

`website/src/pages/api/auth/callback.ts:55` trägt den Kommentar „Keycloak redirects here after
successful login" — Doku-Drift auf Codeebene. Wird hier mitgenommen, weil die Datei ohnehin im
Blick ist.

## Verifikation

Der Erfolgsnachweis ist zweiteilig: alle 44 grün, **und** für jeden gestrichenen oder umgebogenen
Test eine Begründung. Die reine Grün-Zahl ist bei diesem Change kein ausreichendes Kriterium — sie
liesse sich trivial durch Löschen der Testdateien erreichen.
