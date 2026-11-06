---
description: Record that the renewal information went to the broker or insurer. Every undisclosed change of that class up to that date is marked as told.
---

Read CLAUDE.md. Record that the renewal information went to the broker or insurer. Every undisclosed change of that class up to that date is marked as told.

Run `npm run cover -- disclose <policy> [--to=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. Only run this after the operator confirms the information was actually sent. Put the real date in --on.
