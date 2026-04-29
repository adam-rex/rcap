-- Clean slate after a LinkedIn import test run.
-- Review in SQL Editor (or psql), then run in order inside a transaction if desired.
--
-- Step 1: Delete contacts created by the LinkedIn import script.
DELETE FROM public.contacts
WHERE source = 'linkedin_import';

-- Step 2: Delete organisations that have no contacts pointing at them.
-- After step 1, this removes org rows that were only used by those imports.
-- NOTE: This deletes ANY organisation with zero contacts project-wide. If you keep
-- placeholder orgs with no contacts, adjust this (e.g. restrict by created_at or name list).

DELETE FROM public.organisations AS o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contacts AS c
  WHERE c.organisation_id = o.id
);

-- Optional: run in a transaction:
-- BEGIN;
-- ... deletes above ...
-- COMMIT;
