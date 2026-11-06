---
description: Record a contractor's certificate of currency: limit, expiry, insurer.
---

Read CLAUDE.md. Record a contractor's certificate of currency: limit, expiry, insurer.

Run `npm run cover -- certificate <contractor> --limit= --expires=YYYY-MM-DD [--insurer=] [--number=] [--received=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. If it warns the limit is too low, say so plainly before they come on site.
