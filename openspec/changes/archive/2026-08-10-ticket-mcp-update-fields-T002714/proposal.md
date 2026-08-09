# Proposal: ticket-mcp-update-fields-T002714

## Why

Die Tool-Beschreibung von `mcp__ticket-mcp__update_fields` verspricht einen Bulk-Patch für
`title`, `description` und `notes`. Das JSON-Schema kennt außer `id`/`brand` aber nur `notes` —
`title` und `description` sind nicht patchbar, und `scripts/ticket.sh` hat kein `update`-Kommando
dafür. Beschreibung und Verhalten laufen auseinander (drift).

Konkret aufgefallen bei T002703: die Ursachen-Verifikation widerlegte die Hypothese, aus der der
Ticket-Titel formuliert war. Der Titel ließ sich nicht korrigieren; die Richtigstellung musste als
Kommentar danebenstehen, und das Ticket erscheint seither in jeder Liste und Timeline unter einem
Titel, der die Sache falsch benennt. Laut Konvention T002448-M5 ist es der Normalfall, dass sich
die Ursache während der Verifikation verschiebt — ein Ticket-Titel, der danach nicht mehr
korrigierbar ist, kollidiert damit strukturell.

## What

Das Schema wird an die Beschreibung angepasst (nicht umgekehrt): `update_fields` bekommt
optionale `title`- und `description`-Parameter zusätzlich zu `notes`, alle drei sind patchbar.
Der Bash-Layer bekommt ein neues `scripts/ticket.sh update-fields`-Kommando, das `title` und/oder
`description` per `UPDATE tickets.tickets SET ...` setzt — analog zum bestehenden
`update-status`-Kommando (Lock-Guard, `TICKET_OFFLINE`-Unterstützung, gleiche `_ticket-core.sh`-
Helfer). `notes` bleibt wie bisher ein `add-comment`-Aufruf (append-only, kein Feld auf der
Ticket-Zeile). Der Go-MCP-Adapter (`lifecycle.go`) ruft für `title`/`description` das neue
Kommando und für `notes` weiterhin `add-comment` auf; sind mehrere Felder gesetzt, laufen beide
Aufrufe nacheinander — ein Tool-Call kann so wieder tatsächlich mehrere Felder patchen, wie die
Beschreibung es verspricht.

Begründung für „Schema an Beschreibung" statt „Beschreibung an Schema": die Beschreibung kürzen
wäre der bequemere Weg, verschiebt das eigentliche Problem aber nur — ein nach der Triage
unkorrigierbarer Titel bleibt bestehen, und der nächste Vorfall wie T002703 tritt erneut auf. Die
Schema-Erweiterung ist der kleinere, wiederverwendbare Baustein (ein `update-fields`-CLI-Kommando
ist auch außerhalb von MCP-Aufrufen nützlich) und behebt die eigentliche Ursache statt sie zu
verdecken.

_Ticket: T002714_
