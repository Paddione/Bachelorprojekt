# P3 — Review-gated GitHub expertise pilot

Rolle: **impl**. Disjunkter Partial des Change `brain-knowledge-lifecycle` (T012913),
REQ-BRAIN-FOUNDATION-020. Dieser Partial liefert den explizit auf ein Repository und
eine Pull Request begrenzten Fetch→Stage→Approve-Pfad. Er übernimmt vom
`engineer-expertise-extractor` nur die nützlichen Konzepte (PR-Entscheidungen,
Review-Hinweise, wiederkehrende Muster), nicht dessen personenorientiertes Profiling,
organisationsweite Suche oder unredigierte Beispielsammlung.

Die Test-Fixtures und BATS-Abdeckung gehören ausschließlich zu p5. Daher enthält
dieser Partial bewusst weder einen Failing-Test-Step noch die globale Verify-Kette.

Verbindliche Datenschutz- und Lifecycle-Grenze:

```text
gh api (genau owner/repo + PR) -> In-Memory-Auswahl/Redaktion
  -> lokaler State außerhalb des Repos: fetched.json -> candidate.md
  -> explizites approve
  -> docs/brain-expertise/approved/<repo>-pr-<nr>-<revision>.md
  -> Manifest-Gruppe github-reviewed -> Brain-Worklist
```

- Kein GitHub-Suchendpunkt, kein `gh pr list`, kein Organisations-/Autoren-Crawl.
- Unredigierte API-Antworten werden nicht persistiert. Fetch schreibt nur die
  datensparsam ausgewählte und redigierte Evidenz in den lokalen State.
- Der lokale State liegt standardmäßig unter
  `${XDG_STATE_HOME:-$HOME/.local/state}/bachelorprojekt/brain-expertise/` und damit
  außerhalb des von `brain-ingest-worklist.sh --root` durchlaufenen Repos. `stage/`
  ist niemals eine Manifest-Quelle.
- Nur `approve` darf unter `docs/brain-expertise/approved/` schreiben. Die Manifest-
  Allowlist nennt ausschließlich dieses Verzeichnis als Gruppe `github-reviewed`.

---

## File Structure

| Datei | Ist | Effektives Budget |
|---|---:|---:|
| `scripts/brain-expertise.py` | net-new | 800 Zeilen (`.py`-S1-Limit 800) |
| `scripts/brain/ingest-sources.yaml` | 75 Zeilen | nicht S1-limitiert (`.yaml` außerhalb `k3d/`) |
| `docs/brain-expertise/approved/source-policy.md` | net-new | nicht S1-limitiert (`.md`) |

Zielumfang für `scripts/brain-expertise.py`: höchstens 500 Zeilen, also mindestens
300 Zeilen Wachstumsreserve. Keine Baseline-/Ignore-Ausnahme anlegen.

## File `scripts/brain-expertise.py` (net-new)

### Task P3.1 — CLI und fail-closed Scope-Vertrag

- [x] Standardbibliothek-basiertes Python-CLI mit Subcommands `fetch`, `stage`,
      `approve` anlegen. Alle Subcommands verlangen `--repo OWNER/REPO --pr NUMBER`;
      `fetch` verlangt zusätzlich `--revision SHA`. Das Repository muss gegen
      `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`, die PR gegen eine positive Ganzzahl und die
      Revision gegen `^[0-9a-fA-F]{40}$` validiert werden. Ungültige oder fehlende
      Werte: Diagnose auf stderr, Exit 2, keine Dateiänderung.
- [x] State-Root ist per `--state-dir` testbar, sonst
      `${BRAIN_EXPERTISE_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/bachelorprojekt/brain-expertise}`.
      Das Skript muss den kanonischen State-Pfad prüfen und jeden `--state-dir`
      ablehnen, der gleich dem Repo-Root oder darin liegt. Dadurch kann auch ein
      versehentlich passendes Manifest-Glob staged material nicht ingestieren.
- [x] `fetch` darf ausschließlich diese vier repo-/PR-gebundenen Aufrufe über
      `subprocess.run(..., check=True, capture_output=True, text=True)` ausführen:

```bash
gh api repos/Paddione/Bachelorprojekt/pulls/123
gh api --paginate repos/Paddione/Bachelorprojekt/pulls/123/files
gh api --paginate repos/Paddione/Bachelorprojekt/pulls/123/reviews
gh api --paginate repos/Paddione/Bachelorprojekt/issues/123/comments
```

      Der konkrete Pfad wird aus den validierten `--repo`/`--pr`-Werten gebaut;
      keine Shell-Ausführung und keine freie URL. `fetch` verifiziert, dass
      `pull.head.sha == --revision`; bei Abweichung Exit 1, damit Provenienz nicht
      still auf einen beweglichen PR-Stand zeigt.
- [x] Dokumentierte Bedienfolge implementieren:

```bash
python3 scripts/brain-expertise.py fetch --repo Paddione/Bachelorprojekt --pr 123 --revision 0123456789abcdef0123456789abcdef01234567
python3 scripts/brain-expertise.py stage --repo Paddione/Bachelorprojekt --pr 123 --revision 0123456789abcdef0123456789abcdef01234567
python3 scripts/brain-expertise.py approve --repo Paddione/Bachelorprojekt --pr 123 --revision 0123456789abcdef0123456789abcdef01234567 --slug review-gated-brain-ingest
```

      `fetch` erzeugt atomar `fetched/<owner>/<repo>/pr-123/<sha>.json`, `stage`
      liest genau diese Revision und erzeugt atomar
      `staged/<owner>/<repo>/pr-123/<sha>/candidate.md`; `approve` liest nur diesen
      Kandidaten und erzeugt atomar die allowlistete Zieldatei. Bestehende Dateien
      werden nie überschrieben; identischer Inhalt ist idempotent, abweichender Inhalt
      am selben Schlüssel bricht mit Exit 1 ab.

### Task P3.2 — Datensparsame Fetch-Evidenz und Redaction

- [x] Aus den GitHub-Antworten ausschließlich folgende Felder übernehmen:
      Repository, PR-Nummer, unveränderliche Head-SHA, HTML-URL, PR-Titel/-Body;
      aus Files nur Pfad, Status, Patch; aus Reviews/Comments nur numerische ID,
      HTML-URL, State sowie Body. Namen, Logins, E-Mail, Avatar-URLs, Organisation,
      Zeitprofile und Reactions werden verworfen. Personen werden nur als Rollen
      `pr-author`, `reviewer` oder `commenter` dargestellt; es entsteht kein
      Engineer-Profil und kein personenübergreifender Identifier.
- [x] Vor jedem Persistieren Secret- und PII-Redaction auf alle Freitextfelder
      anwenden: E-Mail-Adressen, GitHub-/OAuth-/Bearer-/JWT-Tokens, PEM Private Keys,
      URL-Userinfo, Zuweisungen an Schlüssel mit `password|passwd|secret|token|api_key|private_key`
      werden durch typisierte Marker wie `[REDACTED:email]` bzw.
      `[REDACTED:credential]` ersetzt. Patch-Zeilen zu Binärdateien werden verworfen;
      einzelne Textfelder werden auf 20 KiB, die gesamte redigierte Evidenz auf 2 MiB
      begrenzt. Trunkierung wird als Zähler protokolliert, nicht durch Nachladen
      umgangen.
- [x] Das persistierte JSON erhält `schema_version: 1`, `repository`, `pull_request`,
      `source_url`, `source_revision`, die ausgewählten Evidenzlisten sowie
      `redaction: {version, redacted_fields, truncated_fields}`. JSON wird mit
      sortierten Keys und abschließendem Newline geschrieben. `observed_at` darf als
      Beobachtungszeit enthalten sein, ist aber nicht Bestandteil der Identität;
      Revision und GitHub-IDs bleiben unverändert und werden nie vom Modell erfunden.
- [x] Temporärdateien ausschließlich mit `tempfile` im Zielverzeichnis und Modus
      `0600` erzeugen, nach `fsync` per `os.replace` veröffentlichen; State-Verzeichnisse
      mit `0700`. Bei `gh`-/Parse-/Redaction-Fehlern keine Teil- oder Rohdatei
      zurücklassen.

### Task P3.3 — Stage erzeugt prüfbaren Kandidaten, nicht Brain-Input

- [x] `stage` erzeugt aus der redigierten Evidenz deterministisch ein Markdown-
      Kandidatendokument. Es enthält oben eine maschinenlesbare Provenienzsektion mit
      `repository`, `pull_request`, `source_url`, `source_revision`, verwendeten
      Review-/Comment-IDs und Redaction-Version; danach getrennte Abschnitte für
      „Decision evidence“, „Review guidance“ und „Recurring patterns“.
- [x] Nur Aussagen mit einer konkreten Evidence-ID/URL übernehmen. Freie
      personenbezogene Zuschreibungen („Engineer X bevorzugt …“), Leistungsbewertung
      und nicht aus dem ausgewählten PR belegte Generalisierungen sind verboten.
      Inhalte bleiben `status: staged`; es gibt hier noch kein `source_kind:
      github-reviewed` und keine Datei im Repo.
- [x] Vor dem Schreiben denselben Redactor erneut auf das gerenderte Markdown
      anwenden. Zusätzlich einen fail-closed Residual-Scan ausführen; trifft ein
      Credential-/Private-Key-Muster nach der Redaction weiterhin, Exit 1 und keinen
      Kandidaten schreiben.

### Task P3.4 — Explizites Approve mit unveränderlicher Provenienz

- [x] `approve` verlangt einen gültigen `--slug` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) und
      eine interaktive Bestätigung, die Repository, PR, Revision, Zielpfad und die
      Redaction-/Trunkierungszähler anzeigt. Für Automatisierung/Tests gibt es nur
      `--approval-file PATH`; dessen exakter Inhalt muss
      `APPROVE <owner/repo>#<pr>@<sha> <slug>` sein. Kein `--yes` und kein impliziter
      Default auf Zustimmung.
- [x] Vor Freigabe Kandidat erneut parsen und prüfen: Repo/PR/SHA entsprechen den
      CLI-Werten; jede Evidence-ID kommt in `fetched.json` vor; Residual-Secret- und
      E-Mail-Scan ist leer. Fehler: Exit 1 ohne Zieldatei.
- [x] Zieldatei ist deterministisch
      `docs/brain-expertise/approved/<owner>-<repo>-pr-<number>-<revision-prefix>-<slug>.md`
      mit einem mindestens 12-stelligen SHA-Präfix. Frontmatter enthält
      `type: note`, `tags: [github-reviewed, expertise]`, `status: active`,
      `source_kind: github-reviewed`, `source_revision: <voller SHA>`,
      `repository`, `pull_request`, `source_url` und die unveränderlichen Evidence-IDs.
      Lifecycle-Felder, die der allgemeine Ingest ergänzt, nicht mit erfundenen Werten
      duplizieren.
- [x] Freigabe ist append-only: existiert der Zielpfad, nur byte-identischen Inhalt
      als Erfolg akzeptieren. Geänderte Erkenntnisse zu einer späteren Head-SHA
      erzeugen eine neue Datei; eine frühere Freigabe wird weder mutiert noch gelöscht.
- [x] Das Skript muss per Kopfkommentar und Policy referenziert sein (S4). Danach
      `python3 -m py_compile scripts/brain-expertise.py` und
      `python3 scripts/brain-expertise.py --help` ausführen.

## File `scripts/brain/ingest-sources.yaml` (edit)

### Task P3.5 — Ausschließlich approved als `github-reviewed` allowlisten

- [x] Unter `groups:` exakt diese Gruppe ergänzen:

```yaml
  github-reviewed: docs/brain-expertise/approved/*.md
```

- [x] Unter `type_map.defaults` `github-reviewed: note` und unter `tag_defaults`
      `github-reviewed: [github-reviewed, expertise]` ergänzen. Keine Glob-Erweiterung
      auf `docs/brain-expertise/**`, den lokalen State, `fetched/` oder `staged/`.
- [x] Mit einem temporären Repo-Root prüfen, dass ein Dokument unter
      `docs/brain-expertise/staged/` nicht, ein Dokument unter
      `docs/brain-expertise/approved/` aber als Gruppe `github-reviewed` ausgegeben
      wird. Dies ist ein Implementierungs-Smoke; der reproduzierbare Offline-Test
      samt Fixture folgt in p5.

## File `docs/brain-expertise/approved/source-policy.md` (net-new)

### Task P3.6 — Menschlich prüfbare Source Policy

- [x] Deutschsprachige Policy mit Zweck, erlaubtem Scope und Bedienfolge anlegen.
      Sie nennt die drei konkreten Kommandos aus P3.1, den externen State-Pfad, die
      erlaubten GitHub-Felder, Redaction-/Größenlimits, Approval-File-Satz und den
      append-only Provenienzvertrag.
- [x] Explizite Verbote dokumentieren: keine organisationsweite/ambiente Suche, keine
      Autorenprofile oder Leistungsbewertung, keine Persistenz roher API-Antworten,
      keine ungeprüfte Übernahme von Secrets/PII, kein Ingest von fetched/staged und
      keine automatische Freigabe.
- [x] Review-Checkliste aufnehmen: Scope und SHA stimmen; Evidence-Links sind
      nachvollziehbar; Aussage ist durch den gewählten PR belegt; Identität ist auf
      Rollen minimiert; Redaction-/Residual-Scan ist sauber; Trunkierung verfälscht die
      Aussage nicht; Zielpfad ist neu und enthält nur reviewed Material.
- [x] Die Policy ist selbst ein bewusst freigegebenes Dokument in der
      `github-reviewed`-Gruppe. Ihr Inhalt enthält keine PR-Evidenz und erklärt diesen
      Sonderfall; ihr `source_revision` wird wie bei anderen lokalen Quellen vom
      allgemeinen Provenienz-Partial abgeleitet, nicht als GitHub-SHA ausgegeben.

---

## Scope-Grenzen (nicht in P3)

- Keine Offline-Fixtures oder BATS-Dateien — vollständig p5.
- Keine Änderung am Worklist-Skript: dessen bestehende Manifest-Gruppenauflösung reicht;
  die Sicherheitsgrenze entsteht durch externes Staging plus engen approved-Glob.
- Keine LLM-basierte Extraktion, kein Engineer-Profil und kein automatisches Publishing.
- Keine Änderung an allgemeinen Lifecycle-Metadaten, Audit, MCP-Retrieval oder Eval-
  Runner — diese liegen in den anderen disjunkten Partials.
