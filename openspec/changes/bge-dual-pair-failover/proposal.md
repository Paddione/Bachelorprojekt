# Proposal: bge-dual-pair-failover

## Why

T002110 hat die Embedding- und Rerank-Schicht aus dem TEI-Docker-Zustand geholt und auf zwei
persistente `llama-server`-Instanzen mit GPU-Offload gestellt (`:8095` Embedding, `:8096`
Reranking). Das war der richtige Schritt — aber er hat drei Eigenschaften hinterlassen, die im
Betrieb stören:

- **Genau ein Pfad, keine Redundanz.** Stirbt einer der beiden Prozesse, ist die betroffene
  Funktion vollständig weg. Beim Reranker war das schon einmal der Fall und blieb wochenlang
  unbemerkt, weil `rerank.ts` still auf `score: 0` zurückfiel.
- **Batch-Last und interaktive Last teilen sich dieselben Server.** Ein Reindex über die
  Shared-DB konkurriert mit jeder Agenten-Anfrage um dieselben Slots.
- **Kein Vorrang gegenüber den Chat-Modellen.** Die bge-Server belegen VRAM unabhängig davon, ob
  Gemma, gpt-oss oder Devstral ihn dringender brauchen.

Hinzu kommt eine Lücke, die erst die Recon für diesen Change sichtbar gemacht hat: Agenten können
Embedding und Reranking heute **nur als roher HTTP-Endpunkt** erreichen. Jeder Konsument muss
Modellname, Vektordimension und Distanzmaß selbst kennen und selbst richtig anwenden.

## What

Zwei bge-Paare mit klarer Rollenteilung, einer gemeinsamen Zugriffsschicht und gegenseitiger
Absicherung.

**Paar A — Batch/Reindex, CPU.** Ein zweites Embed+Rerank-Paar, permanent mit `-ngl 0` im
CPU-RAM. Seine Hauptlast ist das Nach-Embedden von Änderungen in der Shared-DB und weiterer
Produktions-Ressourcen. Es belegt bewusst kein VRAM.

**Paar B — interaktiv, GPU.** Das bestehende Paar `:8095`/`:8096`, gestartet mit `--fit`. Es
bedient Agenten zur Laufzeit. Der geforderte Nachrang gegenüber den Chat-Modellen entsteht dabei
**zur Startzeit**: `--fit` bemisst sich am dann freien VRAM, ein zuerst gestartetes Gemma nimmt
also den Platz weg, den Paar B danach nicht mehr beansprucht.

**Zugriffsschicht.** `llama-server` kann sich **nicht selbst als MCP-Server exponieren** —
`--mcp-servers-config` (gesetzt in `scripts/llm-proxy/runner.mjs:45`) ist llama.cpps
MCP-*Client*-Flag, über das das Modell fremde Tools aufruft. Für „Embedding und Reranking als
MCP-Ressource" braucht es daher einen eigenen MCP-Shim. Dieser Shim ist zugleich die
Indirektionsschicht für das Failover: ohne ihn müsste jeder Agent die Ausweichlogik selbst
kennen, mit ihm steht sie an genau einer Stelle. Die HTTP-API bekommt dieselbe Indirektion.

**API von Paar A — zweiteilig.** Ein *Retrieval-Endpunkt* nimmt eine Query entgegen und liefert
die top-k gerankten Treffer aus dem pgvector-Bestand; Embedding und Rerank bleiben serverseitig,
sodass Konsumenten Modell, Dimension und Distanzmaß nicht kennen müssen. Dazu ein
*Änderungs-Feed*, der meldet, welche Ressourcen seit wann neu embedded wurden, damit Agenten ihre
Caches invalidieren können.

**Failover — bidirektional.** Ausgelöst bei hartem Ausfall (Health-Check rot) **und** bei
Überlast (Queue voll bzw. Latenzschwelle gerissen). Die Überlast-Bedingung trägt den eigentlichen
Wert: sie verhindert, dass ein laufender Reindex interaktive Agenten blockiert, und sie ersetzt
den dynamischen VRAM-Offload. Wird Paar B vom VRAM verdrängt oder überlastet, *ist* Paar A
bereits die CPU-RAM-Instanz, die übernimmt — zwei Anforderungen, ein Mechanismus.

**Bewusst verworfen.** Ein watchdog-gesteuertes Neustarten mit wechselndem `-ngl` böte echtes
Preemption, kostet aber 10–30 s Ausfalllücke pro Umschaltung und führt bewegliche Teile ein; der
`-fitt`-Koexistenzregler vermeidet die Lücke, kennt aber keinen Vorrang (wer zuerst startet,
nimmt den Platz). Die statische Aufteilung gewinnt, weil das Failover die Lücke ohnehin abdeckt.

## Bekannte Grenze: der Host-SPOF bleibt

`### Requirement: GPU Host Single Point of Failure for bge-m3 Collections` im SSOT-Spec bleibt
unverändert gültig. Beide Paare laufen auf **demselben** Windows-Host — Paar A unterscheidet sich
nur dadurch, dass es CPU-RAM statt VRAM nutzt. Das Failover deckt damit Prozessausfall,
VRAM-Verdrängung und Überlast ab, **nicht** den Verlust des Hosts. Echte Host-Redundanz verlangte
eine zweite Maschine und ist ein eigener Vorgang.

## Out of scope

- Zweiter Host für echte Host-Redundanz.
- pgvector-Reindex der Bestandsvektoren (unverändert Folgeticket aus T002110).
- Ablösung oder Austausch der bge-Modelle selbst.
- Änderungen am Routing der Chat-Modelle (Gemma/gpt-oss/Devstral) über den `llm-proxy`.

_Ticket: T002426_
