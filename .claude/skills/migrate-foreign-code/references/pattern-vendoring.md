# Pattern: In-Repo-Vendoring

Wie eine externe App in den Monorepo geholt wird, ohne sie als Fremd-Dependency zu konsumieren.

## Muster (generisch)

Statt die migrierte App als externes Paket/Submodul einzubinden, wird ihr Quellcode **in-repo
vendored** und nach dem etablierten Repo-Idiom gebaut: ein **in-repo `Dockerfile`** + ein
**CI-Workflow**, genau wie die bestehenden vendored Dienste (`website/`, `brett/`). Die vendored
Quelle ist Teil des Monorepos und wird bei jedem Build neu gebaut — keine Abhängigkeit von einer
externen Registry oder einem Upstream-Tag.

Vorteil: ein einziger Build-/Deploy-Pfad für alles, keine Versions-Drift zwischen „unserem" Stand
und dem Upstream, und die Migration kann den Code schrittweise an die Plattform-Konventionen
angleichen (siehe [pattern-multistage-build](pattern-multistage-build.md),
[pattern-source-only-package](pattern-source-only-package.md)).

## VideoVault-Beispiel

`packages/videovault-player` (geteiltes Player-Package) und der VideoVault-Service wurden als
in-repo Quelle vendored. Der CI-Build baut dasselbe Image neu; bei Phase 2c wurden lediglich die
Quellen re-vendored, und CI baute das Image ohne neue Infrastruktur neu.

## Stolpersteine

- **`git add -f`** für Dateien, die in einem `.gitignore`-geschützten Verzeichnis liegen — sonst
  landen vendored Build-Assets stillschweigend nicht im Commit.
- **Niemals `node_modules` committen.** Das ist während der VideoVault-Migration **zweimal**
  passiert. Korrektur: `git rm -r --cached <dir>` + `git commit --amend`.
- **`npm install`-Peer-Dep-Konflikte** (z.B. Canvas/jsdom): `--legacy-peer-deps` nötig.
