# p3 — Übrige Flows, Integrationen, Jobs

Ziel: `docs/parity/mentolder-flows-remaining.md` jenseits der Kernpfade.

## Target (neu, kein S1-Limit — `.md` nicht in gates.yaml)

- `docs/parity/mentolder-flows-remaining.md`: neu, Rest-Flows mit Evidenz.

## Tasks

- [ ] **1. Übrige öffentliche Flows kartieren.** Kontakt, Anfrage,
  Newsletter, DSGVO-Request und weitere öffentliche Routen unter
  `components/website/src/pages/api/` mit Route und Handler-Evidenz
  beschreiben.
- [ ] **2. Admin-/Owner-Flows kartieren.** Admin- und Owner-Routen sowie
  Portal-Flows mit Evidenz beschreiben; SDLC/LLM/Coaching-Flächen nur als
  abgegrenzt-out-of-scope listen, nicht vertiefen.
- [ ] **3. Integrationen und Jobs kartieren.** Mail-, PDF-, Kalender-,
  Stripe- und Nextcloud-Anbindungen sowie Cron-/Job-Pfade mit Quelle und
  Test-Referenz (oder `kein Test`) beschreiben.
- [ ] **4. Verify.** Datei existiert, jeder Flow mit Route + Handler-Quelle
  belegt, Scope-Abgrenzung zu SDLC/LLM/Coaching dokumentiert.
