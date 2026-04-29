-- Auth note: the app enforces login via Next.js middleware. Workspace tables use RLS with
-- policies granting full access to role `authenticated` (see earlier migrations). Webhooks use
-- SUPABASE_SERVICE_ROLE_KEY so inserts succeed without a browser session.

select 1;
