# Proposal: coaching-studio-restore-or-remove

## Why

Das Coaching-Studio (`/admin/coaching/studio`) war eine React-App, die zur Laufzeit
React 18 + ReactDOM + @babel/standalone vom CDN (unpkg) lud und 5 .jsx-Dateien im
Browser transpilierte. Die Quelldateien unter `public/coaching-studio/` waren von
Anfang an **korrupt** — `screens_core.jsx` enthielt einen durchgesickerten
Heredoc-Terminator (`EOF && echo "…"`), der die gesamte Datei zu ungültigem JS machte.
Babel hätte sie mit `SyntaxError` abgelehnt, weshalb `window.Dashboard` /
`window.Kundenakte` / `window.ProfileEditor` nie definiert wurden und der Default-Screen
<Dashboard> abstürzte. **Das Feature lief nie in Produktion.**

In T001784 wurde der CDN/Babel-Leak (DSGVO-Verstoß: Admin-IP an unpkg, React-Dev-Builds
+ ~1 MB Babel in Prod) entfernt und die Seite durch einen ehrlichen „nicht verfügbar"-
Platzhalter ersetzt. Die korrupten .jsx- und app.css-Assets wurden gelöscht.

## Entscheidung: Feature entfernen (Option B)

### Begründung

| Kriterium | Entfernen | Wiederherstellen |
|-----------|-----------|------------------|
| Saubere Quelle vorhanden? | — | **Nein.** Repo-Dateien korrupt, kein externes Design-Bundle dokumentiert |
| Feature jemals funktional? | — | **Nein.** JSX-SyntaxError verhinderte jegliche Ausführung |
| Aufwand | ~1h (5 Dateien löschen, 4 Referenzen anpassen) | ≥ 2–3 Tage (neues Design, Implementierung, Tests) |
| Nutzen | Toter Code entfernt, klare Navigation | Feature müsste komplett neu designed und gebaut werden |
| Risiko | Gering — nur Löschung + Redirect | Hoch — unverifizierbare Logik per Inferenz rekonstruieren |

**Empfehlung: Option B — Feature entfernen.** Die Sessions-Liste
(`/admin/coaching/sessions`) bleibt unberührt. Wird das Feature später gebraucht,
kann es als neues Ticket mit sauberem Design-Brief gestartet werden.

## Was

1. **Route löschen:** `studio.astro` + `studio.regression.test.ts` entfernen.
2. **Sidebar-Nav:** „Sessions"-Link von `/admin/coaching/studio` auf
   `/admin/coaching/sessions` umleiten (Label beibehalten).
3. **Sessions-Tab:** Tab-Link „Sessions" (der auf Studio zeigt) in `sessions/index.astro`
   entfernen — die Sessions-Liste ist die einzige Registerkarte.
4. **Content-DB-Merge:** `detailHref` für Questionnaire-Einträge von
   `/admin/coaching/studio` auf `/admin/coaching/sessions` umleiten.
5. **Regression-Test:** `content-db-merge.test.ts` an neues `detailHref` anpassen.
6. **Route-Manifest:** Wird durch `task freshness:regenerate` automatisch aktualisiert.

_Nicht betroffen:_ `/admin/coaching/sessions/*`, `/admin/coaching/projekte/*`,
`/admin/coaching/settings.astro`, alle API-Endpunkte unter
`/api/admin/coaching/*`.

_Ticket: T001792_
