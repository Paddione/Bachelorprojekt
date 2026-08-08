# Proposal: qwen3-coder-loadout

## Why

Die vier bestehenden Chat-Loadouts (`gptoss-context`, `devstral-quality`, `gemma-factory`,
`gemma26-factory`) sind auf Durchsatz optimiert und liefern 158–166 tok/s. Für Tickets, deren
Schwierigkeit in mehrstufiger Werkzeugnutzung liegt statt in der Menge erzeugter Tokens, fehlt
ein Backend mit höherer agentischer Tiefe.

Qwen3-Coder-30B-A3B-Instruct füllt diese Lücke. Gemessen am 2026-08-04 auf der RTX 5070 Ti
(16 GB), **unter Konkurrenz durch das gleichzeitig laufende `gptoss-context`**:

| Kennzahl | Wert |
|---|---|
| Decode | 47,9 tok/s |
| Prefill | 912 tok/s bei 4331 Prompt-Tokens |

Das Modell (UD-Q4_K_XL, 17 GB) passt nicht vollständig in den VRAM und ist auf MoE-Offload
angewiesen. Dieser Weg wurde für `gemma26-factory` ausdrücklich **verworfen** — dort kostete
`-ncmoe` Faktor 7 und landete bei 21,5 tok/s. Der Unterschied ist belegbar und liegt in der
Architektur: Gemma-4-26B aktiviert 4B Parameter je Token, Qwen3-Coder-30B nur 3B, verteilt auf
viele kleine Experten. Pro Token muss dadurch weniger über den PCIe-Bus, und `--fit` verteilt die
Layer automatisch statt mit fester Layer-Zahl. Die Messung widerlegt die Übertragung des
`gemma26`-Ergebnisses auf dieses Modell, sie hebt sie nicht generell auf.

## What

Ein **zusätzliches** Chat-Loadout, kein Ersatz:

- `scripts/llm/loadouts.json` erhält den Eintrag `qwen3-coder` auf Port 8097 in
  `exclusiveGroup: "chat-gpu"`. Die Ports 8091, 8092, 8095, 8096, 8098 und 8099 sind belegt.
- Eine SQL-Migration registriert das Backend in `tickets.llm_proxy_backends` (beide Brands),
  nach Muster `scripts/migrations/2026-08-03-llm-proxy-gptoss-devstral.sql`.
- Ein BATS-Test unter `tests/spec/local-llm-proxy/` sichert die Registrierung ab.

**Ausdrücklich nicht Teil dieses Change:** `tickets.provider_config` und
`tickets.factory_model_slots` bleiben unverändert. Kein Tier wird umgeroutet, kein bestehendes
Backend abgeschaltet. Das Loadout ist gezielt startbar; der Alltagspfad läuft weiter über
`gptoss-context`. Damit ist der Change vollständig reversibel — `enabled=false` in der Registry
genügt.

### Bekannte Auslassung

`fit.targetMarginMib` ist in diesem Change **ungemessen**. Für `gemma26-factory` war dieser Wert
ein Messergebnis (die `-fitt`-Reihe steht in dessen `notes`), hier wird er aus dem Referenzlauf
übernommen. Eine saubere Messung verlangt die GPU exklusiv und damit das Anhalten laufender
Dienste; das ist ein eigener Vorgang. Das Loadout trägt diesen Vorbehalt in seinen `notes`,
damit der nächste Leser den Wert nicht für belegt hält.

_Ticket: T002645_
