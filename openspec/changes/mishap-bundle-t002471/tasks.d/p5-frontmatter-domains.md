# Partial p5 — vda.sh frontmatter domain detection

**Ticket:** T002471
**Rolle:** `vda-fix`
**Ziel-Dateien:** `scripts/vda.sh`
**Mishap:** M10 (frontmatter leitet falsche domains ab)

## Mishap 10

`bash scripts/vda.sh frontmatter <file>` schreibt `domains: [website, db, test]` basierend auf
Textvorkommen im Fliesstext statt auf den tatsächlich betroffenen Pfaden.

## Fix

In `scripts/vda.sh`, die `frontmatter`-Subkommando-Logik so ändern, dass die domain-Ableitung
primär aus dem `## File Structure`-Block (oder expliziten Pfad-Angaben) im Dokument erfolgt,
nicht aus zufälligen Wortvorkommen.

```bash
# === T002471-M10: Domain-Ableitung aus Pfaden ===
# Statt Wortvorkommen: extrahiere domains aus Dateipfaden im Dokument
# Fallback auf alte Logik wenn keine Pfade gefunden
# === Ende T002471-M10 ===
```

_Genaue Implementierung erfordert Einblick in die frontmatter-Logik von vda.sh._
