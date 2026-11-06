---
description: Record an entity's revenue and headcount for the year. They drive premium allocation and the renewal declarations.
---

Read CLAUDE.md. Record an entity's revenue and headcount for the year. They drive premium allocation and the renewal declarations.

Run `npm run cover -- declare-metrics <entity> [--revenue=] [--headcount=] [--year=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars.
