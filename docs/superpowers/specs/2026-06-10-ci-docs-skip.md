# Spec: CI Auto-Skip bei Docs-only-Changes (Erweiterung)

**Ticket:** eea90c15  
**Branch:** feature/eea90c15-ci-docs-skip  
**Datum:** 2026-06-10  
**Status:** approved

---

## Problem

`ci.yml` hat bereits `paths-ignore` fur `docs/**` und `*.md`, aber nested `CLAUDE.md`-Dateien (z.B. `website/CLAUDE.md`) werden nicht abgedeckt. Ein PR der ausschlielich `website/CLAUDE.md` andert, triggert trotzdem die volle CI-Pipeline — unnote ~10 Minuten Wartezeit.

---

## Losung

Erweiterung der bestehenden `paths-ignore`-Liste in `ci.yml` um `**/CLAUDE.md`. GitHub Actions unterstutzt `**`-Glob patterns in `paths-ignore`, wodurch CLAUDE.md-Dateien in beliebiger Tiefe matched werden.

---

## Scope

### In Scope
- `**/CLAUDE.md` zur `paths-ignore`-Liste in beiden Triggern (`pull_request` + `push`) in `.github/workflows/ci.yml` hinzufugen

### Out of Scope
- Andere Workflows (build-website, build-brett, e2e-pr) — haben bereits eigene `paths`-Filter und sind nicht betroffen
- Aenderung an `paths`-Filtern anderer Workflows
- Granulares per-Job-Skipping

---

## Aktuelle Konfiguration (ci.yml Zeilen 6-8, 17-19)

```yaml
paths-ignore:
  - 'docs/**'
  - '*.md'
```

## Ziel-Konfiguration

```yaml
paths-ignore:
  - 'docs/**'
  - '*.md'
  - '**/CLAUDE.md'
```

---

## Warum diese Pattern-Kombination

| Pattern | Matcht | Beispiel |
|---------|--------|----------|
| `*.md` | Root-level Markdown | `AGENTS.md`, `CONTRIBUTING.md`, `README.md` |
| `docs/**` | Alles unter docs/ | `docs/superpowers/specs/*.md`, `docs/agent-guide/` |
| `**/CLAUDE.md` | CLAUDE.md in beliebiger Tiefe | `CLAUDE.md`, `website/CLAUDE.md` |

`AGENTS.md` und `CONTRIBUTING.md` sind Root-level und werden bereits von `*.md` erfasst. Die explizite Nennung im Gap bestatigt den Scope, erfordert aber keine zusatzlichen Pattern.

---

## Grenzfaelle

| Szenario | Verhalten | Korrekt? |
|----------|-----------|----------|
| Nur `docs/my-doc.md` geandert | CI skipped | Ja |
| Nur `README.md` geandert | CI skipped | Ja |
| Nur `website/CLAUDE.md` geandert | CI skipped | Ja (neu) |
| Nur `AGENTS.md` geandert | CI skipped | Ja |
| `docs/` + `website/src/` geandert | CI laeuft | Ja |
| Nur `.github/workflows/ci.yml` geandert | CI laeuft | Ja |
| `brett/src/foo.ts` + `CLAUDE.md` geandert | CI laeuft | Ja |

---

## Risiken

**Keins.** Reine CI-Konfigurationsaenderung, kein Produktionscode beruehrt. Rollback = Revert der einen Zeile.
