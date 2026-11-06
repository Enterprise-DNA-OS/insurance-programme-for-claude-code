---
description: Record that a claim was notified to the insurer, with the claim number they gave.
---

Read CLAUDE.md. Record that a claim was notified to the insurer, with the claim number they gave.

Run `npm run cover -- notify-claim <claim> --number= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. Only after the operator confirms it went. Put the real date in --on.
