# license-manifest — Proposal (T901032)

## WARUM

Das Repo braucht eine verbindliche Wiederverwendungs-Policy und ein
maschinenlesbares Dritt-Lizenz-Manifest: Exakt gepinnte Komponentenversionen,
gesammelte LICENSE/NOTICE-Texte, transitive Lizenz-Inventur, Release-Attribution
und eine CI-Policy, die Verstöße fail-closed blockiert. Ohne das drohen stille
AGPL-Einbettungen in den MIT-Kern und fehlende Notices bei Drittanbieter-Code.

## WAS (Scope)

1. `docs/legal/reuse-policy.md` — Policy: eigener Code MIT, Apache-2.0 mit
   Notices erlaubt, kein AGPL-Embed ohne separaten Beschluss, kein
   automatisches Relicensing von Drittmaterial.
2. `docs/legal/third-party-manifest.json` — Manifest: je Eintrag Name, exakt
   gepinnte Version/Revision, Quelle, SPDX-Lizenz, Notice-Pfad, transitiv-Flag.
3. `docs/legal/NOTICE.md` — menschliche Attribution mit exakten Versionen.
4. `scripts/legal/license-check.sh` + `.github/workflows/license-policy.yml` —
   CI-Policy als Code: Schema-Validierung, Denylist, NOTICE-Abdeckung.
5. `docs/legal/asset-licensing.md` + `docs/legal/release-attribution.md` —
   Assets getrennt von Code lizenziert, Release-Checkliste.
6. `tests/spec/license-manifest.bats` — Spec-Guards für alles oben.

## Brainstorming-Entscheidungen (nicht-interaktiv, aus Ticket-Spec)

- D1: Policy APPROVED-Fakten aus dem Ticket sind bindend (MIT eigener Code,
  Apache-2.0 mit Notices ok, kein AGPL-Embed ohne separaten Beschluss,
  Design-Repo-Code MIT mit Per-Asset-Rechten, Start privat + Quarantäne).
- D2: CI-Policy ist Teil dieses Tickets (eigener Partial, kein Folgeticket).
- D3: Manifest ist JSON (maschinenlesbar für den Checker), NOTICE.md ist die
  menschliche Sicht; der Checker prüft Abdeckung Manifest gegen NOTICE.
- D4: Kein Taskfile-Eingriff: Der Checker ist per CI-Workflow und Doku-Referenz
  erreichbar (S4-konform ohne neue Task).
- D5: Transitive npm-Lizenzen werden per `npm ls`/Lockfile-Ableitung inventiert
  (Methode im Manifest dokumentiert), keine neue Dependency dafür.
- D6: Keine bestehenden Dateien ändern — alle Targets sind neu, keine
  Baseline-Berührung, kein Split nötig.

## Annahmen

- A1: HyperUI-, shadcn-svelte-, Bits-UI- und Skill-Quellen aus der
  Ticket-Beschreibung sind die initialen Manifest-Einträge; exakte Revisionen
  ermittelt die Execute-Phase aus Lockfiles und Upstream-Tags.
- A2: Kein AGPL-Code liegt aktuell im MIT-Kern; die Guards sichern den
  Ist-Stand und blockieren künftige Einbettungen.
- A3: `bats` ist in CI verfügbar (Repo-Standard für Spec-Guards).

## Prior-Art-Suche (T002829, vor Architekturfragen)

- `grep -rni license/SPDX/reuse/AGPL/MIT docs/adr/` — keine Architekturentscheidung
  zu Lizenzen vorhanden (nur Treffer zu Embedding-Modellen u.ä.).
- `grep -rln LICENSE/license tests/spec/` — keine absichernden Guards vorhanden.
- Ergebnis: keine bestehende Entscheidung zu behalten oder zu ersetzen;
  Policy und Guards werden neu geschaffen.

## Nicht-Ziele

- Kein AGPL-Adoption-Beschluss, keine Relicensing-Aktion, keine Änderung an
  `LICENSE` (bleibt MIT), keine Design-Repo-Eröffnung.
