---
description: Add a company, trust or division to the group, with its revenue and headcount for premium allocation.
---

Read CLAUDE.md. Add a company, trust or division to the group, with its revenue and headcount for premium allocation.

Run `npm run cover -- add-entity --code= --name= [--kind=company|trust|division|partnership] [--country=NZ|AU] [--revenue=] [--headcount=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars.
