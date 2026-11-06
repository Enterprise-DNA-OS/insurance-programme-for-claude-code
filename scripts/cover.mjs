#!/usr/bin/env node
// The one CLI for Insurance Programme for Claude Code.
//
//   npm run cover -- help
//   npm run cover -- attention              # what needs a person this week
//   npm run cover -- policy PRP-25          # one policy, everything about it
//   npm run cover -- renewals --json        # machine output for any read
//
// Money flags are in dollars (--premium=41200). Every write needs --actor=<who is doing it>
// and lands in the append-only activity log.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table as textTable, heading, truncate } from './lib/format.mjs';

const $ = (col) => `((${col}) / 100)::bigint`; // cents to whole dollars in a read

// ------------------------------------------------------------------ reads

export const reads = {
  entities: {
    about: 'Every entity in the group: country, the revenue and headcount declared for this year, assets and open claims.',
    sql: `select e.code, e.name, e.kind, e.country, ${$('e.revenue_cents')} as revenue, e.headcount, e.metrics_year as year,
            (select count(*) from assets a where a.entity_id = e.id and a.active)::int as assets,
            (select count(*) from claims c where c.entity_id = e.id and c.status = 'open')::int as open_claims
          from entities e where e.active order by e.code`,
  },
  policies: {
    about: 'Every policy in force or due: class, insurer, period, limit, excess, premium with levies, and its cover state today.',
    sql: `select code, class, insurer, policy_number, period_start, period_end, ${$('limit_cents')} as limit_amt, ${$('excess_cents')} as excess,
            ${$('total_cents')} as premium, currency, cover, renewed_into
          from policy_register where status in ('active', 'lapsed') or period_end >= current_date - 365
          order by (status = 'renewed'), period_end, code`,
  },
  renewals: {
    about: 'Renewals in the next 120 days and any cover that has expired: days left, whether the renewal information has gone, undisclosed changes.',
    sql: `select p.code, p.name, p.insurer, coalesce(p.broker, '') as broker, p.period_end, p.days_to_expiry as days,
            case when p.disclosure_sent_on >= p.period_start then 'sent ' || p.disclosure_sent_on else 'not sent' end as disclosure,
            (select count(*) from changes c where c.class = p.class and c.disclosed_on is null)::int as undisclosed,
            ${$('p.total_cents')} as premium, p.cover
          from policy_register p
          where p.status = 'active' and p.renewed_into is null and p.days_to_expiry <= 120
          order by p.days_to_expiry, p.code`,
  },
  schedule: {
    about: 'The schedule of values: every insured asset, its declared value against its latest replacement valuation, and the valuation date.',
    sql: `select code, entity, policy, kind, name, coalesce(location, '') as location, ${$('declared_cents')} as declared,
            ${$('replacement_cents')} as replacement, pct_declared::float as pct, valued_on, coalesce(valuer, '') as valuer
          from asset_schedule where active order by policy nulls last, kind, code`,
  },
  underinsured: {
    about: 'Assets declared below the average clause on their policy, and the shortfall in dollars that a claim would be scaled by.',
    sql: `select code, entity, policy, name, ${$('declared_cents')} as declared, ${$('replacement_cents')} as replacement, pct_declared::float as pct,
            average_pct::float as average_pct, ${$('replacement_cents - declared_cents')} as gap, valued_on
          from asset_schedule where active and pct_declared < average_pct order by pct_declared, code`,
  },
  claims: {
    about: 'Every claim, open first: policy, what happened, when it was found and notified, reserve and paid, days since the last update.',
    sql: `select code, policy, entity, description, occurred_on, notified_on, coalesce(claim_number, '') as claim_number,
            ${$('reserve_cents')} as reserve, ${$('paid_cents')} as paid, status, case when status = 'open' then days_quiet end as days_quiet
          from claim_register order by (status <> 'open'), occurred_on desc, code`,
  },
  certificates: {
    about: 'Every active contractor: the public liability certificate on file, its limit against what you require, and when it expires.',
    sql: `select code, name, coalesce(trade, '') as trade, entity, ${$('required_pl_cents')} as required, ${$('limit_cents')} as held,
            coalesce(insurer, '') as insurer, expires_on, state
          from contractor_cover where active
          order by case state when 'no certificate' then 0 when 'expired' then 1 when 'limit too low' then 2 when 'expiring' then 3 else 4 end, expires_on, code`,
  },
  changes: {
    about: 'Material changes the insurers must hear about: new sites, assets, markets, activities. Undisclosed first.',
    sql: `select c.code, coalesce(e.code, '') as entity, c.class, c.description, c.occurred_on, c.disclosed_on, coalesce(c.disclosed_to, '') as disclosed_to
          from changes c left join entities e on e.id = c.entity_id order by (c.disclosed_on is not null), c.occurred_on desc, c.code`,
  },
  allocation: {
    about: 'Each in-force policy\'s premium shared across the entities on its basis (revenue, headcount, asset value, vehicles or fixed).',
    sql: `select policy, class, basis, entity, share_pct::float as share_pct, ${$('allocated_cents')} as allocated, currency
          from premium_allocation where base is null or base > 0 order by policy, entity`,
  },
  spend: {
    about: 'This year\'s premium by policy against the policy it renewed, and the change.',
    sql: `select code, class, insurer, ${$('total_cents')} as premium, ${$('prior_total_cents')} as prior,
            case when prior_total_cents > 0 then round(100.0 * (total_cents - prior_total_cents) / prior_total_cents, 1) end::float as change_pct, cover
          from policy_register where status = 'active' order by class, code`,
  },
  'loss-ratio': {
    about: 'By class over the last three years of policies: premium paid, claims incurred (paid plus reserve), and the loss ratio.',
    sql: `select p.class, count(*)::int as policy_years, ${$('sum(p.premium_cents + p.levies_cents)')} as premium,
            ${$('sum(coalesce(c.incurred, 0))')} as incurred, sum(coalesce(c.n, 0))::int as claims,
            case when sum(p.premium_cents + p.levies_cents) > 0 then round(100.0 * sum(coalesce(c.incurred, 0)) / sum(p.premium_cents + p.levies_cents), 1) end::float as loss_ratio_pct
          from policies p
          left join (select policy_id, count(*) as n, sum(paid_cents + case when status = 'open' then reserve_cents else 0 end) as incurred from claims group by policy_id) c on c.policy_id = p.id
          where p.period_start > current_date - 365 * 3 and p.status <> 'cancelled'
          group by p.class order by loss_ratio_pct desc nulls last, p.class`,
  },
  attention: {
    about: 'What needs a person this week: lapsed cover, undisclosed changes, renewals, unnotified and quiet claims, underinsurance, certificates.',
    sql: `select severity, item, rule, detail, days from programme_attention order by severity, days desc nulls last, item`,
  },
  compliance: {
    about: 'Check the records against the rules in docs/compliance.md.',
    sql: null,
  },
  activity: {
    about: 'The append-only log of who changed what.',
    sql: `select created_at, actor, command, record_id, detail from activity order by id`,
  },
};

// Each rule matches a row in docs/compliance.md.
export const complianceRules = [
  { rule: 'DUTY-OF-DISCLOSURE', sql: `select c.code, c.description || ' (' || c.occurred_on || ') not told to ' || p.insurer || ' before ' || p.code ||
        case when p.renewed_into is not null then ' was renewed' else ' renews on ' || p.period_end end as finding
      from changes c join policy_register p on p.class = c.class
      where c.disclosed_on is null and (
        (p.status = 'active' and p.renewed_into is null and p.days_to_expiry between 0 and p.renewal_lead_days)
        or (p.renewed_into is not null and c.occurred_on < p.period_end and c.occurred_on >= p.period_start))` },
  { rule: 'RENEWAL-INFORMATION', sql: `select code, name || ' ends ' || period_end || ' and the renewal information has not gone to ' || coalesce(broker, insurer) as finding
      from policy_register where status = 'active' and renewed_into is null and days_to_expiry between 0 and 45 and (disclosure_sent_on is null or disclosure_sent_on < period_start)` },
  { rule: 'CONTINUOUS-COVER', sql: `select code, name || ' ended ' || period_end || ' with no renewal or cancellation recorded' as finding
      from policy_register where status = 'active' and period_end < current_date and renewed_into is null` },
  { rule: 'AVERAGE-CLAUSE', sql: `select code, name || ' declared at ' || pct_declared || '% of replacement value; the policy pays in proportion below ' || average_pct || '%' as finding
      from asset_schedule where active and pct_declared < average_pct` },
  { rule: 'VALUATION-AGE', sql: `select code, name || ' last valued ' || coalesce(valued_on::text, 'never') as finding
      from asset_schedule where active and kind in ('building', 'plant', 'contents') and (valued_on is null or valued_on < current_date - 365 * 3)` },
  { rule: 'CLAIM-NOTIFICATION', sql: `select code, description || ' found ' || discovered_on ||
        case when notified_on is null then ', insurer not told, due ' || notify_by else ', told ' || days_to_notify || ' days later against ' || notify_within_days end as finding
      from claim_register where (notified_on is null and status = 'open' and notify_by < current_date) or days_to_notify > notify_within_days` },
  { rule: 'CLAIM-IN-PERIOD', sql: `select c.code, c.description || ' occurred ' || c.occurred_on || ', outside ' || c.policy || ' (' || p.period_start || ' to ' || p.period_end || ')' as finding
      from claim_register c join policies p on p.code = c.policy where c.outside_period and not p.claims_made` },
  { rule: 'CLAIM-PROGRESS', sql: `select code, 'no update from ' || insurer || ' since ' || last_update_on || ' (' || days_quiet || ' days)' as finding
      from claim_register where status = 'open' and notified_on is not null and days_quiet > 28` },
  { rule: 'CONTRACTOR-INSURANCE', sql: `select code, name || ': ' || case state when 'no certificate' then 'no certificate of currency'
        when 'expired' then 'public liability expired ' || expires_on else 'limit of $' || to_char(limit_cents / 100, 'FM999,999,999,999') || ' below the $' || to_char(required_pl_cents / 100, 'FM999,999,999,999') || ' required' end as finding
      from contractor_cover where active and state in ('no certificate', 'expired', 'limit too low')` },
];

// ------------------------------------------------------------------ usage

export const usage = {
  ...Object.fromEntries(Object.keys(reads).map((k) => [k, ''])),
  policy: '<policy code or name words>',
  claim: '<claim code or number>',
  entity: '<entity code or name words>',
  contractor: '<contractor code or name words>',
  'add-entity': '--code= --name= [--kind=company|trust|division|partnership] [--country=NZ|AU] [--revenue=] [--headcount=] --actor=',
  'add-policy': '--code= --name= --class= --insurer= --start=YYYY-MM-DD --end=YYYY-MM-DD --premium= [--levies=] [--limit=] [--excess=] [--broker=] [--number=] [--basis=revenue|headcount|asset_value|vehicles|fixed] [--entity=] [--claims-made] --actor=',
  renew: '<policy> --code= --premium= [--levies=] [--insurer=] [--number=] [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--limit=] [--excess=] --actor=',
  disclose: '<policy> [--to=] [--on=YYYY-MM-DD] --actor=',
  'log-change': '--class= --description= [--entity=] [--on=YYYY-MM-DD] --actor=',
  'add-asset': '--entity= --policy= --name= --kind=building|contents|plant|stock|vehicle|business_interruption|other --declared= [--replacement=] [--location=] [--registration=] [--code=] --actor=',
  value: '<asset> --replacement= [--valuer=] [--on=YYYY-MM-DD] --actor=',
  declare: '<asset> --declared= --actor=',
  'declare-metrics': '<entity> [--revenue=] [--headcount=] [--year=] --actor=',
  'log-claim': '--policy= --description= --occurred=YYYY-MM-DD [--discovered=YYYY-MM-DD] [--entity=] [--asset=] [--reserve=] [--code=] --actor=',
  'notify-claim': '<claim> --number= [--on=YYYY-MM-DD] --actor=',
  'claim-update': '<claim> --note= [--reserve=] [--paid=] [--on=YYYY-MM-DD] --actor=',
  'close-claim': '<claim> --outcome=paid|declined|withdrawn --note= [--paid=] [--on=YYYY-MM-DD] --actor=',
  'add-contractor': '--name= [--trade=] [--entity=] [--required=] [--email=] [--code=] --actor=',
  certificate: '<contractor> --limit= --expires=YYYY-MM-DD [--insurer=] [--number=] [--received=YYYY-MM-DD] --actor=',
  import: 'origami [--policies=policies.csv] [--claims=claims.csv] [--values=values.csv] [--dry-run] --actor=',
  export: '--out=<new-file.json>',
  'renewal-submission': '<policy>',
  'claim-notification': '<claim>',
  'cert-request': '<contractor>',
  'allocation-statement': '',
  'weekly-review': '',
  help: '',
};

const mutating = new Set(['add-entity', 'add-policy', 'renew', 'disclose', 'log-change', 'add-asset', 'value', 'declare', 'declare-metrics', 'log-claim',
  'notify-claim', 'claim-update', 'close-claim', 'add-contractor', 'certificate', 'import']);
const CLASSES = ['property', 'liability', 'motor', 'cyber', 'directors_officers', 'professional_indemnity', 'marine_transit', 'management_liability', 'trade_credit', 'other'];
const PREFIX = { property: 'PRP', liability: 'PL', motor: 'MV', cyber: 'CYB', directors_officers: 'DO', professional_indemnity: 'PI', marine_transit: 'MT',
  management_liability: 'ML', trade_credit: 'TC', other: 'OTH' };
const KINDS = ['building', 'contents', 'plant', 'stock', 'vehicle', 'business_interruption', 'other'];
const BASES = ['revenue', 'headcount', 'asset_value', 'vehicles', 'fixed'];
const TABLES = ['entities', 'policies', 'assets', 'changes', 'claims', 'claim_notes', 'contractors', 'certificates', 'imports', 'activity'];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const addYear = (d) => { const [y, m, dd] = d.split('-'); return `${Number(y) + 1}-${m}-${dd === '29' && m === '02' ? '28' : dd}`; };
function need(v, label) {
  if (typeof v !== 'string' || !v.trim()) throw Error(`--${label} is required`);
  return v.trim();
}
function date(v, label, { past = false } = {}) {
  v = need(v, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw Error(`--${label} needs a real YYYY-MM-DD date`);
  if (past && v > today()) throw Error(`--${label} cannot be in the future`);
  return v;
}
const dayOr = (v, label) => (v === undefined ? today() : date(v, label, { past: true }));
function one(v, values, label) {
  if (!values.includes(v)) throw Error(`--${label} must be one of ${values.join(', ')}`);
  return v;
}
// Dollars in, cents out. Accepts 41200, 41,200, $41200.50 and 2.5m.
function cents(v, label) {
  const s = need(String(v === true ? '' : v ?? ''), label).replace(/[$,\s]/g, '').toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) throw Error(`--${label} must be an amount in dollars, like 41200 or 2.5m`);
  return Math.round(Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1) * 100);
}
const optCents = (v, label) => (v === undefined ? null : cents(v, label));
function int(v, label, lo = 0, hi = 10_000_000) {
  const n = Number(need(String(v), label));
  if (!Number.isInteger(n) || n < lo || n > hi) throw Error(`--${label} must be a whole number from ${lo} to ${hi}`);
  return n;
}
const dollars = (c) => (c === null || c === undefined ? '' : `$${Math.round(Number(c) / 100).toLocaleString('en-NZ')}`);

function parse(args) {
  const pos = [];
  const f = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) { pos.push(arg); continue; }
    const [key, ...rest] = arg.slice(2).split('=');
    if (Object.hasOwn(f, key)) throw Error(`Duplicate flag --${key}`);
    f[key] = rest.length ? rest.join('=') : true;
  }
  const cmd = pos.shift() || 'help';
  if (!Object.hasOwn(usage, cmd)) throw Error(`Unknown command "${cmd}". Run: npm run cover -- help`);
  const allowed = new Set(['json', ...[...usage[cmd].matchAll(/--([a-z-]+)/g)].map((m) => m[1])]);
  for (const k of Object.keys(f)) if (!allowed.has(k)) throw Error(`Unknown flag --${k} for ${cmd}. Usage: ${cmd} ${usage[cmd]}`);
  for (const b of ['json', 'dry-run', 'claims-made']) if (f[b] !== undefined && f[b] !== true) throw Error(`--${b} is a boolean flag`);
  if (Object.hasOwn(reads, cmd) && pos.length) throw Error(`Usage: ${cmd} takes no arguments`);
  return { cmd, pos, f };
}

async function log(db, actor, command, recordId, detail) {
  await db.query('insert into activity (actor, command, record_id, detail) values ($1,$2,$3,$4)', [actor, command, recordId, detail]);
}

// Match by code (case-insensitive, then prefix) or by every word appearing in the name. Ambiguous -> list and fail.
async function findOne(db, table, q, label, { extra = '', where = 'true', nameCol = 'name' } = {}) {
  q = need(q, label);
  const exact = await db.query(`select * from ${table} where lower(code) = lower($1) and ${where}`, [q]);
  if (exact.length === 1) return exact[0];
  const all = await db.query(`select *, lower(code || ' ' || ${nameCol} ${extra}) as label from ${table} where ${where} order by code`);
  const words = q.toLowerCase().split(/\s+/);
  const rows = all.filter((r) => r.code.toLowerCase().startsWith(q.toLowerCase()) || words.every((w) => r.label.includes(w)));
  if (!rows.length) throw Error(`No matching ${label} for "${q}"`);
  if (rows.length > 1) throw Error(`Ambiguous: "${q}" matches ${rows.map((r) => `${r.code} (${truncate(r[nameCol], 40)})`).join('; ')}`);
  return rows[0];
}
const findEntity = (db, q) => findOne(db, 'entities', q, 'entity');
const findPolicy = (db, q) => findOne(db, 'policies', q, 'policy', { extra: `|| ' ' || coalesce(policy_number, '') || ' ' || class || ' ' || insurer` });
const findAsset = (db, q) => findOne(db, 'assets', q, 'asset', { extra: `|| ' ' || coalesce(location, '') || ' ' || coalesce(registration, '')` });
const findContractor = (db, q) => findOne(db, 'contractors', q, 'contractor', { extra: `|| ' ' || coalesce(trade, '')` });
const findClaim = (db, q) => findOne(db, 'claims', q, 'claim', { nameCol: 'description', extra: `|| ' ' || coalesce(claim_number, '')` });
async function nextCode(db, table, prefix, width) {
  const rows = await db.query(`select code from ${table} where code like $1`, [`${prefix}%`]);
  const n = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0) + 1;
  return prefix + String(n).padStart(width, '0');
}

// ------------------------------------------------------------------ detail

async function policyDetail(db, q) {
  const p = await findPolicy(db, q);
  const r = (await db.query('select * from policy_register where id = $1', [p.id]))[0];
  return {
    policy: { code: r.code, name: r.name, class: r.class, insurer: r.insurer, broker: r.broker, policy_number: r.policy_number,
      period: `${r.period_start} to ${r.period_end}`, claims_made: r.claims_made, limit: dollars(r.limit_cents), excess: dollars(r.excess_cents),
      premium: dollars(r.premium_cents), levies: dollars(r.levies_cents), allocation_basis: r.allocation_basis, cover: r.cover, days_to_expiry: r.days_to_expiry,
      disclosure_sent_on: r.disclosure_sent_on, renewed_from: r.renewed_from, renewed_into: r.renewed_into, notes: p.notes },
    attention: await db.query(`select severity, rule, detail from programme_attention where item = $1 order by severity`, [r.code]),
    assets: await db.query(`select code, entity, kind, name, ${$('declared_cents')} as declared, pct_declared::float as pct, valued_on from asset_schedule where policy = $1 and active order by kind, code`, [r.code]),
    claims: await db.query(`select code, occurred_on, description, ${$('reserve_cents')} as reserve, ${$('paid_cents')} as paid, status from claim_register where policy = $1 order by occurred_on desc`, [r.code]),
    changes: await db.query(`select code, occurred_on, description, disclosed_on from changes where class = $1 and occurred_on >= $2 order by occurred_on`, [r.class, r.period_start]),
    allocation: await db.query(`select entity, share_pct::float as share_pct, ${$('allocated_cents')} as allocated from premium_allocation where policy = $1 and (base is null or base > 0) order by entity`, [r.code]),
  };
}

async function claimDetail(db, q) {
  const c = await findClaim(db, q);
  const r = (await db.query('select * from claim_register where id = $1', [c.id]))[0];
  delete r.id;
  return {
    claim: { ...r, reserve_cents: undefined, paid_cents: undefined, excess_cents: undefined, reserve: dollars(r.reserve_cents), paid: dollars(r.paid_cents), excess: dollars(r.excess_cents) },
    notes: await db.query('select noted_on, note, recorded_by from claim_notes where claim_id = $1 order by noted_on, created_at', [c.id]),
    activity: await db.query('select created_at, actor, command, detail from activity where record_id = $1 order by id', [c.code]),
  };
}

async function entityDetail(db, q) {
  const e = await findEntity(db, q);
  return {
    entity: { code: e.code, name: e.name, kind: e.kind, country: e.country, revenue: dollars(e.revenue_cents), headcount: e.headcount, metrics_year: e.metrics_year },
    allocation: await db.query(`select policy, class, basis, share_pct::float as share_pct, ${$('allocated_cents')} as allocated from premium_allocation where entity = $1 order by policy`, [e.code]),
    assets: await db.query(`select code, policy, kind, name, ${$('declared_cents')} as declared, pct_declared::float as pct from asset_schedule where entity = $1 and active order by code`, [e.code]),
    claims: await db.query(`select code, policy, occurred_on, description, status from claim_register where entity = $1 order by occurred_on desc`, [e.code]),
    contractors: await db.query(`select code, name, state, expires_on from contractor_cover where entity = $1 and active order by code`, [e.code]),
  };
}

async function contractorDetail(db, q) {
  const k = await findContractor(db, q);
  const r = (await db.query('select * from contractor_cover where id = $1', [k.id]))[0];
  return {
    contractor: { code: r.code, name: r.name, trade: r.trade, entity: r.entity, email: k.email, active: r.active, required: dollars(r.required_pl_cents), state: r.state },
    certificates: await db.query(`select kind, insurer, policy_number, ${$('limit_cents')} as limit_amt, expires_on, received_on, recorded_by from certificates where contractor_id = $1 order by expires_on desc`, [k.id]),
  };
}

// ------------------------------------------------------------------ writes

async function addEntity(db, f, actor) {
  const code = need(f.code, 'code').toUpperCase();
  if ((await db.query('select 1 from entities where code = $1', [code])).length) throw Error(`Entity ${code} already exists`);
  const name = need(f.name, 'name');
  if ((await db.query('select code from entities where lower(name) = lower($1)', [name])).length) throw Error(`${name} is already in the group`);
  const kind = one(f.kind || 'company', ['company', 'trust', 'division', 'partnership'], 'kind');
  const country = String(f.country || 'NZ').toUpperCase();
  const revenue = optCents(f.revenue, 'revenue');
  const headcount = f.headcount === undefined ? null : int(f.headcount, 'headcount');
  await db.query('insert into entities (code, name, kind, country, revenue_cents, headcount, metrics_year) values ($1,$2,$3,$4,$5,$6,$7)',
    [code, name, kind, country, revenue, headcount, Number(today().slice(0, 4))]);
  await log(db, actor, 'add-entity', code, `${name} (${kind}, ${country})`);
  return { entity: code, name, revenue: dollars(revenue), headcount };
}

async function addPolicy(db, f, actor) {
  const code = need(f.code, 'code').toUpperCase();
  if ((await db.query('select 1 from policies where code = $1', [code])).length) throw Error(`Policy ${code} already exists`);
  const cls = one(need(f.class, 'class'), CLASSES, 'class');
  const start = date(f.start, 'start');
  const end = date(f.end, 'end');
  if (end <= start) throw Error('--end must be after --start');
  const basis = one(f.basis || 'revenue', BASES, 'basis');
  const fixed = basis === 'fixed' ? (await findEntity(db, need(f.entity, 'entity'))).id : null;
  await db.query(`insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, claims_made, limit_cents, excess_cents,
      premium_cents, levies_cents, allocation_basis, fixed_entity_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
  [code, need(f.name, 'name'), cls, need(f.insurer, 'insurer'), f.broker || null, f.number || null, start, end, f['claims-made'] === true,
    optCents(f.limit, 'limit'), optCents(f.excess, 'excess') ?? 0, cents(f.premium, 'premium'), optCents(f.levies, 'levies') ?? 0, basis, fixed]);
  await log(db, actor, 'add-policy', code, `${cls} with ${f.insurer}, ${start} to ${end}`);
  return { policy: code, class: cls, period: `${start} to ${end}`, premium: dollars(cents(f.premium, 'premium')) };
}

// A renewal cannot be recorded until the renewal information went to the insurer and every change
// of that class is disclosed. That is the duty of disclosure, enforced at the one moment it matters.
async function renew(db, q, f, actor) {
  const old = await findPolicy(db, q);
  if (old.status !== 'active') throw Error(`${old.code} is ${old.status}; only an active policy renews`);
  const into = (await db.query('select code from policies where renewed_from_id = $1', [old.id]))[0];
  if (into) throw Error(`${old.code} was already renewed into ${into.code}`);
  if (!old.disclosure_sent_on || old.disclosure_sent_on < old.period_start) {
    throw Error(`${old.code}: the renewal information has not been sent. Draft it (renewal-submission ${old.code}), send it, then record it with: disclose ${old.code}`);
  }
  const open = await db.query('select code, description from changes where class = $1 and disclosed_on is null order by occurred_on', [old.class]);
  if (open.length) throw Error(`${old.code}: ${open.length} change(s) not yet told to the insurer (${open.map((c) => c.code).join(', ')}). Disclose them first: disclose ${old.code}`);
  const code = need(f.code, 'code').toUpperCase();
  if ((await db.query('select 1 from policies where code = $1', [code])).length) throw Error(`Policy ${code} already exists`);
  const start = f.start ? date(f.start, 'start') : old.period_end;
  const end = f.end ? date(f.end, 'end') : addYear(start);
  if (end <= start) throw Error('--end must be after --start');
  const premium = cents(f.premium, 'premium');
  const name = old.name.replace(/\b(\d{4})(-\d{2})?\b/, (m) => (/-/.test(m) ? `${start.slice(0, 4)}-${end.slice(2, 4)}` : start.slice(0, 4)));
  await db.exec('BEGIN');
  try {
    const row = (await db.query(`insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, claims_made, limit_cents, excess_cents,
        premium_cents, levies_cents, currency, allocation_basis, fixed_entity_id, renewal_lead_days, notify_within_days, average_pct, renewed_from_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id`,
    [code, name, old.class, f.insurer || old.insurer, old.broker, f.number || old.policy_number, start, end, old.claims_made,
      f.limit === undefined ? old.limit_cents : cents(f.limit, 'limit'), f.excess === undefined ? old.excess_cents : cents(f.excess, 'excess'),
      premium, f.levies === undefined ? 0 : cents(f.levies, 'levies'), old.currency, old.allocation_basis, old.fixed_entity_id,
      old.renewal_lead_days, old.notify_within_days, old.average_pct, old.id]))[0];
    await db.query(`update policies set status = 'renewed' where id = $1`, [old.id]);
    await db.query('update assets set policy_id = $2 where policy_id = $1 and active', [old.id, row.id]);
    await log(db, actor, 'renew', code, `renewed ${old.code} with ${f.insurer || old.insurer}, ${start} to ${end}`);
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
  const prior = Number(old.premium_cents) + Number(old.levies_cents);
  const now = premium + (f.levies === undefined ? 0 : cents(f.levies, 'levies'));
  return { renewed: old.code, into: code, period: `${start} to ${end}`, premium: dollars(now), prior: dollars(prior),
    change_pct: prior ? Math.round((1000 * (now - prior)) / prior) / 10 : null };
}

async function disclose(db, q, f, actor) {
  const p = await findPolicy(db, q);
  if (p.status !== 'active') throw Error(`${p.code} is ${p.status}; disclose against the policy that is renewing`);
  const on = dayOr(f.on, 'on');
  const to = f.to || p.broker || p.insurer;
  const changed = await db.query(`update changes set disclosed_on = $2, disclosed_to = $3 where class = $1 and disclosed_on is null and occurred_on <= $2 returning code`, [p.class, on, to]);
  await db.query('update policies set disclosure_sent_on = $2 where id = $1', [p.id, on]);
  await log(db, actor, 'disclose', p.code, `renewal information sent to ${to} on ${on}; changes disclosed: ${changed.map((c) => c.code).join(', ') || 'none'}`);
  return { policy: p.code, sent_to: to, sent_on: on, changes_disclosed: changed.map((c) => c.code) };
}

async function logChange(db, f, actor, { cls, description, entityId, on } = {}) {
  cls = cls || one(need(f.class, 'class'), CLASSES, 'class');
  description = description || need(f.description, 'description');
  entityId = entityId === undefined ? (f.entity ? (await findEntity(db, f.entity)).id : null) : entityId;
  on = on || dayOr(f.on, 'on');
  const code = await nextCode(db, 'changes', 'CH-', 3);
  await db.query('insert into changes (code, entity_id, class, description, occurred_on) values ($1,$2,$3,$4,$5)', [code, entityId, cls, description, on]);
  await log(db, actor, 'log-change', code, `${cls}: ${description}`);
  const p = (await db.query(`select code, period_end from policy_register where class = $1 and status = 'active' and renewed_into is null order by period_end limit 1`, [cls]))[0];
  return { change: code, class: cls, description, occurred_on: on,
    next: p ? `Tell ${p.code}'s insurer before ${p.period_end}: it goes in the renewal information, or ask the broker for an endorsement now.` : `No active ${cls} policy: ask the broker whether this needs cover.` };
}

async function addAsset(db, f, actor) {
  const e = await findEntity(db, f.entity);
  const p = await findPolicy(db, f.policy);
  const kind = one(need(f.kind, 'kind'), KINDS, 'kind');
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'assets', kind === 'vehicle' ? 'V-' : 'A-', 3);
  if ((await db.query('select 1 from assets where code = $1', [code])).length) throw Error(`Asset ${code} already exists`);
  const declared = cents(f.declared, 'declared');
  const replacement = optCents(f.replacement, 'replacement');
  await db.query(`insert into assets (code, entity_id, policy_id, name, kind, location, registration, declared_cents, replacement_cents, valued_on)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [code, e.id, p.id, need(f.name, 'name'), kind, f.location || null, f.registration || null, declared, replacement, replacement === null ? null : today()]);
  await log(db, actor, 'add-asset', code, `${f.name} on ${p.code}, declared ${dollars(declared)}`);
  const change = await logChange(db, f, actor, { cls: p.class, description: `Added ${f.name} (${code}) to ${p.code} at ${dollars(declared)}`, entityId: e.id, on: today() });
  return { asset: code, policy: p.code, declared: dollars(declared), change: change.change, next: change.next };
}

async function value(db, q, f, actor) {
  const a = await findAsset(db, q);
  const replacement = cents(f.replacement, 'replacement');
  const on = dayOr(f.on, 'on');
  await db.query('update assets set replacement_cents = $2, valued_on = $3, valuer = $4 where id = $1', [a.id, replacement, on, f.valuer || null]);
  await log(db, actor, 'value', a.code, `replacement value ${dollars(replacement)} on ${on}${f.valuer ? ` by ${f.valuer}` : ''}`);
  const s = (await db.query('select pct_declared::float as pct, average_pct::float as avg from asset_schedule where id = $1', [a.id]))[0];
  return { asset: a.code, declared: dollars(a.declared_cents), replacement: dollars(replacement), pct_declared: s.pct,
    ...(s.pct !== null && s.pct < s.avg ? { warning: `declared at ${s.pct}% against an average clause of ${s.avg}%: raise the sum insured to at least ${dollars(Math.ceil((replacement * s.avg) / 100))} (declare ${a.code} --declared=...)` } : {}) };
}

async function declare(db, q, f, actor) {
  const a = await findAsset(db, q);
  const declared = cents(f.declared, 'declared');
  if (declared === Number(a.declared_cents)) throw Error(`${a.code} is already declared at ${dollars(declared)}`);
  const p = a.policy_id ? (await db.query('select code, class from policies where id = $1', [a.policy_id]))[0] : null;
  await db.query('update assets set declared_cents = $2 where id = $1', [a.id, declared]);
  await log(db, actor, 'declare', a.code, `declared value ${dollars(a.declared_cents)} to ${dollars(declared)}`);
  const change = p ? await logChange(db, f, actor, { cls: p.class, description: `Sum insured for ${a.name} (${a.code}) changed from ${dollars(a.declared_cents)} to ${dollars(declared)}`, entityId: a.entity_id, on: today() }) : null;
  const s = (await db.query('select pct_declared::float as pct from asset_schedule where id = $1', [a.id]))[0];
  return { asset: a.code, was: dollars(a.declared_cents), now: dollars(declared), pct_declared: s.pct, change: change?.change || '', next: change?.next || '' };
}

async function declareMetrics(db, q, f, actor) {
  const e = await findEntity(db, q);
  if (f.revenue === undefined && f.headcount === undefined) throw Error('Give --revenue=, --headcount= or both');
  const revenue = f.revenue === undefined ? e.revenue_cents : cents(f.revenue, 'revenue');
  const headcount = f.headcount === undefined ? e.headcount : int(f.headcount, 'headcount');
  const year = f.year === undefined ? Number(today().slice(0, 4)) : int(f.year, 'year', 2000, 2100);
  await db.query('update entities set revenue_cents = $2, headcount = $3, metrics_year = $4 where id = $1', [e.id, revenue, headcount, year]);
  await log(db, actor, 'declare-metrics', e.code, `revenue ${dollars(revenue)}, headcount ${headcount ?? 'not set'} for ${year}`);
  return { entity: e.code, revenue: dollars(revenue), headcount, year };
}

async function logClaim(db, f, actor) {
  const p = await findPolicy(db, f.policy);
  const occurred = date(f.occurred, 'occurred', { past: true });
  const discovered = f.discovered ? date(f.discovered, 'discovered', { past: true }) : occurred;
  if (discovered < occurred) throw Error('--discovered is before --occurred');
  const entity = f.entity ? (await findEntity(db, f.entity)).id : null;
  const asset = f.asset ? await findAsset(db, f.asset) : null;
  if (asset && asset.policy_id && asset.policy_id !== p.id) throw Error(`${asset.code} is insured under another policy, not ${p.code}`);
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'claims', 'CL-', 3);
  const reserve = optCents(f.reserve, 'reserve') ?? 0;
  await db.query(`insert into claims (code, policy_id, entity_id, asset_id, description, occurred_on, discovered_on, reserve_cents) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [code, p.id, entity ?? asset?.entity_id ?? null, asset?.id || null, need(f.description, 'description'), occurred, discovered, reserve]);
  await log(db, actor, 'log-claim', code, `${f.description} on ${p.code}, occurred ${occurred}`);
  const r = (await db.query('select notify_by, outside_period from claim_register where code = $1', [code]))[0];
  const inPeriod = p.claims_made ? discovered >= p.period_start && discovered <= p.period_end : !r.outside_period;
  return { claim: code, policy: p.code, insurer: p.insurer, notify_by: r.notify_by,
    ...(inPeriod ? {} : { warning: `${p.claims_made ? 'found' : 'occurred'} outside ${p.code}'s period (${p.period_start} to ${p.period_end}): check which policy responds before notifying` }),
    ...(reserve && reserve <= Number(p.excess_cents) ? { note: `the estimate is within the ${dollars(p.excess_cents)} excess; notify anyway if the policy requires it` } : {}),
    next: `Tell ${p.broker || p.insurer} by ${r.notify_by} (draft it: claim-notification ${code}), then record the claim number: notify-claim ${code} --number=...` };
}

async function notifyClaim(db, q, f, actor) {
  const c = await findClaim(db, q);
  if (c.notified_on) throw Error(`${c.code} was notified on ${c.notified_on} (${c.claim_number})`);
  const on = dayOr(f.on, 'on');
  if (on < c.discovered_on) throw Error(`--on ${on} is before the loss was found (${c.discovered_on})`);
  await db.query('update claims set notified_on = $2, claim_number = $3, last_update_on = $2 where id = $1', [c.id, on, need(f.number, 'number')]);
  await log(db, actor, 'notify-claim', c.code, `notified ${on}, claim number ${f.number}`);
  const r = (await db.query('select days_to_notify, notify_within_days from claim_register where id = $1', [c.id]))[0];
  return { claim: c.code, notified_on: on, claim_number: f.number, days_after_found: r.days_to_notify, late: r.days_to_notify > r.notify_within_days };
}

async function claimUpdate(db, q, f, actor) {
  const c = await findClaim(db, q);
  if (c.status !== 'open') throw Error(`${c.code} is ${c.status}`);
  const on = dayOr(f.on, 'on');
  const reserve = f.reserve === undefined ? Number(c.reserve_cents) : cents(f.reserve, 'reserve');
  const paid = f.paid === undefined ? Number(c.paid_cents) : cents(f.paid, 'paid');
  await db.query('insert into claim_notes (claim_id, noted_on, note, recorded_by) values ($1,$2,$3,$4)', [c.id, on, need(f.note, 'note'), actor]);
  await db.query('update claims set reserve_cents = $2, paid_cents = $3, last_update_on = greatest(coalesce(last_update_on, $4), $4) where id = $1', [c.id, reserve, paid, on]);
  await log(db, actor, 'claim-update', c.code, f.note);
  return { claim: c.code, noted_on: on, reserve: dollars(reserve), paid: dollars(paid) };
}

async function closeClaim(db, q, f, actor) {
  const c = await findClaim(db, q);
  if (c.status !== 'open') throw Error(`${c.code} is already ${c.status}`);
  const outcome = one(need(f.outcome, 'outcome'), ['paid', 'declined', 'withdrawn'], 'outcome');
  if (outcome !== 'withdrawn' && !c.notified_on) throw Error(`${c.code} was never notified to the insurer; it cannot be ${outcome}. Record the notification first: notify-claim ${c.code}`);
  const paid = f.paid === undefined ? Number(c.paid_cents) : cents(f.paid, 'paid');
  if (outcome === 'paid' && !paid) throw Error('--paid is required when the outcome is paid');
  const on = dayOr(f.on, 'on');
  await db.query('insert into claim_notes (claim_id, noted_on, note, recorded_by) values ($1,$2,$3,$4)', [c.id, on, need(f.note, 'note'), actor]);
  await db.query(`update claims set status = $2, paid_cents = $3, reserve_cents = 0, closed_on = $4, last_update_on = $4 where id = $1`, [c.id, outcome, paid, on]);
  await log(db, actor, 'close-claim', c.code, `${outcome}${paid ? `, ${dollars(paid)} paid` : ''}: ${f.note}`);
  return { claim: c.code, status: outcome, paid: dollars(paid), closed_on: on };
}

async function addContractor(db, f, actor) {
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'contractors', 'CO-', 3);
  if ((await db.query('select 1 from contractors where code = $1', [code])).length) throw Error(`Contractor ${code} already exists`);
  const name = need(f.name, 'name');
  if ((await db.query('select code from contractors where lower(name) = lower($1)', [name])).length) throw Error(`${name} is already on the register`);
  const entity = f.entity ? (await findEntity(db, f.entity)).id : null;
  const required = f.required === undefined ? 1000000000 : cents(f.required, 'required');
  await db.query('insert into contractors (code, name, trade, entity_id, required_pl_cents, email) values ($1,$2,$3,$4,$5,$6)', [code, name, f.trade || null, entity, required, f.email || null]);
  await log(db, actor, 'add-contractor', code, `${name}, public liability required ${dollars(required)}`);
  return { contractor: code, name, required: dollars(required), next: `Ask for their certificate of currency (cert-request ${code}) and record it with: certificate ${code}` };
}

async function certificate(db, q, f, actor) {
  const k = await findContractor(db, q);
  const limit = cents(f.limit, 'limit');
  const expires = date(f.expires, 'expires');
  const received = f.received ? date(f.received, 'received', { past: true }) : today();
  if (expires < received) throw Error(`--expires ${expires} is before it was received (${received}): ask for the current certificate`);
  await db.query(`insert into certificates (contractor_id, insurer, policy_number, limit_cents, expires_on, received_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7)`,
    [k.id, f.insurer || null, f.number || null, limit, expires, received, actor]);
  await log(db, actor, 'certificate', k.code, `public liability ${dollars(limit)} to ${expires}`);
  const r = (await db.query('select state from contractor_cover where id = $1', [k.id]))[0];
  return { contractor: k.code, limit: dollars(limit), expires_on: expires, state: r.state,
    ...(limit < Number(k.required_pl_cents) ? { warning: `below the ${dollars(k.required_pl_cents)} you require: keep them off site or agree a lower limit in writing` } : {}) };
}

// ------------------------------------------------------------------ import

function normDate(v, label) {
  v = String(v || '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return date(`${m[1]}-${m[2]}-${m[3]}`, label);
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // NZ and AU exports: day first
  if (m) return date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, label);
  throw Error(`${label}: "${v}" is not a date this importer reads (use YYYY-MM-DD or DD/MM/YYYY)`);
}
function money(v) {
  const s = String(v ?? '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw Error(`"${v}" is not an amount`);
  return Math.round(n * 100);
}
function classOf(v) {
  const s = String(v || '').toLowerCase();
  if (/cyber/.test(s)) return 'cyber';
  if (/d\s*&\s*o|directors/.test(s)) return 'directors_officers';
  if (/management liab/.test(s)) return 'management_liability';
  if (/professional|e\s*&\s*o|errors|\bpi\b/.test(s)) return 'professional_indemnity';
  if (/marine|transit|cargo/.test(s)) return 'marine_transit';
  if (/auto|motor|fleet|vehicle/.test(s)) return 'motor';
  if (/trade credit|credit insurance/.test(s)) return 'trade_credit';
  if (/property|isr|material damage|business interruption|industrial special/.test(s)) return 'property';
  if (/liab/.test(s)) return 'liability';
  return 'other';
}
function statusOf(v, paid) {
  const s = String(v || '').toLowerCase();
  if (!s || /open|reopen|pending/.test(s)) return 'open';
  if (/den|declin/.test(s)) return 'declined';
  if (/withdr/.test(s)) return 'withdrawn';
  return paid > 0 ? 'paid' : 'withdrawn';
}

// Origami Risk reports export to Excel or CSV. Three reports: the policy schedule, the claims list
// and the schedule of values (locations). Column names vary by how each report was built; the common
// ones are read here and Claude Code can map the rest.
async function importOrigami(db, f, actor) {
  if (!f.policies && !f.claims && !f.values) throw Error('Give --policies=<file.csv>, --claims=<file.csv>, --values=<file.csv> or any of them');
  const problems = [];
  const entities = await db.query('select id, lower(code) as code, lower(name) as name from entities');
  const entityOf = (v, required) => {
    const s = String(v || '').trim().toLowerCase();
    if (!s) { if (required) throw Error('no entity or named insured'); return null; }
    const hit = entities.find((e) => e.code === s || e.name === s);
    if (!hit) throw Error(`no entity "${v}" (add it first, or map the named insured to one of yours)`);
    return hit.id;
  };
  const texts = [];
  const read = (file, label) => { const t = fs.readFileSync(path.resolve(need(file, label)), 'utf8'); texts.push(t); return parseCsv(t); };
  const policyRows = [];
  if (f.policies) read(f.policies, 'policies').forEach((row, n) => {
    const line = n + 2;
    try {
      const number = String(pick(row, 'policy number', 'policy no', 'policy #')).trim();
      if (!number) throw Error('no policy number');
      const start = normDate(pick(row, 'effective date', 'inception date', 'period start', 'start date'), `policies row ${line} start`);
      const end = normDate(pick(row, 'expiration date', 'expiry date', 'period end', 'end date'), `policies row ${line} end`);
      if (!start || !end || end <= start) throw Error('no valid policy period');
      const insurer = String(pick(row, 'carrier', 'insurer', 'underwriter')).trim();
      if (!insurer) throw Error('no carrier or insurer');
      const coverage = pick(row, 'line of coverage', 'coverage', 'policy type', 'class');
      policyRows.push({ number, start, end, insurer, cls: classOf(coverage), name: String(coverage || 'Imported policy').trim(),
        premium: money(pick(row, 'premium', 'annual premium', 'written premium')) ?? 0, limit: money(pick(row, 'limit', 'each occurrence limit', 'aggregate limit')),
        excess: money(pick(row, 'deductible', 'excess', 'retention')) ?? 0, broker: String(pick(row, 'broker', 'agent')).trim() || null,
        entity: entityOf(pick(row, 'named insured', 'entity', 'insured'), false) });
    } catch (e) { problems.push(`policies row ${line}: ${e.message}`); }
  });
  const existing = await db.query('select id, code, policy_number, period_start, period_end, class, claims_made from policies');
  const known = (number, start) => existing.find((p) => p.policy_number === number && p.period_start === start);
  // A claim or value row names a policy number; renewals reuse the number, so the date picks the year.
  const policyFor = (number, on) => {
    const all = [...existing, ...policyRows.map((p) => ({ policy_number: p.number, period_start: p.start, period_end: p.end, pending: p }))]
      .filter((p) => p.policy_number === number && (!on || (p.period_start <= on && p.period_end >= on)));
    if (!all.length) throw Error(`no policy ${number}${on ? ` in force on ${on}` : ''}`);
    return all.sort((a, b) => (a.period_start < b.period_start ? 1 : -1))[0];
  };
  const claimRows = [];
  if (f.claims) read(f.claims, 'claims').forEach((row, n) => {
    const line = n + 2;
    try {
      const number = String(pick(row, 'claim number', 'claim no', 'claim #')).trim();
      if (!number) throw Error('no claim number');
      const occurred = normDate(pick(row, 'date of loss', 'loss date', 'incident date'), `claims row ${line} date of loss`);
      if (!occurred) throw Error('no date of loss');
      const reported = normDate(pick(row, 'date reported', 'report date', 'reported date', 'date reported to carrier'), `claims row ${line} date reported`);
      const paid = money(pick(row, 'total paid', 'paid', 'paid to date')) ?? 0;
      const incurred = money(pick(row, 'total incurred', 'incurred')) ?? paid;
      const status = statusOf(pick(row, 'claim status', 'status'), paid);
      claimRows.push({ number, occurred, reported, paid, reserve: status === 'open' ? Math.max(incurred - paid, 0) : 0, status,
        description: String(pick(row, 'loss description', 'description', 'accident description', 'cause')).trim() || 'Imported claim',
        policy: policyFor(String(pick(row, 'policy number', 'policy no')).trim(), occurred), entity: entityOf(pick(row, 'entity', 'named insured', 'location'), false) });
    } catch (e) { problems.push(`claims row ${line}: ${e.message}`); }
  });
  const valueRows = [];
  if (f.values) read(f.values, 'values').forEach((row, n) => {
    const line = n + 2;
    try {
      const name = String(pick(row, 'location name', 'location', 'name', 'site')).trim();
      if (!name) throw Error('no location name');
      const entity = entityOf(pick(row, 'entity', 'named insured', 'owner'), true);
      const number = String(pick(row, 'policy number', 'policy no')).trim();
      const policy = number ? policyFor(number, today()) : null;
      const address = String(pick(row, 'address', 'street address')).trim() || null;
      const valued = normDate(pick(row, 'valuation date', 'appraisal date', 'valued on'), `values row ${line} valuation date`);
      const parts = [['building', ['building value', 'building', 'buildings']], ['contents', ['contents value', 'contents', 'contents and fit-out']],
        ['plant', ['plant value', 'plant and machinery', 'machinery', 'equipment']], ['stock', ['stock value', 'stock', 'inventory']],
        ['business_interruption', ['bi value', 'business interruption', 'business income', 'gross profit']]];
      let any = false;
      for (const [kind, cols] of parts) {
        const amount = money(pick(row, ...cols));
        if (!amount) continue;
        any = true;
        valueRows.push({ entity, policy, kind, name: `${name} ${kind.replace('_', ' ')}`, location: address, declared: amount, valued });
      }
      if (!any) throw Error('no building, contents, plant, stock or business interruption value');
    } catch (e) { problems.push(`values row ${line}: ${e.message}`); }
  });
  const hash = createHash('sha256').update(texts.join('\n--\n')).digest('hex');
  const already = (await db.query(`select created_at from imports where source = 'origami' and file_hash = $1`, [hash]))[0];
  const summary = { policy_rows: policyRows.length, new_policies: policyRows.filter((p) => !known(p.number, p.start)).length, claim_rows: claimRows.length,
    value_rows: valueRows.length, problems, already_imported: already ? String(already.created_at) : false, dry_run: Boolean(f['dry-run']) };
  if (problems.length || f['dry-run'] || already) {
    if (problems.length && !f['dry-run']) throw Error(`Nothing imported. Fix these first:\n  ${problems.join('\n  ')}`);
    if (already && !f['dry-run']) throw Error(`These files were imported on ${already.created_at}. Nothing imported twice.`);
    return summary;
  }
  await db.exec('BEGIN');
  try {
    let policiesIn = 0;
    for (const p of policyRows.sort((a, b) => (a.start < b.start ? -1 : 1))) {
      if (known(p.number, p.start)) continue;
      const prefix = `${PREFIX[p.cls]}-${p.start.slice(2, 4)}`;
      let code = prefix;
      for (let i = 2; (await db.query('select 1 from policies where code = $1', [code])).length; i++) code = `${prefix}-${i}`;
      const prev = existing.filter((x) => x.policy_number === p.number && x.period_end <= p.start).sort((a, b) => (a.period_end < b.period_end ? 1 : -1))[0];
      const row = (await db.query(`insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, limit_cents, excess_cents, premium_cents,
          allocation_basis, fixed_entity_id, renewed_from_id, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [code, p.name, p.cls, p.insurer, p.broker, p.number, p.start, p.end, p.limit, p.excess, p.premium, p.entity ? 'fixed' : 'revenue', p.entity, prev?.id || null,
        p.end < today() ? 'renewed' : 'active']))[0];
      if (prev) await db.query(`update policies set status = 'renewed' where id = $1`, [prev.id]);
      const rec = { id: row.id, code, policy_number: p.number, period_start: p.start, period_end: p.end, class: p.cls };
      existing.push(rec);
      p.id = row.id;
      policiesIn++;
    }
    // Imported periods that ended with no later period on file stay active, so the lapse check sees them.
    await db.query(`update policies p set status = 'active' where p.status = 'renewed' and not exists (select 1 from policies n where n.renewed_from_id = p.id)`);
    const idOf = (ref) => ref.id || ref.pending?.id;
    let claimsIn = 0;
    const skipped = [];
    for (const c of claimRows) {
      if ((await db.query('select 1 from claims where claim_number = $1', [c.number])).length) { skipped.push(`claim ${c.number}: already on file`); continue; }
      const code = await nextCode(db, 'claims', 'CL-', 3);
      await db.query(`insert into claims (code, policy_id, entity_id, description, occurred_on, discovered_on, notified_on, claim_number, reserve_cents, paid_cents, status, last_update_on, closed_on)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [code, idOf(c.policy), c.entity, c.description, c.occurred, c.reported || c.occurred, c.reported, c.number, c.reserve, c.paid, c.status, c.reported, c.status === 'open' ? null : c.reported || c.occurred]);
      claimsIn++;
    }
    let assetsIn = 0;
    for (const v of valueRows) {
      const code = await nextCode(db, 'assets', 'A-', 3);
      await db.query(`insert into assets (code, entity_id, policy_id, name, kind, location, declared_cents, replacement_cents, valued_on, valuer) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [code, v.entity, v.policy ? idOf(v.policy) : null, v.name, v.kind, v.location, v.declared, v.valued ? v.declared : null, v.valued, v.valued ? 'imported from Origami' : null]);
      assetsIn++;
    }
    await db.query(`insert into imports (source, file_hash, rows) values ('origami', $1, $2)`, [hash, policyRows.length + claimRows.length + valueRows.length]);
    await log(db, actor, 'import', 'origami', `${policiesIn} policies, ${claimsIn} claims, ${assetsIn} assets`);
    await db.exec('COMMIT');
    return { ...summary, policies: policiesIn, claims: claimsIn, assets: assetsIn, skipped };
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

async function exportAll(db, f) {
  const out = path.resolve(need(f.out, 'out'));
  if (fs.existsSync(out)) throw Error(`${out} already exists; choose a new file name`);
  const data = { exported_at: new Date().toISOString() };
  for (const t of TABLES) data[t] = await db.query(`select * from ${t}`);
  fs.writeFileSync(out, JSON.stringify(data, null, 2), { mode: 0o600 });
  return { file: out, tables: Object.fromEntries(TABLES.map((t) => [t, data[t].length])) };
}

// ------------------------------------------------------------------ drafts (written to drafts/, never sent)

function draftsDir() {
  const dir = path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const md = (rows) => {
  if (!rows.length) return '_None._\n';
  const cols = Object.keys(rows[0]);
  const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
  return `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`).join('\n')}\n`;
};

async function renewalSubmission(db, q) {
  const p = await findPolicy(db, q);
  const r = (await db.query('select * from policy_register where id = $1', [p.id]))[0];
  const entities = await db.query(`select code, name, country, ${$('revenue_cents')} as revenue, headcount, metrics_year as year from entities where active order by code`);
  const assets = await db.query(`select code, entity, kind, name, location, ${$('declared_cents')} as declared, valued_on from asset_schedule where policy = $1 and active order by kind, code`, [r.code]);
  const claims = await db.query(`select c.code, c.policy, c.occurred_on, c.description, ${$('c.paid_cents')} as paid, ${$('c.reserve_cents')} as reserve, c.status
    from claim_register c where c.class = $1 and c.occurred_on > current_date - 365 * 5 order by c.occurred_on desc`, [r.class]);
  const changes = await db.query(`select code, occurred_on, description, coalesce(disclosed_on::text, 'in this submission') as disclosed
    from changes where class = $1 and (disclosed_on is null or occurred_on >= $2) order by occurred_on`, [r.class, r.period_start]);
  const total = assets.reduce((s, a) => s + Number(a.declared), 0);
  const body = `# Renewal information: ${r.name}

To: ${r.broker || r.insurer}
Policy: ${r.policy_number || r.code} with ${r.insurer}, expiring ${r.period_end}

Please find the renewal information for the period from ${r.period_end}. We have set out every change since the last renewal that we believe a prudent insurer would want to know, and the claims for this class over five years.

## The insured entities

${md(entities)}
${assets.length ? `## Schedule of values (total declared $${total.toLocaleString('en-NZ')})\n\n${md(assets)}` : ''}
## Changes since the last renewal

${md(changes)}
## Claims, five years

${md(claims)}
## Anything else we know

[Any other matter that could affect the insurer's decision: new contracts, new products or markets, losses not yet claimed, legal action threatened, changes in directors or ownership.]

_Draft prepared ${today()} from the insurance programme records. Check every line before it goes: the duty to disclose sits with the business, not the broker. Once sent, record it with: npm run cover -- disclose ${r.code} --to="${r.broker || r.insurer}" --actor="..."_
`;
  const file = path.join(draftsDir(), `renewal-${r.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, policy: r.code, to: r.broker || r.insurer, changes: changes.length, undisclosed: changes.filter((c) => c.disclosed === 'in this submission').length, claims: claims.length };
}

async function claimNotification(db, q) {
  const d = await claimDetail(db, q);
  const c = d.claim;
  const p = (await db.query('select * from policies where code = $1', [c.policy]))[0];
  const e = c.entity ? (await db.query('select name from entities where code = $1', [c.entity]))[0] : null;
  const body = `# Notification of loss: ${c.description}

To: ${p.broker || p.insurer}
Insured: ${e?.name || 'the group'}
Policy: ${p.policy_number || p.code} with ${p.insurer} (${p.period_start} to ${p.period_end})

| Field | Value |
|---|---|
| Our reference | ${c.code} |
| What happened | ${c.description} |
| Date it happened | ${c.occurred_on} |
| Date we found it | ${c.discovered_on} |
| Asset | ${c.asset || 'not an insured asset'} |
| Our estimate | ${c.reserve} |
| Policy excess | ${c.excess} |

We are notifying this loss as soon as practicable. Please confirm the claim number and whether you are appointing a loss adjuster. We will keep any damaged items and records until you tell us otherwise.

[Photos, invoices and reports attached: list them.]

_Draft prepared ${today()} from the claims register. Once sent, record it with: npm run cover -- notify-claim ${c.code} --number="..." --actor="..."_
`;
  const file = path.join(draftsDir(), `claim-notification-${c.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, claim: c.code, to: p.broker || p.insurer, notify_by: c.notify_by };
}

async function certRequest(db, q) {
  const d = await contractorDetail(db, q);
  const k = d.contractor;
  const latest = d.certificates[0];
  const why = k.state === 'no certificate' ? 'We do not have a certificate of currency on file for you.'
    : k.state === 'expired' ? `The public liability certificate we hold expired on ${latest.expires_on}.`
      : k.state === 'limit too low' ? `The certificate we hold shows a limit of $${Number(latest.limit_amt).toLocaleString('en-NZ')}, and our contract requires ${k.required}.`
        : latest ? `The certificate we hold expires on ${latest.expires_on}.` : '';
  const body = `To: ${k.email || '[their email]'}
Subject: Certificate of currency for ${k.name}

Hello,

${why} Before your next visit to site, please send a current certificate of currency for public liability insurance with a limit of at least ${k.required}.

Thanks.

_Draft prepared ${today()} from the contractor register. Nothing has been sent. When it arrives, record it with: npm run cover -- certificate ${k.code} --limit= --expires= --insurer= --actor="..."_
`;
  const file = path.join(draftsDir(), `certificate-request-${k.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, contractor: k.code, state: k.state };
}

async function allocationStatement(db) {
  const rows = await db.query(`select entity, entity_name, policy, basis, share_pct::float as share_pct, allocated_cents from premium_allocation where base is null or base > 0 order by entity, policy`);
  const byEntity = new Map();
  for (const r of rows) {
    if (!byEntity.has(r.entity)) byEntity.set(r.entity, { name: r.entity_name, rows: [] });
    byEntity.get(r.entity).rows.push({ policy: r.policy, basis: r.basis, share_pct: r.share_pct ?? 'missing data', allocated: dollars(r.allocated_cents) });
  }
  const totals = [...byEntity].map(([code, v]) => ({ entity: code, name: v.name, total: dollars(v.rows.reduce((s, r) => s + (rows.find((x) => x.entity === code && x.policy === r.policy).allocated_cents || 0), 0)) }));
  const body = `# Insurance premium allocation, ${today()}

Each in-force policy's premium and levies, shared across the entities on the basis set for that policy.

## Totals by entity

${md(totals)}
${[...byEntity].map(([code, v]) => `## ${code}: ${v.name}\n\n${md(v.rows)}`).join('\n')}
_Prepared ${today()} from the insurance programme records for the month-end journals._
`;
  const file = path.join(draftsDir(), `premium-allocation-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, entities: byEntity.size, policies: new Set(rows.map((r) => r.policy)).size };
}

async function weeklyReview(db) {
  const att = await db.query(reads.attention.sql);
  const ren = await db.query(reads.renewals.sql);
  const claims = await db.query(`select code, policy, description, status, days_quiet from claim_register where status = 'open' order by occurred_on`);
  const certs = await db.query(`select code, name, state, expires_on from contractor_cover where active and state <> 'current' order by code`);
  const urgent = att.filter((r) => r.severity === 1);
  const body = `# Insurance programme review, ${today()}

**${urgent.length} urgent item(s)**, ${ren.length} renewal(s) in the next 120 days, ${claims.length} open claim(s).

## Urgent

${md(urgent.map(({ item, rule, detail }) => ({ item, rule, detail })))}
## Renewals

${md(ren.map(({ code, period_end, days, disclosure, undisclosed }) => ({ code, period_end, days, disclosure, undisclosed })))}
## Open claims

${md(claims)}
## Contractor certificates

${md(certs)}
## Everything else

${md(att.filter((r) => r.severity > 1).map(({ severity, item, rule, detail }) => ({ severity, item, rule, detail })))}
_Drafted ${today()} from attention, renewals and claims. Nothing has been sent._
`;
  const file = path.join(draftsDir(), `weekly-review-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, urgent: urgent.length, renewals: ren.length, open_claims: claims.length };
}

// ------------------------------------------------------------------ run

export async function run(db, args) {
  const { cmd, pos, f } = parse(args);
  let actor = null;
  if (mutating.has(cmd)) actor = need(f.actor, 'actor');
  if (Object.hasOwn(reads, cmd)) {
    if (cmd === 'compliance') {
      const out = [];
      for (const r of complianceRules) for (const row of await db.query(r.sql)) out.push({ rule: r.rule, code: row.code, finding: row.finding });
      return out.sort((a, b) => a.rule.localeCompare(b.rule) || a.code.localeCompare(b.code));
    }
    return db.query(reads[cmd].sql);
  }
  const target = pos.join(' ');
  switch (cmd) {
    case 'help': return Object.entries(usage).map(([command, a]) => ({ command, args: a, about: reads[command]?.about || '' }));
    case 'policy': return policyDetail(db, target);
    case 'claim': return claimDetail(db, target);
    case 'entity': return entityDetail(db, target);
    case 'contractor': return contractorDetail(db, target);
    case 'add-entity': return addEntity(db, f, actor);
    case 'add-policy': return addPolicy(db, f, actor);
    case 'renew': return renew(db, target, f, actor);
    case 'disclose': return disclose(db, target, f, actor);
    case 'log-change': return logChange(db, f, actor);
    case 'add-asset': return addAsset(db, f, actor);
    case 'value': return value(db, target, f, actor);
    case 'declare': return declare(db, target, f, actor);
    case 'declare-metrics': return declareMetrics(db, target, f, actor);
    case 'log-claim': return logClaim(db, f, actor);
    case 'notify-claim': return notifyClaim(db, target, f, actor);
    case 'claim-update': return claimUpdate(db, target, f, actor);
    case 'close-claim': return closeClaim(db, target, f, actor);
    case 'add-contractor': return addContractor(db, f, actor);
    case 'certificate': return certificate(db, target, f, actor);
    case 'import':
      if (pos[0] !== 'origami' || pos.length > 1) throw Error(`Usage: import ${usage.import}`);
      return importOrigami(db, f, actor);
    case 'export': return exportAll(db, f);
    case 'renewal-submission': return renewalSubmission(db, target);
    case 'claim-notification': return claimNotification(db, target);
    case 'cert-request': return certRequest(db, target);
    case 'allocation-statement': return allocationStatement(db);
    case 'weekly-review': return weeklyReview(db);
    default: throw Error(`Unknown command ${cmd}`);
  }
}

const WIDE = ['detail', 'finding', 'about', 'args', 'description', 'name', 'note'];
const MONEY = ['premium', 'prior', 'revenue', 'limit_amt', 'excess', 'declared', 'replacement', 'gap', 'reserve', 'paid', 'required', 'held', 'allocated', 'incurred'];
function print(cmd, result) {
  if (Array.isArray(result)) {
    if (!result.length) { console.log('  (none)'); return; }
    const cols = Object.keys(result[0]).map((key) => ({ key, label: key === 'limit_amt' ? 'limit' : key, width: WIDE.includes(key) ? 48 : undefined,
      align: typeof result[0][key] === 'number' || MONEY.includes(key) ? 'right' : 'left',
      format: MONEY.includes(key) ? (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('en-NZ')) : undefined }));
    console.log(textTable(result, cols));
    return;
  }
  if (['policy', 'claim', 'entity', 'contractor'].includes(cmd)) {
    const head = result[cmd];
    console.log(heading(`${head.code}  ${head.name || head.description || ''}`));
    for (const [k, v] of Object.entries(head)) if (v !== null && v !== undefined && v !== '' && !['code', 'name', 'description'].includes(k)) console.log(`  ${k.padEnd(22)}${v}`);
    for (const [label, rows] of Object.entries(result)) {
      if (!Array.isArray(rows)) continue;
      console.log(heading(label));
      print('', rows);
    }
    return;
  }
  for (const [k, v] of Object.entries(result)) console.log(`  ${k.padEnd(22)}${Array.isArray(v) ? (v.length ? '\n    ' + v.join('\n    ') : 'none') : typeof v === 'object' && v ? JSON.stringify(v) : v}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let db;
  try {
    db = await getDb();
    const result = await run(db, args);
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else print(args.find((a) => !a.startsWith('--')) || 'help', result);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}
