# p2 — Tests (Rolle tests, STRUCT2-Träger)

Frontmatter-Anker: ticket T016251 · Rolle tests · hängt an p1.
Der RED-Test ist bereits im Stage-Commit enthalten und muss VOR p1 rot laufen
(harter Rot-Grün-Beleg für RC1).

## Task T1 — RED-Beleg dokumentieren (STRUCT2)

- [ ] Vor dem p1-Fix den Stand rot belegen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sessions-server/reap-untracked.bats
# expected: FAIL (red — cmd_reap löscht register-Einträge mit server_pid=0)
```

## Task T2 — GREEN nach p1

- [ ] `reap-untracked.bats` muss nach dem Reap-Fix grün sein.

## Task T3 — Domain-Guard-Suite NEU — `tests/spec/sessions-server/domain-config.bats`

- [ ] Positiv-Anker: `SESSIONS_DOMAIN` existiert in `k3d/configmap-domains.yaml`.
- [ ] Negativ-Guard: k3d-Basis-Manifeste (`k3d/*.yaml`, ausgenommen
      `k3d/configmap-domains.yaml`) fügen keine hartcodierten
      `sessions.<brand-domain>`-Literale hinzu — Ausnahme: die bestehenden
      Kommentarzeilen. Prüfmodus: Querschnitts-Grep (Konventionstest), mit
      Positiv-Anker im selben Test.
- [ ] Suite läuft grün in `bats -r tests/spec/sessions-server*`.
