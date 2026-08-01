# Proposal: cockpit-auth-schnitt

_Ticket: T002463 (K4) · betrifft zusätzlich T002465 (K6) · Epic: T002458_
_Bindend: `docs/superpowers/specs/2026-07-28-sdlc-cockpit-design.md`, E1, E5, E17, E21_

## Why

K4 und K6 trugen beide eine ungelöste Auth-Frage, die ihre Umsetzung blockierte
und deren Definition-of-Readiness-Flag (`offene_fragen_geklaert`) damit zu
optimistisch stand.

**K4** soll die Schreibaktionen aus E5 scharfschalten. Der Daemon verlangt dafür
einen lokalen Token (E17) — aber wie der Browser an diesen Token kommt, stand
nirgends. T002505 hat den einzigen Weg dorthin geschlossen: der Token-Endpunkt
gab ihn unauthentifiziert per HTTP heraus, und die CORS-Konfiguration erlaubt
Origin `null`, den ein sandboxed iframe jeder fremden Seite sendet. Der Token
liegt seither nur noch in `/tmp/cockpit-daemon.token` mit 0600, die beiden
Write-Endpunkte sind Stubs.

**K6** soll den Kontext-Slot der Panels mit Brain-Wiki-Verweisen füllen. Brain
hängt hinter `oauth2-proxy` und hat kein eigenes OIDC. Das Ticket nennt selbst
zwei Wege — Session-Cookie **oder** eigener Pocket-ID-Client — ohne Entscheidung.

## What

Die beiden Fragen sind **nicht dieselbe Frage**: K4 ist Browser → lokaler Daemon
(schreibend), K6 ist Cluster-Dienst → Cluster-Dienst (lesend). Sie teilen nur
das Wort. Beide lösen sich jedoch durch dieselbe Einsicht auf, und es ist keine
Auth-Antwort: **die Arbeit wandert dorthin, wo die Auth schon ist.**

Zwei Umstände tragen das:

1. **Die Admin-Seite ist bereits authentifiziert.**
   `website/src/pages/admin/cockpit.astro` prüft `getSession()` und `isAdmin()`
   und leitet sonst auf `/login`. Schreibende Admin-APIs existieren dort längst;
   `admin/cockpit/feature-action.ts` ist das gelebte Muster.

2. **Die Schreibaktionen aus E5 zerfallen in zwei Klassen.**

   | Klasse | Aktionen | Ausführbar wo |
   |---|---|---|
   | **A** | Ticket-Status setzen, PR mergen | Cluster — DB und GitHub-API |
   | **B** | Agent-Session killen, Worktree entfernen, Lock brechen, Terminal | **nur lokal** |

   Klasse B ist nicht schwer, sondern **prinzipiell unmöglich vom Cluster aus**:
   es gibt keinen Netzwerkweg von der Website zu einem Entwicklerrechner.
   Agent-Locks liegen im `git-common-dir` des lokalen Checkouts, Worktrees im
   lokalen Dateisystem, Agent-Prozesse in der lokalen Prozesstabelle.

Daraus folgt:

- **K4 baut Klasse A** als Website-API nach dem vorhandenen Muster. Es entsteht
  **kein neuer Auth-Mechanismus**. Bestätigungsabstufung (D5/D6), Audit-Log und
  der Aktions-Slot mit vier Zuständen (D4) bleiben vollständig erhalten — sie
  sind unabhängig davon, wer die Aktion ausführt.
- **Klasse B wird zurückgestellt.** Sie braucht die Browser→Daemon-Strecke, die
  zusätzlich an Chromes *Private Network Access* hängt: eine HTTPS-Seite, die
  `http://127.0.0.1` anspricht, löst einen eigenen Preflight aus, unabhängig von
  jeder Auth. Eigenes Kind, wenn der Bedarf real wird — nicht auf Verdacht.
- **K6 liest Brain intern** über `brain.workspace.svc.cluster.local`. Das ist
  kein Umgehen des Schutzes, sondern das übliche Muster: Auth am Edge für
  Browser, direkte Service-zu-Service-Kommunikation intern — vorausgesetzt der
  Endpunkt setzt `isAdmin` durch, wie jede andere Admin-API.

## Folgen

- Der Daemon bleibt **lesend und lokal**, für das, was nur lokal geht:
  Agent-Locks, opencode-DB, lokale Modell-Gesundheit.
- Die zwei Write-Stubs im Daemon werden gegenstandslos. Ob sie entfernt oder für
  Klasse B reserviert bleiben, entscheidet die K4-Umsetzung.
- Der offene Rest aus K7 bekommt eine Antwort: `const BASE = 'http://127.0.0.1:49152'`
  im Adapter zeigt im Admin-Kontext auf die **Website selbst**.

## Vor der Umsetzung zu klären

Der interne Weg zu Brain ist **heute nicht durchgängig**. Die Egress-Policy
erlaubt ihn (`allow-egress-to-workspace` im Namespace `website`, ohne
Port-Filter), aber der Verbindungsversuch aus dem Website-Pod scheitert: Port 80
meldet „connection refused", Port 8787 läuft in einen Timeout. Der Brain-Pod
läuft (1/1, seit 9 Tagen), das Service-Mapping ist `80 → 8787`. Die Ursache ist
cluster-seitig zu klären, bevor K6 dispatched wird — Umsetzungsarbeit, kein
Entwurfsproblem.
