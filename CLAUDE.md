# Insurance Programme for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs attention, the week, what is overdue | `/attention` |
| Renewals coming up, what we owe the broker | `/renewals` |
| The whole programme, every policy | `/policies` |
| One policy | `/policy` |
| New policy | `/add-policy` |
| A policy renewed, new premium | `/renew` |
| We sent the renewal information | `/disclose` |
| Draft the renewal information, the proposal | `/renewal-submission` |
| Something changed: new site, acquisition, new product or market | `/log-change` |
| Schedule of values, sums insured | `/schedule` |
| Are we underinsured | `/underinsured` |
| New building, vehicle or plant on cover | `/add-asset` |
| A valuation came in | `/value` |
| Change a sum insured | `/declare` |
| Something happened, a loss, an incident | `/log-claim` |
| Draft the claim notice | `/claim-notification` |
| We told the insurer, here is the claim number | `/notify-claim` |
| Claims, open claims | `/claims` |
| One claim | `/claim` |
| News on a claim, new estimate, payment | `/claim-update` |
| Claim settled, declined or withdrawn | `/close-claim` |
| Contractor certificates, who is covered | `/certificates` |
| One contractor | `/contractor` |
| New contractor | `/add-contractor` |
| A certificate of currency arrived | `/certificate` |
| Ask a contractor for their certificate | `/cert-request` |
| Material changes, what insurers have been told | `/changes` |
| New company or division in the group | `/add-entity` |
| The group's companies | `/entities` |
| One company | `/entity` |
| This year's revenue and headcount | `/declare-metrics` |
| Who pays what share of the premium | `/allocation` |
| Premium allocation for the journals | `/allocation-statement` |
| What the programme costs, increases | `/spend` |
| Claims against premium by class | `/loss-ratio` |
| Are we compliant | `/compliance` |
| The Monday review | `/weekly-review` |
| Bring data across from Origami Risk | `/import` |
| A copy of everything | `/export` |
| Who changed what | `/activity` |
| Add a field, change a rule or threshold | `/customise` |
| A new dashboard | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run cover -- help`) and then propose a new command for it.

## Hard rules

- Never record a renewal the CLI refuses. Say what is owed: the renewal information, or the changes not yet told to the insurer.
- Run `disclose` and `notify-claim` only after the operator confirms the information or notice actually went, with the real date.
- Never decide that a change is not material. If the operator mentions a new site, asset, product, market, contract or activity, offer to log it.
- A claim is notified by a person. Draft the notice; never contact a broker, insurer or contractor from here.
- Money flags are in dollars. Claims, valuations and certificates are never edited in place: a correction is a new note or a new record.

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Origami Risk.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/origami-risk
