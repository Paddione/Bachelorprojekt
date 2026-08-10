# P1 — `enabled`-Feld für Loadouts

**Rolle:** impl · **Zieldateien:** `scripts/llm-proxy/loadouts.mjs`,
`scripts/llm-proxy/server.mjs` · **depends_on:** —

Ohne dieses Feld lässt sich ein Loadout nur **löschen**, nicht abschalten — `LOADOUT_KEYS`
(`loadouts.mjs:15-19`) ist fail-closed gegen unbekannte Felder. Genau deshalb bleiben dominierte
Loadouts jahrelang stehen: Löschen nimmt die gemessenen `notes` mit, und niemand wirft die
Begründung weg.

## Tasks

- [x] **`enabled` in `LOADOUT_KEYS` aufnehmen.** Ergänzt die Menge in `loadouts.mjs:15-19` um
      `'enabled'`, mit Kommentar, warum das Feld existiert (Abschalten ohne Löschen, T003204).

- [x] **Typprüfung in `validateLoadout`.** Ist `enabled` gesetzt und kein Boolean, scheitert
      `parseLoadouts` mit einer Meldung, die Loadout **und** Feld nennt. Ein Feld, das still
      einen Tippfehler schluckt (`"false"` als String wäre truthy), wäre schlimmer als keins —
      es meldete „abgeschaltet" und ließe das Loadout laufen.

- [x] **Default `true`.** Fehlt das Feld, gilt das Loadout als aktiv. Alle elf bestehenden
      Einträge tragen es nicht und dürfen sich nicht verhalten wie vorher — das ist die
      Rückwärtskompatibilität, an der die Änderung hängt.

- [x] **Hilfsfunktion `isLoadoutEnabled(loadout)`** in `loadouts.mjs` exportieren
      (`loadout.enabled !== false`). Eine Funktion statt verstreuter Vergleiche: die
      Default-Regel steht damit an genau einer Stelle, und die Tests prüfen sie dort.

- [x] **`startLoadout` lehnt deaktivierte Loadouts ab.** In `server.mjs` vor den bestehenden
      Prüfungen (`already_running`, `port_busy`, `exclusive_conflict`) eine weitere ergänzen:
      ist das Loadout deaktiviert, `LoadoutStartError` mit eigenem Code `disabled` und einer
      Meldung, die den Slug nennt.

      **Die Reihenfolge ist Absicht:** `disabled` steht vor `already_running`. Ein deaktiviertes
      Loadout, das noch läuft (weil es vor der Abschaltung gestartet wurde), soll als
      *deaktiviert* gemeldet werden und nicht als *läuft bereits* — sonst liest sich die Antwort
      wie ein Erfolg.

      Eigener Code statt Wiederverwendung von `not_found`: „gibt es nicht" und „ist abgeschaltet"
      führen zu verschiedenen Diagnosen. Wer `not_found` sieht, sucht einen Tippfehler.

- [x] **Auto-Start-Pfad ausschließen.** `planAutoStart` in `loadouts.mjs` darf ein deaktiviertes
      Loadout nicht mehr auswählen. Ohne diesen Schritt bliebe die Abschaltung halb: der
      explizite Start wäre gesperrt, der implizite liefe weiter — und der ist der häufigere Weg.

- [x] **`/admin/loadouts/status` markiert den Zustand.** Die Statusantwort führt `enabled` mit,
      damit die Web-UI ein deaktiviertes Loadout als solches zeigen kann statt es als „gestoppt"
      auszugeben. Gestoppt und abgeschaltet sehen sonst gleich aus, obwohl nur eines davon durch
      einen Klick behebbar ist.

- [x] **Zeilenzuwachs prüfen.** `wc -l scripts/llm-proxy/server.mjs` — Budget sind 183 Zeilen bis
      zur S1-Grenze. Reizt die Ablehnungsbedingung das aus, gehört die Prüfung nach
      `loadouts.mjs` (Budget 518) statt in den Server.
