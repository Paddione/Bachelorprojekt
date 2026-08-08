# p2 — Tote Pfad-Referenzen abräumen (impl)

Rolle: impl. Zieldateien: `.dockerignore`, `scripts/factory/service-registry.sh`, `CLAUDE.md`.

## Task 1 — `.dockerignore` bereinigen und Artefakte markieren

- [ ] Die acht Karteileichen entfernen: `argocd`, `docs-site`, `deploy`, `whisper`,
      `korczewski-website`, `vault-exports`, `billing-bot`, `memory`.

- [ ] Die drei glob-freien Literale, die zur Laufzeit entstehen und bleiben müssen, mit dem
      Marker versehen, den der Guard aus p3 respektiert. Der Marker nennt den erzeugenden
      Schritt, damit ein späterer Leser Artefakt von Karteileiche unterscheiden kann.

```
mentolder-web/node_modules  # runtime: npm install
website/dist                # runtime: astro build
tests/e2e/test-results      # runtime: playwright test
```

- [ ] Unangetastet lassen: `!website/.env.example` und `!scripts/knowledge` (Negativ-Muster,
      deren Ziel fehlen darf) sowie `website/.env.*` (enthält ein Glob-Zeichen). Alle drei sind
      per Scope-Definition außerhalb der Guard-Prüfung.

- [ ] Belegen, dass genau die acht verschwunden und die drei markiert sind.

```bash
# Anker: die Datei hat überhaupt noch Inhalt
[ "$(grep -cve '^\s*$' -e '^#' .dockerignore)" -gt 10 ] || { echo "FATAL: .dockerignore leer"; exit 1; }
# Aussage: keine der acht Karteileichen mehr da
for p in argocd docs-site deploy whisper korczewski-website vault-exports billing-bot memory; do
  grep -qx "$p" .dockerignore && { echo "FATAL: $p noch vorhanden"; exit 1; }
done
# Aussage: die drei Artefakte tragen den Marker
for p in 'mentolder-web/node_modules' 'website/dist' 'tests/e2e/test-results'; do
  grep -q "^${p}[[:space:]]*# runtime" .dockerignore || { echo "FATAL: Marker fehlt bei $p"; exit 1; }
done
echo "OK: .dockerignore bereinigt und markiert"
```

## Task 2 — Registry-Einträge ohne Manifest entfernen

- [ ] Die sechs Einträge aus `scripts/factory/service-registry.sh` entfernen:
      `k3d/whiteboard.yaml`, `k3d/claude-code-config.yaml`, `k3d/claude-code-mcp-browser.yaml`,
      `k3d/claude-code-mcp-github.yaml`, `k3d/claude-code-mcp-ops.yaml`,
      `k3d/claude-code-rbac.yaml`.

Die Datei hat 135 Zeilen bei einem S1-Limit von 800 für `.sh` und keiner Baseline — Budget 665,
und sie schrumpft ohnehin. Kein Split nötig.

- [ ] Vor dem Löschen je Eintrag prüfen, ob es einen gleichnamigen **Verzeichnis**-Kandidaten
      gibt. `k3d/whiteboard` existiert als Verzeichnis, `k3d/whiteboard.yaml` nicht — hier ist
      die Frage, ob der Eintrag falsch geschrieben statt überflüssig ist.

```bash
ls -d k3d/whiteboard k3d/whiteboard.yaml 2>&1
grep -rn 'whiteboard' k3d/kustomization.yaml apps/whiteboard/app.yaml
```

Zeigt sich, dass der Eintrag lediglich die falsche Endung trägt, wird er **korrigiert** statt
entfernt — die App-Registry `apps/whiteboard/app.yaml` verweist mit `kustomize: k3d/whiteboard`
auf das Verzeichnis, der Dienst existiert also. Für die fünf `claude-code-*`-Einträge gibt es
keinen solchen Kandidaten; sie werden entfernt.

- [ ] Belegen, dass jeder verbliebene Schlüssel auflöst.

```bash
keys="$(grep -oE '\[k3d/[^]]+\]' scripts/factory/service-registry.sh | tr -d '[]')"
# Anker: es wurden überhaupt Schlüssel extrahiert
[ "$(echo "$keys" | grep -c .)" -gt 0 ] || { echo "FATAL: keine Registry-Schluessel gefunden"; exit 1; }
# Aussage: jeder existiert
echo "$keys" | while read -r p; do [ -e "$p" ] || { echo "FATAL: $p fehlt"; exit 1; }; done
echo "OK: alle Registry-Schluessel loesen auf"
```

## Task 3 — CLAUDE.md-Drift beheben

- [ ] Den `deploy/`-Eintrag unter „Key components" streichen. Das Verzeichnis existiert nicht;
      die Beschreibung nennt einen Unterordner `mcp/`, den es ebenfalls nicht gibt.

- [ ] Im selben Zug prüfen, ob weitere unter „Key components" genannte Pfade fehlen. Der
      `deploy/`-Eintrag ist aufgefallen, weil er zufällig auch in `.dockerignore` stand — eine
      systematische Prüfung des Abschnitts hat es bisher nicht gegeben.

```bash
# Backtick-zitierte Pfade aus dem Key-components-Abschnitt gegen das Dateisystem halten
awk '/^### Key components/{f=1;next} f&&/^###/{f=0} f' CLAUDE.md \
  | grep -oE '`[a-zA-Z0-9_./-]+/`' | tr -d '`' | sort -u \
  | while read -r p; do [ -e "$p" ] || echo "FEHLT: $p"; done
```

Was diese Prüfung zutage fördert, wird im selben Task korrigiert — es fällt in denselben Vorgang
und wäre als separates Ticket künstlich getrennt. Findet sie nichts weiter, bleibt es beim
`deploy/`-Eintrag.
