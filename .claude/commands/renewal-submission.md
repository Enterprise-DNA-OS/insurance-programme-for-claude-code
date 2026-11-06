---
description: Draft the renewal information for a policy: entities, schedule of values, changes since the last renewal and five years of claims.
---

Read CLAUDE.md. Draft the renewal information for a policy: entities, schedule of values, changes since the last renewal and five years of claims.

Run `npm run cover -- renewal-submission <policy>`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Writes a draft to drafts/. Read it, present the path and the undisclosed changes it carries. Nothing is sent.
