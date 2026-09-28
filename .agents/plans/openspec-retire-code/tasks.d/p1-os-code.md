# p1 — OpenSpec aus Code, CI und Skills lösen (1/7)

Ticket: T900725. Kontext: `design.md`. 45 Dateien.

## Regeln

Verhalten ändert sich: OpenSpec wird als Mechanismus entfernt (ADR-010).
Pläne liegen bereits unter `.agents/plans/<slug>/`, das bleibt.

Pro Datei entscheiden und die erste passende Regel anwenden:

1. **Test prüft OpenSpec-Verhalten** (Validator, Archiv, Propose, Delta, `openspec/specs`-Inhalt,
   `openspec-status.json`) → den `@test`-Block löschen. Bleibt kein Test übrig → Datei löschen (`git rm`).
2. **Test nutzt `openspec/` nur als Beispiel-/Fixture-Pfad** → auf einen Pfad unter `.agents/plans/`
   oder eine Fixture unter `tests/fixtures/` umstellen, Testaussage beibehalten.
3. **Skript/Code liest oder schreibt `openspec/`** → diesen Zweig entfernen. Dient eine Funktion,
   ein Task oder ein Skript nur OpenSpec → komplett entfernen samt Aufrufern (Taskfile, CI, Hooks).
4. **CI-Workflow/Job/Step nur für OpenSpec** → löschen. Required-Check-Namen nicht umbenennen
   (das macht A3b), nur Schritte darin entfernen.
5. **Config-Eintrag** (renovate, commitlint-Scope, gitleaks-Allowlist, vitest-Include, package.json-Script) → Eintrag löschen.
6. **Kommentar/Prosa** → wie A1a: Verweis streichen.

Nach jeder Datei: `grep -in openspec <datei>` ist leer (oder Datei gelöscht). Für geänderte
`.bats`-Dateien `bats <datei>` ausführen. Für geänderte Skripte `bash -n` bzw. `shellcheck`.

## Dateien

- `.claude/workflows/agentic-trends-radar.js`
- `.gitattributes`
- `.githooks/post-commit-embed`
- `.githooks/post-rewrite`
- `.githooks/pre-commit`
- `.github/workflows/arbitration.yml`
- `.github/workflows/auto-enable-automerge.yml`
- `.github/workflows/build-brett.yml`
- `.github/workflows/build-collabora.yml`
- `.github/workflows/build-dev-pod.yml`
- `.github/workflows/build-factory-runner.yml`
- `.github/workflows/build-mediaviewer-widget.yml`
- `.github/workflows/build-mentolder-web.yml`
- `.github/workflows/build-rustdesk-installer.yml`
- `.github/workflows/build-sdlc-console.yml`
- `.github/workflows/build-transcriber.yml`
- `.github/workflows/build-videovault.yml`
- `.github/workflows/build-website.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/e2e-pr.yml`
- `.github/workflows/e2e.yml`
- `.github/workflows/factory-post-merge-e2e.yml`
- `.github/workflows/freshness-regen.yml`
- `.github/workflows/health-goals.yml`
- `.github/workflows/k1-embed.yml`
- `.github/workflows/mirror-to-gitlab.yml`
- `.github/workflows/opencode.yml`
- `.github/workflows/openspec-orphan-archive.yml`
- `.github/workflows/post-merge.yml`
- `.github/workflows/pr-auto-title.yml`
- `.github/workflows/quality-loop.yml`
- `.github/workflows/release-please.yml`
- `.github/workflows/render-fleet-artifact.yml`
- `.github/workflows/renovate.yml`
- `.github/workflows/sentinel.yml`
- `.gitignore`
- `.gitleaks.toml`
- `.lavish/kit/daemon/sources/epics.ts`
- `.lavish/kit/panel-epic-canvas.js`
- `.opencode/agent-models.jsonc`
- `assets/feature-intake/pm-form-template.html`
- `commitlint.config.cjs`
- `components/website/all_files.txt`
- `components/website/api-public-allowlist.json`

## Abschluss

```bash
bats tests/spec/os-retirement-code.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
