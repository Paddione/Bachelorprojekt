# p7 — Tests und Guards

Partial p7, Rolle tests. Grundlage: `../design.md` §10 (Testtabelle), §2–§4 und §9. Vorbilder sind
`tests/py/spec/devmesh/test_devmesh_flux.py` (`subprocess` + `yaml.safe_load_all` + `repo_root`) und
`tests/py/spec/native_ported/spec/flux-render-security/` (Fixture-Aufbau, Positiv-Anker gegen
vakuose Assertions, `run_cmd`-Muster). Alle drei Zieldateien sind neu.

Abhängigkeiten: p2 liefert `flux/clusters/korczewski-prod/` (FluxInstance, `oci-source.yaml`, vier
Kustomizations, `tenant-rbac.yaml`, `bootstrap/README.md`), p3/p4 den Manifest-Baum, p5
`scripts/korczewski-prod/render-stack.sh` und den Workflow. p7 pinnt deren Invarianten und ändert
keine dieser Dateien: die Tests sind reine Leser.

Randbedingungen, die für jeden Task gelten:

- **Offline.** Kein Cluster, kein Netz, kein `kubectl` gegen einen Context. Die Tests lesen YAML aus
  dem Repo (`pathlib`) oder aus einem lokalen Render (`subprocess`), sonst nichts.
- **S1-Budget.** `.py`-Limit ist 800 (`docs/code-quality/gates.yaml`, `s1.limits`); keine der drei
  Dateien ist baselined (`jq -r '."S1:tests/py/spec/korczewski-prod/test_render_guards.py".metric'
  docs/code-quality/baseline.json` → `nicht-baselined`, Ist 0). Budget also je **800**; Zielgrößen
  `conftest.py` ~40, `test_korczewski_prod_flux.py` ~200, `test_render_guards.py` ~230 Zeilen. Kein
  Split nötig, über 400 Zeilen Reserve je Datei.
- **Fixture-Konvention.** `repo_root` existiert bereits (`tests/py/conftest.py:72-75`,
  session-scoped, `Path(__file__).resolve().parents[2]`) — p7 definiert sie nicht neu, sondern
  konsumiert sie. `tests/py/pytest.ini` setzt `--import-mode=importlib`; der neue Spec-Ordner
  braucht deshalb kein `__init__.py`, und `python3 -m pytest` findet die Ini über den gemeinsamen
  Vorfahren `tests/py/` selbst.
- **Docstrings.** Jeder Test trägt einen deutschen Docstring mit Invariante und Ursprung: `C1`/`C2`/
  `C3` für die Audit-Befunde, `D1`–`D8` bzw. `§10` für die Design-Entscheidung.
- **Kein Vitest.** Die drei Dateien sind Python/YAML/Bash-Gates.

<!-- vitest: kein neuer Test nötig, weil rein konfigurativ (YAML/Bash/Python) -->

## Task 1: Rotphase — alle drei Testdateien mit den finalen Assertions anlegen

**Files:** `tests/py/spec/korczewski-prod/conftest.py`, `tests/py/spec/korczewski-prod/test_korczewski_prod_flux.py`, `tests/py/spec/korczewski-prod/test_render_guards.py`

Diesen Task zuerst ausführen, also **vor** dem Abschluss von p2–p5: er ist der Rot-Beleg, dass die
Lieferkette noch fehlt. Lege den Ordner `tests/py/spec/korczewski-prod/` an (kein `__init__.py`) und
schreibe alle drei Dateien sofort mit den Assertions, die in Task 2 und Task 3 festgehalten sind —
nicht mit Platzhaltern und nicht mit abgeschwächten Zwischenformen. Ein späteres „erst grün machen"
ist damit ausgeschlossen: die Assertions stehen fest, bevor der Implementierungspfad existiert.

`conftest.py` trägt den Modul-Docstring „Fixtures fuer die korczewski-prod-Lieferkette
(design.md §10)." und genau eine Fixture:

```python
@pytest.fixture(scope="session")
def render_tree(repo_root: Path, tmp_path_factory) -> Path:
    """Rendert den korczewski-prod-Baum einmal pro Session und liefert das --out-Verzeichnis.

    Offline: der Renderer (design.md §4, D3) liest environments/korczewski-prod.yaml und
    schreibt {cluster-bootstrap,platform,secrets,apps}. Kein Cluster, kein Netz.
    """
    out = tmp_path_factory.mktemp("korczewski-prod-render")
    res = subprocess.run(
        ["bash", "scripts/korczewski-prod/render-stack.sh", "--out", str(out)],
        cwd=repo_root, capture_output=True, text=True, timeout=600,
    )
    assert res.returncode == 0, f"render-stack.sh failed ({res.returncode}):\n{res.stdout}\n{res.stderr}"
    return out
```

`tmp_path_factory` statt `tmp_path` ist Pflicht, weil eine session-scoped Fixture keine
function-scoped Fixture anfordern darf; `repo_root` ist ebenfalls session-scoped und darf bleiben.
Der `timeout=600` deckt vier `kustomize`-Läufe ab. Der Fehlertext enthält bewusst `stdout` und
`stderr`, damit ein Vorbedingungs-Abbruch (Exit 2, z. B. fehlendes `yq`) im Testreport lesbar ist.

Die beiden Testdateien bekommen je einen Modul-Docstring mit Verweis auf `../design.md` §10 sowie
die unten festgelegten Testfunktionen — `test_korczewski_prod_flux.py` mit vier Tests, die ohne
Render laufen, `test_render_guards.py` mit sechs Tests, die `render_tree` anfordern.

Führe danach den Lauf aus. Erwartetes Ergebnis, solange p2–p5 nicht gelandet sind: `4 failed`
(Flux-Modul: `AssertionError` „`…/flux/clusters/korczewski-prod` does not exist", `FileNotFoundError`
auf `oci-source.yaml`, `ks-*.yaml` und `bootstrap/README.md`) und `6 errors` (Render-Modul: die
Fixture scheitert an `assert res.returncode == 0` mit `scripts/korczewski-prod/render-stack.sh: No
such file or directory` aus `stderr`, weil `bash` ein fehlendes Skript mit Exit 127 beantwortet).
Die Lücke ist echt: `tests/py/spec/korczewski-prod/`, `scripts/korczewski-prod/`,
`flux/clusters/korczewski-prod/`, `korczewski-prod/` und
`.github/workflows/render-korczewski-prod-artifact.yml` existieren auf `main@bc0772bf5` nicht.

expected: FAIL

Verify: `python3 -m pytest tests/py/spec/korczewski-prod -q`

## Task 2: Flux-Modul — Isolation, Identitätsanker, vier Sync-Pfade, Vorbedingungen

**Files:** `tests/py/spec/korczewski-prod/test_korczewski_prod_flux.py`

Vier Tests ohne Render, alle mit `repo_root`. Der Pfad
`flux/clusters/korczewski-prod` wird einmal als Modulkonstante gehalten, damit alle vier Tests
dieselbe Basis prüfen. Jeder Test beginnt mit einem Positiv-Anker (Datei- beziehungsweise
Dokumentanzahl > 0), damit ein leerer Baum nicht als „alles in Ordnung" durchgeht — das Muster aus
`test_envsubst_whitelist.py` (`assert names == [...]` statt nur „nicht enthalten").

- `test_flux_instances_isolated` — Docstring: „Die Flux-Insel korczewski-prod referenziert
  ausschließlich ihre eigene Quelle; kein devmesh-manifests, kein fleet, kein mentolder
  (Design §10, D1: ein Pfad, eine Quelle — die Lehre aus C1)." Sammle alle `*.yaml`/`*.yml` unter
  `flux/clusters/korczewski-prod/` (rekursiv, `bootstrap/README.md` ist keine YAML und fällt heraus),
  parse jedes Dokument mit `yaml.safe_load_all` und prüfe auf der **serialisierten Form**
  (`yaml.dump(doc)`), dass keine der Zeichenketten `devmesh-manifests`, `fleet-manifests`,
  `clusters/fleet`, `mentolder` vorkommt. Auf Dokumentwerten statt auf Rohtext zu prüfen ist
  Absicht: p2 nennt `flux/clusters/devmesh/` als Vorbild in Kommentaren, und ein Rohtext-Scan würde
  daran fälschlich scheitern; Kommentare fallen bei `safe_load` weg. Zusätzlich: die `FluxInstance`
  hat `spec.sync.path == "flux/clusters/korczewski-prod"` und `spec.sync.url ==
  "https://github.com/Paddione/Bachelorprojekt"`, und jede `OCIRepository` dieses Baums zeigt auf
  `oci://ghcr.io/paddione/korczewski-prod-manifests`.
- `test_workflow_verify_identity_anchored` — Docstring: „Das öffentliche Artefakt ist nur für genau
  einen Workflow auf `main` verwertbar (Design §8, D8; ADR-017 mildert die Abweichung von ADR-016
  D1)." Aus `oci-source.yaml`: genau eine `OCIRepository` namens `korczewski-prod-manifests`,
  `spec.verify.provider == "cosign"`, genau ein Eintrag in `spec.verify.matchOIDCIdentity` mit
  `issuer == "https://token.actions.githubusercontent.com"`; der `subject` beginnt mit `^` und endet
  mit `$` (verankert), und `re.fullmatch(subject, "https://github.com/Paddione/Bachelorprojekt/
  .github/workflows/render-korczewski-prod-artifact.yml@refs/heads/main")` trifft. Negativ-Anker
  derselben Regex gegen `…/ci.yml@refs/heads/main` muss `None` sein — sonst wäre der Anker zu weit
  und jeder Workflow im Repo signaturberechtigt. Aus
  `.github/workflows/render-korczewski-prod-artifact.yml`: Datei existiert, enthält `cosign sign`
  und den Artefaktnamen `ghcr.io/paddione/korczewski-prod-manifests` (Push **und** Signatur), dazu
  `id-token: write` und `packages: write` in der `permissions`-Sektion; der Workflow-Dateiname
  `render-korczewski-prod-artifact` muss im gepinnten `subject` enthalten sein, damit Anker und
  tatsächlicher Signierer nicht auseinanderlaufen können.
- `test_four_kustomizations_with_authored_service_accounts` — Docstring: „Vier getrennte Sync-Pfade,
  jeder mit eigener Identität und ohne geerbte Rechte; die `dependsOn`-Kette ist azyklisch
  `bootstrap → platform → secrets → apps` (Design §2, D1; Antwort auf C2)." Aus allen Dokumenten des
  Flux-Baums die `kind: Kustomization` einsammeln und prüfen: genau vier, Namen
  `korczewski-prod-{bootstrap,platform,secrets,apps}`; jede setzt `spec.serviceAccountName`, die
  Abbildung ist `bootstrap → korczewski-prod-bootstrap`, `platform → korczewski-prod-platform`,
  `secrets`/`apps → korczewski-prod-tenant` (drei verschiedene SA-Namen, `secrets` und `apps` teilen
  bewusst die Tenant-Identität); jeder dieser Namen existiert als `ServiceAccount` in
  `tenant-rbac.yaml` unter `metadata.namespace: flux-system`; `spec.path` ist der jeweilige
  `./`-Pfad; jede `sourceRef` zeigt auf `OCIRepository/korczewski-prod-manifests`. Für die Kette:
  alle `dependsOn`-Namen müssen in der Vierermenge liegen, genau eine Kustomization ist Wurzel
  (`bootstrap`, kein `dependsOn`), und eine topologische Sortierung (Kahn, `set`-basiert, keine
  Rekursion) liefert exakt die Reihenfolge `bootstrap, platform, secrets, apps` — ein Zyklus lässt
  die Sortierung kürzer als vier enden und schlägt damit fehl.
- `test_bootstrap_readme_lists_prerequisites` — Docstring: „Wer den Cluster aufsetzt, muss die
  Vorbedingungen prüfen können statt sie zu erraten (Design §9); genau die Punkte, an denen C3
  entstand, sind mit Befehl hinterlegt." `flux/clusters/korczewski-prod/bootstrap/README.md` ist
  nicht leer, enthält mindestens sechs nummerierte Einträge im Muster `^[0-9]+\. \*\*` (p2 liefert
  acht), und jeder Eintragsblock — von der Nummer bis zur nächsten Nummer — enthält mindestens einen
  Aufruf `kubectl --context korczewski-prod` oder `flux --context korczewski-prod`. Zusätzlich:
  mindestens ein Block nennt `sealed-secrets` (Key-Bezug, C3-Wurzel) und mindestens ein Block nennt
  `cert-manager` (CRD-Gate vor dem Bootstrap-Pfad).

Verify: `python3 -m pytest tests/py/spec/korczewski-prod/test_korczewski_prod_flux.py -q --collect-only`

## Task 3: Render-Modul — Layout, Fremd-Referenzen, Scope-Trennung, RBAC, C3-Parität, Digests

**Files:** `tests/py/spec/korczewski-prod/test_render_guards.py`

Sechs Tests, alle mit `render_tree` (der Render läuft dadurch genau einmal pro Session, nicht sechsmal).
Gemeinsame Helfer im Modul: `_yaml_files(root)` liefert `sorted(root.rglob("*.yaml")) + rglob("*.yml")`,
`_docs(path)` liefert `[d for d in yaml.safe_load_all(...) if d]`, `_walk(node)` liefert alle
`(key, value)`-Paare rekursiv. Jeder Test beginnt mit einem Positiv-Anker.

- `test_render_out_layout` — Docstring: „`render-stack.sh --out` erzeugt den Vier-Baum
  `{cluster-bootstrap,platform,secrets,apps}`, und jede Datei enthält mindestens ein Dokument
  (Design §4/D3, §10)." Für jedes der vier Verzeichnisse: `is_dir()`, mindestens eine YAML-Datei,
  `len(_docs(datei)) >= 1` je Datei, `sum(len(_docs(f)) for f in ...) >= 1` je Verzeichnis.
  Bewusst **nicht** geprüft wird das Fehlen von `${…}` im Baum: laufzeit-escapte Variablen
  (`$${VAR}`) werden vom Renderer absichtlich zu `${VAR}` entwest (`test_runtime_var_unwrapping.py`),
  ein pauschales Verbot wäre also falsch; die Leftover-Prüfung ist Sache des Renderers (p5).
- `test_no_devmesh_or_fleet_refs` — Docstring: „Kein Dokument des Ziel-Baums trägt eine
  devmesh-/fleet-/mentolder-Referenz; der Prod-Pfad erbt keine Fremdquelle (Design §4 fail-closed;
  C1-Lehre: kein Objekt und keine Referenz ohne Manifest)." Über alle YAML-Dateien im Baum: die
  Zeichenketten `mentolder.de`, `fleet-manifests`, `devmesh-manifests`, `workspace-dev`,
  `devmesh.korczewski.de`, `clusters/fleet` dürfen im Dateitext nicht vorkommen; Positiv-Anker ist
  die Anzahl gescannter Dateien plus Gesamtbytezahl > 0. Die Liste deckt sich mit dem
  Fail-closed-Gate des Renderers, damit Test und Renderer nicht auseinanderlaufen.
- `test_cluster_scoped_only_in_bootstrap` — Docstring: „Cluster-scoped Objekte liegen ausschließlich
  im Bootstrap-Pfad; kein Tenant-Pfad trägt Rechte oder CRs mit Cluster-Wirkung (Design §10/D1,
  Antwort auf C2)." Menge der cluster-scoped Kinds exakt wie in der Design-Tabelle plus die
  eindeutig cluster-weiten Typen: `ClusterRole`, `ClusterRoleBinding`, `ClusterIssuer`, `TLSStore`,
  `CustomResourceDefinition`, `StorageClass`, `IngressClass`, `PersistentVolume`,
  `ValidatingWebhookConfiguration`, `MutatingWebhookConfiguration`. Jedes Dokument dieser Kinds muss
  unter `cluster-bootstrap/` liegen; Positiv-Anker: dort mindestens ein `ClusterIssuer` und ein
  `TLSStore`. `Namespace` ist bewusst **nicht** in der Menge: die Design-Tabelle nennt ihn nicht,
  und die beiden Tenant-Namespaces sind genau der Gegenstand des C3-Paritätstests (Task 3, fünfter
  Punkt) beziehungsweise der Namespace-Deklaration in `tenant-rbac.yaml` (p2).
- `test_tenant_rbac_has_no_cluster_admin` — Docstring: „Kein Pfad bindet `cluster-admin`, und die
  Tenant- beziehungsweise Platform-ServiceAccounts erscheinen in keinem `ClusterRoleBinding`
  (Design §3/D2; wörtlich der C2-Befund, der auf devmesh offen ist)." Geprüft wird die Vereinigung
  aus gerendertem Baum und `flux/clusters/korczewski-prod/**` — die RBAC-Objekte des Ziel-Clusters
  entstehen in beiden Quellen, eine Prüfung nur des Artefakts wäre unvollständig. Assertions: kein
  `ClusterRoleBinding` mit `roleRef.name == "cluster-admin"`; die Zeichenkette `cluster-admin`
  kommt in keinem Dokumentwert vor; `korczewski-prod-tenant` und `korczewski-prod-platform` sind in
  keinem `ClusterRoleBinding` Subjekt (in namespaced `RoleBinding`s dürfen und sollen sie stehen).
  Positiv-Anker: es existiert mindestens ein `ClusterRoleBinding`, und dessen Subjekte sind
  ausschließlich `korczewski-prod-bootstrap`/`flux-system` — ohne diesen Anker wäre die Prüfung bei
  einem leeren Scan vakuos grün.
- `test_sealed_secret_namespaces_match_created_namespaces` — Docstring: „Jeder SealedSecret-Namespace
  wird von der Lieferkette selbst angelegt; keine Entsiegelung zielt auf einen Namespace, den das
  Artefakt nicht erzeugt (Design §6/§10, C3-Regression)." Erst der Anker: die Menge der
  `SealedSecret`-Paare im gerenderten Baum ist exakt `(cert-manager, ipv64-api-key)`,
  `(workspace-korczewski, workspace-secrets)`, `(website-korczewski, website-secrets)`,
  `(website-korczewski, website-content-token)`. Dann die Erzeugermenge als Vereinigung aus
  (a) `Namespace`-Dokumenten im gerenderten Baum, (b) `Namespace`-Dokumenten unter
  `flux/clusters/korczewski-prod/**` (die Root-Kustomization des Operators appliziert diesen Pfad
  vor den Kind-Pfaden, p2), (c) `metadata.namespace` aller namespaced Dokumente im gerenderten Baum
  (deckt `flux-system`, `cert-manager` und `kube-system` ab, in die hinein gerendert wird) und
  (d) `flux-system` selbst. Assertion: `sealed_namespaces <= created_namespaces` **und**
  `sealed_namespaces == {"cert-manager", "workspace-korczewski", "website-korczewski"}`; dazu die
  Gegenprobe, dass `workspace-korczewski` und `website-korczewski` in der Erzeugermenge liegen. Die
  Vereinigung ist kein Schlupfloch, sondern die korrekte Bezugsgröße: die Design-Tabelle vergleicht
  „vom Artefakt angelegt" gegen „versiegelt", und im Ziel-Cluster entstehen die Namespaces teils
  über das Artefakt, teils über den Flux-Kontrollpfad — beide Wege vor dem ersten `apps`-Reconcile.
- `test_images_are_digest_pinned` — Docstring: „Jedes Container-Image im Baum ist per Digest gepinnt;
  kein beweglicher Tag kann den Prod-Cluster unbemerkt auf eine andere Version ziehen (Design §7/D7,
  Audit-Befund `latest` in `k3d/website.yaml:252`)." Sammle rekursiv jeden Mapping-Schlüssel `image`
  mit String-Wert (Container, `initContainers`, Jobs, CronJobs; `image:` taucht in den HelmReleases
  dieses Baums nicht auf, deshalb genügt der Schlüssel-Name) und fordere je Wert
  `re.search(r"@sha256:[0-9a-f]{64}$", wert)`. Die Form `name:tag@sha256:…` ist zulässig (so sind
  `postgres`, `pocket-id`, `busybox` und `curl` bereits gepinnt); verboten ist jeder Wert ohne
  Digest und jeder Wert mit `:latest`. Positiv-Anker: mindestens vier Image-Werte gefunden. Findet
  der Lauf ein Tag-only-Image, ist das ein echter D7-Verstoß im Manifest-Baum und wird an den
  Besitzer von p4 gemeldet, nicht durch Aufweichen der Assertion „behoben".

Verify: `python3 -m pytest tests/py/spec/korczewski-prod/test_render_guards.py -q`

## Task 4: Grünlauf, Inventar und Commit

**Files:** `tests/py/spec/korczewski-prod/conftest.py`, `tests/py/spec/korczewski-prod/test_korczewski_prod_flux.py`, `tests/py/spec/korczewski-prod/test_render_guards.py`

Erst wenn p2–p5 gelandet sind, muss derselbe Aufruf aus Task 1 grün sein: zehn Tests, ein einziger
Render, kein Netz, kein Cluster. Prüfe die Zahl der gesammelten Tests mit
`python3 -m pytest tests/py/spec/korczewski-prod -q --collect-only` (erwartet `10 tests collected`)
und danach den vollen Lauf mit `-q`. Beide Aufrufe laufen ohne `-c`, weil `python3 -m pytest` die
`tests/py/pytest.ini` über den gemeinsamen Vorfahren `tests/py/` selbst findet und damit
`--import-mode=importlib` aktiv ist; der Repo-Runner `bash scripts/pytest-run.sh
tests/py/spec/korczewski-prod` setzt dieselbe Ini explizit und muss dasselbe Ergebnis liefern.

Weil zwei neue Testmodule dazukommen, danach `task test:inventory` laufen lassen (Ziel:
`scripts/build-test-inventory.sh`, Ausgabe `components/website/src/data/test-inventory.json`); das
Skript erfasst `tests/py/spec` als nativen pytest-Pfad, die neuen Module erscheinen also im
Inventar. Nur wenn die Datei sich inhaltlich ändert, wird sie mitgestaged — eine unveränderte Datei
bleibt unangetastet. Kein Vitest-Task nötig: die Zieldateien sind Python, die zu prüfenden Artefakte
YAML und Bash.

Stage ausschließlich die drei Zieldateien (plus das Inventar, falls geändert) — nie `git add -A`,
nie `-u` über den Worktree. Kein PR: Staging per Push, Abschluss übernimmt `dev-flow-execute`.

Verify: `bash -c 'python3 -m pytest tests/py/spec/korczewski-prod -q --collect-only >/dev/null && python3 -m pytest tests/py/spec/korczewski-prod -q && bash scripts/pytest-run.sh tests/py/spec/korczewski-prod && echo OK'`

Commit: `test(infra): Guards fuer korczewski-prod Lieferkette`
