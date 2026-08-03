# Proposal: unsloth-training-env

## Why

Die Plattform betreibt lokale LLMs ausschließlich als *Konsument*: `llm-proxy` (:18235) serviert
fremde Gewichte, die Factory nutzt sie über benannte Slots. Es gibt keinen Weg, ein Modell auf die
eigenen Konventionen zu spezialisieren — und keinen Weg, die dabei anfallenden Factory-Traces als
Trainingsmaterial zu nutzen. Beides verschenkt den einzigen Datenvorteil, den eine selbst
betriebene Software-Factory hat: ihre eigene Ausführungshistorie.

T002587 beschrieb dafür ursprünglich ein Einmal-Setup (Gemma 2 9B / Qwen 2.5 14B auf
OpenThoughts-114k). Eine Vorab-Sitzung am 2026-08-03 auf der Zielhardware (RTX 5070 Ti, 16 GB,
Blackwell sm_120) hat drei Annahmen dieses Zuschnitts widerlegt:

1. **Nicht die Parameterzahl limitiert, sondern die Sequenzlänge.** Ein 4B-Modell lief bei 2048
   Tokens und LoRA 16-bit mit 31,6 s/it bei 76 W Leistungsaufnahme — die GPU wartete auf Speicher
   statt zu rechnen. Nach Umstellung auf QLoRA 4-bit bei *längeren* Sequenzen (3584): 7,5 s/it bei
   206 W. Reasoning-CoT erzeugt lange Ketten; eine Modellwahl ohne vorherige Längenmessung ist eine
   Wette. Im selben Korpus hätte der übliche Default 2048 genau 45 % der Zeilen am Ende gekürzt —
   dort, wo das Trainingsziel steht.
2. **Trainings-Loss ist kein Erfolgsmaß.** Drei Läufe fielen sauber (1,28 / 1,29 / 0,52), während
   die Verhaltensmessung von 9/10 über 8/10 auf 6/10 sank und wieder auf 8/10 stieg.
3. **Das Chat-Template driftet still.** Unsloths `save_pretrained` legte im Adapter ein Template mit
   4040 Zeichen ab (Thinking-Variante), während das Basismodell 2630 Zeichen nutzt. Ein so
   ausgelieferter Adapter erzeugt beim Serving ein anderes Format als beim Training.

Ein Trainings-Setup, das diese drei Punkte nicht strukturell adressiert, produziert Adapter, deren
Qualität niemand beurteilen kann.

Hinzu kommt der Zustand des Vorgänger-Branches: von 3095 Zeilen sind rund 2350 aus dem
`unsloth-buddy`-Plugin kopiert (`reflect.py`, `dashboard.html`, `gaslamp_callback.py`). Kopierter
Skill-Code im Repo driftet gegenüber dem Skill, ohne dass ein Gate das bemerkt. Die eigene
Trainingslogik liegt zudem dreifach dupliziert vor (`train.py`, `train_gemma.py`, `train_qwen.py`).

## What

Ein reproduzierbares, in Repo-Konventionen eingebettetes Finetuning-Subsystem:

- **Messung vor Modellwahl.** Ein Vorschaltschritt ermittelt die Token-Längenverteilung des
  Zielkorpus (Median, p90, p99, Maximum) und leitet daraus eine VRAM-Machbarkeitsmatrix je
  Kandidatenmodell ab. Die Modellwahl ist Ergebnis dieser Messung, nicht Vorgabe.
- **Ein parametrisiertes Trainingsskript** statt drei duplizierter Fassungen. Assistant-only Loss
  über ein gepatchtes Chat-Template, dessen Byte-Gleichheit zum Hub-Template über den gesamten
  Korpus verifiziert wird, bevor trainiert wird.
- **Factory-Traces als Datenquelle.** Ein Kollektor liest abgeschlossene Ticket-Läufe aus
  `tickets.factory_phase_events` und rendert sie ins Trainingsformat. Die Factory erzeugt damit
  laufend eigenes Trainingsmaterial.
- **Export mit Template-Korrektur** nach GGUF, servierbar über `llm-proxy` als benannter Slot.
- **Agenten-Anbindung** auf drei Wegen: Taskfile-Namespace (auffindbar über den Task-Oracle),
  Eintrag in `capabilities.yaml` (wird von `toolset-context.sh` in Agent-Prompts injiziert) und ein
  Repo-Skill, das die Repo-Konventionen mit `unsloth-buddy` verbindet.
- **Entfernung des kopierten Skill-Codes** aus `unsloth_training_setup/`; die eigene Logik zieht
  dedupliziert nach `scripts/finetune/` um.

Dataset-Vorgabe wird auf **OpenThoughts3-1.2M** aktualisiert: QwQ-32B-Teacher statt DeepSeek-R1
(1,9–2,6 % höhere Distillationsgüte), aus über 1000 Ablationen abgeleitet. OpenThoughts-114k ist
dessen Vorgänger.

**Abgrenzung:** Die Bewertung trainierter Adapter ist bewusst nicht Teil dieses Changes. Sie liegt
in `unsloth-eval-harness` (T002606), weil sie unabhängig vom Trainingspfad benutzbar sein muss —
insbesondere für Adapter, die außerhalb dieses Setups entstanden sind.

_Ticket: T002587_
