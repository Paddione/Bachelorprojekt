# Proposal: coaching-studio

## Why

Gerald Korczewski (Mentolder) führt systemische Coaching-Gespräche mit internationalen
Klient:innen (Farsi, Arabisch, Türkisch, EN, FR) — bislang ohne KI-Unterstützung, ohne
strukturierten digitalen Gesprächsbogen, ohne Übersetzungshilfe und ohne reproduzierbaren
Verlauf. Der 10-Ebenen-Bogen (Ankommen → Abschluss) ist methodisch ausgereift, ein
vollständiger Hi-Fi React-Prototyp liegt vor. Gleichzeitig braucht die Marketing-Site ein
Hi-Fi Redesign zu einem ruhigeren, editorialeren Brand-Auftritt.

## What

Zwei Workstreams in einem Plan:

### Workstream A — Coaching Studio MVP (eigener Service)
Auth-geschützter Service (Container, arena-server-artig) für den Coach, mit:
- **Sessions** (§1): mehrere pro Kunde, pausierbar/fortsetzbar, kopierbar als Vorlage mit Alt-vs-Neu-Vergleich; Verlauf dauerhaft in der Kundenakte gespeichert.
- **Profil & Daten** (§2): zentrale DB, genau ein KI-Profil pro Kunde, admin-erweiterbare Standardfragen, Checkbox-gated (nur aktive Felder fließen in die KI-Anfrage).
- **10 Ebenen + Prompts** (§3): editierbare Standard-Prompts (Admin), pro Session anpassbar, Reset-Schalter.
- **Zwischenablage** (§4): leert sich nach Senden + Ebenenwechsel.
- **Speicher & Export** (§5): visuelles Highlighting von "Zielsetzungen" (Ebene 05) und "Vereinbarungen" (Ebene 09); Export inkludiert diese.
- **Präsentationsfenster** (§6): separates Fenster für Nextcloud-Talk-Bildschirmfreigabe oder Zweitmonitor.
- **Audio & Transkription** (§7): Coach-Mic only → faster-whisper; abhörbar/löschbar/ersetzbar; Text editierbar vor Senden. Kein LiveKit, keine Client-Audio-Verbindung (Nextcloud Talk extern).
- **Übersetzung & TTS** (§8): DE ∥ Zielsprache parallel; min. Farsi/Arabisch/Türkisch/EN/FR; TTS-Vorlesen über Nextcloud-Talk-Audiokanal.
- **Screens:** Dashboard, Kundenakte, KI-Profil-Editor, Workspace, CompareView, Admin, Präsentation, Export.

Wiederverwendung: Keycloak OIDC, zentrale Postgres, LLM-Gateway (TEI+LM Studio), faster-whisper. Design-Tokens (Brass/Ink/Sage) aus `colors_and_type.css`.

### Workstream B — Homepage Redesign (in website/)
Hi-Fi Redesign von `src/pages/index.astro` nach `assets/new/homepage_redesign/README.md`.
Brand-agnostisches Shared-System (gilt auch für korczewski.de). Sektionen: Sticky TopBar, Hero (Portrait), Stats+Availability, Offers (ServiceRow), Why-Me+Quote, Process, CTA, Footer. Refactors bestehender Svelte/Astro-Komponenten; Daten-Helfer unverändert.

_Ticket: T001002_
