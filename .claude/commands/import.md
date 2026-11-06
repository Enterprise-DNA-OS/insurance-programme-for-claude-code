---
description: Bring policies, claims and the schedule of values across from Origami Risk report exports. Always a dry run first.
---

Read CLAUDE.md. Bring policies, claims and the schedule of values across from Origami Risk report exports. Always a dry run first.

Run `npm run cover -- import origami [--policies=policies.csv] [--claims=claims.csv] [--values=values.csv] [--dry-run] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Put the real person doing this in `--actor`. Money is in dollars. Run with --dry-run first and show every problem row. Only run for real once the operator has seen a clean dry run. Read docs/replace-origami-risk.md.
