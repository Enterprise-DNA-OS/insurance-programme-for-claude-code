# Why there is no front end

Origami Risk is a database with a subscription. The records underneath it are ordinary: a handful of companies, the policies they hold, the buildings and vehicles on those policies, claims, and the contractors on site. What you pay for is the layer on top that lets people who do not write SQL get at those records: screens, filters, dashboards, forms and portals.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it, and explains the answer. Ask a question the dashboard never had a chart for ("which changes have we not told the property insurer about?") and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask your own question, in your own words, against your own records.
- **No seats.** The CFO, the risk manager and the site managers can all ask. The bill does not grow with headcount.
- **Your data in your Postgres.** Plain tables. Back them up, query them from anything, leave any time.
- **Rules that stop you.** A renewal cannot be recorded while a change is undisclosed. A claim cannot close before the insurer was told. These are checks in the CLI, not reminders on a screen.

## What you give up

- **A contractor portal.** In Origami, contractors can upload their own certificates. Here a person records each one (or Claude Code reads the PDF and records it).
- **A mobile incident form.** Site staff report a loss to someone who logs it, or by talking to Claude Code.
- **Broker and insurer data feeds.** Some Origami setups take bordereaux or claims feeds straight from the insurer. Here the claims list is imported from the insurer's report or updated by hand.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for businesses that want someone to call.

Each of those can be built onto your version: a certificate upload page, a phone form, a scheduled import of the insurer's claims report. That is what the customised path is for.

## Who this fits

Groups of companies with a broker-placed programme where one person, often in finance, keeps the insurance records alongside another job. If you need the answers more than the screens, this is cheaper, faster and yours.

Installed and run for you: https://enterprisedna.co/omni/instead-of/origami-risk
