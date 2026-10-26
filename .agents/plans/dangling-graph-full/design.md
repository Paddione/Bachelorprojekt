# Design: Dangling-Graph-vollständig

## Markierung (v1-Klassen bleiben, Stil ergänzt)

| Klasse | Darstellung |
|---|---|
| Beinahe-Treffer (Embedding, v1) | rot, gestrichelt mit Score |
| Umbenennung (git-Historie belegt) | blau, gepunktet mit Commit-Referenz |
| Waise Anbieter | orange, eigener Cluster |
| Waise Verbraucher | rot und fett |
| Laufzeit-belegt (404-/Proxy-Log) | roter Ring um den Knoten |
| Scope-Env (kein HTTP) | violett, eigener Cluster |

## Ablauf je Partial

1. p1 auditiert die HANDLES-Lücke: alle `src/pages/api/**/*.ts` gegen die
   Route-Knoten halten, jeder Treffer ohne Kante ist ein Indexer-Beleg.
2. p2 löst von jedem Aufrufer aus auf: normalisiertes Ziel, exakter Treffer,
   sonst Belegpfad bis zur Lücke (Ziel, Normalisierungsschritte, Anbieter-Rest).
3. p3 korreliert: `git log --follow` für umbenannte Routenpaare, 404- und
   Proxy-Log-Zeilen als Laufzeit-Beleg an Knoten hängen.
4. p4 inventarisiert EnvVars (1.124 Knoten als Startpunkt), MCP-Tools und
   Taskfile-Tasks nach demselben Muster exakt plus Near-Miss und trägt alles
   in denselben HTML-Graphen ein.

## Entscheidungen

- Standalone-Skripte ohne Laufzeit-Abhängigkeit zu v1-Artefakten: kein
  Cross-Branch-Input, beide Branches laufen kollisionsfrei.
- Embedding-Rechenarbeit erst nach Historie und vorhandene Kanten:
  Raten ist die letzte Stufe, nicht die erste.
- Alle Skripte klein (≈200 Zeilen) mit Reserve unter dem Limit, reine Module
  ohne Rück-Import (S2), keine Brand-Domain-Literale (S3).
