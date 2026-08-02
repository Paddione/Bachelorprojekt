# Proposal: env-seal-empty-value-keys

## Why

**G-CD01** (korczewski-Website-Deploy-Rate 27 %, 11/15 rot) hat zwei Ebenen. **PR #2124 (T001182)** hat die **symptomatische** Ebene gefixt: Cluster-Repair der fehlenden 5 Keys (`DEEPSEEK_API_KEY*`, `SEPA_CREDITOR_*`) plus ein BATS-Drift-Guard, der künftige Cluster-vs-Manifest-Divergenzen fail-closed detektiert. **Die root-cause in `scripts/env-seal.sh` ist ungefixt** und kann denselben Bug in einer anderen Konfiguration jederzeit reproduzieren — auch auf mentolder, sobald ein optional-Key mit empty value dort in `extra_namespaces` landet.

Die root-cause: `seal_extra_namespace_secrets` (Z. 494) skippt Keys mit empty value **stillschweigend** (WARNING auf stderr, exit 0). Wenn ALLE Keys einer `(ns, secret)`-Pair leer sind, wird der gesamte SealedSecret nicht geschrieben. Das Cluster bekommt ein unvollständiges Secret, der Pod scheitert mit `CreateContainerConfigError` 120s später beim Rollout. Die Fehlerkette ist lang und der Feedback-Loop dementsprechend langsam.

**Konsequenz:** solange die Root-Cause lebt, ist die korczewski-Lane latent instabil — heute über die 5 optional-Empty-Keys, morgen über einen neuen optional-Key in mentolder. T001182 hat den konkreten Schaden behoben, aber die Klasse von Bugs nicht.

## What

`seal_extra_namespace_secrets` so umbauen, dass das Schema-`required`-Flag respektiert wird:

- **`required: true` + empty value** → `die` mit klarem Error (`refusing to seal incomplete secret`), exit ≠ 0
- **`required: false` + empty value** → Key trotzdem in den Manifest schreiben (mit `""`-Wert) — der `envFrom.secretKeyRef` resolvet im Pod zu `""`, was ein deterministisch gültiger Zustand ist
- **`required`-Flag fehlt im Schema** → fail-closed als `required: true` (Schema-Pflicht)

Der bestehende `required`-Flag-Mechanismus (vom `scan_for_dev_values`-Helper und `check_schema_completeness` bereits genutzt) wird wiederverwendet — **keine Schema-Änderung**, **keine Migration**.

**Regression-Schutz:**
- 3 neue BATS-Tests in `tests/spec/env-seal-empty-value-keys.bats` (einer davon ist der failing-test-first für den Bug)
- Bestehender `sealed-secret-cluster-drift.bats` (T001182) muss grün bleiben
- Re-Seal von mentolder muss byte-genau identisches `sealed-secrets/mentolder.yaml` liefern; korczewski darf nur ADDITIONs in `website-korczewski/website-secrets` zeigen, keine REMOVEs

**Out of scope:** echte Werte für die 5 placeholder-Keys, `env-seal.sh`-Refactor für leere Manifest-Docs, Renovate-Refresh der website-Lockfile.

_Ticket: T001198_
