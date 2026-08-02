# Partial p3 — CI-Dokumentation: kein Pflichtpfad

## Scope
Dokumentation in `.github/workflows/e2e.yml`, dass K8 explizit kein CI-Gate ist.

## Task List
- [x] **3.1** `.github/workflows/e2e.yml`: Kommentar/Doku — K8 ist kein Merge-Gate
- [x] **3.2** Keine Änderung an der Workflow-Logik

## Verification
```bash
grep -q 'K8.*optional\|K8.*Headed' .github/workflows/e2e.yml
```
