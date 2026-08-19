# p3 — Natives Guard-Plugin

**Rolle:** impl · **Ziel-Datei:** `tools/dsh/plugins/repo-guard.mjs` · **hängt ab von:** p2

Zweite Stufe der Guards. Die Bridge aus p2 beweist Verträglichkeit; dieses Plugin beweist den
Architekturgewinn: eine typisierte Ablehnung mit Begründung statt eines Exit-Codes.

- [ ] **3.1 Auf `tools/pre-execute` registrieren.** Das Ereignis ist ein Waterfall: Wer nicht
      entscheidet, MUSS `next()` aufrufen, sonst bleibt die Kette stehen. Registrierungspunkt und
      Signatur sind in `deepseek-harness/packages/core/tools/src/index.ts` (Zeile 152 laut
      `docs/event-producer-consumer.md`) belegt — vor dem Schreiben dort die tatsächliche Signatur
      nachlesen, nicht aus der Dokumentation ableiten.

- [ ] **3.2 Dieselbe Regel wie der Shell-Guard.** Die Prüfung spiegelt
      `scripts/hooks/worktree-write-guard.sh`: ein schreibender Werkzeugaufruf, dessen Zielpfad
      außerhalb des Sitzungs-Arbeitsverzeichnisses liegt, wird abgelehnt. Der Zielpfad wird
      aufgelöst, bevor er verglichen wird — ein relativer Pfad mit `..` darf die Prüfung nicht
      unterlaufen.

- [ ] **3.3 Ablehnung trägt einen Grund.** Die zurückgegebene Entscheidung nennt den beanstandeten
      Pfad und das Arbeitsverzeichnis. Das ist der Punkt, an dem sich das native Plugin vom
      Shell-Hook unterscheidet: Der Hook kann nur stderr füllen, das Plugin gibt eine strukturierte
      Ablehnung zurück, die die Oberfläche anzeigt.

- [ ] **3.4 Alles andere delegieren.** Für jeden nicht beanstandeten Aufruf `next()` aufrufen und
      keine eigene Entscheidung zurückgeben, damit nachgelagerte Listener und die Bridge weiterhin
      greifen.

- [ ] **3.5 Doppelprüfung sichtbar machen.** Bridge und Plugin prüfen dieselbe Regel. Im
      Modulkopf notieren, dass eine doppelte Ablehnung erwartet und unschädlich ist (die Kette
      faltet restriktivst), und dass ein Auseinanderlaufen beider Wege ein Befund ist, kein
      Rauschen.
