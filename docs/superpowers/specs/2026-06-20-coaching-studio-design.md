---
ticket_id: T001002
plan_ref: openspec/changes/coaching-studio/tasks.md
status: active
date: 2026-06-20
---

# Design Spec — Coaching-Sessions Service (T001002)

## Kontext & Problem

Gerald Korczewski (Mentolder) führt systemische Coaching-Gespräche mit internationalen
Klient:innen (Farsi, Arabisch, Türkisch, EN, FR). Bisher laufen diese Gespräche ohne
KI-Unterstützung: Notizen per Hand, keine strukturierte Gesprächsführung, keine
Übersetzungshilfe für mehrsprachige Settings, kein reproduzierbarer Verlauf. Der 10-Ebenen-
Bogen (Ankommen → Abschluss) ist methodisch ausgereift, aber nicht digital abgebildet.

Ein vollständiger React-18-Prototyp liegt vor (`assets/new/coaching_studio/`) und zeigt
die Ziel-UX in Hi-Fi: Dashboard, Kundenakte, KI-Profil-Editor, 10-Ebenen-Workspace mit
Prompt-Editor/Mic/Transkription/KI-Antwort/Übersetzung+RTL+TTS, Vergleichsansicht, Admin,
Präsentations- und Export-Fenster. Dazu ein Hi-Fi Homepage-Redesign-Handoff
(`assets/new/homepage_redesign/`) für die Marketing-Site.

## Lösung — zwei Workstreams

### Workstream A — Coaching Studio MVP (eigener Service)

Ein eigener, auth-geschützter Service (Container, arena-server-artig) für den Coach.
Wiederverwendung der Cluster-Infrastruktur: Keycloak OIDC, zentrale Postgres (shared-db),
LLM-Gateway (TEI+LM Studio), faster-whisper-Transkription. **Kein LiveKit für MVP** —
die Client-Audio-Verbindung läuft extern über Nextcloud Talk; das System nutzt nur das
Coach-Mic für Transkription eigener Notizen/Prompts/Kundenaussagen.

**Screens (Hi-Fi aus dem Prototyp, 1:1-Port in die Service-Tech-Stack):**
1. TopBar — Brand-Mark, Navigation (Übersicht/Admin), RTL-Toggle, Präsentation + Session-CTAs.
2. Dashboard — Kundengitter mit Stats (aktiv/pausiert/fertig), Suche, Admin-Button, Neue-Session-CTA.
3. Kundenakte — Stammdaten + KI-Profil-Pin (exakt 1, aktiv/inaktiv-Checkboxen) + Session-Liste mit Status-Pills.
4. KI-Profil-Editor — pro Kunde genau ein Profil; Checkbox-gated; nur aktive Felder fließen in die KI-Anfrage; admin-erweiterbar.
5. **Workspace (Herzstück)** — linke 10-Ebenen-Liste (Tastaturnavigation, Done-Checks); Mitte: Prompt-Editor + Standard/Reset-Schalter, Eingabe-Dock mit Mic (idle/recording/review) + Waveform, Transkriptions-Review, KI-Antwort; rechts: Zwischenablage + Übersetzungs-Panel (DE ∥ Zielsprache, RTL, TTS).
6. CompareView — Alt-vs-Neu-Split mit Diff-Highlighting, eigenes Fenster.
7. AdminArea — Tabs: 10-Ebenen-Standard-Prompts (Name/Ziel/Prompt editierbar) + Standard-Profilfragen (Label/Wert/Typ/Pflicht/Aktiv).
8. Präsentationsfenster — separaten Route/Fenster für Bildschirmfreigabe via Nextcloud Talk oder Zweitmonitor.
9. Export — Druck-/PDF-Export des gesamten Session-Verlaufs.

**Schlüssel-Entscheidungen (aus den bereinigten Anforderungen):**
- **Zentrale DB** (Anforderung §2): eine Datenbank (shared-db), Studio-Daten in `studio.*`-Schema oder Erweiterung des bestehenden `coaching.*`-Schemas (im Plan zu entscheiden — es existiert schon ein Admin-Coaching-Subsystem mit `coaching.sessions`).
- **Mehrere Sessions pro Kunde**, pausierbar/fortsetzbar, kopierbar als Vorlage mit Alt-vs-Neu-Vergleich (§1).
- **10 Ebenen** mit editierbaren Standard-Prompts (Admin), pro Session anpassbar, Reset-Schalter (§3).
- **Zwischenablage** leert sich nach Senden UND nach Ebenenwechsel (§4).
- **Speicher-Highlighting** (§5 — NEU): Ebene 05 (Zielbild → "Zielsetzungen") und Ebene 09 (Vereinbarungen) werden visuell hervorgehoben; Export inkludiert diese explizit.
- **Präsentationsfenster** für Nextcloud-Talk-Bildschirmfreigabe oder Zweitmonitor (§6).
- **Coach-Mic only** (§7): Mic → faster-whisper → Text; abhörbar/löschbar/ersetzbar vor dem Senden; transkribierter Text editierbar.
- **Übersetzung + TTS** (§8): DE ∥ Zielsprache parallel; min. Farsi/Arabisch/Türkisch/EN/FR; TTS-Vorlesen für Nextcloud-Talk-Audiokanal.

### Workstream B — Homepage Redesign (in website/)

Hi-Fi Redesign von `src/pages/index.astro` nach dem Handoff (`assets/new/homepage_redesign/README.md`).
Brand-agnostisches Shared-System (gilt auch für korczewski.de — nur Copy+Config unterscheiden).
Tokens (Brass/Ink/Sage) sind bereits Produktions-CSS in `src/styles/global.css`.

**Sektionen:** Sticky TopBar → Hero (Portrait) → Stats+Availability-Strip → Offers (ServiceRow) → Why-Me+Quote → Process → CTA → Footer.
**Refactors:** `Navigation.svelte`, `Hero.svelte`, neues `ServiceRow.svelte` (ersetzt `ServiceCard.svelte`), `WhyMe.svelte`+`QuoteCard.svelte`, `Process.astro`, `CallToAction.svelte`, Footer in `Layout.astro`. Daten-Helfer unverändert (`getEffectiveHomepage()` etc.).

## Design-System (gemeinsam für beide Workstreams)

`assets/new/colors_and_type.css` ist die Source of Truth. Tokens: Ink-Palette (`--ink-900`–`--ink-750`), Brass (`--brass`, `--brass-2`, `--brass-d`), Sage (`--sage`), Foreground (`--fg`, `--fg-soft`, `--mute`). Typo: Newsreader (Display/Serif, italic = einzige Betonung), Geist (Sans/UI), Geist Mono (Labels/Eyebrows/Captions). Film-Grain-Overlay. Radii: Pill 999, Card 22, Frame 4. "mentolder." immer mit brass Punkt.

## Out of Scope (Folge-Tickets)
Systembrett (Figuren-Platzierung), Coaching Vertrag (Vertrags-PDF), Art-Library-Ingestion-Pipeline, Avatare-&-Sidekick-Produktionisation. Assets sind co-lokalisiert als Referenz.

## Offene Plan-Fragen (vom Subagenten zu entscheiden)
1. Studio-Daten in neuem `studio.*`-Schema oder Erweiterung des bestehenden `coaching.*`-Schemas?
2. Eigener Keycloak-Client `studio` oder Shared-`website`-Client mit neuer Realm-Role `coach`?
3. TTS via Browser SpeechSynthesis oder Cluster-TTS-Service?
4. Studio-Frontend-Stack: Astro+React/Svelte (wie Website) oder reiner React/Vite-Service?
5. Deployment-Topologie: eigener Namespace/Service + Ingress-Host (in `configmap-domains.yaml` registrieren).
