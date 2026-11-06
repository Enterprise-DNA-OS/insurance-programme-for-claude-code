-- Demo data: Kauri Coast Group, a food manufacturer and distributor with a factory in Auckland,
-- a depot in Hamilton and a new warehouse in Brisbane. Dates are relative to today, so the
-- attention list always has something to say:
--   the cyber policy expired a week ago and nothing renewed it
--   the property renewal is 35 days away, the new Brisbane warehouse has not been disclosed,
--     and the renewal information has not gone to the broker
--   the Auckland factory is declared at 77% of its replacement value and was last valued four years ago
--   a product contamination claim was found 20 days ago and the insurer has not been told
--   the Hamilton racking claim has had no update in 45 days
--   one contractor's certificate has expired, one is below the required limit, one has none
-- Safe to run twice: returns early when the group already exists.
do $$
declare
  hold uuid; foods uuid; logi uuid; aus uuid;
  prp24 uuid; prp25 uuid; pl24 uuid; pl25 uuid; mv25 uuid; mv26 uuid; cyb24 uuid; cyb25 uuid; do26 uuid; mt26 uuid;
  a1 uuid; a4 uuid;
  k1 uuid; k2 uuid; k3 uuid; k5 uuid; k6 uuid;
begin
  if exists (select 1 from entities where code = 'KCG') then return; end if;

  insert into entities (code, name, kind, country, revenue_cents, headcount, metrics_year) values
    ('KCG', 'Kauri Coast Group Holdings Ltd', 'company', 'NZ', 0, 6, 2026) returning id into hold;
  insert into entities (code, name, kind, country, revenue_cents, headcount, metrics_year) values
    ('KCF', 'Kauri Coast Foods Ltd', 'company', 'NZ', 6200000000, 142, 2026) returning id into foods;
  insert into entities (code, name, kind, country, revenue_cents, headcount, metrics_year) values
    ('KCL', 'Kauri Coast Logistics Ltd', 'company', 'NZ', 1400000000, 38, 2026) returning id into logi;
  insert into entities (code, name, kind, country, revenue_cents, headcount, metrics_year) values
    ('KCA', 'Kauri Coast Foods Pty Ltd', 'company', 'AU', 900000000, null, 2026) returning id into aus;

  -- Last year's programme, renewed.
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, status, disclosure_sent_on)
    values ('PRP-24', 'Material damage and business interruption 2024-25', 'property', 'Albany Mutual', 'Harbour Insurance Brokers', 'AM-ISR-77120',
      current_date - 695, current_date - 330, 38600000, 4100000, 6000000000, 2500000, 'asset_value', 'renewed', current_date - 360) returning id into prp24;
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, status, disclosure_sent_on)
    values ('PL-24', 'Public and products liability 2024-25', 'liability', 'Pacifica General', 'Harbour Insurance Brokers', 'PG-LIA-30418',
      current_date - 665, current_date - 300, 8400000, 0, 2000000000, 1000000, 'revenue', 'renewed', current_date - 330) returning id into pl24;
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, status, disclosure_sent_on)
    values ('MV-25', 'Commercial motor fleet 2025', 'motor', 'Albany Mutual', 'Harbour Insurance Brokers', 'AM-MV-55010',
      current_date - 385, current_date - 20, 5200000, 0, null, 250000, 'vehicles', 'renewed', current_date - 50) returning id into mv25;
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, status, claims_made, disclosure_sent_on)
    values ('CYB-24', 'Cyber 2024-25', 'cyber', 'Ironbark Specialty', 'Harbour Insurance Brokers', 'IB-CY-1180',
      current_date - 737, current_date - 372, 2100000, 0, 200000000, 1000000, 'headcount', 'renewed', true, current_date - 400) returning id into cyb24;

  -- This year's programme.
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, renewed_from_id, disclosure_sent_on, notes)
    values ('PRP-25', 'Material damage and business interruption 2025-26', 'property', 'Albany Mutual', 'Harbour Insurance Brokers', 'AM-ISR-77120',
      current_date - 330, current_date + 35, 41200000, 4400000, 6500000000, 2500000, 'asset_value', prp24, current_date - 360,
      'Levies include the Fire and Emergency levy.') returning id into prp25;
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, renewed_from_id, disclosure_sent_on)
    values ('PL-25', 'Public and products liability 2025-26', 'liability', 'Pacifica General', 'Harbour Insurance Brokers', 'PG-LIA-30418',
      current_date - 300, current_date + 65, 9100000, 0, 2000000000, 1000000, 'revenue', pl24, current_date - 330) returning id into pl25;
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, renewed_from_id, disclosure_sent_on)
    values ('MV-26', 'Commercial motor fleet 2026', 'motor', 'Albany Mutual', 'Harbour Insurance Brokers', 'AM-MV-55010',
      current_date - 20, current_date + 345, 6100000, 0, null, 250000, 'vehicles', mv25, current_date - 50) returning id into mv26;
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, renewed_from_id, claims_made, disclosure_sent_on)
    values ('CYB-25', 'Cyber 2025-26', 'cyber', 'Ironbark Specialty', 'Harbour Insurance Brokers', 'IB-CY-1180',
      current_date - 372, current_date - 7, 2600000, 0, 200000000, 1000000, 'headcount', cyb24, true, current_date - 400) returning id into cyb25;
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, fixed_entity_id, claims_made, disclosure_sent_on)
    values ('DO-26', 'Directors and officers 2026', 'directors_officers', 'Ironbark Specialty', 'Harbour Insurance Brokers', 'IB-DO-2207',
      current_date - 100, current_date + 265, 1850000, 0, 500000000, 0, 'fixed', hold, true, current_date - 120) returning id into do26;
  insert into policies (code, name, class, insurer, broker, policy_number, period_start, period_end, premium_cents, levies_cents, limit_cents, excess_cents, allocation_basis, disclosure_sent_on)
    values ('MT-26', 'Marine transit 2026', 'marine_transit', 'Pacifica General', 'Harbour Insurance Brokers', 'PG-MT-8841',
      current_date - 150, current_date + 215, 1450000, 0, 50000000, 250000, 'revenue', current_date - 170) returning id into mt26;

  -- Schedule of values.
  insert into assets (code, entity_id, policy_id, name, kind, location, declared_cents, replacement_cents, valued_on, valuer) values
    ('A-001', foods, prp25, 'Auckland factory building', 'building', '14 Kahu Road, East Tamaki, Auckland', 1850000000, 2400000000, current_date - 1480, 'Coastal Valuers Ltd')
    returning id into a1;
  insert into assets (code, entity_id, policy_id, name, kind, location, declared_cents, replacement_cents, valued_on, valuer) values
    ('A-002', foods, prp25, 'Auckland plant and machinery', 'plant', '14 Kahu Road, East Tamaki, Auckland', 920000000, 960000000, current_date - 380, 'Coastal Valuers Ltd'),
    ('A-003', foods, prp25, 'Auckland stock', 'stock', '14 Kahu Road, East Tamaki, Auckland', 350000000, 380000000, current_date - 30, 'Stock declaration'),
    ('A-005', aus, prp25, 'Brisbane warehouse fit-out and stock', 'contents', '7 Lytton Road, Hemmant, Brisbane', 410000000, 410000000, current_date - 60, 'Fit-out invoice'),
    ('A-006', foods, prp25, 'Business interruption, gross profit 12 months', 'business_interruption', 'Group', 2100000000, 2100000000, current_date - 330, 'Finance declaration');
  insert into assets (code, entity_id, policy_id, name, kind, location, declared_cents, replacement_cents, valued_on, valuer) values
    ('A-004', logi, prp25, 'Hamilton depot building', 'building', '220 Te Rapa Road, Hamilton', 600000000, 640000000, current_date - 760, 'Waikato Property Valuers')
    returning id into a4;
  insert into assets (code, entity_id, policy_id, name, kind, location, registration, declared_cents, replacement_cents, valued_on) values
    ('V-001', logi, mv26, 'Isuzu FVR refrigerated truck', 'vehicle', 'Hamilton', 'QKC412', 18500000, 18500000, current_date - 100),
    ('V-002', logi, mv26, 'Isuzu FVR refrigerated truck', 'vehicle', 'Hamilton', 'QKC413', 17200000, 17200000, current_date - 400),
    ('V-003', logi, mv26, 'Hino 300 delivery truck', 'vehicle', 'Hamilton', 'PZT118', 9800000, 9800000, current_date - 400),
    ('V-004', foods, mv26, 'Toyota Hilux', 'vehicle', 'Auckland', 'RHL220', 6200000, 6200000, current_date - 400);

  -- Material changes since the last renewals.
  insert into changes (code, entity_id, class, description, occurred_on, disclosed_on, disclosed_to) values
    ('CH-001', aus, 'property', 'Leased and fitted out a new warehouse at Hemmant, Brisbane', current_date - 60, null, null),
    ('CH-002', foods, 'liability', 'Started exporting frozen meals to Japan', current_date - 40, null, null),
    ('CH-003', logi, 'motor', 'Added a second refrigerated truck (QKC412)', current_date - 100, current_date - 95, 'Harbour Insurance Brokers'),
    ('CH-004', foods, 'cyber', 'Moved orders and payroll to a new cloud system', current_date - 150, current_date - 140, 'Harbour Insurance Brokers');

  -- Claims.
  insert into claims (code, policy_id, entity_id, asset_id, description, occurred_on, discovered_on, notified_on, claim_number, reserve_cents, paid_cents, status, last_update_on) values
    ('CL-001', prp25, logi, a4, 'Forklift struck racking in the Hamilton depot', current_date - 80, current_date - 80, current_date - 78, 'AM-CLM-50331', 8500000, 0, 'open', current_date - 45),
    ('CL-002', pl25, foods, null, 'Customer reports a foreign object in a frozen meal sold in Wellington', current_date - 25, current_date - 20, null, null, 2500000, 0, 'open', null),
    ('CL-006', mt26, foods, null, 'Pallets of chilled product warmed in transit to Christchurch', current_date - 30, current_date - 30, current_date - 29, 'PG-MT-C-0912', 1800000, 0, 'open', current_date - 5);
  insert into claims (code, policy_id, entity_id, asset_id, description, occurred_on, discovered_on, notified_on, claim_number, reserve_cents, paid_cents, status, last_update_on, closed_on) values
    ('CL-003', mv25, logi, null, 'Delivery truck rear-ended at lights, Te Rapa', current_date - 200, current_date - 200, current_date - 199, 'AM-MV-C-2210', 0, 1420000, 'paid', current_date - 150, current_date - 150),
    ('CL-004', cyb24, foods, null, 'Invoice fraud through a spoofed supplier email', current_date - 500, current_date - 496, current_date - 495, 'IB-CY-C-0077', 0, 4500000, 'paid', current_date - 420, current_date - 420),
    ('CL-005', prp24, foods, a1, 'Burst sprinkler main flooded the dry store', current_date - 420, current_date - 420, current_date - 419, 'AM-CLM-48810', 0, 12000000, 'paid', current_date - 350, current_date - 350),
    ('CL-007', pl24, foods, null, 'Slip claim by a visitor at the factory shop', current_date - 450, current_date - 440, current_date - 438, 'PG-L-C-1022', 0, 0, 'declined', current_date - 400, current_date - 400);
  insert into claim_notes (claim_id, noted_on, note, recorded_by)
    select id, current_date - 45, 'Loss adjuster visited; waiting on the racking supplier quote.', 'Mere Tane' from claims where code = 'CL-001';
  insert into claim_notes (claim_id, noted_on, note, recorded_by)
    select id, current_date - 5, 'Insurer asked for the temperature logger download.', 'Mere Tane' from claims where code = 'CL-006';

  -- Contractors on site and their certificates of currency.
  insert into contractors (code, name, trade, entity_id, required_pl_cents, email) values ('CO-001', 'Northside Electrical Ltd', 'electrical', foods, 1000000000, 'office@northside.example') returning id into k1;
  insert into contractors (code, name, trade, entity_id, required_pl_cents, email) values ('CO-002', 'Rapid Refrigeration Services', 'refrigeration', foods, 1000000000, 'admin@rapidrefrig.example') returning id into k2;
  insert into contractors (code, name, trade, entity_id, required_pl_cents, email) values ('CO-003', 'SafeLift Forklift Hire', 'forklift hire and servicing', logi, 1000000000, 'hire@safelift.example') returning id into k3;
  insert into contractors (code, name, trade, entity_id, required_pl_cents, email) values ('CO-004', 'Kiwi Clean Commercial', 'cleaning', foods, 500000000, 'ops@kiwiclean.example');
  insert into contractors (code, name, trade, entity_id, required_pl_cents, email, active) values ('CO-005', 'Old Mill Scaffolding', 'scaffolding', foods, 1000000000, null, false) returning id into k5;
  insert into contractors (code, name, trade, entity_id, required_pl_cents, email) values ('CO-006', 'Harbour Security Patrols', 'security', logi, 500000000, 'roster@harboursecurity.example') returning id into k6;
  insert into certificates (contractor_id, insurer, policy_number, limit_cents, expires_on, received_on, recorded_by) values
    (k1, 'Pacifica General', 'PG-PL-90021', 1000000000, current_date + 120, current_date - 245, 'Mere Tane'),
    (k2, 'Albany Mutual', 'AM-PL-61733', 1000000000, current_date - 12, current_date - 377, 'Mere Tane'),
    (k3, 'Ironbark Specialty', 'IB-PL-4410', 500000000, current_date + 200, current_date - 165, 'Mere Tane'),
    (k5, 'Albany Mutual', 'AM-PL-11009', 1000000000, current_date - 300, current_date - 665, 'Mere Tane'),
    (k6, 'Pacifica General', 'PG-PL-77102', 500000000, current_date + 20, current_date - 345, 'Mere Tane');
end $$;
