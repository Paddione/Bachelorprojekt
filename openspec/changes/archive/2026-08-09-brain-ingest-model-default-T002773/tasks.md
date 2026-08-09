# T002773 — brain-ingest.sh Default-Modell entfernen
> **Type:** fix | **Severity:** trivial | **Effort:** klein

## Tasks
1. [ ] `scripts/brain-ingest.sh:44`: `${LM_MODEL:-…}` → `${LM_MODEL:?LM_MODEL ist Pflicht (T002533)}`
2. [ ] `scripts/brain-ingest.sh:19`: Kommentar aktualisieren
