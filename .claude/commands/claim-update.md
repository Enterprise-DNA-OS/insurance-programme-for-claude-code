---
description: Add a note to an open claim, and update the reserve or the amount paid.
---

Read CLAUDE.md. Add a note to an open claim, and update the reserve or the amount paid.

Run `npm run cover -- claim-update <claim> --note= [--reserve=] [--paid=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars.
