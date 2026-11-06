# Moving off Origami Risk

Origami Risk keeps your policies, locations and claims in its own database. Every list in it can be exported from a report to Excel or CSV. Three reports bring the programme across. Save each as CSV (UTF-8) before importing.

## 1. Export three reports

| Report | What it holds | Columns the importer reads |
|---|---|---|
| Policy schedule | One row per policy period | `Policy Number`, `Line of Coverage` (or `Coverage`, `Policy Type`), `Carrier` (or `Insurer`), `Effective Date`, `Expiration Date`, `Premium`, `Limit`, `Deductible` (or `Excess`), `Named Insured`, `Broker` |
| Claims list | One row per claim | `Claim Number`, `Policy Number`, `Date of Loss`, `Date Reported`, `Claim Status`, `Total Paid`, `Total Incurred`, `Loss Description` |
| Schedule of values (locations) | One row per location | `Location Name`, `Address`, `Entity`, `Policy Number`, `Building Value`, `Contents Value`, `Stock Value`, `Plant and Machinery`, `Business Interruption`, `Valuation Date` |

Origami reports are built per customer, so your column names may differ. The importer matches the common names without caring about case. Anything else: open the folder in Claude Code and ask it to map your columns. It reads the header row and adds the names to the importer.

## 2. Add your entities first

The importer matches `Named Insured` and `Entity` to the entities in the group by code or full name. Add them before you import (ask Claude Code: "add Kauri Coast Foods Ltd as KCF, revenue 62 million, 142 staff"), or edit the cells in the export to match.

## 3. Do a test run

```bash
npm run cover -- import origami --policies=policies.csv --claims=claims.csv --values=values.csv --dry-run --actor="Your name"
```

It reports how many policies are new, every row it cannot read and why (a missing carrier, a date that does not exist, an entity it does not know), and writes nothing. Fix the rows and run the test again until it is clean.

## 4. Import

Run the same command without `--dry-run`. In one transaction it:

- adds each policy period, gives it a code from its class and year (`PRP-25`, `PL-26`), and links each period to the one before it with the same policy number, so the renewal history and premium change are there from day one
- adds each claim to the policy period its date of loss falls in, skipping any claim number already on file
- turns each location into one asset per value (building, contents, stock and so on) on the property policy in force today

The same files never import twice.

## What maps and what does not

| Origami Risk | Here |
|---|---|
| Policies and periods | `policies`, chained by policy number |
| Line of coverage | `class` (property, liability, motor, cyber, directors and officers, professional indemnity, marine transit, management liability, trade credit, other) |
| Locations and their values | `assets`, one per value type |
| Claims, paid and incurred | `claims`; for open claims the reserve is incurred less paid |
| Claim notes and documents | Not imported. Keep the export; add notes going forward with `/claim-update` |
| Certificates of insurance | Not imported. Add contractors with `/add-contractor` and their certificates with `/certificate` |
| Premium allocation rules | Set the basis on each policy (revenue, headcount, asset value, vehicles or one entity) with `/customise` |
| Workflows, portals and approvals | Replaced by the slash commands. A person still sends every email. |

## After the import

Run `/attention`. The first list usually shows policies with no renewal information recorded, assets with no replacement valuation, and contractors with no certificate. That is your first week.
