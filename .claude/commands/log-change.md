---
description: Record a material change insurers must hear about: a new site, an acquisition, a new product or market, a big contract.
---

Read CLAUDE.md. Record a material change insurers must hear about: a new site, an acquisition, a new product or market, a big contract.

Run `npm run cover -- log-change --class= --description= [--entity=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. Pick the class whose insurer needs to know. If it touches two classes, log it twice. Report which renewal it must be told by.
