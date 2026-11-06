<h1 align="center">Insurance Programme for Claude Code</h1>

<p align="center">
  <strong>The open-source insurance programme and claims register that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Origami Risk data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=origami-risk">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/origami-risk?utm_source=github&utm_medium=readme&utm_campaign=origami-risk">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-origami-risk">Instead of Origami Risk</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Insurance Programme for Claude Code does the job you pay Origami Risk for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Origami Risk dashboard cannot.

Origami Risk does not publish a price. Its risk management information system is an annual subscription quoted to each organisation, and the price varies with the size and complexity of the implementation ([Capterra UK](https://www.capterra.co.uk/software/219772/origami-risk-for-risk-management)). Bring your own agreement to compare.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=origami-risk).

It covers what a risk and insurance manager, or the finance lead who does that job, keeps for a group of companies: the entities that buy cover, every policy and its renewal history, the schedule of values behind the property cover, the material changes insurers must hear about at renewal, claims from first notice to settlement, contractor certificates of currency, and how each premium is shared across the companies. It is built for NZ and Australian groups with a broker-placed programme, and it checks the records against the rules they live under: the duty of disclosure at every renewal, claim notice, average clauses and contractor insurance.

### Your first hour: ten things to ask for

1. "What needs attention this week?"
2. "Which renewals are coming up and what do we still owe the broker?"
3. "We have leased a new warehouse in Brisbane." (logged as a change the property insurer must hear about)
4. "Draft the renewal information for the property policy."
5. "The valuer says the Auckland factory would cost 24.5 million to rebuild." (`/value`, with a warning if you are under the average clause)
6. "A customer says they found something in one of our meals. Log it on the liability policy."
7. "Draft the claim notification for CL-002."
8. "Which contractors are on site without current cover?"
9. "Give me the premium allocation by company for the month-end journals."
10. "Our property policy's average clause is 85%, not 80%." (`/customise`)

### Ten questions the Origami Risk dashboard does not answer

1. Which changes since the last renewal have we not told our insurers about?
2. Which renewals are due in the next 90 days, and has the renewal information gone for each?
3. Is any of our cover expired with nothing in its place?
4. Which buildings are declared below the average clause, and how much short are we?
5. Which assets have not been valued in three years?
6. Which losses has the insurer not been told about yet, and how late are we?
7. Which open claims have had no update from the insurer in a month?
8. Which contractors on site have no current certificate, or a limit below what we require?
9. How is each premium shared across our companies, and what does each one owe this year?
10. Which class of cover has cost the insurer more in claims than we paid in premium over three years?


## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/insurance-programme-for-claude-code.git
cd insurance-programme-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. The demo group has a cyber policy that lapsed a week ago, a property renewal in 35 days with a new warehouse nobody has told the insurer about, a factory declared under its average clause, a claim the insurer has not heard about, and contractors on site without current cover. Run `npm test` to check every command, and `npm run view` and `npm run docs` for the branded dashboards and paperwork.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/entities` | Every entity in the group with the revenue and headcount declared for this year, assets and open claims. |
| `/policies` | The whole programme: every policy, insurer, period, limit, excess, premium and its cover state today. |
| `/renewals` | Renewals in the next 120 days and any cover that has lapsed, with whether the renewal information has gone and how many changes are undisclosed. |
| `/schedule` | The schedule of values: every insured asset, the declared value against the latest replacement valuation, and when it was valued. |
| `/underinsured` | Assets declared below the average clause on their policy, and the gap in dollars. |
| `/claims` | Every claim, open first: policy, what happened, when it was found and notified, reserve, paid and days since the last update. |
| `/certificates` | Contractor certificates of currency: the public liability on file against what you require, and when it expires. |
| `/changes` | Material changes the insurers must hear about: new sites, assets, markets and activities. Undisclosed first. |
| `/allocation` | Each in-force policy's premium shared across the entities on its basis: revenue, headcount, asset value, vehicles or a fixed entity. |
| `/spend` | This year's premium by policy against the policy it renewed, and the change. |
| `/loss-ratio` | By class over three years: premium, claims incurred and the loss ratio. |
| `/attention` | What needs a person this week: lapsed cover, undisclosed changes, renewals, unnotified and quiet claims, underinsurance, contractor certificates. |
| `/compliance` | Check the records against the rules in docs/compliance.md and cite the rule for every finding. |
| `/activity` | The append-only log of who changed what. |
| `/policy` | One policy: the cover, what needs attention, the assets on it, its claims, changes since inception and how its premium is shared. |
| `/claim` | One claim: the dates, the notice deadline, reserve, paid, notes and who changed what. |
| `/entity` | One entity: its share of each premium, its assets, claims and contractors. |
| `/contractor` | One contractor: trade, the limit you require and every certificate they have sent. |
| `/add-entity` | Add a company, trust or division to the group, with its revenue and headcount for premium allocation. |
| `/add-policy` | Add a policy to the programme: class, insurer, period, premium, limit, excess and how its premium is shared. |
| `/renew` | Record a renewal: the new period and premium. Refused until the renewal information has gone and every change of that class is disclosed. |
| `/disclose` | Record that the renewal information went to the broker or insurer. Every undisclosed change of that class up to that date is marked as told. |
| `/log-change` | Record a material change insurers must hear about: a new site, an acquisition, a new product or market, a big contract. |
| `/add-asset` | Add an asset to the schedule of values on a policy. The addition is logged as a change for the insurer. |
| `/value` | Record a replacement valuation for an asset. Warns when the declared value falls under the average clause. |
| `/declare` | Change the value declared to the insurer for an asset. The change is logged for the insurer. |
| `/declare-metrics` | Record an entity's revenue and headcount for the year. They drive premium allocation and the renewal declarations. |
| `/log-claim` | Record a loss or incident against a policy. Returns the date the insurer must hear by. |
| `/notify-claim` | Record that a claim was notified to the insurer, with the claim number they gave. |
| `/claim-update` | Add a note to an open claim, and update the reserve or the amount paid. |
| `/close-claim` | Close a claim as paid, declined or withdrawn, with the final amount and a note. |
| `/add-contractor` | Add a contractor to the register with the public liability limit you require of them. |
| `/certificate` | Record a contractor's certificate of currency: limit, expiry, insurer. |
| `/import` | Bring policies, claims and the schedule of values across from Origami Risk report exports. Always a dry run first. |
| `/export` | Write every record to one JSON file the business keeps. |
| `/renewal-submission` | Draft the renewal information for a policy: entities, schedule of values, changes since the last renewal and five years of claims. |
| `/claim-notification` | Draft the notification of a loss to the broker or insurer from the claims register. |
| `/cert-request` | Draft the email asking a contractor for a current certificate of currency. |
| `/allocation-statement` | Draft the premium allocation by entity for the month-end journals. |
| `/weekly-review` | Draft the Monday insurance review from attention, renewals, open claims and certificates. |
| `/help` | Every command the CLI takes, with its flags. |
| `/customise` | Make it yours in plain words: add a field, change a threshold, rename a class. Writes and tests the migration. |
| `/new-view` | Add a branded read-only dashboard from a question. |

Every command runs the one CLI, `npm run cover -- <command>`, with `--json` on any read. Money flags are in dollars. Every write needs `--actor=` and lands in an append-only activity log.

`npm run view` renders four read-only dashboards (this week, renewals, schedule of values, claims) and `npm run docs` renders premium allocation statements by entity, schedules of values by policy and claims histories for renewal, in your brand from `brand.json`.

## Instead of Origami Risk

Export three reports from Origami Risk (the policy schedule, the claims list and the schedule of values) as CSV, run `npm run cover -- import origami --policies=policies.csv --claims=claims.csv --values=values.csv --dry-run --actor="Your name"`, fix every row it reports, then run it for real. Policy periods chain by policy number, so your renewal history comes across. Column names differ from one Origami setup to the next; the importer reads the common ones and Claude Code can map the rest. Full guide: [docs/replace-origami-risk.md](docs/replace-origami-risk.md). The rules it checks, with sources: [docs/compliance.md](docs/compliance.md).

## Architecture

```
insurance-programme-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Insurance Programme for Claude Code for your business, migrates your Origami Risk data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=origami-risk)
- Read more: [enterprisedna.co/omni/instead-of/origami-risk](https://enterprisedna.co/omni/instead-of/origami-risk?utm_source=github&utm_medium=readme&utm_campaign=origami-risk)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
