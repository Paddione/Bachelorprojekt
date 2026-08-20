# Proposal: hybrid-github-actions-runners

## Why

Die GitHub-PR-CI ist nach dem Wechsel auf self-hosted Runner funktional, aber ihre
beabsichtigte Parallelität wird durch den Runner-Pool aufgehoben. Ein PR erzeugt ungefähr
zehn Jobs, während nur zwei Runner mit den gemeinsamen Labels `self-hosted, linux, x64`
verfügbar sind. GitHub Actions reiht deshalb portable Gates und vier Factory-Shards in
mehrere Wellen ein.

Der Lauf `32179927036` belegt, dass die Wartezeit bereits größer als die eigentliche Arbeit
ist: `Manifest Validation` wartete etwa 3 Minuten und lief 70 Sekunden; `Security Scan`
wartete etwa 4:40 Minuten und lief 47 Sekunden. Selbst kurze Kontrolljobs wie
`Conventional Commits` blieben hinter den langen Testjobs in der Queue. Weitere lokale
Runner-Prozesse würden diese Queue verkürzen, erhöhten aber die Last- und
Isolationskomplexität auf gemeinsam genutzten Hosts.

Das Repository ist öffentlich. Portable, unprivilegierte Jobs können deshalb auf
GitHub-hosted Standard-Runnern parallel laufen, während die vorhandenen self-hosted Runner
für Jobs mit lokaler GPU, privaten Diensten oder anderer Host-Infrastruktur reserviert
bleiben. Diese hybride Verteilung erhöht die Kapazität ohne schwächere Gates und reduziert
gleichzeitig die Angriffsfläche für Fork-PRs auf eigener Hardware.

## What

- Die portablen PR-Gates in `.github/workflows/ci.yml` laufen auf `ubuntu-latest`:
  BATS/Quality, Manifest Validation, Factory Fast Gate, alle vier Factory-Shards,
  Aggregator, Security Scan, Brett TypeScript, Website Vitest, Lighthouse und
  Conventional Commits.
- Kleine PR-Steuerungsworkflows (`auto-enable-automerge`, `pr-auto-title`) sowie das
  gefilterte PR-E2E und AI Review laufen ebenfalls GitHub-hosted, sofern sie keine lokale
  Infrastruktur benötigen. Secret-abhängige Schritte behalten explizite Fork-Guards.
- Spezialjobs mit belegter lokaler Abhängigkeit bleiben self-hosted und verwenden
  spezifische Labels, insbesondere `opencode` und Merge-Arbitration auf `fleet-gpu`.
- Ein BATS-Guard prüft die Runner-Platzierung semantisch und verhindert, dass portable
  Jobs unbemerkt wieder den knappen generischen self-hosted Pool belegen.
- Required-Check-Namen, Trigger, `cancel-in-progress`, Tool-Pins und Gate-Abdeckung bleiben
  unverändert.
- Vorher-/Nachher-Messungen aus der GitHub-Actions-API dokumentieren Queue-Zeit,
  Laufzeit und PR-Gesamtdauer. Ziel ist mindestens 40 % weniger Gesamtdauer oder eine
  nachvollziehbare Analyse, falls externe Limits das Ziel verhindern.

_Ticket: T012446_
