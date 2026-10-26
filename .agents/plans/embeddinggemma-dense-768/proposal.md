---
title: Dense-BGE durch EmbeddingGemma 768 ersetzen
domains: [llm, retrieval, knowledge, infrastructure]
status: proposed
---
# Dense-BGE durch EmbeddingGemma 768 ersetzen

## Auftrag und Entscheidung
Der Nutzer hat den vollständigen Wechsel des bisherigen Dense-BGE-M3-Pfads auf EmbeddingGemma-300M mit 768 Dimensionen beauftragt. Deployment-Ziel sind die CPU-Nodes; kein Fine-Tuning ist Bestandteil dieser Migration. BGE-Reranker, LFM-Dense-CBM und ColBERT bleiben erhalten.

## Belegter Ausgangszustand
Live devmesh: knowledge.chunks 4954 Vektoren, public.code_embeddings 25983 Vektoren, tickets.ticket_embeddings leer; alle genannten Spalten vector(1024). Knowledge-Collections tragen bge-m3. Der lokale Devflow-Graphcache ist ein weiterer BGE-Raum ohne ausreichenden Modellguard. Der Proxy bevorzugt derzeit Tablet-Dense vor dem CPU-Backend. Änderungen liegen in getrennten Bachelorprojekt- und Dotfiles-Worktrees; fremde Änderungen bleiben unangetastet.

## Gewählter Ablauf
Ein separates EmbeddingGemma-Q8_0-CPU-Backend wird vor dem Cutover verfügbar gemacht. Ein gemeinsamer Modellvertrag legt Modellname, Profil, 768 Dimensionen, reale 2048-Token-Grenze und asymmetrische Query-/Dokument-Prompts fest. Bestehende Texte werden in additive Shadow-Generationen neu eingebettet, lange Texte verlustfrei in passende Unterabschnitte geteilt. Vollständigkeit, Quellhashes, Modellprofil, Vektoren und Retrieval-Smokes werden geprüft. Erst dann werden Writer angehalten, Änderungen nachgeführt, Generationen transaktional aktiviert und Query-Consumer umgestellt. BGE-Dense bleibt bis dahin nutzbar; Altbestände bleiben als Rückfallbestand erhalten. Die Tablet-Dense-Route wird aus der Gemma-Kette genommen, bis ein eigener Gemma-Nachweis vorliegt; Tablet-Rerank bleibt bestehen.

## Erfolg
Alle aktiven bisherigen BGE-Dense-Consumer verwenden das identische Gemma-Profil mit 768 Dimensionen. Kein alter Cache und kein BGE-Query kann still gegen den neuen Index suchen. Alte und neue Daten bleiben während des Aufbaus getrennt. Vollständige Reindex-Belege und die aktuelle Generation sind nachvollziehbar. Neue Generation und zurückgehaltene Tests funktionieren auf CPU; unbekannte oder falsche Generationen schlagen geschlossen fehl.
