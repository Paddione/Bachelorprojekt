# Derived Secrets: Ableitung, Rotation, Export

Deterministische Secret-Ableitung (HKDF-SHA256) aus einem Master-Seed je
Brand. Ableitbare Keys (Schema: `generate: true`, kein `derived: false`)
werden an beiden Enden — Repo-Tooling und JSON-Generator — identisch aus
dem Seed abgeleitet statt gespeichert. Enthält **keine** echten Werte.

Werkzeuge: `scripts/secret-derive.py` (Stdlib-only), Schema-Sektionen
`derivation` + `groups` in `environments/schema.yaml`, gruppierter Modus
in `scripts/generate-bitwarden-export.py`. Tests:
`tests/py/unit/test_secret_derive.py`,
`tests/py/unit/test_bitwarden_export.py`.

## Seed-Anlage

Ein Seed je Brand, 32 Zufallsbytes, Ablage gitignored mit Modus 0600:

```bash
python3 -c "import os; open('environments/.secrets/.seed-<brand>', 'wb').write(os.urandom(32))"
chmod 600 environments/.secrets/.seed-<brand>
```

(`<brand>` ist `mentolder` bzw. `korczewski`.)

Backup (Betreiber-Aktion, gehört nicht ins Repo und nicht ins Cluster):

1. Eine Kopie in Vaultwarden ablegen.
2. Eine Offline-Kopie auf einem externen Medium sichern.

Seed-Verlust bedeutet: alle abgeleiteten Werte sind neu zu würfeln und zu
rotieren. Seed-Leak kompromittiert alle abgeleiteten Werte sofort.

## Ableitung

Info-String ist `v<version>:<brand>:<KEY_NAME>`, Salt ist der fixe
Domain-Separator `derived-secrets-v1`, Länge und Version kommen aus dem
Schema (Overrides: `--length`, `--version`).

```bash
# Einzelwert nach stdout (Default-Encoding hex, URL- und expansions-sicher)
python3 scripts/secret-derive.py --brand <brand> --key SHARED_DB_PASSWORD

# Alle ableitbaren Keys als .secrets-kompatibles Mapping (für Re-Seal-Flows)
python3 scripts/secret-derive.py --brand <brand> --all

# Anderes Encoding, expliziter Seed-Pfad
python3 scripts/secret-derive.py --brand <brand> --key SOME_TOKEN \
  --format base64url --seed-file /pfad/zum/seed
```

Fehler (fehlende Seed-Datei, `derived: false`-Key) gehen nach stderr mit
Exit-Code ungleich 0 — es gibt nie einen stillen Leerwert.

Beide Enden leiten mit demselben Algorithmus, demselben Seed und derselben
Version ab und erhalten denselben Wert. Stale Werte heilen durch
Neu-Ableitung, ohne dass ein gespeicherter Wert nachgezogen werden muss.

## Rotation via Version

Rotation braucht keinen gespeicherten Wert:

1. Globale Version in `environments/schema.yaml` (`derivation.version`)
   erhöhen — oder pro Key via `derive_version` beim betroffenen Eintrag.
2. Beide Enden leiten neu ab (neue Version fließt in den Info-String ein).
3. Abhängige Workloads neu starten / neu seeden (DB-Rollen, OIDC-Clients,
   Sessions — dieselben Schritte wie bei einer gewürfelten Rotation).

## JSON-Generierung

```bash
# Gruppierte JSON-DBs je Brand (gitignored, lokal, nie committen)
python3 scripts/generate-bitwarden-export.py --format grouped
# → environments/.export/<brand>.json

# Default bleibt das importfähige Bitwarden-Format (unverändert)
python3 scripts/generate-bitwarden-export.py
```

Die gruppierte Datei enthält unter `groups` die Must-store-Keys **mit**
Werten (Gruppe aus den Schema-Regeln `db`, `oidc`, `api`, `mail`,
`network`, `ssh`, Fallback `misc`) und unter `derived` die ableitbaren
Keys als Referenz `{derived: true, version}` **ohne Wert**. Abgeleitete
Werte werden grundsätzlich nie ausgeschrieben — sie werden bei Bedarf mit
`secret-derive.py` aus dem Seed abgeleitet.

## Grenzen

- **Seed-Leak:** Wer den Seed hat, kann jeden abgeleiteten Wert
  nachrechnen. Seed nie ins Repo, nie ins Cluster, nie in Logs oder
  Tickets. Schlüsselnamen dürfen genannt werden, Werte nie.
- **Must-store bleibt must-store:** Fremdvergebene (API-Keys),
  identitätsgebundene (SSH-Keys) oder rotations-sensible Werte
  (Verschlüsselungs-Key mit ruhenden Daten, Backup-Passphrase) werden
  weiter gespeichert und stehen mit Werten in den JSON-DBs.
- **Keine Live-Migration:** Dieses Tooling ändert keine laufenden Werte.
  Die Umstellung produktiver Secrets auf abgeleitete Werte (DB-Neustarts,
  OIDC-Reseed, Session-Invalidierung) ist ein eigenes Folgeticket.
