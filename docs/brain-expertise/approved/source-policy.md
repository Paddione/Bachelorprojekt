---
type: note
tags: [github-reviewed, expertise, policy]
status: active
---
# Source Policy für GitHub-Expertise

Diese Policy ist selbst ein bewusst freigegebenes Dokument der Gruppe `github-reviewed`.
Sie enthält keine PR-Evidenz; ihre lokale `source_revision` und die Lifecycle-Felder ergänzt
der allgemeine Brain-Ingest aus dieser Ursprungsdatei. Die Gruppenzugehörigkeit oder das Tag
`github-reviewed` allein machen eine Quelle nicht zu einem PR-Artefakt: Nur die vom
Approval-Schritt geschriebenen Frontmatter-Felder `source_kind`, `repository`, `pull_request`
und `upstream_revision` kennzeichnen diese unveränderliche Upstream-Provenienz.

Der Pilot verarbeitet ausschließlich ein ausdrücklich genanntes Repository, eine Pull Request
und deren unveränderliche Head-SHA. Die Bedienfolge lautet:

```bash
python3 scripts/brain-expertise.py fetch --repo Paddione/Bachelorprojekt --pr 123 --revision 0123456789abcdef0123456789abcdef01234567
python3 scripts/brain-expertise.py stage --repo Paddione/Bachelorprojekt --pr 123 --revision 0123456789abcdef0123456789abcdef01234567
python3 scripts/brain-expertise.py approve --repo Paddione/Bachelorprojekt --pr 123 --revision 0123456789abcdef0123456789abcdef01234567 --slug review-gated-brain-ingest
```

Fetch und Stage liegen außerhalb des Repositories unter
`${XDG_STATE_HOME:-$HOME/.local/state}/bachelorprojekt/brain-expertise/`. Persistiert werden
nur Repository, PR, Revision, Quellen-URLs, Dateipfad/Status/Patch sowie numerische Review-
und Comment-IDs, Zustand und Text. Personen erscheinen nur als Rollen. E-Mail-Adressen,
Credentials, Tokens, URL-Userinfo und Private Keys werden redigiert; Textfelder sind auf
20 KiB und die gesamte Evidenz auf 2 MiB begrenzt.

Approval ist append-only und erfordert interaktiv oder per Datei exakt:
`APPROVE <owner/repo>#<pr>@<sha> <slug>`. Nur danach entsteht ein Dokument unter
`docs/brain-expertise/approved/`. Es hält die geprüfte GitHub-SHA als `upstream_revision` fest;
der allgemeine Ingest berechnet davon getrennt `source_revision` aus den Bytes dieses lokalen
approved-Artefakts.

Verboten sind organisationsweite oder ambiente Suche, Autorenprofile und Leistungsbewertung,
Persistenz roher API-Antworten, ungeprüfte Secrets oder PII, Ingest aus `fetched/` oder
`staged/` sowie automatische Freigabe.

## Review-Checkliste

- Repository, PR und SHA stimmen mit dem ausgewählten Scope überein.
- Evidence-IDs und Links sind nachvollziehbar und belegen die Aussage.
- Identität ist auf Rollen minimiert; Redaction und Residual-Scan sind sauber.
- Trunkierung verfälscht die Aussage nicht.
- Der Zielpfad ist neu und enthält ausschließlich geprüftes Material.
