---
description: Add an asset to the schedule of values on a policy. The addition is logged as a change for the insurer.
---

Read CLAUDE.md. Add an asset to the schedule of values on a policy. The addition is logged as a change for the insurer.

Run `npm run cover -- add-asset --entity= --policy= --name= --kind=building|contents|plant|stock|vehicle|business_interruption|other --declared= [--replacement=] [--location=] [--registration=] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. Ask for the declared value and, if they have one, the replacement valuation.
