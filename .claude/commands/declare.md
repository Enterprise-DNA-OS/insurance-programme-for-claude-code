---
description: Change the value declared to the insurer for an asset. The change is logged for the insurer.
---

Read CLAUDE.md. Change the value declared to the insurer for an asset. The change is logged for the insurer.

Run `npm run cover -- declare <asset> --declared= --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. Tell the operator the broker needs to hear about it: in the renewal information or as an endorsement now.
