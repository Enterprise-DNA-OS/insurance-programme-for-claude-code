---
description: Record a replacement valuation for an asset. Warns when the declared value falls under the average clause.
---

Read CLAUDE.md. Record a replacement valuation for an asset. Warns when the declared value falls under the average clause.

Run `npm run cover -- value <asset> --replacement= [--valuer=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. If it warns, give the sum insured that clears the clause and offer /declare.
