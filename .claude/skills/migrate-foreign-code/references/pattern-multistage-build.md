# Pattern: Multi-Stage-Build (Client + Server → ein Runtime-Port)

Wie eine Client+Server-App zu einem einzigen, schlanken Container-Image gebaut wird.

## Muster (generisch)

Ein **Multi-Stage-Build** trennt Bau und Laufzeit:

- **Client-Stage:** `vite build` → statische Assets nach `dist/public`.
- **Server-Stage:** `esbuild` bündelt den Server → `dist/index.js`.
- **Runtime-Stage:** ein schlankes Base-Image (`node:bookworm-slim`) startet den Express-Server,
  der die **SPA und die `/api`-Routen auf einem einzigen Port** serviert.

Ein Port für SPA + API erspart Ingress-Sonderfälle (kein getrenntes Routing für Frontend/Backend).
Native bzw. System-Abhängigkeiten werden in der Runtime-Stage per APT nachinstalliert, weil das
Slim-Image sie nicht mitbringt.

## VideoVault-Beispiel

Das Runtime-Image installiert `ffmpeg`/`ffprobe` via APT (für den serverseitigen Schnitt, siehe
[pattern-hybrid-backend](pattern-hybrid-backend.md)). Die Client-first-Architektur bleibt
unangetastet — FSAA und der WASM-Splitter laufen weiter im Browser; das server-resident ffmpeg ist
eine separate Fähigkeit.

## Stolpersteine

- **Native/System-Deps** (`ffmpeg`, `ffprobe`, …) fehlen im `*-slim`-Image und müssen explizit per
  APT in die Runtime-Stage — sonst schlägt die Funktion erst zur Laufzeit fehl.
- **Ein Port für SPA + API** bewusst wählen: vermeidet doppeltes Ingress-Routing und
  CORS-Sonderfälle gegenüber zwei getrennten Deployments.
