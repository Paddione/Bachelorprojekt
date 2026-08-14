# p4 — CLI, Rendering und Fallback-Kette

**Rolle:** impl · **Dateien:** `scripts/context-retrieve.mjs` · **Hängt ab von:** p2, p3

Verdrahtet p2 und p3 und ist der einzige Ort mit Ein- und Ausgabe. Neue Datei, `.mjs`-Limit
800 Zeilen, veranschlagt rund 300.

## Schnittstelle

```
--task-prompt <text>|-   Aufgabentext als Query-Quelle; '-' liest stdin
--role <rolle>           harter Metadaten-Filter; Allowlist identisch zu toolset-context.sh
--budget <tokens>        Obergrenze des Retrieval-Anteils (Vorgabe 4000)
--corpora <a,b,c>        Korpus-Whitelist; Default: alle für die Rolle freigegebenen
--json                   Diagnose statt Block: Scores, Kandidatenzahl, Token-Bilanz, mode,
                         Anzahl der Backend-Aufrufe — Messgrundlage für p6
```

## Ablauf

Pinned-Set laden → Query embedden → Kandidaten ziehen → reranken → Budget füllen → rendern.

## Herkunfts-Marker

Erste Zeile jedes Blocks:

```
<!-- context-retrieve mode=<mode> corpora=<liste> candidates=<n> selected=<n> budget=<used>/<total> pinned=<n> -->
```

Ist `mode` **nicht** `retrieval`, folgt im Blockkörper ein Klartextsatz, der die
Unvollständigkeit benennt und ausdrücklich davor warnt, aus fehlenden Informationen auf deren
Nichtexistenz zu schliessen. Der Satz steht im **Fliesstext**, nicht im HTML-Kommentar — ein
Kommentar wird zu leicht überlesen.

## Fallback-Kette

| Situation | Verhalten |
| --- | --- |
| Embedding- oder Datenbankfehler | `mode=rulefilter`, Delegation an die heutigen `*-context.sh`, hart am Budget gekappt |
| Rerank-Ausfall | `mode=retrieval degraded=rerank` |
| Budget < Pinned-Set | `mode=truncated`, Pinned-Set vollständig |
| Null Kandidaten | Block mit Header und Klartextsatz, **niemals** ein Leerstring |

Der Exit-Code bleibt in **allen** Fällen 0. Ein Exit ≠ 0 würde bei einem Backend-Ausfall jeden
Agent-Dispatch im Repo lahmlegen.

## Timeout-Bemessung ⚠

Der Timeout wird aus der **aktuell gemessenen** Latenz plus Reserve abgeleitet, nicht aus einem
historischen Wert. Vor T002661 lag die Embedding-Latenz bei 10,7 s, heute bei 0,25 s. Ein
grosszügig für die alten Werte bemessener Timeout liesse einen echten Ausfall minutenlang als
Hänger erscheinen statt als Fallback; ein zu knapper macht den Fallback zum unbemerkten
Dauerzustand. Die Prüfung erfolgt ausschliesslich über eine **tatsächliche Antwort** des
Endpunkts — nie über Prozess- oder systemd-Unit-Zustand (bei der Planung meldete `systemctl`
alle bge-Units `active`, während der Dienst unbrauchbar war).
