# Grilling: Brett Admin Panel — Antworten

## Runde 2 — Scope & Grenzen

### 2.1 — Brett oder Arena (oder beides)?

**Auswahl:** Brett (3D Systembrett mit Mayhem-Mode, Räume, Bots)

### 2.2 — Welche Aktionen soll das Admin-Panel im ersten Wurf können?

**Auswahl:**
- [x] Mode wechseln (mayhem / lms / duel / deathmatch / coaching)
- [x] Bots/AI-Gegner spawnen + despawnen
- [ ] Spieler kicken
- [x] Runde zurücksetzen / Spawn-Reset
- [ ] Broadcast-Nachricht an alle im Raum
- [x] Mayhem ein/aus toggeln (über reinen Mode-Switch hinaus)
- [ ] Spieler-Limit / Max-Player setzen
- [ ] Time-Limit / Score-Limit für die Runde
- [ ] Karten-Layout / Spawn-Punkte setzen
- [x] Spieler einladen (Link/Code teilen, User-Suche)
- [x] Session/Lobby explizit erstellen (Pre-Game-Setup)

**Kommentar:** Session/Lobby explizit erstellen (Pre-Game-Setup)   die Lobby sollte parallel mit einem ausblendbaren overlay gezigt werden sodass man trotzdem im warmup Fähigkeiten und so nutzen kann, bevor es losgeht.

### 2.3 — Wo sitzt das Admin-Panel im UI?

**Auswahl:** A — Floating Overlay im Spiel (Sidebar, einklappbar zu Icon)

### 2.4 — Was bleibt explizit DRAUSSEN?

**Auswahl:**
- [x] Coaching-Mode auf Mentolder anfassen (bleibt as-is)
- [x] Mehrere gleichzeitige Admins pro Session
- [x] Granulare Rollen (Moderator < Admin < SuperAdmin)
- [x] Replay / Recording von Sessions
- [x] Spectator-Mode (Zuschauer ohne Interaktion)
- [ ] Admin-Panel auch auf mentolder.de verfügbar
- [x] Audit-Log aller Admin-Aktionen (DSGVO/Nachvollziehbarkeit)
- [x] Auto-Host-Handoff wenn Admin Session verlässt

**Kommentar:** Mehrere gleichzeitige Admins pro Session. Zwei Admins sollten miteinander spielen können. Der Admin der zuerst da ist hat die Kontrolle über die Adminoberfläche kann diese aber über eine schaltfläche übertragen

## Runde 3 — Erfolg & Abnahme

### 3.1 — Woran erkennst du, dass das Feature fertig & erfolgreich ist?

- [x ] paddione kann sich einloggen, sieht 'Admin'-Badge neben Username
- [x] paddione kann von der Lobby aus 'Mayhem-Session erstellen' klicken, landet im Setup-Screen
- [ x] paddione kann 3 Bots hinzufügen, Mode auf 'Ims' setzen, Spiel starten
- [ x] Ein 2. Spieler kann die Session über Link/Code joinen

### 3.2 — Welche Edge Cases / Fehler-Szenarien MÜSSEN gehandled sein?

- Admin verlässt Session mitten im Spiel - wer übernimmt? (oder Session endet?)
Session ohne admin ist zu handlen wie stale 2 minuten removal
- Zweiter Admin joint - was passiert in UI (du sagtest: edge-case, aber wie genau? Lock? Read-only? Co-
Admin?) erster admin behält kontrolle bis er sie freiwillig abgibt
- WS-Connection zum Server bricht - wie reconnected sich der Admin? Behält Admin-Status?  
Während warmup kann man jederzeit connecten während einer aktiven runde nicht.

### 3.3 — Welche NFRs gelten?

**Auswahl:**
- [x] Mobile-Responsive (Admin-Panel auf Phone bedienbar)
- [ ] Desktop-only akzeptabel (Admin = Coach mit Laptop)
- [ ] DSGVO-konform — keine personenbezogenen Daten in Logs/Telemetrie
- [x] Performance — Admin-Aktionen <200ms RTT spürbar
- [x] Accessibility — Keyboard-navigable, ARIA, Color-Contrast WCAG AA
- [ ] i18n — DE/EN parallel
- [x] Dark/Light-Mode (matched mit Brett-Theme)
- [x] Auf dev.korczewski.de in <5min iterierbar (dev-flow-iterate-kompatibel)

## Runde 4 — Assets, Referenzen & Freitext

### 4.1 — Gibt es Mockups, Screenshots, Konkurrenz-Beispiele, Sketches?

_(nichts angegeben)_

### 4.2 — Sonst noch was, was du loswerden willst, bevor wir ins Brainstorming gehen?

_(nichts angegeben)_