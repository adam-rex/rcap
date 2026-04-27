-- Static sample data for SQL Editor / supabase db reset.
-- For repeatable, count-driven fake data use: npm run db:seed -- --help
-- Inbound email–only Faker seed: npm run db:seed:emails -- --help
-- Order: contacts reference organisations; matches/suggestions reference contacts; extractions/attachments reference emails.
truncate table public.rex_email_extractions restart identity;
truncate table public.rex_inbound_email_attachments restart identity;
truncate table public.rex_inbound_emails restart identity;
truncate table public.match_stage_history restart identity;
truncate table public.matches restart identity;
truncate table public.suggestions restart identity;
truncate table public.contacts restart identity;
truncate table public.organisations restart identity;

insert into public.organisations (id, name, type, description) values
  ('a1000000-0000-4000-8000-000000000001', 'Acme Capital Partners', 'fund', 'Series A–C growth fund focused on B2B SaaS and fintech.'),
  ('a1000000-0000-4000-8000-000000000002', 'Northwind Holdings', 'family_office', 'Direct co-investments alongside lead sponsors in North America.'),
  ('a1000000-0000-4000-8000-000000000003', 'Summit Ridge Advisors', 'advisor', 'M&A advisory and capital placement for middle-market industrials.');

insert into public.contacts (
  id, name, organisation_id, contact_type, role, deal_types, min_deal_size, max_deal_size,
  sector, sectors, geography, relationship_score, last_contact_date, notes, source, internal_owner
) values
  (
    'c1000000-0000-4000-8000-000000000001',
    'Jordan Lee',
    'a1000000-0000-4000-8000-000000000001',
    'Investor',
    'Principal',
    array['growth_equity', 'venture']::text[],
    5000000,
    40000000,
    'saas',
    array['saas', 'fintech']::text[],
    'United States',
    0.82,
    '2026-03-18',
    'Warm intro via portfolio CEO. Interested in vertical SaaS with strong net retention.',
    'conference',
    'James'
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'Priya Sharma',
    'a1000000-0000-4000-8000-000000000001',
    'Founder',
    'CEO',
    array['venture']::text[],
    2000000,
    15000000,
    'healthcare_it',
    array['healthcare_it', 'saas']::text[],
    'US / Canada',
    0.64,
    '2026-02-02',
    'Building a clinical workflow tool for radiology groups; raising Series A.',
    'linkedin',
    'Adam'
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    'Marcus Webb',
    'a1000000-0000-4000-8000-000000000002',
    'Lender',
    'Managing Director',
    array['co_invest', 'secondaries']::text[],
    10000000,
    75000000,
    'industrials',
    array['industrials', 'business_services']::text[],
    'North America',
    0.91,
    '2026-04-01',
    'Senior debt + unitranche; comfortable financing industrial roll-ups.',
    'referral',
    'Neil'
  ),
  (
    'c1000000-0000-4000-8000-000000000004',
    'Elena Vasquez',
    'a1000000-0000-4000-8000-000000000003',
    'Founder',
    'Founder & CEO',
    array['m_and_a', 'private_placement']::text[],
    null,
    null,
    'logistics',
    array['industrials', 'logistics']::text[],
    'US Midwest',
    0.77,
    '2026-03-28',
    'Founder of a regional cold-chain operator; exploring growth equity to fund expansion.',
    'event',
    'James'
  );

insert into public.matches (
  id, contact_a_id, contact_b_id, kind, stage, outcome, context, notes
) values
  (
    'd1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    'founder_investor',
    'introduced',
    null,
    'Priya Sharma (healthcare IT founder) × Jordan Lee (growth investor). Vertical SaaS thesis fit; warm intro queued.',
    'Send deck and Q1 cohort retention numbers ahead of first call.'
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000004',
    'c1000000-0000-4000-8000-000000000003',
    'founder_lender',
    'active',
    null,
    'Elena Vasquez (cold-chain founder) × Marcus Webb (lender). Senior debt facility under term-sheet discussion.',
    'IC scheduled next Thursday; covenants pending revised model.'
  );

insert into public.suggestions (
  id, title, body, status, contact_a_id, contact_b_id, kind, score
) values
  (
    'b1000000-0000-4000-8000-000000000001',
    'Priya Sharma <> Marcus Webb',
    E'**Priya Sharma** (founder) <> **Marcus Webb** (lender)\n- Sector overlap: healthcare_it / industrials\n- Geography: US / Canada / North America\n- Match score: 0.71',
    'pending',
    'c1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000003',
    'founder_lender',
    0.71
  );

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
