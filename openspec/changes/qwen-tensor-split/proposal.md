# Proposal: qwen-tensor-split

## Why

Nach T900171 verteilt `-fit` die Layer des Qwen-27B-Loadouts selbst. Die RTX 5070 Ti behaelt dabei 2782 MiB ungenutzt, die langsamere RTX 3060 Ti traegt mehr Layer als noetig. Jeder Token laeuft durch beide Karten, also bremst jeder Layer auf der 3060 Ti.

Messung (2026-09-15, PK-W-1, llama-b10881-13.3, Reserve `-fitt 256,1500`, je drei Laeufe a 300 Token):

| `-ts` | n_ctx_slot | frei 3060 Ti | frei 5070 Ti | Decode |
|---|---|---|---|---|
| (fit) | 205.056 | 1699 MiB | 2782 MiB | 31 t/s |
| 75,25 | 205.056 | 791 MiB | 2218 MiB | 36 t/s |
| 80,20 | 205.056 | 1599 MiB | 1400 MiB | 37-38 t/s |
| 85,15 | 205.056 | 2628 MiB | 374 MiB | 38 t/s |

85,15 mit einem Prompt von 102.936 Token: kein Fehler, Prefill 1015 t/s, danach frei 2630/356 MiB.

Befund zu T900171: `-ts` bricht die fit-Layer-Platzierung ebenfalls ab (`tensor_split already set by user, abort`). Die Kontextanpassung an `-fitt` laeuft danach weiter (`256,4000` ergab 129.792 Kontext). Die Aussage "verwirft jede -fitt-Reserve" war zu stark.

## What

- `-TensorSplit` im Startskript defaultet auf `85,15`, das Loadout `qwen38-220k` uebergibt `-ts 85,15`.
- Die Requirement "Start scripts leave -ngl to -fit" wird praezisiert: `-ts` ist erlaubt, wenn die Verteilung gemessen ist, und die Abbruch-Warnung ist dann erwartet.
- Skriptkommentar und Loadout-Notiz werden auf die Messung nachgezogen.

_Ticket: T900172_
