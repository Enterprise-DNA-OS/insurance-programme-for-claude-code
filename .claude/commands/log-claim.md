---
description: Record a loss or incident against a policy. Returns the date the insurer must hear by.
---

Read CLAUDE.md. Record a loss or incident against a policy. Returns the date the insurer must hear by.

Run `npm run cover -- log-claim --policy= --description= --occurred=YYYY-MM-DD [--discovered=YYYY-MM-DD] [--entity=] [--asset=] [--reserve=] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. Ask what happened, when it happened and when it was found. Then offer /claim-notification straight away.
