// npm test: a temporary database, migrate, seed twice, then every command and every gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, reads, usage } from './cover.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-'));
process.env.DATA_DIR = path.join(tmp, 'db');
process.env.OUTPUT_DIR = tmp;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const db = await getDb();
const exercised = new Set();
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const call = async (args) => { exercised.add(args[0]); return run(db, args); };
const fail = async (args, re) => { exercised.add(args[0]); await assert.rejects(() => run(db, args), re); checks++; };
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const dmy = (n) => day(n).split('-').reverse().join('/');
const actor = '--actor=Tester';

try {
  ok((await migrate(db)).ran.length === 1, 'migration applies');
  ok((await migrate(db)).ran.length === 0, 'migration is idempotent');
  await seed(db);
  await seed(db);
  ok((await db.query('select * from policies')).length === 10, 'seed is idempotent');
  ok((await db.query('select * from claims')).length === 7, 'seed claims');

  // Every read works in both shapes.
  for (const name of Object.keys(reads)) ok(Array.isArray(await call([name, '--json'])), `${name} returns rows`);
  ok((await call(['help'])).length === Object.keys(usage).length, 'help lists every command');

  // The attention list finds what the seed planted.
  const att = await call(['attention']);
  const has = (item, rule) => att.some((r) => r.item === item && r.rule === rule);
  ok(has('CYB-25', 'cover expired, no renewal') && !att.some((r) => r.item === 'MV-25'), 'lapsed cover, and a renewed policy needs nothing');
  ok(has('PRP-25', 'undisclosed change before renewal') && has('PL-25', 'undisclosed change before renewal'), 'undisclosed changes before renewal');
  ok(has('PRP-25', 'renewal disclosure not sent') && !has('PL-25', 'renewal disclosure not sent') && has('PL-25', 'renewal coming'), 'renewal information due inside 45 days');
  ok(has('CL-002', 'claim not notified') && !att.some((r) => r.item === 'CL-006'), 'unnotified claim');
  ok(has('CL-001', 'claim gone quiet'), 'quiet claim');
  ok(has('A-001', 'underinsured') && has('A-001', 'valuation out of date') && !att.some((r) => r.item === 'A-004'), 'underinsurance and old valuation');
  ok(has('CO-002', 'contractor certificate expired') && has('CO-003', 'contractor limit too low') && has('CO-004', 'no contractor certificate'), 'contractor certificates');
  ok(has('CO-006', 'contractor certificate expiring') && !att.some((r) => r.item === 'CO-005' || r.item === 'CO-001'), 'inactive and current contractors need nothing');
  ok(att[0].severity === 1, 'worst first');

  const comp = await call(['compliance']);
  const finds = (rule, code) => comp.some((r) => r.rule === rule && r.code === code);
  ok(finds('DUTY-OF-DISCLOSURE', 'CH-001') && finds('DUTY-OF-DISCLOSURE', 'CH-002') && !finds('DUTY-OF-DISCLOSURE', 'CH-003'), 'disclosure findings');
  ok(finds('CONTINUOUS-COVER', 'CYB-25') && finds('RENEWAL-INFORMATION', 'PRP-25') && finds('AVERAGE-CLAUSE', 'A-001') && finds('VALUATION-AGE', 'A-001'));
  ok(finds('CLAIM-NOTIFICATION', 'CL-002') && finds('CLAIM-PROGRESS', 'CL-001') && !comp.some((r) => r.rule === 'CLAIM-IN-PERIOD'), 'claims rules');
  ok(['CO-002', 'CO-003', 'CO-004'].every((c) => finds('CONTRACTOR-INSURANCE', c)), 'contractor rule');

  const under = await call(['underinsured']);
  ok(under.length === 1 && under[0].gap === 5500000, 'the shortfall in dollars');
  const alloc = await call(['allocation']);
  const share = (p, e) => alloc.find((r) => r.policy === p && r.entity === e);
  ok(share('DO-26', 'KCG').allocated === 18500 && !share('DO-26', 'KCF'), 'fixed allocation');
  ok(share('MV-26', 'KCL').share_pct === 75, 'vehicle allocation');
  ok(alloc.filter((r) => r.policy === 'PL-25').reduce((s, r) => s + r.allocated, 0) === 91000 - 1, 'revenue shares add up to the premium, to the dollar');
  ok(!alloc.some((r) => r.policy === 'CYB-25'), 'only in-force policies are shared');
  ok((await call(['spend'])).find((r) => r.code === 'MV-26').change_pct === 17.3, 'premium change on renewal');
  ok((await call(['loss-ratio']))[0].class === 'marine_transit', 'worst loss ratio first');
  ok((await call(['renewals'])).map((r) => r.code).join() === 'CYB-25,PRP-25,PL-25', 'renewals, soonest first');
  ok((await call(['certificates']))[0].code === 'CO-004', 'missing certificate first');
  ok((await call(['changes']))[0].disclosed_on === null, 'undisclosed changes first');
  ok((await call(['entities'])).find((r) => r.code === 'KCF').open_claims === 2, 'entities');
  ok((await call(['policies'])).some((r) => r.code === 'PRP-24' && r.renewed_into === 'PRP-25'), 'renewal chain');
  ok((await call(['schedule'])).length === 10 && (await call(['claims']))[0].status === 'open', 'schedule and claims');

  // Lookup: code, name words, ambiguity, misses, bad flags.
  ok((await call(['policy', 'prp-25'])).policy.cover === 'renewal due', 'policy by code, any case');
  ok((await call(['policy', 'directors'])).policy.code === 'DO-26', 'policy by name words');
  await fail(['policy', 'liability'], /Ambiguous/);
  await fail(['policy', 'aviation'], /No matching policy/);
  ok((await call(['claim', 'forklift'])).claim.code === 'CL-001', 'claim by description words');
  ok((await call(['claim', 'am-clm-50331'])).notes.length === 1, 'claim by insurer claim number');
  ok((await call(['entity', 'logistics'])).assets.length === 4, 'entity by name words');
  ok((await call(['contractor', 'refrigeration'])).contractor.state === 'expired', 'contractor by trade');
  await fail(['policies', '--bogus'], /Unknown flag/);
  await fail(['nonsense'], /Unknown command/);
  await fail(['policies', 'extra'], /takes no arguments/);
  await fail(['log-change', '--class=property', '--description=x'], /--actor is required/);

  // Renewal: the duty of disclosure is a hard stop.
  await fail(['renew', 'PRP-25', '--code=PRP-26', '--premium=470000', actor], /renewal information has not been sent/);
  const draft = await call(['renewal-submission', 'PRP-25']);
  ok(draft.undisclosed === 1 && /Leased and fitted out a new warehouse/.test(fs.readFileSync(draft.file, 'utf8')), 'renewal information drafted with the undisclosed change');
  const ch = await call(['log-change', '--class=property', '--description=Installed a second blast freezer', '--entity=KCF', actor]);
  ok(ch.change === 'CH-005' && /PRP-25/.test(ch.next), 'a change is tied to the next renewal');
  await fail(['log-change', '--class=aviation', '--description=x', actor], /--class must be one of/);
  const sent = await call(['disclose', 'PRP-25', `--on=${day(0)}`, actor]);
  ok(sent.changes_disclosed.join() === 'CH-001,CH-005' && sent.sent_to === 'Harbour Insurance Brokers', 'disclosure marks the class');
  await fail(['disclose', 'PRP-24', actor], /is renewed/);
  ok(!(await call(['compliance'])).some((r) => r.rule === 'DUTY-OF-DISCLOSURE' && r.code === 'CH-001'), 'disclosed changes clear');
  const rn = await call(['renew', 'PRP-25', '--code=PRP-26', '--premium=470000', '--levies=46000', actor]);
  ok(rn.into === 'PRP-26' && rn.change_pct === 13.2, 'renewal with the premium change');
  ok((await call(['policy', 'PRP-26'])).assets.length === 6, 'the schedule moves to the new policy');
  await fail(['renew', 'PRP-25', '--code=PRP-27', '--premium=1', actor], /is renewed/);
  await fail(['renew', 'PL-25', '--code=PL-26', '--premium=95000', actor], /renewal information has not been sent/);

  ok((await call(['add-entity', '--code=KCS', '--name=Kauri Coast Seafoods Ltd', '--revenue=4.5m', '--headcount=12', actor])).revenue === '$4,500,000', 'add an entity');
  await fail(['add-entity', '--code=KCX', '--name=kauri coast seafoods ltd', actor], /already in the group/);

  // A lapsed policy is put back with a fresh policy, not a renewal of the dead one.
  ok((await call(['add-policy', '--code=CYB-26', '--name=Cyber 2026-27', '--class=cyber', '--insurer=Ironbark Specialty', `--start=${day(0)}`, `--end=${day(365)}`,
    '--premium=29,500', '--limit=2m', '--excess=10k', '--basis=headcount', '--claims-made', actor])).premium === '$29,500', 'add a policy');
  await fail(['add-policy', '--code=cyb-26', '--name=x', '--class=cyber', '--insurer=x', `--start=${day(0)}`, `--end=${day(1)}`, '--premium=1', actor], /already exists/);
  await fail(['add-policy', '--code=X-1', '--name=x', '--class=cyber', '--insurer=x', `--start=${day(1)}`, `--end=${day(0)}`, '--premium=1', actor], /after --start/);
  await fail(['add-policy', '--code=X-1', '--name=x', '--class=cyber', '--insurer=x', `--start=${day(0)}`, `--end=${day(1)}`, '--premium=lots', actor], /amount in dollars/);
  ok((await call(['attention'])).some((r) => r.item === 'CYB-26' && r.rule === 'allocation data missing'), 'headcount missing for the AU entity');
  ok((await call(['declare-metrics', 'KCA', '--headcount=21', actor])).headcount === 21, 'declare metrics');
  ok(!(await call(['attention'])).some((r) => r.rule === 'allocation data missing'), 'allocation complete');

  // Schedule of values: valuations, declarations, new assets.
  const v = await call(['value', 'A-004', '--replacement=8.2m', '--valuer=Waikato Property Valuers', actor]);
  ok(v.pct_declared === 73.2 && /at least \$6,560,000/.test(v.warning), 'a new valuation exposes underinsurance');
  const d = await call(['declare', 'A-004', '--declared=6.6m', actor]);
  ok(d.pct_declared === 80.5 && d.change === 'CH-006', 'declaring more logs a change for the insurer');
  await fail(['declare', 'A-004', '--declared=6.6m', actor], /already declared/);
  ok((await call(['value', 'auckland factory', '--replacement=24.5m', '--valuer=Coastal Valuers Ltd', actor])).warning, 'still under after revaluing');
  ok(!(await call(['attention'])).some((r) => r.item === 'A-001' && r.rule === 'valuation out of date'), 'the valuation is current');
  const na = await call(['add-asset', '--entity=KCL', '--policy=MV-26', '--name=Isuzu NPR curtainsider', '--kind=vehicle', '--declared=96000', '--registration=RKT901', actor]);
  ok(na.asset === 'V-005' && /CH-/.test(na.change), 'a new vehicle is a change for the insurer');
  ok((await call(['allocation'])).find((r) => r.policy === 'MV-26' && r.entity === 'KCL').share_pct === 80, 'vehicles drive the motor allocation');
  await fail(['add-asset', '--entity=KCL', '--policy=MV-26', '--name=x', '--kind=boat', '--declared=1', actor], /--kind must be one of/);

  // Claims: notify, update, close.
  const lc = await call(['log-claim', '--policy=MT-26', '--description=Forklift dropped a pallet at the Napier port', `--occurred=${day(-2)}`, '--reserve=1800', actor]);
  ok(lc.claim === 'CL-008' && lc.notify_by === day(12) && /within the \$2,500 excess/.test(lc.note), 'claim logged with its deadline');
  ok(/outside/.test((await call(['log-claim', '--policy=MV-25', '--description=Scrape found in the yard', `--occurred=${day(-3)}`, actor])).warning), 'outside the policy period');
  await fail(['log-claim', '--policy=MT-26', '--description=x', `--occurred=${day(2)}`, actor], /cannot be in the future/);
  await fail(['log-claim', '--policy=MT-26', '--description=x', `--occurred=${day(-2)}`, `--discovered=${day(-3)}`, actor], /before --occurred/);
  await fail(['log-claim', '--policy=MT-26', '--description=x', `--occurred=${day(-2)}`, '--asset=A-001', actor], /another policy/);
  ok((await call(['compliance'])).some((r) => r.rule === 'CLAIM-IN-PERIOD' && r.code === 'CL-009'), 'the period rule catches it');
  const note = await call(['claim-notification', 'CL-002']);
  ok(fs.existsSync(note.file) && /Notification of loss/.test(fs.readFileSync(note.file, 'utf8')), 'claim notification drafted');
  const nc = await call(['notify-claim', 'CL-002', '--number=PG-L-C-1188', actor]);
  ok(nc.late === true && nc.days_after_found === 20, 'a late notice stays late');
  await fail(['notify-claim', 'CL-002', '--number=again', actor], /was notified/);
  ok((await call(['compliance'])).some((r) => r.rule === 'CLAIM-NOTIFICATION' && r.code === 'CL-002' && /told 20 days later/.test(r.finding)), 'the record keeps it');
  ok((await call(['claim-update', 'CL-001', '--note=Racking supplier quote received', '--reserve=92000', actor])).reserve === '$92,000');
  ok(!(await call(['attention'])).some((r) => r.item === 'CL-001'), 'an update clears the quiet flag');
  await fail(['close-claim', 'CL-008', '--outcome=paid', '--paid=1800', '--note=x', actor], /never notified/);
  await fail(['close-claim', 'CL-001', '--outcome=paid', '--note=x', actor], /--paid is required/);
  ok((await call(['close-claim', 'CL-001', '--outcome=paid', '--paid=89500', '--note=Settled less excess', actor])).status === 'paid');
  await fail(['claim-update', 'CL-001', '--note=x', actor], /is paid/);
  ok((await call(['close-claim', 'CL-008', '--outcome=withdrawn', '--note=Under the excess', actor])).status === 'withdrawn', 'withdraw without notice');

  // Contractors and certificates.
  const ac = await call(['add-contractor', '--name=Bay Pest Control', '--trade=pest control', '--entity=KCF', '--required=5m', actor]);
  ok(ac.contractor === 'CO-007', 'contractor added');
  await fail(['add-contractor', '--name=bay pest control', actor], /already on the register/);
  const req = await call(['cert-request', 'CO-002']);
  ok(/expired on/.test(fs.readFileSync(req.file, 'utf8')), 'certificate request drafted');
  ok((await call(['certificate', 'CO-002', '--limit=10m', `--expires=${day(365)}`, '--insurer=Albany Mutual', actor])).state === 'current', 'certificate recorded');
  ok(/below/.test((await call(['certificate', 'pest', '--limit=2m', `--expires=${day(300)}`, actor])).warning), 'low limit warns');
  await fail(['certificate', 'CO-004', '--limit=5m', `--expires=${day(-1)}`, actor], /before it was received/);
  ok(!(await call(['attention'])).some((r) => r.item === 'CO-002'), 'a new certificate clears the flag');

  // Drafts and statements land in drafts/, never sent.
  const st = await call(['allocation-statement']);
  ok(st.entities === 5 && /Totals by entity/.test(fs.readFileSync(st.file, 'utf8')), 'allocation statement');
  const wk = await call(['weekly-review']);
  ok(wk.urgent >= 1 && fs.readFileSync(wk.file, 'utf8').includes('## Renewals'), 'weekly review');

  // Import from Origami Risk report exports: dry run, problems, the real thing, never twice.
  const pol = path.join(tmp, 'policies.csv');
  const clm = path.join(tmp, 'claims.csv');
  const val = path.join(tmp, 'values.csv');
  fs.writeFileSync(pol, `Policy Number,Line of Coverage,Carrier,Effective Date,Expiration Date,Premium,Limit,Deductible,Named Insured,Broker\n` +
    `PG-PI-5501,Professional Liability,Pacifica General,${dmy(-400)},${dmy(-35)},"$12,400.00","5,000,000",25000,Kauri Coast Foods Ltd,Harbour Insurance Brokers\n` +
    `PG-PI-5501,Professional Liability,Pacifica General,${dmy(-35)},${dmy(330)},"$13,100.00","5,000,000",25000,Kauri Coast Foods Ltd,Harbour Insurance Brokers\n` +
    `TC-9001,Trade Credit,Coface,${dmy(-200)},${dmy(165)},8200,,,KCF,\n`);
  fs.writeFileSync(clm, `Claim Number,Policy Number,Date of Loss,Date Reported,Claim Status,Total Paid,Total Incurred,Loss Description\n` +
    `PI-C-1,PG-PI-5501,${dmy(-300)},${dmy(-290)},Closed,"6,000.00","6,000.00",Wrong allergen label on a customer's private-label run\n` +
    `PI-C-2,PG-PI-5501,${dmy(-10)},${dmy(-8)},Open,0,15000,Customer alleges recipe consulting advice caused a recall\n` +
    `AM-CLM-50331,AM-ISR-77120,${dmy(-80)},${dmy(-78)},Open,0,85000,Forklift struck racking\n`);
  fs.writeFileSync(val, `Location Name,Address,Entity,Policy Number,Building Value,Contents Value,Stock Value,Valuation Date\n` +
    `Christchurch cold store,"5 Halswell Junction Road, Christchurch",KCL,AM-ISR-77120,"3,200,000",,450000,${dmy(-20)}\n`);
  const dry = await call(['import', 'origami', `--policies=${pol}`, `--claims=${clm}`, `--values=${val}`, '--dry-run', actor]);
  ok(dry.dry_run && dry.new_policies === 3 && dry.claim_rows === 3 && dry.value_rows === 2 && !dry.problems.length, 'dry run');
  ok(!(await db.query(`select 1 from policies where policy_number = 'PG-PI-5501'`)).length, 'a dry run writes nothing');
  const bad = path.join(tmp, 'bad.csv');
  fs.writeFileSync(bad, `Policy Number,Line of Coverage,Carrier,Effective Date,Expiration Date,Named Insured\nX-1,Property,Albany,31/02/2026,${dmy(10)},\nX-2,Property,,${dmy(-10)},${dmy(10)},\nX-3,Property,Albany,${dmy(-10)},${dmy(10)},Nobody Ltd\n`);
  await fail(['import', 'origami', `--policies=${bad}`, actor], /Nothing imported[\s\S]*real YYYY-MM-DD[\s\S]*no carrier[\s\S]*no entity "Nobody Ltd"/);
  const imp = await call(['import', 'origami', `--policies=${pol}`, `--claims=${clm}`, `--values=${val}`, actor]);
  ok(imp.policies === 3 && imp.claims === 2 && imp.assets === 2 && imp.skipped.length === 1, 'import, with a claim already on file skipped');
  const pi = await db.query(`select code, status, renewed_from_id is not null as renewed from policies where policy_number = 'PG-PI-5501' order by period_start`);
  ok(pi.map((p) => `${p.code}:${p.status}:${p.renewed}`).join() === `PI-${day(-400).slice(2, 4)}:renewed:false,PI-${day(-35).slice(2, 4)}${day(-400).slice(2, 4) === day(-35).slice(2, 4) ? '-2' : ''}:active:true`, 'renewals chained by policy number');
  ok((await db.query(`select p.class from claims c join policies p on p.id = c.policy_id where c.claim_number = 'PI-C-1'`))[0].class === 'professional_indemnity', 'old claim lands on the year it happened');
  ok((await db.query(`select count(*)::int as n from assets where location like '%Halswell%'`))[0].n === 2, 'one location becomes an asset per value');
  await fail(['import', 'origami', `--policies=${pol}`, `--claims=${clm}`, `--values=${val}`, actor], /imported on/);
  await fail(['import', 'other', actor], /Usage: import/);

  const out = path.join(tmp, 'export.json');
  const ex = await call(['export', `--out=${out}`]);
  ok(ex.tables.policies === 15 && JSON.parse(fs.readFileSync(out, 'utf8')).claims.length === 11, 'export');
  await fail(['export', `--out=${out}`], /already exists/);

  const acts = await call(['activity']);
  ok(acts.length >= 20 && acts.every((a) => a.actor), 'every write is logged with who did it');

  // Every command in usage was exercised.
  const missed = Object.keys(usage).filter((c) => !exercised.has(c));
  ok(!missed.length, `commands never exercised: ${missed.join(', ')}`);

  // The branded views and documents render from the same data.
  await db.close();
  for (const script of ['view', 'docs']) {
    const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', `${script}.mjs`)], { env: { ...process.env, OUTPUT_DIR: tmp }, encoding: 'utf8' });
    ok(r.status === 0, `${script} renders: ${r.stderr}`);
    ok(/(view|doc): /.test(r.stdout), `${script} wrote files`);
  }
  console.log(`PASS: ${checks} checks, ${Object.keys(usage).length} commands`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
  try { await db.close(); } catch {}
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
