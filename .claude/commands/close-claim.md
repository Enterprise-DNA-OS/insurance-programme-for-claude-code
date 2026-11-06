---
description: Close a claim as paid, declined or withdrawn, with the final amount and a note.
---

Read CLAUDE.md. Close a claim as paid, declined or withdrawn, with the final amount and a note.

Run `npm run cover -- close-claim <claim> --outcome=paid|declined|withdrawn --note= [--paid=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. If declined, ask whether the operator wants to take it to the insurer's internal disputes process.
