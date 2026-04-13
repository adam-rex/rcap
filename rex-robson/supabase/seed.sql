-- Static sample data for SQL Editor / supabase db reset.
-- For repeatable, count-driven fake data use: npm run db:seed -- --help
-- Inbound email–only Faker seed: npm run db:seed:emails -- --help
-- Order: contacts reference organisations; deals are standalone; extractions/attachments reference emails.
truncate table public.rex_email_extractions restart identity;
truncate table public.rex_inbound_email_attachments restart identity;
truncate table public.rex_inbound_emails restart identity;
truncate table public.deal_stage_history restart identity;
truncate table public.contacts restart identity;
truncate table public.deals restart identity;
truncate table public.organisations restart identity;

insert into public.organisations (id, name, type, description) values
  ('a1000000-0000-4000-8000-000000000001', 'Acme Capital Partners', 'fund', 'Series A–C growth fund focused on B2B SaaS and fintech.'),
  ('a1000000-0000-4000-8000-000000000002', 'Northwind Holdings', 'family_office', 'Direct co-investments alongside lead sponsors in North America.'),
  ('a1000000-0000-4000-8000-000000000003', 'Summit Ridge Advisors', 'advisor', 'M&A advisory and capital placement for middle-market industrials.');

insert into public.contacts (
  name, organisation_id, role, deal_types, min_deal_size, max_deal_size,
  sectors, geography, relationship_score, last_contact_date, notes, source
) values
  (
    'Jordan Lee',
    'a1000000-0000-4000-8000-000000000001',
    'Principal',
    array['growth_equity', 'venture']::text[],
    5000000,
    40000000,
    array['saas', 'fintech']::text[],
    'United States',
    0.82,
    '2026-03-18',
    'Warm intro via portfolio CEO. Interested in vertical SaaS with strong net retention.',
    'conference'
  ),
  (
    'Priya Sharma',
    'a1000000-0000-4000-8000-000000000001',
    'Associate',
    array['venture']::text[],
    2000000,
    15000000,
    array['healthcare_it', 'saas']::text[],
    'US / Canada',
    0.64,
    '2026-02-02',
    'Follow up on data room for the logistics automation deal.',
    'linkedin'
  ),
  (
    'Marcus Webb',
    'a1000000-0000-4000-8000-000000000002',
    'Managing Director',
    array['co_invest', 'secondaries']::text[],
    10000000,
    75000000,
    array['industrials', 'business_services']::text[],
    'North America',
    0.91,
    '2026-04-01',
    'Prefers control or significant minority with board rights.',
    'referral'
  ),
  (
    'Elena Vasquez',
    'a1000000-0000-4000-8000-000000000003',
    'Director',
    array['m_and_a', 'private_placement']::text[],
    null,
    null,
    array['industrials', 'logistics']::text[],
    'US Midwest',
    0.77,
    '2026-03-28',
    'Running sell-side for two founder-led manufacturers; open to strategic buyers.',
    'event'
  );

insert into public.deals (title, size, deal_type, deal_stage, sector, structure, status, notes) values
  ('Project Atlas — B2B payments platform', 28000000, 'equity deal', 'active', 'fintech', 'Series B preferred', 'diligence', 'Strong unit economics; key risk is enterprise sales cycle length.'),
  ('Lumen Analytics recapitalization', 120000000, 'senior debt', 'matching', 'saas', 'majority_recap', 'ioi', 'Sponsor exploring add-on acquisitions in marketing analytics.'),
  ('Harbor Freight co-invest (secondary)', 45000000, 'debt deal', 'prospect', 'logistics', 'secondary', 'passed', 'Passed on pricing; staying in touch for future stapled secondaries.'),
  ('Midwest Cold Storage platform', 85000000, 'bridging', 'closed', 'industrials', 'buyout', 'live', 'Roll-up of regional cold chain assets; environmental capex plan in data room.');

insert into public.rex_inbound_emails (
  id, received_at, from_name, from_address, to_addresses, subject, body_text, snippet, external_message_id, thread_participant_count
) values
  (
    'e2000000-0000-4000-8000-000000000001',
    '2026-04-12 14:30:00+00',
    'Alex Morgan',
    'alex.morgan@acmecap.com',
    array['rex@workspace.local']::text[],
    'Re: Project Atlas — quick question on data room access',
    E'Hi Rex,\n\nFollowing up on the B2B payments diligence — can you confirm whether the Q1 cohort retention deck is in the data room? We need it for IC on Thursday.\n\nThanks,\nAlex',
    'Following up on the B2B payments diligence — can you confirm whether the Q1 cohort retention deck is in the data room?',
    'seed-msg-atlas-001',
    null
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    '2026-04-11 09:15:00+00',
    'Priya Sharma',
    'priya.sharma@acmecap.com',
    array['rex@workspace.local']::text[],
    'Fwd: Intro — Harbor Freight secondary',
    E'Rex — looping you in. Marcus asked for a one-pager on stapled secondaries. Forwarding the thread below.\n\n— Priya',
    'Marcus asked for a one-pager on stapled secondaries.',
    'seed-msg-harbor-002',
    null
  ),
  (
    'e2000000-0000-4000-8000-000000000003',
    '2026-04-13 08:00:00+00',
    'James',
    'james@robson.capital',
    array['rex@robson.capital']::text[],
    'Intro — Marcus Peel / Shawbrook re bridging',
    E'Hi Rex — can you track intro context for IC?\n\nMarcus at Shawbrook is looking at a bridging piece on a Manchester logistics asset (~£8M, 12mo).\n\nThanks,\nJames',
    'Marcus at Shawbrook — bridging on Manchester logistics asset (~£8M).',
    'seed-msg-marcus-intro-003',
    3
  );

insert into public.rex_email_extractions (
  email_id, kind, status, title, summary, detail, payload
) values
  (
    'e2000000-0000-4000-8000-000000000003',
    'contact',
    'pending',
    'Marcus Peel',
    'Shawbrook Bank · Bridging & RE finance · £5–20M · UK',
    null,
    '{"name":"Marcus Peel","organisationName":"Shawbrook Bank","role":"Bridging & RE finance","geography":"UK","notes":"£5–20M ticket; UK focus."}'::jsonb
  ),
  (
    'e2000000-0000-4000-8000-000000000003',
    'deal_signal',
    'pending',
    'Bridging — Manchester logistics asset',
    '~£8M · 12 month term · mentioned as live requirement',
    null,
    '{"title":"Bridging — Manchester logistics asset","size":8000000,"dealType":"bridging","structure":"bridging","sector":"logistics","status":"live","notes":"12 month term; live requirement per thread."}'::jsonb
  );

insert into public.rex_inbound_email_attachments (
  id, email_id, filename, content_type, size_bytes
) values
  (
    'f2000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000002',
    'Harbor_secondary_outline.pdf',
    'application/pdf',
    245760
  );
