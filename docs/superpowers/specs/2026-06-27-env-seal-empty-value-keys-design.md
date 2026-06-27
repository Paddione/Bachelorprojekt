---
ticket_id: T001198
plan_ref: null
status: active
date: 2026-06-27
---

# env-seal.sh empty-value Bug — G-CD01 Root-Cause Fix

**Branch:** `fix/env-seal-empty-value-keys`  
**Ticket:** T001198 (depends on T001182)  
**Worktree:** `/tmp/wt-env-seal-bug`  
**Spec-Datei:** diese Datei  
**Brainstorm:** `.lavish/env-seal-bug-brainstorm.html` (im selben Branch)  
**Companion-PR:** #2124 (T001182) — hat Symptom (Cluster-Repair + Drift-Guard BATS) gefixt, NICHT die Root-Cause

---

## 1. Context & Bug

`scripts/env-seal.sh:494` skippt Keys in `extra_namespaces`-Entries **stillschweigend**, wenn der Plaintext-Wert leer ist oder im git-crypt-encrypted `environments/.secrets/<env>.yaml` fehlt:

```bash
[[ -z "$val" ]] && { echo "WARNING: key ${src} not found in secrets file — skipping ${dest} in ${sname}" >&2; continue; }
```

Folge-Kette:
1. WARNING auf stderr, **kein** non-zero Exit
2. `seal_extra_namespace_secrets` baut das SealedSecret **ohne** den Key
3. Bei komplett leeren Keys: die ganze `(ns, secret)`-Paar-Schleife wird übersprungen (Zeilen 500–504) → **kein** SealedSecret überhaupt
4. `task secrets:sync` wendet den unvollständigen SealedSecret an
5. Pod-Rollout scheitert: `CreateContainerConfigError` (envFrom.secretKeyRef fehlt) nach 120s
6. CD-Workflow wird rot — bei korczewski-Lane 11/15 = 73 % Failure-Rate über mehrere Wochen

### 1.1 Konkretes Beispiel (2026-06-27, T001182-Investigation)

`environments/schema.yaml` definiert für `DEEPSEEK_API_KEY`:
```yaml
- name: DEEPSEEK_API_KEY
  required: false      # ← optional: darf leer sein
  generate: false      # ← nicht auto-generieren
  extra_namespaces:
    - namespace: website-korczewski
      secret: website-secrets
```

`environments/.secrets/korczewski.yaml` hat aber nie einen Wert für `DEEPSEEK_API_KEY` (Schema: `required: false, generate: false` → env:generate füllt nichts). Beim Seal:
- Dev-Value-Scanner akzeptiert leer (weil `required: false`)
- `seal_extra_namespace_secrets:494` skippt
- `dest_list` leer → ganzes SealedSecret für `website-korczewski/website-secrets` wird NICHT geschrieben
- Cluster bekommt 5 Keys weniger (DEEPSEEK_API_KEY, DEEPSEEK_API_KEY_HASH, SEPA_CREDITOR_ID, SEPA_CREDITOR_NAME, SEPA_CREDITOR_IBAN) als `k3d/website.yaml` per `envFrom.secretKeyRef` required
- `CreateContainerConfigError` auf jedem Pod

## 2. Fix-Design (Option A — Recommended)

**Prinzip:** Schema-`required`-Flag respektieren. Verhalten:

| `required` | Plaintext value | Aktuelles Verhalten | Fix-Verhalten |
|---|---|---|---|
| `true`  | non-empty | OK | OK (unverändert) |
| `true`  | empty    | silent WARNING, exit 0 | **ERROR, exit ≠ 0** mit klarem Hinweis auf Key + Pfad |
| `false` | non-empty | OK | OK (unverändert) |
| `false` | empty    | silent skip | **Key wird trotzdem geschrieben** (mit `""`-Wert) |
| missing/non-YAML | empty | silent skip | **ERROR, exit ≠ 0** (fail-closed, weil Schema Pflicht ist) |

### 2.1 Code-Änderung in `scripts/env-seal.sh`

In `seal_extra_namespace_secrets` (Zeilen 416–515):

1. **PyYAML-Block erweitern** (Zeilen 426–441): zusätzlich zur `(src, ns, sec, dest)`-Tuple auch das `required`-Flag pro Entry emittieren. Neuer Tuple-Shape: `src<TAB>ns<TAB>sec<TAB>dest<TAB>required`.

2. **Schleife anpassen** (Zeilen 481–498): nach Lookup des Werts:
   ```bash
   if [[ -z "$val" ]]; then
     case "$required" in
       true|TRUE|True|"yes"|"" )  # required (default wenn Schema-Flag fehlt — fail-closed)
         die "ERROR: required key '${src}' is empty in ${secrets_file} — refusing to seal incomplete secret ${sname}"
         ;;
       false|FALSE|False|"no")
         # Optional+empty: trotzdem emittieren, damit envFrom.secretKeyRef im Pod auflöst
         val=""
         ;;
     esac
   fi
   echo "  ${dest}: \"${val}\""
   dest_list="${dest_list} ${dest}"
   ```

3. **Reihenfolge-Trennung**: Empty-Werte NACH `required`-Check in den Manifest schreiben, nicht vorher skippen.

### 2.2 Kein neues Schema-Feld

Das `required`-Flag existiert bereits in `environments/schema.yaml` und wird vom `scan_for_dev_values`-Helper (Zeile 75) und `check_schema_completeness` (Zeile 188) bereits konsumiert. Wir nutzen die **gleiche Quelle** für `seal_extra_namespace_secrets` — keine Schema-Migration nötig.

### 2.3 Backwards-Kompatibilität

Re-Seal aller existierenden Envs (mentolder, korczewski) muss **identische oder erweiterte** sealed-secrets-Dateien liefern. Erwartet:
- `sealed-secrets/mentolder.yaml` — identisch (alle mentolder-Keys haben schon non-empty values)
- `sealed-secrets/korczewski.yaml` — **erweitert** um 5 leere Keys (DEEPSEEK_API_KEY*, SEPA_CREDITOR_*) in `website-korczewski/website-secrets`

**Verifikations-Schritt im Plan:** nach Re-Seal `git diff environments/sealed-secrets/` muss zeigen:
- mentolder.yaml: 0 changes
- korczewski.yaml: nur ADDITIONs in `encryptedData` (keine REMOVEs)

## 3. Test-Strategie (failing tests first)

`tests/spec/env-seal-empty-value-keys.bats` (bereits angelegt in diesem Branch, **3 Tests**):

| Test | Status vor Fix | Status nach Fix |
|---|---|---|
| `optional extra_namespaces key with empty value is included in output` | ❌ FAIL (BUG: extra SealedSecret fehlt) | ✅ PASS |
| `required key with empty value fails seal with non-zero exit` | ✅ PASS (vom dev-value-scanner) | ✅ PASS (bleibt grün — doppelte Absicherung) |
| `happy path with all required keys present succeeds` | ✅ PASS | ✅ PASS |

Stub-Mechanik: `kubeseal` wird per `PATH`-Override durch ein Stub-Script ersetzt, das die Secret-Manifest-Daten auf stdin liest und in die Output-Datei echoed (kein echtes Encryption nötig; Test fokussiert auf Manifest-Inhalt).

**Regression-Schutz:** Bestehender `tests/spec/sealed-secret-cluster-drift.bats` (T001182) muss weiter grün bleiben — der BATS-Test läuft im `factory:`-Pipeline und verifiziert Cluster-vs-Manifest-Konsistenz.

## 4. Subsysteme

| Datei | Rolle | Änderung |
|---|---|---|
| `scripts/env-seal.sh` | Hauptbug — `seal_extra_namespace_secrets` (Z. 416–515) | **ja, Kern** (PyYAML-Block + Skip-Logik) |
| `tests/spec/env-seal-empty-value-keys.bats` | Failing-then-passing tests | **neu** (im Branch) |
| `tests/spec/sealed-secret-cluster-drift.bats` | Bestehender Drift-Guard (T001182) | nicht ändern (soll grün bleiben) |
| `openspec/changes/env-seal-empty-value-keys/` | Change-Proposal + Plan | **neu** |
| `docs/superpowers/specs/2026-06-27-env-seal-empty-value-keys-design.md` | Diese Spec | **neu** (im Branch) |
| `environments/schema.yaml` | Definiert `required`-Flag pro Key | **nicht ändern** (SSOT, bereits korrekt) |
| `environments/.secrets/{mentolder,korczewski}.yaml` | Plaintext-Inputs | **nicht ändern** in diesem PR (Daten korrekt) |
| `environments/sealed-secrets/korczewski.yaml` | Output | **regeneriert** durch Re-Seal-Schritt (im Plan) |
| `openspec/changes/g-cd01-korczewski-secret-drift/` | Bestehende Spec (PR #2124) | **nicht ändern** (separater Change, archiviert nach Merge) |
| `.claude/lib/goals.md` | SSOT Repo-Health | **nicht ändern** in diesem PR (Baseline-Refresh in eigenem PR) |

## 5. Out of Scope (separate Follow-ups)

- `env-seal.sh seal_extra_namespace_secrets` leere `secret`-Manifeste komplett vermeiden, wenn ALLE Keys optional+empty sind (würde dann nur leere SealedSecret-Yaml-Doc schreiben). Akzeptabel als aktueller Stand.
- `pnpm-outdated`-Refresh der website-Lockfile (G-DEP02)
- 5 placeholder-keys mit echten Werten befüllen (für korczewski-Brand; out of thesis scope per PR #2124-Body)
- `tests/unit/ticket-external-id-sequence.bats` rebase auf T001160 (PR #2124-Body)

## 6. Akzeptanzkriterien

1. ✅ Alle 3 Tests in `tests/spec/env-seal-empty-value-keys.bats` grün
2. ✅ Bestehende `sealed-secret-cluster-drift.bats` weiter grün
3. ✅ `task env:seal ENV=mentolder` produziert **identisches** `sealed-secrets/mentolder.yaml` (byte-genau oder YAML-äquivalent)
4. ✅ `task env:seal ENV=korczewski` produziert `sealed-secrets/korczewski.yaml` mit 5 zusätzlichen empty Keys in `website-korczewski/website-secrets.spec.encryptedData`
5. ✅ `task test:changed` grün
6. ✅ `task freshness:check` grün
7. ✅ `task workspace:validate` grün
8. ✅ `task test:openspec` grün
9. ✅ Keine neuen FIXME/HACK/XXX (G-CQ04 bleibt 0 echte Schuld)

## 7. Risiken

- **R:** Backwards-Inkompatibilität in sealed-secrets-Dateien (anderes Team konsumiert das Format). **M:** sealed-secrets ist Cluster-intern, kein externer Konsument; byte-genaue Diff-Verifikation im Plan.
- **R:** PyYAML-Block-Parsing bricht bei Edge-Cases (Multi-Line-Strings, Anchors). **M:** Schema ist Single-Line-YAML (verifiziert in `environments/schema.yaml`).
- **R:** Korczewski-Deploy schlägt mit neuem Manifest fehl, weil leere Keys nicht von der App erwartet werden. **M:** `envFrom.secretKeyRef` resolvet leeren String zu `""` (K8s-Spec, OK); App-Verhalten unverändert weil leere Werte schon vor Fix möglich waren (über unsupportete envs).

## 8. Verwandte

- PR #2124 (T001182) — Companion: Symptom-Fix (Cluster-Repair + Drift-Guard)
- `openspec/changes/g-cd01-korczewski-secret-drift/` — voriger Change
- `tests/spec/sealed-secret-cluster-drift.bats` — Regression-Schutz aus T001182
- `.claude/lib/goals.md#G-CD01` — Repository-Health-Goal
