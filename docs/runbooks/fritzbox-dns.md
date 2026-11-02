# FritzBox 7590: DNS-/Freigaben-Befund (Stand 02.11.2026)

Zugang für diese Prüfung: FritzBox-Benutzer `claude-read` (schreibberechtigt).
Passwort steht **nicht** in dieser Datei (nur zur Laufzeit verwendet, danach
aus allen Temp-Dateien gelöscht).

## Festgestellte Konfiguration (nur gelesen, unverändert)

- Externe IPv4 (TR-064 `GetExternalIPAddress`): `10.42.255.28` — privater
  Bereich, d. h. Anschluss hinter CGNAT. Eingehendes IPv4 aus dem Internet
  ist damit nicht direkt möglich; `159.48.35.203` (öffentlich, aus dyndns)
  funktioniert nur per Hairpin aus dem Heimnetz.
- Externe IPv6 (`X_AVM_DE_GetExternalIPv6Address`): `2a04:6ec1:1:a::22a7/64`,
  gültig (Lifetime ~71 h). Das ist exakt die Adresse der öffentlichen
  AAAA-Records (`*.korczewski.de`, `*.devmesh.korczewski.de` zeigen dorthin).
  Es gibt **keine** IPv6-Freigabe auf devmesh — IPv6-bevorzugende Browser
  laufen gegen die FritzBox selbst ins Timeout. Das war die Ursache für
  `ERR_CONNECTION_TIMED_OUT` auf dem Auth-Link (nicht die FritzBox-DNS,
  nicht AdGuard auf dem Pi).
- Portfreigaben (TR-064, beide aktiv): `TCP 80 → 10.10.10.3:80`,
  `TCP 443 → 10.10.10.3:443` (Beschreibung HTTP(S)-Server). v4-Pfad ins
  devmesh-Traefik damit i. O. (per Hairpin verifiziert: 200 + frisches
  Let's-Encrypt-Zertifikat).
- DNS-Rebind-Schutz (`netSet`): Ausnahmen bereits vollständig gepflegt
  (u. a. `korczewski.de`, `auth/web/opencode/fritz/studio.korczewski.de`,
  `agent-board/auth/brain/dna/graph/llm/mail/massage/sessions/web`
  `.devmesh.korczewski.de`). Keine Änderung nötig — lokale 10.x-Antworten
  werden nicht verworfen.

## Geändert am 02.11.2026 (über Web-UI als `claude-read`)

- Internet → Zugangsdaten → DNS-Server: IPv4-Benutzer-DNS `1.1.1.1`/`9.9.9.9`
  ersetzt durch `10.10.10.3` (bevorzugt) + `10.10.10.4` (alternativ).
  IPv6 bleibt beim Provider. Verifiziert: `dig @10.0.0.1 auth.devmesh…`
  liefert `10.10.10.3`/`10.10.10.4`, kein AAAA mehr, Upstream intakt.
  (Technisch: `data.lua`, Seite `dnsSrv`; IPv4-Oktette als Einzelfelder
  `ipv4_user_firstdns0..3` senden, `apply=true`.)
- Damit lösen alle FritzBox-DNS-Clients devmesh-Namen direkt lokal auf
  (AdGuard-Workload, siehe `devmesh-lan-dns.md`).

## Offen / bewusst nicht angefasst

- Pi `10.0.0.2` (AdGuard, eigenes Passwort unbekannt) nutzt einen eigenen
  Upstream — Geräte mit statischem Pi-DNS bekommen weiterhin die öffentliche
  IPv4 per Hairpin plus den toten AAAA-Record. Abhilfe: Pi-Rewrite
  `*.devmesh.korczewski.de → 10.10.10.3` (braucht Pi-AdGuard-Passwort) oder
  Geräte-DNS auf `10.0.0.1`/`10.10.10.3` umstellen.
- DynDNS-Seite der FritzBox wurde lesend nicht erreicht (js3-Framework);
  ungeklärt, ob die FritzBox die AAAA-Records selbst per DynDNS pflegt
  (dann bitte IPv6-Update dort prüfen statt Records manuell zu löschen).
- DHCP (`Heimnetz → Netzwerk`) advertiert weiterhin die FritzBox selbst
  (`client_dns1/2 = 0.0.0.0`); keine Umstellung vorgenommen, weil der Pi
  bewusst als DNS eingetragen wurde.
