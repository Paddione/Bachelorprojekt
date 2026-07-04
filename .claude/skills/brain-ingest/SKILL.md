# brain-ingest — Brain-Quartz Wiki Kompilierung

## Was ist das?
Initialisiert die Brain-Wiki-Kompilierung via Quartz, generiert die Worklist aus `scripts/brain/ingest-sources.yaml` und führt den ersten Ingest-Lauf durch.

## Ziel
Erstelle die erste kompilierte Version der Brain-Quartz-Dokumentations-Wiki mit allen relevanten Quellen (57 SSOT-Specs + Runbooks + Core-Repo-Doku).

## Schritte

### 1. Worklist generieren
```bash
./scripts/brain-ingest-worklist.sh > brain-worklist.txt
wc -l brain-worklist.txt  # Erwartet: ~60+ Einträge
```

### 2. Quellen prüfen
```bash
cat brain-worklist.txt | cut -f2 | sort | uniq -c
# Sollte zeigen: brain-ssot-specs, brain-runbooks, etc.
```

### 3. Initial-Ingest ausführen (beispielsweise mit Quartz CLI)
```bash
quartz generate --sources brain-worklist.txt --output docs/brain/wiki/
```

### 4. Qualitätssicherung
```bash
find docs/brain/wiki -name "*.md" | wc -l  # Erwartet: ~60+ Dateien
head -50 docs/brain/wiki/*.md | grep "source:" | head -10  # Verifiziere Citations
```

## Artefakte
- `brain-worklist.txt` (TAB-separated, sortiert nach Priority)
- `docs/brain/wiki/*.md` (kompilierte Wiki-Seiten mit Citations)

## Next Steps
- T001570: CI-Gates (`task test:changed`, `freshness:regenerate`)
- Brain-Wiki regelmäßig synchronisieren (cron/call-backus)
