# Neovim dashboard runbook index (T900655)

Master index for the dashboard's runbooks. Chapter order and action names
here must match the dashboard exactly (`lua/config/dashboard.lua`, Home
page). Each chapter gets its own runbook file once its chapter ticket
lands; until then it is marked `stub` here and has no per-chapter file yet.
Use `_template.md` as the starting point for a new chapter runbook.

## Home

**Home** — foundation (T900655) — [`home.md`](home.md) — status: complete

## Chapters (fixed EPIC order, listed on Home in this order)

1. **Files & Search** — T900657 — status: stub
2. **JavaScript / Frontend** — T900658 — status: stub
3. **GitHub** — T900659 — status: stub
4. **SDLC** — T900660 — status: stub
5. **Repository & Code Knowledge** — T900661 — status: stub
6. **AI & Agents** — T900662 — status: stub
7. **Models & Inference** — T900663 — status: stub
8. **Infrastructure** — T900664 — status: stub
9. **ComfyUI & Images** — T900666 — status: stub
10. **Settings & Help** — T900667 — status: stub

No Factory chapter: T900665 (Factory & Proxy) is archived/obsolete and was
dropped from the EPIC chapter list.

Per-chapter local tables of contents (sub-pages within each chapter)
arrive with the chapter tickets above, which define those pages. This
index tracks only the top-level chapter list and its status.
