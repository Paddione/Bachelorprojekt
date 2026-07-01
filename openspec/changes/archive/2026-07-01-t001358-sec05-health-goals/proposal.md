# Proposal: t001358-sec05-health-goals

## Why

`scripts/health-goals-check.sh` misst G-SEC05 (Anteil unsignierter Commits), filtert dabei
aber nur eine von zwei GitHub-Actions-Bot-Mail-Varianten aus dem `grep -v`-Ausdruck heraus
(`41898282+github-actions[bot]@users.noreply.github.com`, nicht aber die kürzere Variante
`github-actions[bot]@users.noreply.github.com`). Dadurch werden automatisierte Bot-Commits
fälschlich als unsigniert gezählt und die G-SEC05-Metrik ist verfälscht.

## What

Der `grep -v`-Ausdruck in `scripts/health-goals-check.sh:116` wird auf `grep -vE` mit einem
optionalen Präfix (`(41898282\+)?github-actions\[bot\]@users\.noreply\.github\.com`)
umgestellt, sodass beide Bot-Mail-Varianten korrekt gefiltert werden. Abgesichert durch
BATS-Tests in `tests/spec/health-goals.bats`.

_Ticket: T001358_
