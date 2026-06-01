# Spec: Asset-Layer (Kunst & Sound) für den Lernpfad — „Plasma"-Pack

**Branch:** `feature/learning-path-tracking`
**Datum:** 2026-06-01
**Status:** design-approved (Brainstorm mit Owner, Visual Companion)
**Eltern-Spec:** [`2026-06-01-learning-path-tracking-design.md`](./2026-06-01-learning-path-tracking-design.md) — diese Spec ist der **Illustrations-/Sound-Layer** für dessen **M2 (Lern-Surface)** und **M3 (Onboarding)**. Sie ändert keine der dort getroffenen Daten-/Tracking-/Collab-Entscheidungen.

---

## 1. Vision & Abgrenzung

Die Eltern-Spec macht den Lernpfad (= die Agent-Anleitung) *trackbar* (`learning_progress`, Status, Notizen, Admin-Sicht). Sie sagt **nichts** darüber, wie das Wissen *illustriert* wird. Diese Spec liefert genau das: einen **kuratierten, vendored Asset-Pack + ein Manifest**, das **ich (Claude Code) zur Build-Zeit** nutze, um jeden Lernschritt mit passenden Visuals und (opt-in) Sounds auszustatten.

**Kern-Mechanik:** Eine SSOT-Manifest-Datei beschreibt jedes Asset (Register, Konzept, Tone, Quelle/Lizenz). Eine einzige `<LearningAsset>`-Komponente löst auf und rendert. Eine kleine Authoring-Skill sagt mir, *wie* ich Assets semantisch auswähle (`concept`/`register`/`tone` statt roher Pfade). → Das ist „Claude schöne Assets zum Illustrieren geben."

## 2. Scope-Entscheidungen (vom Owner im Brainstorm bestätigt)

| Dimension | Entscheidung |
|---|---|
| **Konsument / Zeitpunkt** | **Build-Zeit, für Claude Code.** Kuratierte Bibliothek + Manifest, das ich beim Generieren der Lernpfad-Inhalte einbette (nicht primär Laufzeit-Auswahl). |
| **Wissensdomäne / Register** | **Zwei Register:** `technical` (Agent-Anleitung: Ziele/Werkzeuge/Bausteine, line-geometric/topology) **+** `coaching` (Systembrett/Coaching-Ton, warm/menschzentriert). |
| **Asset-Typen** | **Volle Palette:** statische Visuals (Spot-Illustration, Icon, Diagramm), Mikro-Animationen (Lottie/animiertes SVG), Sound-Cues, Stimme & Ambient. |
| **Produktion** | **Hybrid:** lizenzreine Primitive (Icons/SFX/Ambient/Piper-TTS) + kleine generierte Schicht (bespoke Spot-Illustrationen/Diagramme). Jedes Asset mit `provenance` (Quelle+Lizenz). |
| **Stil** | **„Neon Glass / Plasma"** (Option D) — dunkle Glas-Panels, Lime/Cyan-Glow — mit **Tone-Dial** `active` (Technik) / `calm` (Coaching). Brand-tokenisiert (Kore-Lime ↔ Mentolder-Brass). |
| **Brands** | Beide, brand-aware (wie Eltern-Spec). Form-Sprache fix, Farbe via Tokens. |

## 3. Architektur-Überblick

Folgt bestehenden Konventionen (`website/src/data/*.manifest.json`, `website/src/lib/*.generated.*`, `public/brand/…`):

```
website/
├─ public/learning-assets/            # ausgelieferte Binärdateien (DSGVO: lokal, kein Runtime-CDN)
│  ├─ illustration/  icon/  diagram/  motion/  sfx/  voice/  ambient/
├─ src/data/
│  ├─ learning-assets.manifest.json    # ← SSOT (Hand + Build gepflegt)
│  └─ learning-assets.schema.json      # JSON-Schema zur Validierung
└─ src/lib/
   ├─ learning-assets.generated.ts     # typisierter Accessor (Build-Output, CI-geprüft)
   └─ learning-assets.ts               # getAsset()/queryAssets()-Helfer
```

**Integration in die Eltern-Spec-Surfaces:** `<LearningAsset>` wird in **`GuideCard.svelte`** / **`AgentGuideView.svelte`** (M2 inline) und **`/portal/loslernen.astro`** (M2 Dashboard) sowie in der **M3-Onboarding-Sequenz** verwendet. Die Status-Transition `todo→in_progress→done` (Eltern-Spec `upsertLearningItem`) löst optional einen `milestone`-Sound-Cue aus.

## 4. Manifest-Schema (SSOT)

Pro Asset:

| Feld | Zweck |
|---|---|
| `id` | stabiler Slug, z. B. `feedback-loop.active` |
| `type` | `illustration · icon · diagram · motion · sfx · voice · ambient` |
| `register` | `technical · coaching · neutral` |
| `concept[]` | semantische Tags (`milestone`, `reflection`, `node-graph`, `constellation`, `error`, …) |
| `guideItem?` | optionales Mapping auf eine `agent-guide.generated.json`-Item-`id` (Direkt-Treffer pro Lern-Item) |
| `tone` | `active · calm` (Plasma-Tone-Dial) |
| `formats{}` | Pfade je Format (`svg`, `webp`, `lottie`, `ogg`, `vtt`) |
| `brandable` | `false` \| `{ tokens: ["--accent", …] }` (tokenisierbar via `currentColor`/CSS-Vars) |
| `a11y{}` | `alt` / `caption` / `transcript` (Pflicht je nach Typ) |
| `provenance{}` | `source` · `license` · `attribution` (**Thesis-Pflicht, CI-erzwungen**) |
| `reducedMotion?` | Fallback-Asset-`id` für `prefers-reduced-motion` |

Beispieleinträge:

```json
{ "id": "feedback-loop.active", "type": "illustration", "register": "technical",
  "concept": ["feedback-loop","node-graph","iteration"], "tone": "active",
  "formats": { "svg": "/learning-assets/illustration/feedback-loop.svg",
               "webp": "/learning-assets/illustration/feedback-loop.webp" },
  "brandable": { "tokens": ["--accent","--accent-soft"] },
  "a11y": { "alt": "Zwei Knoten in einer leuchtenden Rückkopplungsschleife" },
  "provenance": { "source": "generated:in-house", "license": "CC0-1.0", "attribution": null },
  "reducedMotion": null }
```
```json
{ "id": "reflection-pause.calm", "type": "voice", "register": "coaching",
  "concept": ["reflection","pause","grounding"], "tone": "calm",
  "formats": { "ogg": "/learning-assets/voice/reflection-pause.ogg",
               "vtt": "/learning-assets/voice/reflection-pause.vtt" },
  "brandable": false,
  "a11y": { "transcript": "Nimm dir einen Moment. Wo stehst du gerade in dieser Aufstellung?" },
  "provenance": { "source": "tts:piper/de_DE-thorsten", "license": "CC0-1.0",
                  "attribution": "Piper (MIT) · Thorsten-Voice (CC0)" } }
```

## 5. Accessor + Komponente

`src/lib/learning-assets.ts`:
- `queryAssets(filter): AssetEntry[]` — filtert nach `type`/`register`/`concept`/`tone`/`guideItem`.
- `getAsset(idOrFilter): AssetEntry | null` — bester Einzeltreffer (Priorität: exakte `id` > `guideItem` > `concept`+`register`+`tone`).

`<LearningAsset>` (Astro/Svelte) — **die einzige Stelle, über die Assets in die UI kommen:**
```astro
<LearningAsset concept="feedback-loop" register="technical" tone="active" />
<LearningAsset guideItem="goal-knowledge-tracking" />
<LearningAsset id="reflection-pause.calm" />
```
Rendert je `type`: **Inline-SVG** (brand-tokenisiert via `currentColor`/CSS-Vars), **Lottie-Player** (mit `prefers-reduced-motion` → `reducedMotion`-Standbild), **Audio-Control** (Captions aus `.vtt`, standardmäßig *aus*). Zieht `alt`/`transcript` automatisch aus `a11y`. Unbekannte Query → leeres Render + Build-Warnung (kein Crash).

## 6. Plasma-Stil & Tone-Dial

- **Eine Glas/Glow-Sprache, zwei Tonlagen.** `active` = heller Lime-Glow, dicht, Bewegung (Technik/Meilensteine). `calm` = gedimmter Cyan-Glow, viel Raum, kaum Bewegung (Reflexion/Coaching).
- **Authoring-Regel:** `technical`-Schritte → `active`; `coaching`/Reflexion → `calm`.
- **Brand-Tokenisierung:** Motive nutzen `currentColor` + CSS-Variablen-Slots; dieselbe Datei rendert in Kore-Lime und Mentolder-Brass. Farbe nie hart kodiert.
- **A11y:** Glow ist rein dekorativ. `prefers-reduced-motion` / hoher Kontrast → flache, glühfreie Variante; Text sitzt nie auf Glow; WCAG-AA-Kontrast für alle Textebenen.

## 7. Sound-Subsystem (neue, minimale Audio-Infra)

Plattform hat heute **null** Audio → bewusst klein & opt-in:
- **Steuerung:** `src/lib/learning-audio.ts` + persistierter Settings-Store (Sound/Narration/Ambient an-aus, Volume). **Default: aus.** Verdrahtet sich in bestehende User-Settings, falls vorhanden.
- **SFX-Cues** (`step-done`/`milestone`/`error`): <400 ms, vorgeladen, **nur durch Nutzer-Geste** ausgelöst (kein Autoplay-Problem). Synth/„plasma"-Charakter.
- **Narration:** pro Schritt `.ogg` + `.vtt`, **lokal mit Piper-TTS** zur Build-Zeit erzeugt → vendored. Nur auf Knopfdruck. Captions/Transcript Pflicht.
- **Ambient-Loop:** optional, opt-in, leise, kein Autostart bei `prefers-reduced-motion`.
- **DSGVO/A11y:** Piper läuft offline beim Build → keine Cloud-TTS, kein externer Audio-Host. Tastatur­erreichbar, globaler Mute.

## 8. Produktion, CI & Tests

- **Hybrid-Workflow:** (1) lizenzreine Primitive vendoren (Icons/SFX/Ambient — CC0/MIT) → `provenance`; (2) generierte Schicht für bespoke Plasma-Illustrationen/Diagramme (`source: generated:in-house`, CC0) + Narration via Piper; (3) alles ins Manifest normalisieren.
- **Build-Step** `scripts/build-learning-assets.*` (analog `scripts/build-docs.js`): validiert Manifest gegen JSON-Schema; **bricht ab, wenn ein `provenance.license` fehlt**; prüft, dass alle referenzierten Dateien existieren; generiert `learning-assets.generated.ts`; optimiert SVG (SVGO)/Audio.
- **CI** (bestehender Offline-Job): Schema-Validierung + Lizenz-Vollständigkeit + „keine verwaisten/fehlenden Dateien" + generiertes Modul == committed (wie `test-inventory`-Gate).
- **Tests:** Unit für `getAsset/queryAssets` (Vitest); Component-Test für `<LearningAsset>` (Render je Typ, Brand-Token, reduced-motion-Fallback, a11y-Text — Muster `GuideMap.test.ts`). Neue Tests → `test-inventory.json` via `task test:inventory` regenerieren + mitcommitten.
- **Thesis-Anhang:** generiertes `THIRD-PARTY-ASSETS.md` aus den `provenance`-Feldern (Lizenz-/Attributions-Nachweis).

## 9. DSGVO & Brand-Isolation

- Alle Assets **lokal vendored**, keine Runtime-Calls (passt zur DSGVO-by-design-Linie der Eltern-Spec). Audio strikt opt-in, Captions/Transcripts immer vorhanden.
- Assets sind brand-neutral (Form) + brand-tokenisiert (Farbe) → keine Brand-Datenvermischung; respektiert die Brand-Isolation der Eltern-Spec.

## 10. Phasen (für den Plan)

- **P1 — Fundament:** Manifest + Schema + `learning-assets.ts`/`.generated.ts` + `<LearningAsset>` + Build-Step + CI-Gate + erstes statisches Plasma-Visual-Set (Icons + ein paar Spot-Illustrationen/Diagramme). Einbau in `GuideCard`/`AgentGuideView`.
- **P2 — Bewegung & Sound:** Lottie-Mikro-Animationen + Audio-Subsystem (SFX/Piper-Narration/Ambient) + Settings-UI + `milestone`-Cue an die Status-Transition koppeln.
- **P3 — Content-Authoring:** Assets entlang der echten Agent-Anleitung-Items kuratieren/generieren (`guideItem`-Mapping), `/portal/loslernen` und Onboarding-Sequenz vollständig illustrieren.

## 11. Out of Scope

- Laufzeit-/KI-gestützte Asset-Auswahl im Sidekick (diese Spec ist Build-Zeit).
- Voll-generierter KI-Hausstil ohne lizenzreine Primitive (Hybrid wurde gewählt).
- Gamification/Badges (Eltern-Spec: ebenfalls out of scope).
- Eigene Asset-Admin-UI (Kuration läuft über Repo + Manifest, nicht über die `platform_assets`-Tabelle).

## 12. Offene Fragen / Entscheidungen für den Plan

- **A1:** Eigenes Milestone (M6) der Eltern-Spec **oder** eigener Plan/Branch? (Empfehlung: eigener Plan, da rein additiv und unabhängig deploybar — Asset-Layer braucht kein `learning_progress`.)
- **A2:** Piper-Voice-Auswahl (de_DE-thorsten CC0 vs. Alternativen) — abhängig von der laufenden Lizenz-Recherche.
- **A3:** Bespoke-Illustrationen — Generierungs-Pipeline (welches Tool/Modell, reproduzierbar dokumentiert für die Thesis).
- **A4:** Sollen Lottie-Animationen auch `calm`-Tonlage bekommen oder bleibt `calm` rein statisch? (Default: `calm` statisch/sehr subtil.)
