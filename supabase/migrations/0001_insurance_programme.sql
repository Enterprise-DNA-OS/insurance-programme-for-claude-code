-- Insurance Programme for Claude Code: the schema.
-- A group's insurance programme from the insured's side: the entities that buy cover, the policies,
-- the schedule of values behind the property cover, claims, the material changes insurers must be told
-- about at renewal, and the certificates of currency contractors must hold.
-- Plain Postgres. Runs the same on PGlite. Money is in cents (bigint).

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- The companies, trusts and divisions in the group. Revenue and headcount drive premium allocation
-- and the declarations at renewal.
create table entities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null default 'company' check (kind in ('company', 'trust', 'division', 'partnership')),
  country text not null default 'NZ',
  revenue_cents bigint check (revenue_cents >= 0),
  headcount int check (headcount >= 0),
  metrics_year int,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table policies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  class text not null check (class in ('property', 'liability', 'motor', 'cyber', 'directors_officers', 'professional_indemnity',
    'marine_transit', 'management_liability', 'trade_credit', 'other')),
  insurer text not null,
  broker text,
  policy_number text,
  period_start date not null,
  period_end date not null check (period_end > period_start),
  claims_made boolean not null default false,
  limit_cents bigint check (limit_cents >= 0),
  excess_cents bigint not null default 0 check (excess_cents >= 0),
  premium_cents bigint not null default 0 check (premium_cents >= 0),
  levies_cents bigint not null default 0 check (levies_cents >= 0),
  currency text not null default 'NZD',
  -- How the premium is shared across entities.
  allocation_basis text not null default 'revenue' check (allocation_basis in ('revenue', 'headcount', 'asset_value', 'vehicles', 'fixed')),
  fixed_entity_id uuid references entities(id),
  renewal_lead_days int not null default 90 check (renewal_lead_days between 0 and 365),
  notify_within_days int not null default 14 check (notify_within_days between 0 and 365),
  average_pct numeric(5,2) not null default 80 check (average_pct between 0 and 100),
  disclosure_sent_on date,
  status text not null default 'active' check (status in ('active', 'renewed', 'cancelled', 'lapsed')),
  renewed_from_id uuid references policies(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (allocation_basis <> 'fixed' or fixed_entity_id is not null)
);

-- The schedule of values: buildings, plant, stock and vehicles, with the value declared to the insurer
-- and the latest replacement valuation.
create table assets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  entity_id uuid not null references entities(id),
  policy_id uuid references policies(id),
  name text not null,
  kind text not null check (kind in ('building', 'contents', 'plant', 'stock', 'vehicle', 'business_interruption', 'other')),
  location text,
  registration text,
  declared_cents bigint not null default 0 check (declared_cents >= 0),
  replacement_cents bigint check (replacement_cents >= 0),
  valued_on date,
  valuer text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Anything an insurer would want to know at renewal: a new site, an acquisition, a new product or market,
-- a big contract, a change of activity. Each one is owed to the insurers of its class.
create table changes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  entity_id uuid references entities(id),
  class text not null,
  description text not null,
  occurred_on date not null,
  disclosed_on date,
  disclosed_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  policy_id uuid not null references policies(id),
  entity_id uuid references entities(id),
  asset_id uuid references assets(id),
  description text not null,
  occurred_on date not null,
  discovered_on date not null,
  notified_on date,
  claim_number text,
  reserve_cents bigint not null default 0 check (reserve_cents >= 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  status text not null default 'open' check (status in ('open', 'paid', 'declined', 'withdrawn')),
  last_update_on date,
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discovered_on >= occurred_on)
);

create table claim_notes (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id),
  noted_on date not null,
  note text not null,
  recorded_by text not null,
  created_at timestamptz not null default now()
);

create table contractors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  trade text,
  entity_id uuid references entities(id),
  required_pl_cents bigint not null default 1000000000 check (required_pl_cents >= 0),
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table certificates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id),
  kind text not null default 'public_liability' check (kind in ('public_liability', 'professional_indemnity', 'workers_comp', 'motor', 'other')),
  insurer text,
  policy_number text,
  limit_cents bigint not null default 0 check (limit_cents >= 0),
  expires_on date not null,
  received_on date not null,
  recorded_by text not null,
  created_at timestamptz not null default now()
);

create table imports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  file_hash text not null,
  rows int not null,
  created_at timestamptz not null default now(),
  unique (source, file_hash)
);

create table activity (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor text not null,
  command text not null,
  record_id text,
  detail text
);

create trigger entities_touch before update on entities for each row execute function touch_updated_at();
create trigger policies_touch before update on policies for each row execute function touch_updated_at();
create trigger assets_touch before update on assets for each row execute function touch_updated_at();
create trigger changes_touch before update on changes for each row execute function touch_updated_at();
create trigger claims_touch before update on claims for each row execute function touch_updated_at();
create trigger contractors_touch before update on contractors for each row execute function touch_updated_at();

create index on assets (policy_id);
create index on claims (policy_id);
create index on certificates (contractor_id, expires_on);

-- ---------------------------------------------------------------- views

-- Every policy with its cover state today.
create view policy_register as
select p.id, p.code, p.name, p.class, p.insurer, p.broker, p.policy_number, p.period_start, p.period_end, p.claims_made,
  p.limit_cents, p.excess_cents, p.premium_cents, p.levies_cents, p.premium_cents + p.levies_cents as total_cents, p.currency,
  p.allocation_basis, p.renewal_lead_days, p.notify_within_days, p.average_pct, p.disclosure_sent_on, p.status,
  (p.period_end - current_date) as days_to_expiry,
  prev.code as renewed_from, prev.premium_cents + prev.levies_cents as prior_total_cents,
  (select n.code from policies n where n.renewed_from_id = p.id limit 1) as renewed_into,
  case
    when p.status in ('renewed', 'cancelled') then p.status
    when p.status = 'lapsed' then 'lapsed'
    when p.period_start > current_date then 'starts ' || p.period_start
    when p.period_end < current_date then 'EXPIRED'
    when p.period_end - current_date <= p.renewal_lead_days then 'renewal due'
    else 'in force'
  end as cover
from policies p left join policies prev on prev.id = p.renewed_from_id;

-- The schedule of values, with how much of the replacement value is declared.
create view asset_schedule as
select a.id, a.code, a.name, a.kind, a.location, a.registration, e.code as entity, p.code as policy, p.class,
  a.declared_cents, a.replacement_cents,
  case when a.replacement_cents > 0 then round(100.0 * a.declared_cents / a.replacement_cents, 1) end as pct_declared,
  coalesce(p.average_pct, 80) as average_pct, a.valued_on, a.valuer,
  case when a.valued_on is not null then (current_date - a.valued_on) / 365 end as valuation_years,
  a.active
from assets a join entities e on e.id = a.entity_id left join policies p on p.id = a.policy_id;

create view claim_register as
select c.id, c.code, p.code as policy, p.class, p.insurer, e.code as entity, a.code as asset, c.description,
  c.occurred_on, c.discovered_on, c.notified_on, c.claim_number,
  c.discovered_on + p.notify_within_days as notify_by,
  case when c.notified_on is not null then c.notified_on - c.discovered_on end as days_to_notify,
  p.notify_within_days, c.reserve_cents, c.paid_cents, p.excess_cents, c.status,
  coalesce(c.last_update_on, c.notified_on, c.discovered_on) as last_update_on,
  current_date - coalesce(c.last_update_on, c.notified_on, c.discovered_on) as days_quiet,
  (c.occurred_on < p.period_start or c.occurred_on > p.period_end) as outside_period,
  c.closed_on
from claims c join policies p on p.id = c.policy_id left join entities e on e.id = c.entity_id left join assets a on a.id = c.asset_id;

-- Each contractor's best current certificate of each kind they must hold (public liability for now).
create view contractor_cover as
select k.id, k.code, k.name, k.trade, k.active, k.required_pl_cents, e.code as entity,
  c.insurer, c.policy_number, c.limit_cents, c.expires_on, c.received_on,
  case when c.id is null then 'no certificate'
       when c.expires_on < current_date then 'expired'
       when c.limit_cents < k.required_pl_cents then 'limit too low'
       when c.expires_on - current_date <= 30 then 'expiring'
       else 'current' end as state,
  c.expires_on - current_date as days_left
from contractors k
left join entities e on e.id = k.entity_id
left join lateral (select * from certificates x where x.contractor_id = k.id and x.kind = 'public_liability'
                   order by x.expires_on desc, x.received_on desc limit 1) c on true;

-- The base for sharing each in-force policy's premium across entities.
create view allocation_base as
select p.id as policy_id, e.id as entity_id,
  case p.allocation_basis
    when 'revenue' then e.revenue_cents::numeric
    when 'headcount' then e.headcount::numeric
    when 'asset_value' then (select coalesce(sum(a.declared_cents), 0) from assets a where a.policy_id = p.id and a.entity_id = e.id and a.active)::numeric
    when 'vehicles' then (select count(*) from assets a where a.policy_id = p.id and a.entity_id = e.id and a.kind = 'vehicle' and a.active)::numeric
    when 'fixed' then case when e.id = p.fixed_entity_id then 1 else 0 end
  end as base
from policies p cross join entities e
where p.status = 'active' and current_date between p.period_start and p.period_end and e.active;

create view premium_allocation as
select p.code as policy, p.class, p.allocation_basis as basis, e.code as entity, e.name as entity_name, p.currency,
  b.base,
  case when t.total > 0 and b.base is not null then round(100.0 * b.base / t.total, 2) end as share_pct,
  case when t.total > 0 and b.base is not null then round((p.premium_cents + p.levies_cents) * b.base / t.total)::bigint end as allocated_cents,
  t.missing
from allocation_base b
join policies p on p.id = b.policy_id
join entities e on e.id = b.entity_id
join (select policy_id, sum(base) as total, count(*) filter (where base is null) as missing from allocation_base group by policy_id) t on t.policy_id = b.policy_id;

-- What needs a person, worst first. Severity 1: uninsured or a legal duty at risk. 2: due soon. 3: housekeeping.
create view programme_attention as
select 1 as severity, code as item, 'cover expired, no renewal' as rule,
  name || ' with ' || insurer || ' ended ' || period_end || '; nothing renewed it' as detail, -days_to_expiry as days
from policy_register where cover = 'EXPIRED' and renewed_into is null
union all
select 1, p.code, 'undisclosed change before renewal',
  c.code || ': ' || c.description || ' (' || c.occurred_on || ') not yet told to ' || p.insurer || '; renewal ' || p.period_end,
  current_date - c.occurred_on
from changes c join policy_register p on p.class = c.class and p.status = 'active' and p.cover in ('renewal due', 'in force') and p.days_to_expiry <= p.renewal_lead_days
where c.disclosed_on is null
union all
select 1, code, 'renewal disclosure not sent',
  name || ' ends ' || period_end || '; renewal information not yet sent to ' || coalesce(broker, insurer), days_to_expiry
from policy_register where status = 'active' and cover = 'renewal due' and days_to_expiry <= 45
  and (disclosure_sent_on is null or disclosure_sent_on < period_start)
union all
select 1, code, 'claim not notified',
  description || ' found ' || discovered_on || '; insurer to hear by ' || notify_by, current_date - notify_by
from claim_register where status = 'open' and notified_on is null and notify_by < current_date
union all
select 1, code, 'underinsured',
  name || ' declared at ' || pct_declared || '% of its replacement value, under the ' || average_pct || '% average clause', null
from asset_schedule where active and pct_declared < average_pct
union all
select 2, code, 'renewal coming',
  name || ' ends ' || period_end || ' (' || days_to_expiry || ' days)', days_to_expiry
from policy_register where status = 'active' and cover = 'renewal due'
  and not (days_to_expiry <= 45 and (disclosure_sent_on is null or disclosure_sent_on < period_start))
union all
select 2, code, 'claim gone quiet',
  description || ': no update from ' || insurer || ' since ' || last_update_on, days_quiet
from claim_register where status = 'open' and notified_on is not null and days_quiet > 28
union all
select 2, code, case state when 'no certificate' then 'no contractor certificate' when 'expired' then 'contractor certificate expired' else 'contractor limit too low' end,
  name || coalesce(' (' || trade || ')', '') || ': ' ||
  case state when 'no certificate' then 'no certificate of currency on file'
             when 'expired' then 'public liability expired ' || expires_on
             else 'holds ' || (limit_cents / 100000000) || 'm against ' || (required_pl_cents / 100000000) || 'm required' end,
  case when state = 'expired' then -days_left end
from contractor_cover where active and state in ('no certificate', 'expired', 'limit too low')
union all
select 2, code, 'undisclosed change',
  description || ' (' || occurred_on || ', ' || class || ')', current_date - occurred_on
from changes c where disclosed_on is null
  and not exists (select 1 from policy_register p where p.class = c.class and p.status = 'active' and p.cover in ('renewal due', 'in force') and p.days_to_expiry <= p.renewal_lead_days)
union all
select 3, code, 'valuation out of date',
  name || ' last valued ' || valued_on || coalesce(' by ' || valuer, ''), current_date - valued_on
from asset_schedule where active and kind in ('building', 'plant', 'contents') and (valued_on is null or valued_on < current_date - 365 * 3)
union all
select 3, code, 'contractor certificate expiring',
  name || ': public liability expires ' || expires_on, days_left
from contractor_cover where active and state = 'expiring'
union all
select distinct 3, policy, 'allocation data missing',
  basis || ' missing for ' || missing || ' entity(ies), so the premium cannot be shared', null::int
from premium_allocation where missing > 0;
