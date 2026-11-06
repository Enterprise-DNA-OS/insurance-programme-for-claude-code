---
description: Add a policy to the programme: class, insurer, period, premium, limit, excess and how its premium is shared.
---

Read CLAUDE.md. Add a policy to the programme: class, insurer, period, premium, limit, excess and how its premium is shared.

Run `npm run cover -- add-policy --code= --name= --class= --insurer= --start=YYYY-MM-DD --end=YYYY-MM-DD --premium= [--levies=] [--limit=] [--excess=] [--broker=] [--number=] [--basis=revenue|headcount|asset_value|vehicles|fixed] [--entity=] [--claims-made] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. Money is in dollars. Use --basis=fixed with --entity= when one entity pays all of it.
