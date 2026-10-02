# openspec-retire-prose — Design (T900724)

OpenSpec wird abgerissen (ADR-010, Epic T900560, Charge C7a). Dieser Plan entfernt Verweise, die nur in Prosa und Kommentaren stehen. Kein Verhalten ändert sich.

Ausgenommen (Historie/generiert, nicht anfassen): `docs/superpowers/`, `docs/adr/`, `.agents/docs/reorg-phase2/`, `.agents/plans/`, `.agents/memory/`, `scripts/migrations/`, `CHANGELOG.md`, `docs/generated/`, `docs/code-quality/repo-index.json`, `components/website/src/data/{test,api}-inventory.json`, `goals-data.generated.json`. Generierte Dateien regeneriert `task freshness:regenerate`.

## Messung

```bash
PRE=b4612a29a5bc02842f7019d3a08ecb3ce5ef74e0
git grep -l -i openspec "$PRE" -- . ':!openspec' | wc -l   # 900 inkl. Ausnahmen
```

Die Dateilisten `tests/fixtures/os-retirement/prose.txt` (448 Dateien) sind gegen `$PRE` erzeugt. Dateien, die zwischenzeitlich weggefallen sind, überspringen. Neu hinzugekommene Treffer gehören in ein Folge-Ticket.
