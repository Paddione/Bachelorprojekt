# p5 — Factory-Executor

**Rolle:** impl · **Ziel-Dateien:** `scripts/factory/dsh-exec.sh`,
`scripts/factory/dispatcher-bridge.sh` (Budget 609 Zeilen) · **hängt ab von:** p2

Vorlage ist `scripts/factory/opencode-exec.sh` — sie wird gelesen und in ihrer Struktur
übernommen, nicht neu erfunden.

- [ ] **5.1 Dispatcher-Zweig.** In `scripts/factory/dispatcher-bridge.sh` den Executor-Block
      (Zeile 165 ff.) um `dsh` erweitern:

```bash
executor="${FACTORY_EXECUTOR:-claude}"
case "$executor" in
  claude|opencode|dsh) ;;
  *) echo "dispatcher-bridge: unknown FACTORY_EXECUTOR='$executor' — falling back to claude" >&2
     executor=claude ;;
esac
```

      Das `[pipeline:${ext_id}] `-Präfix und das nachgestellte `&` bleiben unverändert, damit das
      äußere `wait` den Lauf weiterhin einsammelt.

- [ ] **5.2 Binary und Build getrennt prüfen.** Der Harness-Klon ist gitignoriert und in einem
      frischen Checkout ungebaut. Fehlender Klon und ungebauter Klon bekommen je eine eigene
      Meldung, beide enden mit **Exit 2** — bewusst nicht 127, damit im Journal die Ursache
      ablesbar bleibt (Konvention aus T003275). Der Pfad zum Klon wird über eine Umgebungsvariable
      überschreibbar gemacht, weil der Factory-Lauf als systemd-User-Dienst einen anderen `PATH`
      hat als eine interaktive Sitzung.

- [ ] **5.3 Exit-Codes je Ursache.** `0` Erfolg mit Commit · `2` Klon fehlt oder ungebaut ·
      `6` lief, hinterließ aber weder Commit noch Änderung · `7` ohne Branch oder Plan abgelehnt,
      nicht gestartet · `8` für dieses Ticket läuft bereits ein dsh-Prozess.

- [ ] **5.4 Zweite Verteidigungslinie gegen planlose Läufe.** Der `LAUNCH_DIR`-Rückfall auf den
      geteilten Haupt-Checkout hat am 2026-08-11 den Branch einer fremden Sitzung umbenannt
      (T003773). Der Guard aus `opencode-exec.sh` wird mit übernommen: ohne Branch und Plan wird
      der Lauf mit Exit 7 abgelehnt, bevor ein Prozess startet. Der Literalwert `null` kommt als
      Zeichenkette an und wird als fehlend behandelt.

- [ ] **5.5 Kein Rückfall auf einen anderen Executor.** Schlägt der Lauf fehl, wird ein
      `blocked`-Phasenereignis geschrieben und abgebrochen. Beobachtbarkeit vor Bequemlichkeit —
      dieselbe Entscheidung wie im opencode-Pfad.

- [ ] **5.6 Phasen-Ereignisse.** `implement`-Ereignisse (`entered`, `done`, `blocked`) mit
      strukturiertem `detail` schreiben, `executor` = `dsh`.
