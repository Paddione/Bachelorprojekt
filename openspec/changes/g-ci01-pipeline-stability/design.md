## Context

Zwei post-merge Workflows scheitern nach jedem main-Push seit 27.06.2026:

1. `freshness-regen.yml`: Die Action `crazy-max/ghaction-import-gpg@d46b8ef5e...` ist nicht mehr auflösbar (SHA-Pinning-Regression). Das Setup scheitert vor dem ersten Job-Step.
2. `build-website.yml` → `website/Dockerfile`: Der Docker-Build kopiert `package-lock.json` (COPY website/package.json website/package-lock.json), die in T001224 als Teil des S5 Lockfile-Gates gelöscht wurde. Die Website nutzt ausschließlich pnpm (pnpm-lock.yaml), das Dockerfile wurde nicht mitmigriert.

## Goals / Non-Goals

**Goals:**
- `freshness-regen.yml` läuft durch ohne Setup-Fehler
- `build-website.yml` baut erfolgreich ein Docker-Image
- Beide Fixes durch BATS-Tests abgesichert (Regression Guards)
- OpenSpec SSOT (`ci-cd.md`) spiegelt die korrigierten Requirements

**Non-Goals:**
- Strukturelle Aufspaltung von `build-website.yml` (→ T001276)
- Systematisches Action-SHA-Monitoring (zukünftiges Ticket)
- Migration anderer Workflows auf pnpm

## Decisions

**Fix A: GPG-Action → Bot-Commit ohne Signing**

Der `crazy-max/ghaction-import-gpg`-Step wird entfernt. Bot-Commits in `freshness-regen.yml` laufen
ohne GPG-Signing. Die Push-Authentifizierung erfolgt via `secrets.GH_PAT` — kein Sicherheitsverlust.
Alternativoptionen (SHA-Update auf gültigen Tag, bash-basiertes GPG-Import) wurden verworfen:
- SHA-Update: erneutes Pinning-Risiko
- Bash-GPG: unnötige Komplexität für Bot-Commits ohne Verification-Anforderung

**Fix B: Dockerfile npm → pnpm@10**

Build-Stage Änderungen:
```
# Vorher:
COPY website/package.json website/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
RUN npm run build
RUN npm prune --omit=dev

# Nachher:
RUN npm install -g pnpm@10
COPY website/package.json website/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm prune --prod
```

pnpm@10 entspricht der Version in der CI (`pnpm/action-setup@v4.1.0 version: 10`). Der
Cache-Mount-Pfad wechselt von `/root/.npm` zu `/root/.local/share/pnpm/store` (pnpm-Store). 
Runtime-Stage bleibt unverändert.

**BATS-Tests (fail→pass-Prinzip):**
- G-CI01-A: freshness-regen.yml enthält keinen `ghaction-import-gpg`-Verweis
- G-CI01-B: Dockerfile COPY-Zeile referenziert `pnpm-lock.yaml`, nicht `package-lock.json`
- G-CI01-C: Dockerfile nutzt `pnpm install`, nicht `npm ci`
- G-CI01-D: `website/pnpm-lock.yaml` existiert; `website/package-lock.json` nicht

## Risks / Trade-offs

| Risiko | Mitigation |
|--------|-----------|
| pnpm@10 im Dockerfile weicht künftig von CI ab | BATS-Test G-CI01-C + geplantes Renovate-Tracking |
| Bot-Commits ohne GPG = kein "Verified"-Badge | Akzeptiert — Commits sind via PAT authenticated |
| T001276 ändert build-website.yml gleichzeitig | Keine gemeinsamen Dateien → kein Konflikt |
| pnpm prune --prod entfernt ggf. andere Deps als npm prune --omit=dev | Funktional äquivalent; runtime-Stage kopiert nur node_modules + dist |
