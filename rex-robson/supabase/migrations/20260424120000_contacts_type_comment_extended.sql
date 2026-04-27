-- Extend documented values for contacts.contact_type to include Advisor and Corporate.
-- Column is free text (no enum / check constraint) so this is a comment update only.

comment on column public.contacts.contact_type is
  'High-level relationship type. Expected values: Founder, Investor, Lender, Advisor, Corporate, Other.';
