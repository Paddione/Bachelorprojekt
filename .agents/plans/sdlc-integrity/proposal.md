---
title: PostgreSQL-Integrität und nachvollziehbarer SDLC-Kontext
ticket_id: T901697
domains: [scripts-infra, tickets, knowledge, devflow]
status: proposed
plan_ref: .agents/plans/sdlc-integrity/tasks.md
---
# SDLC-Integrität

Die Standard-Kontextsuche kann historischen OpenSpec-Inhalt als aktuelle Doktrin liefern, Ticket-Reader verlieren erlaubte Kanten, und ein fehlgeschlagener Knowledge-Ersatz kann vollständige Dokumente beschädigen. Dieser Fix repariert die vorhandenen Writer und Reader und macht Nachweislücken ausdrücklich sichtbar.

Der Nutzer hat die Umsetzung autorisiert und ausdrücklich die vermutete Ablösung der OpenSpec-SSOT hinterfragt. Die Quellprüfung bestätigt: ADR-010 beschreibt die Ablösung, obwohl der ADR-Status noch Entwurf ist; das OpenSpec-Verzeichnis ist tatsächlich entfernt. Der aktuelle Markdown-Ingest und Stage-Index schreiben nach `Specs & Plans`, Quelle `specs_plans`. Die historischen Collections bleiben unverändert erhalten und werden aus der Standardsuche ausgeschlossen.

Lesender Abgleich von 561 Dokumenten: `OpenSpec Specs & Plans` enthält 492 Dokumente, davon 491 mit fehlenden Quelldateien und eines mit verändertem Hash. `OpenSpec SSOT Specs` enthält 68 Dokumente mit fehlenden Quelldateien. `Repo Docs` enthält ein existentes, aber verändertes Dokument. `Specs & Plans` war leer. Das sind zeitgebundene Auditwerte, keine Testkonstanten und keine Grundlage zur Wiederbelebung der alten Ingest-Pipeline. Der suspendierte Markdown-CronJob bleibt suspendiert; der erfolgreiche K1-Job indizierte Code, keinen Markdown-Corpus.

Ergebnis: korrekte Ticket-Kanten, atomare Knowledge-Ersetzungen, nachweisbare Modellherkunft und Suchfilter vor Top-k, korrekte Repository-Konfiguration nach dem MCP-Umzug sowie ein lesender Audit, der fehlende Evidenz als unbekannt meldet. Keine Produktionseinführung, keine Datenlöschung und keine synthetischen historischen Events, Resolutions oder PR-Belege.

Ein unabhängiger Baseline-Test gegen eine disposable PostgreSQL-16/pgvector-Instanz bestätigte F2 real: ein Chunk-CHECK-Fehler (SQLSTATE 23514) ließ anschließend `sha256=new` mit null Chunks statt `old` und vollständigem alten Chunk zurück.
