# Asset-Lizenzierung — getrennt von Code

**Ticket:** T901032
**Policy:** `docs/legal/reuse-policy.md` (RP-1, RP-5, RP-6)

## Grundsatz

Asset-Lizenzierung ist getrennt von Code-Lizenzierung. Das
Top-Level-`LICENSE` im Repo-Root deckt Assets nicht automatisch ab:
Fonts, Bilder, Fotos, Marken und generierte Outputs behalten ihre
eigene Lizenz (RP-5). Wer ein Asset übernimmt, prüft dessen Rechte
unabhängig vom Code-Kontext (RP-1).

## Pro-Asset-Dokumentation

Jedes Asset dokumentiert vier Angaben:

1. **Quelle** — woher stammt das Material (Upstream-URL, Autor, Datum).
2. **Inhaber** — wer hält die Rechte.
3. **Lizenz** — SPDX-ID oder Lizenzname plus Lizenztext-Ablage.
4. **Permissions** — was ist erlaubt (nutzen, ändern, weitergeben,
   kommerziell verwenden) und unter welchen Bedingungen.

Fehlt eine Angabe, gilt das Asset als ungeklärt und fällt unter den
Quarantäne-Prozess unten.

## Kategorien

- **Fonts** — Schriftlizenzen (z. B. SIL OFL) erlauben oft Embedding,
  aber nicht jede Weitergabe; Lizenztext beilegen.
- **Bilder und Fotos** — Stock- und Community-Lizenzen variieren stark;
  Quelle und Permissions exakt festhalten.
- **Marken** — Logos und Namen Dritter sind kein Code und nie implizit
  freigegeben; Nutzung nur mit dokumentierter Erlaubnis.
- **Generierte Outputs** — Modell-Outputs erben keine Generallizenz;
  Trainings- und Nutzungsbedingungen des Generators prüfen.

## Quarantäne-Prozess

Material mit ungeklärten Rechten wird nicht publiziert:

1. Ablage in einem als Quarantäne markierten Bereich, getrennt von
   freigegebenem Material.
2. Klärung von Quelle, Inhaber, Lizenz und Permissions dokumentieren.
3. Freigabe erst nach vollständiger Dokumentation; bis dahin bleibt das
   Material unveröffentlicht und außerhalb jedes Release-Artefakts.

## Design-Repo

Das Design-Repo startet privat (RP-6). Sein Code darf MIT sein; jedes
Asset darin folgt dieser Datei: dokumentierte Quelle, Inhaber, Lizenz
und Permissions, Quarantäne für alles Ungeklärte.
