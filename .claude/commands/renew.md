---
description: Record a renewal: the new period and premium. Refused until the renewal information has gone and every change of that class is disclosed.
---

Read CLAUDE.md. Record a renewal: the new period and premium. Refused until the renewal information has gone and every change of that class is disclosed.

Run `npm run cover -- renew <policy> --code= --premium= [--levies=] [--insurer=] [--number=] [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--limit=] [--excess=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. Read the policy first. If it is refused, say exactly what is owed and offer /renewal-submission or /disclose. Report the premium change.
